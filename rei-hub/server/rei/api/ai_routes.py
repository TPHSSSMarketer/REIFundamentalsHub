"""AI Provider Management API routes."""

from __future__ import annotations

import base64
import logging
import time
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import AI_PLAN_ALLOWANCES, Settings, get_settings
from rei.models.crm import ContentImage, CrmContact, CrmDeal, DealFile
from rei.models.user import AIProviderConfig, AIUsageByProvider, User
from rei.services.ai_service import (
    PROVIDER_CONFIGS,
    ai_complete,
    ai_research,
    analyze_document,
    analyze_property_photos,
    decrypt_api_key,
    encrypt_api_key,
    extract_conversation_data_with_db,
    generate_content_waterfall,
    generate_platform_images,
    get_user_knowledge,
    mask_api_key,
    scrape_url_content,
)
from rei.services.rag_service import rebuild_all_embeddings, retrieve_relevant_knowledge

logger = logging.getLogger(__name__)
ai_router = APIRouter(prefix="/ai", tags=["ai"])


# ── Schemas ───────────────────────────────────────────────────────────────


class AdminConfigUpdate(BaseModel):
    active_provider: Optional[str] = None
    active_model: Optional[str] = None
    # API keys are now managed exclusively via Admin > Credentials (ProviderCredentials)
    allow_user_override: Optional[bool] = None
    user_can_bring_own_key: Optional[bool] = None


class AdminUserAiUpdate(BaseModel):
    ai_provider_override: Optional[str] = None
    ai_model_override: Optional[str] = None
    ai_override_enabled: Optional[bool] = None


class UserConfigUpdate(BaseModel):
    ai_provider_override: Optional[str] = None
    ai_model_override: Optional[str] = None
    ai_own_anthropic_key: Optional[str] = None
    ai_own_nvidia_key: Optional[str] = None
    ai_own_openai_key: Optional[str] = None


class TestRequest(BaseModel):
    message: str
    task_type: Optional[str] = "general"  # Allows testing specific providers via task routing


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    system: Optional[str] = None
    task_type: Optional[str] = "chat"  # chat, sms_draft, opener
    contact_id: Optional[str] = None   # CRM contact for lead context injection


# Per-task token limits and temperature — keeps costs low for simple tasks
_TASK_SETTINGS = {
    "sms_draft": {"max_tokens": 150, "temperature": 0.7, "skip_rag": False, "rag_top_k": 3},
    "opener":    {"max_tokens": 300, "temperature": 0.7, "skip_rag": False, "rag_top_k": 5},
    "chat":      {"max_tokens": 1500, "temperature": 0.7, "skip_rag": False, "rag_top_k": 7},
}


class ResearchRequest(BaseModel):
    query: str
    context: Optional[str] = ""


class ExtractContactRequest(BaseModel):
    contact_id: str
    messages: list[ChatMessage]


class ContentGenerateRequest(BaseModel):
    source_text: str
    topic: Optional[str] = "Real Estate Investing"
    tags: list[str] = []
    tone_override: Optional[str] = None


class ContentScrapeRequest(BaseModel):
    url: str
    tags: list[str] = []


class DocumentAnalyzeRequest(BaseModel):
    file_id: str
    deal_id: str
    category: Optional[str] = "general"  # title, inspection, appraisal, contract, insurance, general


class PhotoAnalyzeRequest(BaseModel):
    deal_id: str
    photo_ids: list[str] = []  # Empty = analyze all photos for the deal


class ContentImageRequest(BaseModel):
    topic: str
    platforms: list[str] = ["facebook", "instagram", "linkedin", "youtube_thumb", "blog", "youtube_short"]


# ── Helpers ───────────────────────────────────────────────────────────────


def _require_superadmin(user: User) -> None:
    """Raise 403 if the user is not an admin or superadmin."""
    if not (getattr(user, "is_admin", False) or getattr(user, "is_superadmin", False)):
        raise HTTPException(status_code=403, detail="Admin access required")


async def _get_or_create_global_config(db: AsyncSession) -> AIProviderConfig:
    """Get the global AIProviderConfig, creating one if it doesn't exist."""
    result = await db.execute(
        select(AIProviderConfig).where(AIProviderConfig.user_id.is_(None))
    )
    config = result.scalar_one_or_none()
    if not config:
        config = AIProviderConfig(user_id=None)
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


