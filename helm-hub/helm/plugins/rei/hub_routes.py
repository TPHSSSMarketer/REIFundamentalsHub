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
