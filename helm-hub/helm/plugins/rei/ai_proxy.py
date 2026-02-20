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


class DealAnalysisRequest(BaseModel):
    address: str = ""
    purchase_price: float = 0
    rehab_cost: float = 0
    arv: float | None = None
    monthly_rent: float | None = None
    strategy: str = "buy_and_hold"


class ContentWaterfallRequest(BaseModel):
    source_text: str
    topic: str | None = None
    investor_name: str = "a local real estate investor"


class ImagePromptsRequest(BaseModel):
    topic: str
    platform: str


class ScrapeUrlRequest(BaseModel):
    url: str


# ── Proxy Endpoints ──────────────────────────────────────────────────────────


@ai_proxy_router.post("/chat", dependencies=[Depends(require_rei_plugin)])
async def ai_proxy_chat(req: ChatRequest):
    """Proxy chat messages to the Helm agent."""
    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode
    from helm.models.schemas import ChatRequest as HelmChatRequest

    system = req.system or (
        "You are Helm, an AI assistant specialized in real estate investing. "
        "You help investors analyze deals, qualify leads, and make smarter decisions."
    )

    context_parts = [system]
    for msg in req.messages:
        context_parts.append(f"[{msg.role}]: {msg.content}")
    combined = "\n\n".join(context_parts)

    helm_req = HelmChatRequest(message=combined, mode=AssistantMode.REAL_ESTATE)
    response = await helm_engine.chat(helm_req)
    return ChatResponse(
        content=response.reply,
        model=response.model_used,
        usage={"input_tokens": 0, "output_tokens": 0},
    )


@ai_proxy_router.post("/analyze-deal", dependencies=[Depends(require_rei_plugin)])
async def ai_proxy_analyze_deal(req: DealAnalysisRequest):
    """Analyze a real estate deal from REI Hub data."""
    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode
    from helm.models.schemas import ChatRequest as HelmChatRequest

    prompt = (
        f"/opus Analyze this potential real estate deal:\n"
        f"- Address: {req.address}\n"
        f"- Purchase Price: ${req.purchase_price:,.2f}\n"
        f"- Rehab Cost: ${req.rehab_cost:,.2f}\n"
    )
    if req.arv:
        prompt += f"- After Repair Value (ARV): ${req.arv:,.2f}\n"
    if req.monthly_rent:
        prompt += f"- Expected Monthly Rent: ${req.monthly_rent:,.2f}\n"
    prompt += (
        f"- Strategy: {req.strategy}\n\n"
        "Provide a thorough analysis including:\n"
        "1. Cap rate\n2. Cash-on-cash return\n3. ROI projection\n"
        "4. 70% rule check\n5. 1% rule check\n6. BRRRR feasibility\n"
        "7. Risk factors\n8. Clear BUY / PASS / NEEDS MORE INFO verdict\n\n"
        "Show all math. Label all assumptions."
    )

    helm_req = HelmChatRequest(message=prompt, mode=AssistantMode.REAL_ESTATE)
    response = await helm_engine.chat(helm_req)
    return {
        "analysis": response.reply,
        "model_used": response.model_used,
    }


