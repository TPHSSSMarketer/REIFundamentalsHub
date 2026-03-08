"""Pure-ASGI CORS middleware — guarantees CORS headers on EVERY response.

Replaces Starlette's CORSMiddleware because it has known edge cases where
responses from inner middleware (BaseHTTPMiddleware, @app.middleware("http"))
can bypass its send wrapper, resulting in responses with no CORS headers.

This implementation operates at the raw ASGI level, wrapping the `send`
callable so that CORS headers are injected into EVERY http.response.start
message — no matter which middleware or route produced it.
"""

from __future__ import annotations

import re
import logging

logger = logging.getLogger(__name__)


class CORSMiddleware:
    """Pure-ASGI CORS middleware.

    Parameters
    ----------
    app : ASGI app
    allow_origins : list of allowed origin strings (exact match)
    allow_origin_regex : optional regex pattern for dynamic origin matching
    allow_methods : HTTP methods to allow
    allow_headers : request headers to allow
    allow_credentials : whether to send Access-Control-Allow-Credentials
    max_age : preflight cache duration in seconds
    """

    def __init__(
        self,
        app,
        *,
        allow_origins: list[str] | None = None,
        allow_origin_regex: str | None = None,
        allow_methods: list[str] | None = None,
        allow_headers: list[str] | None = None,
        allow_credentials: bool = False,
        max_age: int = 600,
    ):
        self.app = app
        self.allow_origins = set(o.rstrip("/") for o in (allow_origins or []))
        self.allow_origin_re = re.compile(allow_origin_regex) if allow_origin_regex else None
        self.allow_methods = ", ".join(allow_methods or ["GET"])
        self.allow_headers = ", ".join(allow_headers or [])
        self.allow_credentials = allow_credentials
        self.max_age = str(max_age)

    def _origin_allowed(self, origin: str) -> bool:
        if origin in self.allow_origins:
            return True
        if self.allow_origin_re and self.allow_origin_re.fullmatch(origin):
            return True
        return False

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Extract Origin header
        origin = ""
        for hname, hval in scope.get("headers", []):
            if hname == b"origin":
                origin = hval.decode("latin-1")
                break

        # No Origin header → not a CORS request, pass through
        if not origin:
            await self.app(scope, receive, send)
            return

        allowed = self._origin_allowed(origin)
        method = scope.get("method", "GET")

        # ── Preflight (OPTIONS with Origin) ──────────────────────
        if method == "OPTIONS" and allowed:
            # Build and return preflight response immediately
            headers = [
                [b"access-control-allow-origin", origin.encode()],
                [b"access-control-allow-methods", self.allow_methods.encode()],
                [b"access-control-allow-headers", self.allow_headers.encode()],
                [b"access-control-max-age", self.max_age.encode()],
                [b"content-length", b"0"],
            ]
            if self.allow_credentials:
                headers.append([b"access-control-allow-credentials", b"true"])
            # Vary header so caches key on Origin
            headers.append([b"vary", b"Origin"])

            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": headers,
            })
            await send({
                "type": "http.response.body",
                "body": b"",
            })
            return

        # ── Actual request — wrap send to inject CORS headers ────
        if allowed:
            cors_headers = [
                [b"access-control-allow-origin", origin.encode()],
                [b"vary", b"Origin"],
            ]
            if self.allow_credentials:
                cors_headers.append([b"access-control-allow-credentials", b"true"])

            async def cors_send(message):
                if message["type"] == "http.response.start":
                    existing = list(message.get("headers", []))
                    existing.extend(cors_headers)
                    message = {**message, "headers": existing}
                await send(message)

            await self.app(scope, receive, cors_send)
        else:
            # Origin not allowed — pass through without CORS headers
            # (browser will block the response)
            await self.app(scope, receive, send)
