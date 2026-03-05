"""CSRF protection middleware — double-submit cookie pattern.

How it works:
  1. On login/register, the backend sets a non-HttpOnly `csrf_token` cookie.
  2. The frontend reads that cookie and sends it back as an X-CSRF-Token header.
  3. This middleware checks that the header matches the cookie on state-changing requests.

Why this is secure:
  - A malicious site can trigger the browser to *send* cookies, but it cannot *read*
    cookies from another domain. So it cannot copy the value into a custom header.
  - Only code running on the same origin can read the cookie and set the header.
"""

from __future__ import annotations

from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from rei.config import get_settings

# Paths that are exempt from CSRF validation.
# These either don't need auth, handle their own validation, or are
# not vulnerable to CSRF (e.g., login is credential-based, not cookie-based).
_CSRF_EXEMPT_PREFIXES = (
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/google/",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/webhooks/",
    "/api/lead/",          # Public lead capture forms
    "/api/team/accept",    # Public invite acceptance (no auth)
    "/api/team/invite/",   # Public invite validation (no auth)
    "/health",
    "/docs",
    "/openapi.json",
)

# Methods that don't change state — never need CSRF checks
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """Validate CSRF token on state-changing requests (POST, PUT, DELETE, PATCH)."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Safe methods are always allowed
        if request.method in _SAFE_METHODS:
            return await call_next(request)

        # Skip exempt paths
        path = request.url.path
        if any(path.startswith(prefix) for prefix in _CSRF_EXEMPT_PREFIXES):
            return await call_next(request)

        # If there's no access_token cookie, this request is using Bearer auth
        # (mobile app / API client) — CSRF doesn't apply to token-based auth
        if not request.cookies.get("access_token"):
            return await call_next(request)

        # Double-submit validation: cookie value must match header value
        settings = get_settings()
        csrf_cookie = request.cookies.get("csrf_token")
        csrf_header = request.headers.get(settings.csrf_header_name)

        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            return JSONResponse(
                status_code=status.HTTP_403_FORBIDDEN,
                content={"detail": "CSRF token validation failed"},
            )

        return await call_next(request)
