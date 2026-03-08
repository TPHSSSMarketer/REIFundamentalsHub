"""Rate-limiting middleware — pure ASGI implementation.

Replaces @app.middleware("http") to avoid BaseHTTPMiddleware, which can
bypass outer middleware send wrappers (breaking CORS header injection).
"""

from __future__ import annotations

import json

from rei.services.security import check_rate_limit, rl_ip_key


class RateLimitMiddleware:
    """Apply rate limits per endpoint category and IP address."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "GET")

        # Skip health check
        if path == "/health":
            await self.app(scope, receive, send)
            return

        # Extract client IP
        ip = "unknown"
        client = scope.get("client")
        if client:
            ip = client[0]

        # Auth endpoints: 5 requests/minute per IP
        if path.startswith("/api/auth/") and method == "POST":
            if not check_rate_limit(rl_ip_key(ip, "auth"), max_requests=5, window_seconds=60):
                await self._send_429(send, "Too many authentication attempts. Please try again in 1 minute.")
                return

        # AI endpoints: 20 requests/minute per IP
        if path.startswith("/api/ai/") and method == "POST":
            if not check_rate_limit(rl_ip_key(ip, "ai"), max_requests=20, window_seconds=60):
                await self._send_429(send, "Too many AI requests. Please try again in 1 minute.")
                return

        # Lead form submissions: 10 per minute per IP
        if path.endswith("/submit") and "/sites/" in path and method == "POST":
            if not check_rate_limit(rl_ip_key(ip, "lead_submit"), max_requests=10, window_seconds=60):
                await self._send_429(send, "Too many submissions. Please try again later.")
                return

        # General rate limit: 100 requests/minute per IP
        if not check_rate_limit(rl_ip_key(ip, "general"), max_requests=100, window_seconds=60):
            await self._send_429(send, "Rate limit exceeded. Please try again in 1 minute.")
            return

        await self.app(scope, receive, send)

    @staticmethod
    async def _send_429(send, detail: str) -> None:
        body = json.dumps({"detail": detail}).encode()
        await send({
            "type": "http.response.start",
            "status": 429,
            "headers": [
                [b"content-type", b"application/json"],
                [b"content-length", str(len(body)).encode()],
            ],
        })
        await send({
            "type": "http.response.body",
            "body": body,
        })
