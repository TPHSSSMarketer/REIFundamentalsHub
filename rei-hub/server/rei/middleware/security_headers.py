"""Security-headers middleware — pure ASGI implementation.

Replaces @app.middleware("http") to avoid BaseHTTPMiddleware, which can
bypass outer middleware send wrappers (breaking CORS header injection).
"""

from __future__ import annotations

from rei.config import get_settings


class SecurityHeadersMiddleware:
    """Inject security headers into every HTTP response."""

    def __init__(self, app):
        self.app = app
        self._settings = get_settings()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        env = self._settings.environment

        async def add_headers(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))

                headers.append([b"x-content-type-options", b"nosniff"])
                headers.append([b"x-xss-protection", b"1; mode=block"])
                headers.append([b"referrer-policy", b"strict-origin-when-cross-origin"])
                headers.append([b"permissions-policy", b"geolocation=(), microphone=(), camera=()"])

                # HSTS — enforce HTTPS for 1 year (production only)
                if env != "development":
                    headers.append([
                        b"strict-transport-security",
                        b"max-age=31536000; includeSubDomains; preload",
                    ])

                # CSP — API server returns JSON, lock down resources tightly
                if not path.startswith("/sites/") and "/sites/" not in path:
                    headers.append([
                        b"content-security-policy",
                        b"default-src 'none'; frame-ancestors 'none'",
                    ])

                # Frame options
                if path.startswith("/sites/") or "/sites/" in path:
                    headers.append([b"x-frame-options", b"SAMEORIGIN"])
                else:
                    headers.append([b"x-frame-options", b"DENY"])

                message = {**message, "headers": headers}

            await send(message)

        await self.app(scope, receive, add_headers)
