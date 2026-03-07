"""CSRF protection middleware — double-submit cookie pattern (pure ASGI).

How it works:
  1. On login/register, the backend sets a non-HttpOnly `csrf_token` cookie.
  2. The frontend reads that cookie and sends it back as an X-CSRF-Token header.
  3. This middleware checks that the header matches the cookie on state-changing requests.

Why this is secure:
  - A malicious site can trigger the browser to *send* cookies, but it cannot *read*
    cookies from another domain. So it cannot copy the value into a custom header.
  - Only code running on the same origin can read the cookie and set the header.

Implementation note:
  This is a pure ASGI middleware (NOT BaseHTTPMiddleware) so that rejection
  responses flow correctly through Starlette's CORSMiddleware send-wrapper.
  BaseHTTPMiddleware has a known issue where direct-return responses bypass
  outer middleware's send hooks, causing CORS headers to be missing on 403s.
"""

from __future__ import annotations

import json
from http.cookies import SimpleCookie

from rei.config import get_settings

# Paths that are exempt from CSRF validation.
_CSRF_EXEMPT_PREFIXES = (
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/google/",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/webhooks/",
    "/api/lead/",
    "/api/team/accept",
    "/api/team/invite/",
    "/health",
    "/docs",
    "/openapi.json",
)

# Methods that don't change state — never need CSRF checks
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


class CSRFProtectionMiddleware:
    """Validate CSRF token on state-changing requests (POST, PUT, DELETE, PATCH).

    Pure ASGI implementation for correct CORSMiddleware interop.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")

        # Safe methods are always allowed
        if method in _SAFE_METHODS:
            await self.app(scope, receive, send)
            return

        # Skip exempt paths
        path = scope.get("path", "")
        if any(path.startswith(prefix) for prefix in _CSRF_EXEMPT_PREFIXES):
            await self.app(scope, receive, send)
            return

        # Parse cookies from headers
        cookies = _parse_cookies(scope)

        # If there's no access_token cookie, this request is using Bearer auth
        # (mobile app / API client) — CSRF doesn't apply to token-based auth
        if not cookies.get("access_token"):
            await self.app(scope, receive, send)
            return

        # Double-submit validation: cookie value must match header value
        settings = get_settings()
        csrf_cookie = cookies.get("csrf_token", "")
        csrf_header = _get_header(scope, settings.csrf_header_name)

        if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
            # Return 403 as a raw ASGI response — this flows through
            # CORSMiddleware's send wrapper so CORS headers get added.
            body = json.dumps({"detail": "CSRF token validation failed"}).encode()
            await send({
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    [b"content-type", b"application/json"],
                    [b"content-length", str(len(body)).encode()],
                ],
            })
            await send({
                "type": "http.response.body",
                "body": body,
            })
            return

        await self.app(scope, receive, send)


def _parse_cookies(scope) -> dict[str, str]:
    """Extract cookies from ASGI scope headers."""
    for header_name, header_value in scope.get("headers", []):
        if header_name == b"cookie":
            cookie = SimpleCookie()
            cookie.load(header_value.decode("latin-1"))
            return {key: morsel.value for key, morsel in cookie.items()}
    return {}


def _get_header(scope, name: str) -> str:
    """Get a header value by name (case-insensitive) from ASGI scope."""
    target = name.lower().encode("latin-1")
    for header_name, header_value in scope.get("headers", []):
        if header_name == target:
            return header_value.decode("latin-1")
    return ""
