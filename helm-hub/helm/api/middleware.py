"""API middleware — authentication, rate limiting, and tenant scoping."""

from __future__ import annotations

import logging
import time
from collections import defaultdict

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials, HTTPBearer

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── API Key Auth ──────────────────────────────────────────────────────────

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)


def _valid_api_keys() -> set[str]:
    """Parse the comma-separated API_KEYS setting."""
    raw = settings.api_keys if hasattr(settings, "api_keys") else ""
    if not raw:
        return set()
    return {k.strip() for k in raw.split(",") if k.strip()}


async def get_current_user(
    request: Request,
    api_key: str | None = Depends(api_key_header),
    bearer: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """Authenticate via API key or JWT bearer token.

    Returns a user context dict:
      {"user_id": str, "tenant_id": str | None, "auth_method": str, "is_admin": bool}
    """
    # Method 1: API Key
    if api_key:
        valid_keys = _valid_api_keys()
        if valid_keys and api_key in valid_keys:
            return {
                "user_id": "api_key_user",
                "tenant_id": settings.admin_tenant_id or None,
                "auth_method": "api_key",
                "is_admin": True,
            }

    # Also check query param
    query_key = request.query_params.get("api_key")
    if query_key:
        valid_keys = _valid_api_keys()
        if valid_keys and query_key in valid_keys:
            return {
                "user_id": "api_key_user",
                "tenant_id": settings.admin_tenant_id or None,
                "auth_method": "api_key",
                "is_admin": True,
            }

    # Method 2: JWT Bearer
    if bearer and bearer.credentials:
        from helm.api.auth import decode_access_token
        payload = decode_access_token(bearer.credentials)
        if payload:
            return {
                "user_id": payload.get("sub", "unknown"),
                "tenant_id": payload.get("tenant_id"),
                "auth_method": "jwt",
                "is_admin": payload.get("is_admin", False),
            }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication. Provide X-API-Key header or Bearer token.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def optional_auth(
    request: Request,
    api_key: str | None = Depends(api_key_header),
    bearer: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict | None:
    """Same as get_current_user but returns None instead of raising."""
    try:
        return await get_current_user(request, api_key, bearer)
    except HTTPException:
        return None


# ── Rate Limiter ──────────────────────────────────────────────────────────


class RateLimiter:
    """Simple in-memory sliding window rate limiter."""

    def __init__(self, max_requests: int = 60, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup = time.time()

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        # Periodic cleanup
        if now - self._last_cleanup > self.window_seconds * 2:
            self._cleanup(now)
            self._last_cleanup = now

        window_start = now - self.window_seconds
        # Filter to requests within window
        self._requests[key] = [t for t in self._requests[key] if t > window_start]

        if len(self._requests[key]) >= self.max_requests:
            return False

        self._requests[key].append(now)
        return True

    def _cleanup(self, now: float) -> None:
        cutoff = now - self.window_seconds
        empty_keys = []
        for key, timestamps in self._requests.items():
            self._requests[key] = [t for t in timestamps if t > cutoff]
            if not self._requests[key]:
                empty_keys.append(key)
        for key in empty_keys:
            del self._requests[key]


# Default rate limiters
default_limiter = RateLimiter(max_requests=60, window_seconds=60)     # 60 req/min
strict_limiter = RateLimiter(max_requests=10, window_seconds=60)      # 10 req/min (write ops)
webhook_limiter = RateLimiter(max_requests=300, window_seconds=60)    # 300 req/min (webhooks)


def _get_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def rate_limit(request: Request) -> None:
    """Default rate limiter dependency (60 req/min per IP)."""
    ip = _get_client_ip(request)
    if not default_limiter.is_allowed(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please slow down.",
        )


async def rate_limit_strict(request: Request) -> None:
    """Strict rate limiter for write operations (10 req/min per IP)."""
    ip = _get_client_ip(request)
    if not strict_limiter.is_allowed(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded for write operations.",
        )


async def rate_limit_webhook(request: Request) -> None:
    """Relaxed rate limiter for webhook endpoints (300 req/min per IP)."""
    ip = _get_client_ip(request)
    if not webhook_limiter.is_allowed(ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Webhook rate limit exceeded.",
        )


# ── Tenant Scoping ────────────────────────────────────────────────────────


async def get_tenant_scope(
    user: dict = Depends(get_current_user),
) -> str | None:
    """Extract tenant_id from auth context for DB query scoping."""
    return user.get("tenant_id") or settings.admin_tenant_id or None