def _config_to_dict(config: AIProviderConfig) -> dict:
    """Serialize config (keys managed via Admin > Credentials, not here)."""
    return {
        "id": config.id,
        "active_provider": config.active_provider,
        "active_model": config.active_model,
        "allow_user_override": config.allow_user_override,
        "user_can_bring_own_key": config.user_can_bring_own_key,
        "total_requests": config.total_requests,
        "total_tokens": config.total_tokens,
        "created_at": config.created_at.isoformat() if config.created_at else None,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }


def _settings() -> Settings:
    return get_settings()


# ══════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════


@ai_router.get("/admin/config")
async def get_admin_config(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the global AI provider config."""
    _require_superadmin(user)
    config = await _get_or_create_global_config(db)
    return _config_to_dict(config)


@ai_router.patch("/admin/config")
async def update_admin_config(
    body: AdminConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the global AI provider config."""
    _require_superadmin(user)
    settings = _settings()
    config = await _get_or_create_global_config(db)

    if body.active_provider is not None:
        if body.active_provider not in PROVIDER_CONFIGS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid provider. Must be one of: {list(PROVIDER_CONFIGS.keys())}",
            )
        config.active_provider = body.active_provider

    if body.active_model is not None:
        config.active_model = body.active_model

    # API keys are managed via Admin > Credentials (ProviderCredentials table)

    if body.allow_user_override is not None:
        config.allow_user_override = body.allow_user_override

    if body.user_can_bring_own_key is not None:
        config.user_can_bring_own_key = body.user_can_bring_own_key

    config.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(config)

    return _config_to_dict(config)


