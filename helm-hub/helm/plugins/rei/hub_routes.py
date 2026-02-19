"""Hub-facing API routes — called by REIFundamentals Hub for AI features.

These endpoints are ONLY available to tenants who have purchased the REI
plugin upsell.  The Hub continues to call GHL directly for core CRUD; these
routes add AI-powered analysis, research, chat, and enrichment on top.

Mounted at: /api/plugins/rei/hub/
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request

from helm.api.middleware import get_current_user, rate_limit, rate_limit_strict
from helm.plugins.rei.hub_middleware import require_rei_plugin
from helm.plugins.rei.ai_proxy import ai_proxy_router

router = APIRouter(
    prefix="/hub",
    dependencies=[Depends(require_rei_plugin)],
)
logger = logging.getLogger(__name__)


# ── AI Chat ──────────────────────────────────────────────────────────────────


@router.post("/ai/chat", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_ai_chat(request: Request):
    """AI chat in real-estate mode — the Hub's AI assistant."""
    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode, ChatRequest

    data = await request.json()
    messages = data.get("messages", [])

    if not messages:
        raise HTTPException(status_code=400, detail="Messages are required")

    system_prompt = (
        "You are Helm, an AI assistant specialized in real estate investing. "
        "You help investors analyze deals, qualify leads, and make smarter decisions."
    )

    # Build conversation context: system prompt + full messages array
    context_parts = [system_prompt]
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        context_parts.append(f"[{role}]: {content}")

    combined_message = "\n\n".join(context_parts)

    chat_request = ChatRequest(
        message=combined_message,
        mode=AssistantMode.REAL_ESTATE,
    )
    response = await helm_engine.chat(chat_request)
    return {
        "content": response.reply,
        "model": response.model_used,
        "usage": {"input_tokens": 0, "output_tokens": 0},
    }


# ── Deal Analysis ────────────────────────────────────────────────────────────