@ai_proxy_router.post("/content-waterfall", dependencies=[Depends(require_rei_plugin)])
async def ai_proxy_content_waterfall(req: ContentWaterfallRequest):
    """Generate 6 platform-specific content pieces from source text."""
    import json as _json
    import re as _re

    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode
    from helm.models.schemas import ChatRequest as HelmChatRequest

    topic = req.topic or req.source_text[:60]
    prompt = (
        "You are a content strategist specializing in real estate investing content. "
        "You write in a direct, authentic voice for real estate investors.\n\n"
        f"Source material from {req.investor_name}:\n\n{req.source_text}\n\n"
        f"Topic: {topic}\n\n"
        "Generate 6 platform-specific pieces of content from the source text above. "
        "Return ONLY a valid JSON object with exactly these keys:\n\n"
        '- "facebook": 150-300 word emotional story-driven post\n'
        '- "instagram": hook line with line breaks and 5-8 hashtags\n'
        '- "linkedin": 200-350 words, authority angle\n'
        '- "youtube_script": full script with Hook, Problem, Story, Solution, CTA\n'
        '- "youtube_short": 15-30 second hook script\n'
        '- "blog_post": 600-900 words, SEO-structured with HTML tags\n\n'
        "Return ONLY the JSON object. No markdown fencing, no explanation."
    )

    helm_req = HelmChatRequest(message=prompt, mode=AssistantMode.REAL_ESTATE)
    response = await helm_engine.chat(helm_req)

    try:
        content = _json.loads(response.reply)
    except _json.JSONDecodeError:
        match = _re.search(r"\{.*\}", response.reply, _re.DOTALL)
        if match:
            try:
                content = _json.loads(match.group())
            except _json.JSONDecodeError:
                content = {"raw": response.reply}
        else:
            content = {"raw": response.reply}

    return {"content": content, "topic": topic, "model": response.model_used}


@ai_proxy_router.post("/image-prompts", dependencies=[Depends(require_rei_plugin)])
async def ai_proxy_image_prompts(req: ImagePromptsRequest):
    """Generate AI image prompts optimized for a specific platform."""
    import json as _json
    import re as _re

    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode
    from helm.models.schemas import ChatRequest as HelmChatRequest

    valid_platforms = {"facebook", "instagram", "linkedin", "youtube_thumbnail"}
    if req.platform not in valid_platforms:
        raise HTTPException(
            status_code=400,
            detail=f"platform must be one of: {', '.join(sorted(valid_platforms))}",
        )

    prompt = (
        f"Generate exactly 3 AI image generation prompts for a {req.platform} post about "
        f"the following real estate investing topic: {req.topic}\n\n"
        "Each prompt should describe a photo-realistic scene relevant to real estate "
        "investing. Make each prompt vivid and specific.\n\n"
        f"Optimize dimensions and composition for {req.platform}.\n\n"
        'Return ONLY a JSON object with a single key "prompts" containing an array of '
        "exactly 3 strings. No markdown fencing, no explanation."
    )

    helm_req = HelmChatRequest(message=prompt, mode=AssistantMode.REAL_ESTATE)
    response = await helm_engine.chat(helm_req)

    try:
        parsed = _json.loads(response.reply)
        prompts = parsed.get("prompts", [])
    except _json.JSONDecodeError:
        match = _re.search(r"\{.*\}", response.reply, _re.DOTALL)
        if match:
            try:
                parsed = _json.loads(match.group())
                prompts = parsed.get("prompts", [])
            except _json.JSONDecodeError:
                prompts = [response.reply]
        else:
            prompts = [response.reply]

    return {"prompts": prompts[:3], "platform": req.platform}


@ai_proxy_router.post("/scrape-url", dependencies=[Depends(require_rei_plugin)])
async def ai_proxy_scrape_url(req: ScrapeUrlRequest):
    """Scrape a URL and return cleaned, structured text content."""
    from html.parser import HTMLParser

    if not req.url:
        raise HTTPException(status_code=400, detail="url is required")

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(req.url, headers={"User-Agent": "HelmHub/1.0"})
            resp.raise_for_status()
            raw_html = resp.text
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Could not fetch URL. Please paste the content directly.",
        )

    class _Stripper(HTMLParser):
        def __init__(self):
            super().__init__()
            self._parts: list[str] = []

        def handle_data(self, data: str):
            self._parts.append(data)

        def get_text(self) -> str:
            return " ".join(self._parts)

    stripper = _Stripper()
    stripper.feed(raw_html)
    clean = " ".join(stripper.get_text().split())[:4000]

    return {"text": clean, "url": req.url, "char_count": len(clean)}