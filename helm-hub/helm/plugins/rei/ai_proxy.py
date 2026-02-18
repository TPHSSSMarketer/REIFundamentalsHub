"""AI proxy endpoints — REI Hub sends requests here, Helm Hub calls Anthropic.
ANTHROPIC_API_KEY never leaves the server.
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from helm.config import get_settings
from helm.plugins.rei.hub_middleware import require_rei_plugin

logger = logging.getLogger(__name__)

ai_proxy_router = APIRouter(tags=["rei-ai-proxy"])

# ── Simple in-memory rate limiter (20 req/min per tenant) ────────────────────
_rate_buckets: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 20
RATE_WINDOW = 60.0


def _check_rate_limit(tenant_id: str) -> None:
    now = time.monotonic()
    bucket = _rate_buckets[tenant_id]
    # Drop timestamps outside the window
    _rate_buckets[tenant_id] = [t for t in bucket if now - t < RATE_WINDOW]
    if len(_rate_buckets[tenant_id]) >= RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded — max {RATE_LIMIT} AI requests per minute.",
        )
    _rate_buckets[tenant_id].append(now)


# ── Request / response schemas ────────────────────────────────────────────────
class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    system: str | None = None
    max_tokens: int | None = 1024


class ChatResponse(BaseModel):
    content: str
    model: str
    usage: dict[str, int]


class