@router.post("/ai/analyze-deal", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_analyze_deal(request: Request):
    """AI-powered deal analysis — returns verdict, metrics, and reasoning."""
    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode, ChatRequest

    data = await request.json()

    address = data.get("address", "Unknown")
    purchase_price = data.get("purchase_price") or data.get("purchasePrice", 0)
    rehab_cost = data.get("rehab_cost") or data.get("rehabCost", 0)
    arv = data.get("after_repair_value") or data.get("arv")
    monthly_rent = data.get("monthly_rent") or data.get("monthlyRent")
    strategy = data.get("strategy", "buy_and_hold")

    prompt = (
        f"/opus Analyze this potential real estate deal:\n"
        f"- Address: {address}\n"
        f"- Purchase Price: ${purchase_price:,.2f}\n"
        f"- Rehab Cost: ${rehab_cost:,.2f}\n"
    )
    if arv:
        prompt += f"- After Repair Value (ARV): ${arv:,.2f}\n"
    if monthly_rent:
        prompt += f"- Expected Monthly Rent: ${monthly_rent:,.2f}\n"
    prompt += (
        f"- Strategy: {strategy}\n\n"
        "Provide a thorough analysis including:\n"
        "1. Cap rate\n2. Cash-on-cash return\n3. ROI projection\n"
        "4. 70% rule check\n5. 1% rule check\n6. BRRRR feasibility\n"
        "7. Risk factors\n8. Clear BUY / PASS / NEEDS MORE INFO verdict\n\n"
        "Show all math. Label all assumptions."
    )

    chat_request = ChatRequest(
        message=prompt,
        mode=AssistantMode.REAL_ESTATE,
    )
    response = await helm_engine.chat(chat_request)
    return {
        "analysis": response.reply,
        "model_used": response.model_used,
        "conversation_id": response.conversation_id,
    }


# ── Contact Enrichment ───────────────────────────────────────────────────────


@router.post("/ai/enrich-contact", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_enrich_contact(request: Request):
    """AI-powered contact enrichment — analyzes a contact's history and context."""
    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode, ChatRequest

    data = await request.json()
    contact_name = data.get("name", "Unknown")
    contact_email = data.get("email", "")
    contact_phone = data.get("phone", "")
    tags = data.get("tags", [])
    notes = data.get("notes", "")
    deals = data.get("deals", [])

    prompt = (
        f"Analyze this contact and provide actionable insights:\n\n"
        f"**Contact:** {contact_name}\n"
        f"**Email:** {contact_email}\n"
        f"**Phone:** {contact_phone}\n"
        f"**Tags:** {', '.join(tags) if tags else 'None'}\n"
        f"**Notes:** {notes or 'None'}\n"
    )
    if deals:
        prompt += f"**Associated Deals:** {len(deals)}\n"
        for d in deals[:5]:
            title = d.get("title") or d.get("name", "Untitled")
            value = d.get("value") or d.get("monetaryValue", 0)
            prompt += f"  - {title} (${value:,.0f})\n"

    prompt += (
        "\nProvide:\n"
        "1. Contact priority assessment (Hot / Warm / Cold)\n"
        "2. Suggested next actions\n"
        "3. Relationship-building recommendations\n"
        "4. Any red flags or opportunities spotted"
    )

    chat_request = ChatRequest(message=prompt, mode=AssistantMode.REAL_ESTATE)
    response = await helm_engine.chat(chat_request)
    return {
        "insights": response.reply,
        "model_used": response.model_used,
    }


# ── Dashboard Insights ───────────────────────────────────────────────────────


@router.post("/ai/insights", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_dashboard_insights(request: Request):
    """Generate AI insights from the Hub's current dashboard data."""
    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode, ChatRequest

    data = await request.json()
    metrics = data.get("metrics", {})
    deals = data.get("deals", [])
    activities = data.get("activities", [])

    prompt = "Based on my current RE portfolio dashboard, give me 3-5 actionable insights:\n\n"

    if metrics:
        prompt += f"**Metrics:**\n"
        prompt += f"- Active Deals: {metrics.get('activeDeals', 0)}\n"
        prompt += f"- Pipeline Value: ${metrics.get('pipelineValue', 0):,.0f}\n"
        prompt += f"- Closed This Month: {metrics.get('closedThisMonth', 0)}\n"
        prompt += f"- Pending Tasks: {metrics.get('pendingTasks', 0)}\n\n"

    if deals:
        prompt += f"**Active Deals ({len(deals)}):**\n"
        for d in deals[:10]:
            title = d.get("title") or d.get("name", "Untitled")
            value = d.get("value") or d.get("monetaryValue", 0)
            status = d.get("status", "open")
            prompt += f"  - {title}: ${value:,.0f} ({status})\n"
        prompt += "\n"

    if activities:
        prompt += f"**Recent Activity:**\n"
        for a in activities[:5]:
            prompt += f"  - {a.get('title', '')}: {a.get('description', '')}\n"

    prompt += (
        "\nFocus on: opportunities to close, risks to mitigate, "
        "and next steps I should take today. Be concise and metric-driven."
    )

    chat_request = ChatRequest(message=prompt, mode=AssistantMode.REAL_ESTATE)
    response = await helm_engine.chat(chat_request)
    return {
        "insights": response.reply,
        "model_used": response.model_used,
    }


# ── Market Research ──────────────────────────────────────────────────────────


@router.post("/ai/research/comps", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_research_comps(request: Request):
    """Research comparable sales for a property."""
    from helm.integrations.openrouter import openrouter_client

    data = await request.json()
    address = data.get("address", "")
    if not address:
        raise HTTPException(status_code=400, detail="Address is required")
    if not openrouter_client.is_configured:
        raise HTTPException(status_code=503, detail="Research backend not configured")
    return await openrouter_client.research_comps(address)


@router.post("/ai/research/neighborhood", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_research_neighborhood(request: Request):
    """Research neighborhood data for a property."""
    from helm.integrations.openrouter import openrouter_client

    data = await request.json()
    address = data.get("address", "")
    if not address:
        raise HTTPException(status_code=400, detail="Address is required")
    if not openrouter_client.is_configured:
        raise HTTPException(status_code=503, detail="Research backend not configured")
    return await openrouter_client.research_neighborhood(address)


@router.post("/ai/research/market", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_research_market(request: Request):
    """Research market conditions for a city/metro area."""
    from helm.integrations.openrouter import openrouter_client

    data = await request.json()
    market = data.get("market", "")
    if not market:
        raise HTTPException(status_code=400, detail="Market is required")
    if not openrouter_client.is_configured:
        raise HTTPException(status_code=503, detail="Research backend not configured")
    return await openrouter_client.research_market(market)


# ── Webhook Receiver ─────────────────────────────────────────────────────────


@router.post("/webhooks/events", dependencies=[Depends(rate_limit)])
async def hub_webhook_events(request: Request):
    """Receive event notifications from the Hub.

    The Hub can POST events here when deals are created, contacts updated,
    etc.  Helm stores these in memory for context-aware AI responses.

    Expected payload::

        {
            "event": "deal.created" | "deal.updated" | "contact.added" | ...,
            "data": { ... event-specific payload ... },
            "timestamp": "2026-02-15T12:00:00Z"
        }

    Optional: include X-Hub-Signature header with HMAC-SHA256 of the
    body using the shared webhook secret for verification.
    """
    from helm.config import get_settings

    settings = get_settings()

    # Verify webhook signature if configured
    if settings.reifundamentals_webhook_secret:
        signature = request.headers.get("X-Hub-Signature", "")
        body = await request.body()
        expected = hmac.new(
            settings.reifundamentals_webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    data = await request.json()
    event_type = data.get("event", "unknown")
    event_data = data.get("data", {})
    timestamp = data.get("timestamp", "")

    logger.info("Hub webhook received: %s at %s", event_type, timestamp)

    # Store the event in Helm's memory for AI context
    from helm.assistant.memory import memory

    summary = _summarize_event(event_type, event_data)
    if summary:
        await memory.add_and_persist(
            conversation_id="hub-events",
            role="system",
            content=f"[Hub Event] {summary}",
        )

    # Sync living files from hub event data
    if event_type.startswith(("deal.", "contact.")) or event_type in ("portfolio.updated", "market.updated"):
        try:
            import asyncio
            from helm.context.sync import living_file_sync
            tenant_id = getattr(request.state, "tenant_id", "default")
            await asyncio.to_thread(living_file_sync.sync_from_hub, tenant_id, event_data)
        except Exception as exc:
            logger.warning("Living file sync failed: %s", exc)

    return {"status": "received", "event": event_type}


# ── Hub Status / Config ──────────────────────────────────────────────────────


@router.get("/status", dependencies=[Depends(get_current_user)])
async def hub_status():
    """Return Helm's AI capabilities for the Hub to discover."""
    from helm.integrations.openrouter import openrouter_client

    return {
        "status": "connected",
        "version": "0.3.0",
        "capabilities": {
            "ai_chat": True,
            "deal_analysis": True,
            "contact_enrichment": True,
            "dashboard_insights": True,
            "comp_research": openrouter_client.is_configured,
            "neighborhood_research": openrouter_client.is_configured,
            "market_research": openrouter_client.is_configured,
            "webhooks": True,
        },
    }


# ── Content Waterfall ───────────────────────────────────────────────────────


@router.post("/ai/content-waterfall", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_content_waterfall(request: Request):
    """Generate 6 platform-specific content pieces from a single source text."""
    import json as _json
    import re as _re

    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode, ChatRequest

    data = await request.json()
    source_text = data.get("source_text", "")
    if not source_text:
        raise HTTPException(status_code=400, detail="source_text is required")

    topic = data.get("topic") or source_text[:60]
    investor_name = data.get("investor_name", "a local real estate investor")

    system_prompt = (
        "You are a content strategist specializing in real estate investing content. "
        "You write in a direct, authentic voice for real estate investors who buy houses "
        "from motivated sellers. Never use corporate jargon. Write like a human being."
    )

    prompt = (
        f"{system_prompt}\n\n"
        f"Source material from {investor_name}:\n\n{source_text}\n\n"
        f"Topic: {topic}\n\n"
        "Generate 6 platform-specific pieces of content from the source text above. "
        "Return ONLY a valid JSON object with exactly these keys:\n\n"
        '- "facebook": 150-300 word emotional story-driven post, ends with a soft CTA '
        "to motivated sellers\n"
        '- "instagram": hook line, line breaks for readability, 5-8 relevant hashtags '
        "at the end\n"
        '- "linkedin": 200-350 words, authority/expertise angle, professional but '
        "personal, no hashtag spam\n"
        '- "youtube_script": full script with sections: Hook [0-5s], Problem [5-30s], '
        "Story [30-90s], Solution [90-120s], CTA [final 10s]\n"
        '- "youtube_short": 15-30 second hook script — one punchy opening line + the '
        "core insight + CTA\n"
        '- "blog_post": 600-900 words, SEO-structured with H2 subheadings, as an HTML '
        "string with <h2>, <p>, <ul> tags\n\n"
        "Return ONLY the JSON object. No markdown fencing, no explanation."
    )

    chat_request = ChatRequest(message=prompt, mode=AssistantMode.REAL_ESTATE)
    response = await helm_engine.chat(chat_request)

    # Parse AI response as JSON
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

    return {
        "content": content,
        "topic": topic,
        "model": response.model_used,
    }


# ── Image Prompts ───────────────────────────────────────────────────────────


@router.post("/ai/image-prompts", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_image_prompts(request: Request):
    """Generate 3 AI image prompts optimized for a specific platform."""
    import json as _json
    import re as _re

    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode, ChatRequest

    data = await request.json()
    topic = data.get("topic", "")
    platform = data.get("platform", "")

    if not topic:
        raise HTTPException(status_code=400, detail="topic is required")
    if not platform:
        raise HTTPException(status_code=400, detail="platform is required")

    valid_platforms = {"facebook", "instagram", "linkedin", "youtube_thumbnail"}
    if platform not in valid_platforms:
        raise HTTPException(
            status_code=400,
            detail=f"platform must be one of: {', '.join(sorted(valid_platforms))}",
        )

    prompt = (
        f"Generate exactly 3 AI image generation prompts for a {platform} post about "
        f"the following real estate investing topic: {topic}\n\n"
        "Each prompt should describe a photo-realistic scene relevant to real estate "
        "investing — motivated sellers, house walkthroughs, cash offers, neighborhood "
        "scenes. No generic stock photo feel. Make each prompt vivid and specific.\n\n"
        f"Optimize dimensions and composition for {platform}.\n\n"
        'Return ONLY a JSON object with a single key "prompts" containing an array of '
        "exactly 3 strings. No markdown fencing, no explanation."
    )

    chat_request = ChatRequest(message=prompt, mode=AssistantMode.REAL_ESTATE)
    response = await helm_engine.chat(chat_request)

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

    return {
        "prompts": prompts[:3],
        "platform": platform,
    }


# ── URL Scraper ─────────────────────────────────────────────────────────────


@router.post("/ai/scrape-url", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def hub_scrape_url(request: Request):
    """Fetch a URL and return cleaned text content (first 4000 chars)."""
    from html.parser import HTMLParser

    import httpx

    data = await request.json()
    url = data.get("url", "")
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "HelmHub/1.0"})
            resp.raise_for_status()
            raw_html = resp.text
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Could not fetch URL. Please paste the content directly.",
        )

    # Strip HTML tags using stdlib HTMLParser
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

    return {
        "text": clean,
        "url": url,
        "char_count": len(clean),
    }


# ── Helpers ──────────────────────────────────────────────────────────────────


def _summarize_event(event_type: str, data: dict) -> str | None:
    """Create a human-readable summary of a Hub event for AI context."""
    if event_type == "deal.created":
        title = data.get("title") or data.get("name", "Unknown deal")
        value = data.get("value") or data.get("monetaryValue", 0)
        return f"New deal created: {title} (${value:,.0f})"

    if event_type == "deal.updated":
        title = data.get("title") or data.get("name", "Unknown deal")
        return f"Deal updated: {title}"

    if event_type == "deal.stage_changed":
        title = data.get("title") or data.get("name", "Unknown deal")
        stage = data.get("stage") or data.get("stageName", "Unknown")
        return f"Deal '{title}' moved to stage: {stage}"

    if event_type == "contact.added":
        name = data.get("name") or f"{data.get('firstName', '')} {data.get('lastName', '')}".strip()
        return f"New contact added: {name}"

    if event_type == "contact.updated":
        name = data.get("name") or f"{data.get('firstName', '')} {data.get('lastName', '')}".strip()
        return f"Contact updated: {name}"

    if event_type == "task.completed":
        title = data.get("title", "Unknown task")
        return f"Task completed: {title}"

    if event_type == "message.sent":
        channel = data.get("type", "message")
        contact = data.get("contactName", "Unknown")
        return f"{channel} sent to {contact}"

    # Generic fallback
    return f"{event_type}: {str(data)[:200]}" if data else None

    # Generic fallback
    return f"{event_type}: {str(data)[:200]}" if data else None


router.include_router(ai_proxy_router, prefix="/ai")
@router.get("/context/files", dependencies=[Depends(get_current_user)])
async def hub_list_context_files(request: Request):
    """List all living context files for this tenant."""
    from helm.context.living_files import list_living_files
    tenant_id = getattr(request.state, "tenant_id", "default")
    files = list_living_files(tenant_id)
    return {"tenant_id": tenant_id, "files": files}