@ai_router.get("/admin/usage")
async def get_admin_usage(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return usage statistics across all users — global and per-user."""
    _require_superadmin(user)
    config = await _get_or_create_global_config(db)

    # Get per-user stats for ALL users who have made AI requests
    result = await db.execute(
        select(User).where(User.ai_total_requests > 0)
    )
    active_users = result.scalars().all()

    per_user = []
    for u in active_users:
        per_user.append({
            "user_id": u.id,
            "email": u.email,
            "provider": u.ai_provider_override or config.active_provider,
            "model": u.ai_model_override or config.active_model,
            "requests": u.ai_total_requests or 0,
            "tokens": u.ai_total_tokens or 0,
            "last_request_at": (
                u.ai_last_request_at.isoformat() if u.ai_last_request_at else None
            ),
        })

    # Sort by tokens descending so heaviest users are at the top
    per_user.sort(key=lambda x: x["tokens"], reverse=True)

    # Per-provider breakdown (current month + all-time)
    current_month = datetime.utcnow().strftime("%Y-%m")
    prov_result = await db.execute(
        select(AIUsageByProvider).order_by(
            AIUsageByProvider.month.desc(),
            AIUsageByProvider.total_requests.desc(),
        )
    )
    all_provider_rows = prov_result.scalars().all()

    by_provider_current = []
    by_provider_all_time: dict[str, dict] = {}

    for row in all_provider_rows:
        # Aggregate all-time totals per provider
        key = row.provider
        if key not in by_provider_all_time:
            by_provider_all_time[key] = {
                "provider": row.provider,
                "requests": 0,
                "tokens": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "cost_cents": 0,
            }
        by_provider_all_time[key]["requests"] += row.total_requests
        by_provider_all_time[key]["tokens"] += row.total_tokens
        by_provider_all_time[key]["input_tokens"] += row.input_tokens
        by_provider_all_time[key]["output_tokens"] += row.output_tokens
        by_provider_all_time[key]["cost_cents"] += row.cost_cents

        # Current month detail
        if row.month == current_month:
            by_provider_current.append({
                "provider": row.provider,
                "model": row.model,
                "month": row.month,
                "requests": row.total_requests,
                "tokens": row.total_tokens,
                "input_tokens": row.input_tokens,
                "output_tokens": row.output_tokens,
                "cost_cents": row.cost_cents,
            })

    return {
        "total_requests": config.total_requests,
        "total_tokens": config.total_tokens,
        "per_user": per_user,
        "by_provider_current_month": by_provider_current,
        "by_provider_all_time": list(by_provider_all_time.values()),
        "current_month": current_month,
        "billing_note": "User billing cycles reset on each user's signup anniversary date.",
    }


@ai_router.get("/admin/users")
async def get_admin_ai_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all users with their AI settings."""
    _require_superadmin(user)
    config = await _get_or_create_global_config(db)

    result = await db.execute(select(User).where(User.is_active.is_(True)))
    users = result.scalars().all()

    return [
        {
            "user_id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "ai_provider_override": u.ai_provider_override,
            "ai_model_override": u.ai_model_override,
            "ai_override_enabled": u.ai_override_enabled,
            "effective_provider": u.ai_provider_override
            if u.ai_override_enabled and u.ai_provider_override
            else config.active_provider,
            "effective_model": u.ai_model_override
            if u.ai_override_enabled and u.ai_model_override
            else config.active_model,
        }
        for u in users
    ]


@ai_router.patch("/admin/users/{user_id}")
async def update_admin_user_ai(
    user_id: int,
    body: AdminUserAiUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Override AI settings for a specific user."""
    _require_superadmin(user)

    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.ai_provider_override is not None:
        target_user.ai_provider_override = body.ai_provider_override
    if body.ai_model_override is not None:
        target_user.ai_model_override = body.ai_model_override
    if body.ai_override_enabled is not None:
        target_user.ai_override_enabled = body.ai_override_enabled

    await db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════
# USER ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════


@ai_router.get("/config")
async def get_user_config(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's effective AI config."""
    config = await _get_or_create_global_config(db)
    settings = _settings()

    # Determine effective provider/model
    effective_provider = config.active_provider
    effective_model = config.active_model
    if user.ai_override_enabled and config.allow_user_override:
        if user.ai_provider_override:
            effective_provider = user.ai_provider_override
        if user.ai_model_override:
            effective_model = user.ai_model_override

    has_own_anthropic = bool(user.ai_own_anthropic_key)
    has_own_nvidia = bool(user.ai_own_nvidia_key)
    has_own_openai = bool(getattr(user, "ai_own_openai_key", None))

    # Users only see Anthropic — NVIDIA is used behind the scenes
    available_providers = [
        {
            "id": pid,
            "display_name": pc["display_name"],
            "models": pc["models"],
            "default_model": pc["default_model"],
        }
        for pid, pc in PROVIDER_CONFIGS.items()
        if not pid.startswith("nvidia_")  # Hide NVIDIA from regular users
    ]

    return {
        "active_provider": effective_provider,
        "active_model": effective_model,
        "available_providers": available_providers,
        "can_override": config.allow_user_override,
        "can_bring_own_key": config.user_can_bring_own_key,
        "has_own_keys": has_own_anthropic or has_own_nvidia or has_own_openai,
        "override_enabled": user.ai_override_enabled,
        "own_anthropic_configured": has_own_anthropic,
        "own_nvidia_configured": has_own_nvidia,
        "own_openai_configured": has_own_openai,
    }


@ai_router.patch("/config")
async def update_user_config(
    body: UserConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's AI config (only if admin allows override)."""
    config = await _get_or_create_global_config(db)
    settings = _settings()

    if not config.allow_user_override:
        raise HTTPException(
            status_code=403,
            detail="User AI provider override is not enabled by the administrator",
        )

    if body.ai_provider_override is not None:
        if body.ai_provider_override and body.ai_provider_override not in PROVIDER_CONFIGS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid provider. Must be one of: {list(PROVIDER_CONFIGS.keys())}",
            )
        user.ai_provider_override = body.ai_provider_override
        user.ai_override_enabled = True

    if body.ai_model_override is not None:
        user.ai_model_override = body.ai_model_override

    if body.ai_own_anthropic_key is not None:
        if not config.user_can_bring_own_key:
            raise HTTPException(
                status_code=403,
                detail="Bringing your own API keys is not enabled by the administrator",
            )
        user.ai_own_anthropic_key = encrypt_api_key(
            body.ai_own_anthropic_key, settings.ai_encryption_key
        )

    if body.ai_own_nvidia_key is not None:
        if not config.user_can_bring_own_key:
            raise HTTPException(
                status_code=403,
                detail="Bringing your own API keys is not enabled by the administrator",
            )
        user.ai_own_nvidia_key = encrypt_api_key(
            body.ai_own_nvidia_key, settings.ai_encryption_key
        )

    if body.ai_own_openai_key is not None:
        if not config.user_can_bring_own_key:
            raise HTTPException(
                status_code=403,
                detail="Bringing your own API keys is not enabled by the administrator",
            )
        user.ai_own_openai_key = encrypt_api_key(
            body.ai_own_openai_key, settings.ai_encryption_key
        )

    await db.commit()

    return {
        "active_provider": user.ai_provider_override or config.active_provider,
        "active_model": user.ai_model_override or config.active_model,
        "override_enabled": user.ai_override_enabled,
    }


# ══════════════════════════════════════════════════════════════════════════
# TEST & RESEARCH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════


@ai_router.post("/test")
async def test_ai_provider(
    body: TestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a test message to the current AI provider."""
    settings = _settings()
    start = time.time()

    result = await ai_complete(
        messages=[{"role": "user", "content": body.message}],
        user_id=workspace_user_id(user),
        db=db,
        settings=settings,
        task_type=body.task_type or "general",
        max_tokens=1000,
        temperature=0.3,
    )

    latency_ms = int((time.time() - start) * 1000)

    return {
        "response": result["content"],
        "provider": result["provider"],
        "model": result["model"],
        "tokens_used": result["tokens_used"],
        "latency_ms": latency_ms,
    }


@ai_router.post("/chat")
async def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Multi-turn chat with the AI provider, enriched with Knowledge Base via RAG."""
    settings = _settings()

    # Resolve per-task settings (token limits, temperature, RAG behavior)
    task = body.task_type or "chat"
    task_cfg = _TASK_SETTINGS.get(task, _TASK_SETTINGS["chat"])

    # Extract the latest user message for semantic search
    latest_user_msg = ""
    for msg in reversed(body.messages):
        if msg.role == "user":
            latest_user_msg = msg.content
            break

    # Use RAG to find relevant knowledge entries — unless this task type
    # skips RAG (e.g. SMS drafts don't need the full knowledge base).
    knowledge = []
    if not task_cfg.get("skip_rag"):
        knowledge = await retrieve_relevant_knowledge(
            user_id=workspace_user_id(user),
            query=latest_user_msg,
            db=db,
            top_k=task_cfg.get("rag_top_k", 7),
        )

    # Separate training entries (always-on foundation) from situational knowledge
    training = [e for e in knowledge if e.get("entry_type") == "training"]
    situational = [e for e in knowledge if e.get("entry_type") != "training"]

    # Build system prompt: training first (sets mindset/tone), then
    # any frontend system text, then situational knowledge.
    system_content = ""

    # Training comes FIRST — it's the AI's core approach and mindset
    if training:
        system_content += "CORE TRAINING & APPROACH:\n"
        system_content += "Always follow this training to set your mindset, tone, "
        system_content += "and approach for every interaction.\n\n"
        for entry in training:
            system_content += f"--- {entry['name']} ---\n{entry['content']}\n\n"

    # Then any persona/context from the frontend
    if body.system:
        system_content += body.system + "\n"

    # Then situational knowledge (scripts, objection handlers, etc.)
    if situational:
        system_content += "\nRELEVANT KNOWLEDGE:\n"
        for entry in situational:
            system_content += f"--- {entry['name']} ---\n{entry['content']}\n\n"

    # Inject CRM lead context if a contact_id was provided
    if body.contact_id:
        result_q = await db.execute(
            select(CrmContact).where(
                CrmContact.id == body.contact_id,
                CrmContact.user_id == workspace_user_id(user),
                CrmContact.is_deleted == False,
            )
        )
        contact = result_q.scalar_one_or_none()
        if contact:
            context_lines = []
            if contact.name:
                context_lines.append(f"Name: {contact.name}")
            if contact.phone:
                context_lines.append(f"Phone: {contact.phone}")
            if contact.email:
                context_lines.append(f"Email: {contact.email}")
            if contact.notes:
                context_lines.append(f"Notes: {contact.notes}")
            if contact.source:
                context_lines.append(f"Source: {contact.source}")
            if context_lines:
                system_content += "\nLEAD CONTEXT (what we already know about this person):\n"
                system_content += "\n".join(f"- {line}" for line in context_lines)
                system_content += "\nDo NOT re-ask for information already listed above.\n\n"

    # Build the messages list, prepending system message if we have one
    messages = []
    if system_content.strip():
        messages.append({"role": "system", "content": system_content})
    for msg in body.messages:
        messages.append({"role": msg.role, "content": msg.content})

    # ── Check AI usage limit before calling the model ──
    # Priority: plan credits → universal credits (30% markup) → own API keys → block
    allowance = AI_PLAN_ALLOWANCES.get(user.plan, AI_PLAN_ALLOWANCES["starter"])
    allowance_cents = allowance["monthly_allowance_cents"]
    has_own_key = user.ai_override_enabled and bool(
        getattr(user, "ai_own_anthropic_key", None)
        or getattr(user, "ai_own_nvidia_key", None)
    )
    over_allowance = (user.ai_cost_cents or 0) >= allowance_cents
    use_own_keys = False

    if over_allowance:
        if (user.phone_credits_cents or 0) > 0:
            pass  # Has universal credits → proceed with admin keys + markup
        elif has_own_key:
            use_own_keys = True  # No credits left → fall back to subscriber's own keys
        else:
            raise HTTPException(
                status_code=429,
                detail=(
                    "You've used all your AI credits this month. "
                    "Buy more credits or add your own API keys in Settings > AI Provider "
                    "to keep using AI features."
                ),
            )

    result = await ai_complete(
        messages=messages,
        user_id=workspace_user_id(user),
        db=db,
        settings=settings,
        task_type=task,
        max_tokens=task_cfg["max_tokens"],
        temperature=task_cfg["temperature"],
        use_own_keys=use_own_keys,
    )

    response: dict = {
        "content": result["content"],
        "model": result["model"],
        "usage": {
            "input_tokens": result.get("input_tokens", 0),
            "output_tokens": result.get("output_tokens", 0),
            "cost_cents": result.get("cost_cents", 0),
        },
    }
    # Include warning threshold if one was crossed on this call
    if result.get("warning_pct"):
        response["usage"]["warning_pct"] = result["warning_pct"]
    return response


@ai_router.get("/usage")
async def get_my_usage(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's AI usage and remaining allowance."""
    allowance = AI_PLAN_ALLOWANCES.get(user.plan, AI_PLAN_ALLOWANCES["starter"])
    allowance_cents = allowance["monthly_allowance_cents"]
    cost = user.ai_cost_cents or 0
    has_own_key = user.ai_override_enabled and bool(
        getattr(user, "ai_own_anthropic_key", None)
        or getattr(user, "ai_own_nvidia_key", None)
    )

    return {
        "total_requests": user.ai_total_requests or 0,
        "total_tokens": user.ai_total_tokens or 0,
        "cost_cents": cost,
        "allowance_cents": allowance_cents,
        "remaining_cents": max(0, allowance_cents - cost),
        "credits_cents": user.phone_credits_cents or 0,
        "has_own_key": has_own_key,
        "plan": user.plan,
        "reset_at": user.ai_cost_reset_at.isoformat() if user.ai_cost_reset_at else None,
    }


@ai_router.post("/extract-contact-data")
async def extract_contact_data(
    body: ExtractContactRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Extract lead data from a conversation using NVIDIA (free) and update the CRM contact."""
    settings = _settings()

    # Convert messages to dicts
    msgs = [{"role": m.role, "content": m.content} for m in body.messages]

    extracted = await extract_conversation_data_with_db(msgs, db, settings)
    if not extracted:
        return {"extracted": {}, "updated": False}

    # Look up the CRM contact
    result = await db.execute(
        select(CrmContact).where(
            CrmContact.id == body.contact_id,
            CrmContact.user_id == workspace_user_id(user),
            CrmContact.is_deleted == False,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        return {"extracted": extracted, "updated": False}

    # Only update fields that are currently empty on the contact
    field_map = {
        "name": "name",
        "first_name": "first_name",
        "last_name": "last_name",
        "email": "email",
        "phone": "phone",
        "notes": "notes",
    }
    updated_any = False
    for json_key, db_col in field_map.items():
        value = extracted.get(json_key)
        if value and not getattr(contact, db_col, None):
            setattr(contact, db_col, value)
            updated_any = True

    # Special handling: property_address goes into notes if notes is empty
    prop_addr = extracted.get("property_address")
    if prop_addr and not contact.notes:
        contact.notes = f"Property: {prop_addr}"
        updated_any = True
    elif prop_addr and contact.notes and "Property:" not in contact.notes:
        contact.notes = f"{contact.notes}\nProperty: {prop_addr}"
        updated_any = True

    if updated_any:
        from datetime import datetime
        contact.last_activity = datetime.utcnow()
        await db.commit()

    return {"extracted": extracted, "updated": updated_any}


@ai_router.post("/research")
async def run_research(
    body: ResearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run a research query through the AI provider."""
    settings = _settings()

    result = await ai_research(
        query=body.query,
        user_id=workspace_user_id(user),
        db=db,
        settings=settings,
        context=body.context or "",
    )

    return {
        "content": result["content"],
        "provider": result["provider"],
        "model": result["model"],
    }


@ai_router.post("/rebuild-embeddings")
async def rebuild_embeddings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-embed all active knowledge entries for the current user.

    Useful after bulk-adding entries or when first setting up the RAG system.
    This creates or updates the embedding fingerprint for every active
    knowledge entry (both platform-level and user-level).
    """
    count = await rebuild_all_embeddings(workspace_user_id(user), db)
    return {
        "status": "completed",
        "entries_embedded": count,
    }


@ai_router.post("/seed-knowledge")
async def seed_knowledge(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seed platform-level starter knowledge entries and embed them.

    Creates standard REI scripts, objection handlers, and templates
    if they don't already exist, then generates embeddings for all of them.
    Safe to call multiple times — won't duplicate existing entries.
    """
    from rei.seeds.knowledge_seeds import seed_platform_knowledge
    from rei.seeds.persona_seeds import seed_platform_personas

    entries_created = await seed_platform_knowledge(db)
    personas_created = await seed_platform_personas(db)
    entries_embedded = await rebuild_all_embeddings(workspace_user_id(user), db)
    return {
        "status": "completed",
        "entries_created": entries_created,
        "personas_created": personas_created,
        "entries_embedded": entries_embedded,
    }


# ══════════════════════════════════════════════════════════════════════════
# CONTENTHUB AI ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════


@ai_router.post("/content/generate")
async def generate_content(
    body: ContentGenerateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a content waterfall — one source piece → 6 platform-specific versions.

    Takes source text and an optional topic, returns content optimized for:
    Facebook, Instagram, LinkedIn, YouTube script, YouTube Short, and blog post.
    """
    settings = _settings()

    if not body.source_text or len(body.source_text.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="Please provide at least 20 characters of source content to generate from.",
        )

    # Check AI usage limit (same pattern as /chat)
    allowance = AI_PLAN_ALLOWANCES.get(user.plan, AI_PLAN_ALLOWANCES["starter"])
    allowance_cents = allowance["monthly_allowance_cents"]
    has_own_key = user.ai_override_enabled and bool(
        getattr(user, "ai_own_anthropic_key", None)
        or getattr(user, "ai_own_nvidia_key", None)
    )
    over_allowance = (user.ai_cost_cents or 0) >= allowance_cents
    if over_allowance and (user.phone_credits_cents or 0) <= 0 and not has_own_key:
        raise HTTPException(
            status_code=429,
            detail="You've used all your AI credits this month. Buy more credits or add your own API keys.",
        )

    uid = workspace_user_id(user)
    result = await generate_content_waterfall(
        source_text=body.source_text,
        topic=body.topic or "Real Estate Investing",
        user_id=uid,
        db=db,
        settings=settings,
        tone_override=body.tone_override,
    )

    # Auto-save to ContentHub database + embed for semantic search
    content_entry_id = None
    try:
        from rei.services.content_hub_service import save_waterfall_content
        content_entry_id = await save_waterfall_content(
            user_id=uid,
            topic=body.topic or body.source_text[:60],
            waterfall_output=result.get("content", {}),
            source_article_id=None,
            tags=body.tags,
            db=db,
        )
        logger.info("Auto-saved waterfall to content DB (id=%s)", content_entry_id)
    except Exception as exc:
        logger.warning("Failed to auto-save waterfall: %s", exc)

    if content_entry_id:
        result["content_entry_id"] = content_entry_id
    return result


@ai_router.post("/content/scrape")
async def scrape_content(
    body: ContentScrapeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Scrape a URL and extract clean text content for use as source material.

    No AI credits are consumed — this just fetches and parses HTML.
    """
    if not body.url or not body.url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=400,
            detail="Please provide a valid URL starting with http:// or https://",
        )

    uid = workspace_user_id(user)
    try:
        result = await scrape_url_content(body.url)

        # Auto-save source article to ContentHub database + embed
        source_entry_id = None
        try:
            from rei.services.content_hub_service import save_source_article
            source_entry_id = await save_source_article(
                user_id=uid,
                source_url=body.url,
                source_text=result.get("text", ""),
                topic=body.url.split("/")[-1].replace("-", " ")[:80] or body.url,
                tags=body.tags or ["source"],
                db=db,
            )
            logger.info("Auto-saved source article to content DB (id=%s)", source_entry_id)
        except Exception as exc2:
            logger.warning("Failed to auto-save source article: %s", exc2)

        if source_entry_id:
            result["content_entry_id"] = source_entry_id
        return result

    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch the URL (status {exc.response.status_code}). Please check the URL and try again.",
        )
    except Exception as exc:
        logger.warning("URL scrape failed: %s", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Could not fetch the URL: {str(exc)[:200]}",
        )


# ══════════════════════════════════════════════════════════════════════════
# CONTENT IMAGE GENERATION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════


@ai_router.post("/content/generate-images")
async def generate_content_images(
    body: ContentImageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate platform-specific images using Claude Haiku (prompts) + NVIDIA Stable Diffusion.

    Consumes AI credits for the Haiku prompt generation (image generation via NVIDIA is free).
    """
    settings = _settings()
    uid = workspace_user_id(user)

    if not body.topic or not body.topic.strip():
        raise HTTPException(status_code=400, detail="Topic is required.")

    # Check AI credit limit
    user_obj = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not user_obj:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        results = await generate_platform_images(
            topic=body.topic.strip(),
            platforms=body.platforms,
            user_id=uid,
            db=db,
            settings=settings,
        )

        # Build response with public URLs
        base_url = settings.server_url if hasattr(settings, "server_url") else ""
        images_out = {}
        for plat, data in results.items():
            entry = {
                "id": data.get("id"),
                "prompt": data.get("prompt", ""),
                "width": data.get("width", 0),
                "height": data.get("height", 0),
            }
            if data.get("id"):
                entry["url"] = f"/api/ai/content/image/{data['id']}"
            if data.get("error"):
                entry["error"] = data["error"]
            images_out[plat] = entry

        return {"images": images_out, "topic": body.topic.strip()}

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Image generation failed: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Image generation failed: {str(exc)[:200]}",
        )


@ai_router.get("/content/image/{image_id}")
async def serve_content_image(
    image_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Serve a generated image by ID — PUBLIC endpoint (no auth).

    Social media APIs (Facebook, Instagram) need to fetch images from a public URL.
    Images expire after 7 days and return 404 after expiry.
    """
    result = await db.execute(
        select(ContentImage).where(
            ContentImage.id == image_id,
            ContentImage.is_deleted.is_(False),
        )
    )
    img = result.scalar_one_or_none()

    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check expiry
    if img.expires_at and img.expires_at < datetime.utcnow():
        raise HTTPException(status_code=404, detail="Image has expired")

    # Decode and serve
    try:
        image_bytes = base64.b64decode(img.image_b64)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decode image")

    return Response(
        content=image_bytes,
        media_type=img.mime_type or "image/png",
        headers={
            "Cache-Control": "public, max-age=604800",  # 7 days
            "Content-Disposition": f"inline; filename=content-{img.platform}.png",
        },
    )


# ══════════════════════════════════════════════════════════════════════════
# DOCUMENT INTELLIGENCE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════


@ai_router.post("/documents/analyze")
async def analyze_doc(
    body: DocumentAnalyzeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze a document (title report, inspection, contract, etc.) using AI.

    Looks up the file from the database, runs AI analysis, and stores results
    back on the DealFile record.
    """
    settings = _settings()
    uid = workspace_user_id(user)

    # Look up the file
    result_q = await db.execute(
        select(DealFile).where(
            DealFile.id == body.file_id,
            DealFile.user_id == uid,
            DealFile.deal_id == body.deal_id,
        )
    )
    file_record = result_q.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")

    # Check AI usage limit
    allowance = AI_PLAN_ALLOWANCES.get(user.plan, AI_PLAN_ALLOWANCES["starter"])
    allowance_cents = allowance["monthly_allowance_cents"]
    has_own_key = user.ai_override_enabled and bool(
        getattr(user, "ai_own_anthropic_key", None)
        or getattr(user, "ai_own_nvidia_key", None)
    )
    over_allowance = (user.ai_cost_cents or 0) >= allowance_cents
    if over_allowance and (user.phone_credits_cents or 0) <= 0 and not has_own_key:
        raise HTTPException(
            status_code=429,
            detail="You've used all your AI credits this month.",
        )

    # Mark as pending
    file_record.analysis_status = "pending"
    await db.commit()

    try:
        analysis = await analyze_document(
            file_content_b64=file_record.file_content,
            file_type=file_record.mime_type or "application/octet-stream",
            document_category=body.category or "general",
            user_id=uid,
            db=db,
            settings=settings,
        )

        # Store results on the file record
        import json as _json
        file_record.analysis_json = _json.dumps(analysis)
        file_record.analysis_status = "completed"
        await db.commit()

        return analysis

    except Exception as exc:
        logger.exception("Document analysis failed")
        file_record.analysis_status = "failed"
        await db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"Document analysis failed: {str(exc)[:200]}",
        )


# ══════════════════════════════════════════════════════════════════════════
# PROPERTY PHOTO ANALYSIS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════


@ai_router.post("/photos/analyze")
async def analyze_photos(
    body: PhotoAnalyzeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Analyze property photos using Claude Vision for condition assessment.

    If photo_ids is empty, analyzes all photos for the deal.
    Returns per-photo grades and an overall property condition summary.
    Also updates the deal's property_condition_grade and estimated_total_repairs.
    """
    settings = _settings()
    uid = workspace_user_id(user)

    # Look up the deal
    deal_q = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == body.deal_id,
            CrmDeal.user_id == uid,
            CrmDeal.is_deleted == False,
        )
    )
    deal = deal_q.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Get photos — either specific IDs or all for the deal
    if body.photo_ids:
        photos_q = await db.execute(
            select(DealFile).where(
                DealFile.deal_id == body.deal_id,
                DealFile.user_id == uid,
                DealFile.file_type == "photo",
                DealFile.id.in_(body.photo_ids),
            )
        )
    else:
        photos_q = await db.execute(
            select(DealFile).where(
                DealFile.deal_id == body.deal_id,
                DealFile.user_id == uid,
                DealFile.file_type == "photo",
            )
        )
    photo_records = photos_q.scalars().all()

    if not photo_records:
        raise HTTPException(status_code=404, detail="No photos found for this deal")

    # Check AI usage limit
    allowance = AI_PLAN_ALLOWANCES.get(user.plan, AI_PLAN_ALLOWANCES["starter"])
    allowance_cents = allowance["monthly_allowance_cents"]
    has_own_key = user.ai_override_enabled and bool(
        getattr(user, "ai_own_anthropic_key", None)
        or getattr(user, "ai_own_nvidia_key", None)
    )
    over_allowance = (user.ai_cost_cents or 0) >= allowance_cents
    if over_allowance and (user.phone_credits_cents or 0) <= 0 and not has_own_key:
        raise HTTPException(
            status_code=429,
            detail="You've used all your AI credits this month.",
        )

    # Build the photos list for the analysis function
    photos_data = []
    photo_id_map = []  # Track which DealFile each photo came from
    for pr in photo_records[:12]:  # Max 12 photos
        photos_data.append({
            "base64": pr.file_content,
            "media_type": pr.mime_type or "image/jpeg",
            "category": pr.category or "miscellaneous",
        })
        photo_id_map.append(pr)

    try:
        analysis = await analyze_property_photos(
            photos=photos_data,
            property_address=deal.address or "Unknown",
            user_id=uid,
            db=db,
            settings=settings,
        )

        # Store per-photo results on each DealFile
        import json as _json
        per_photo = analysis.get("per_photo", [])
        for i, photo_result in enumerate(per_photo):
            if i < len(photo_id_map):
                photo_id_map[i].photo_analysis_json = _json.dumps(photo_result)

        # Update deal with overall condition
        summary = analysis.get("summary", {})
        if summary.get("overall_grade"):
            deal.property_condition_grade = summary["overall_grade"]
        if summary.get("total_estimated_repairs"):
            try:
                deal.estimated_total_repairs = float(summary["total_estimated_repairs"])
            except (ValueError, TypeError):
                pass

        await db.commit()

        return analysis

    except Exception as exc:
        logger.exception("Photo analysis failed")
        raise HTTPException(
            status_code=500,
            detail=f"Photo analysis failed: {str(exc)[:200]}",
        )
