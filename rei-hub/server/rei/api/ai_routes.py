"""AI Provider Management API routes."""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import AI_PLAN_ALLOWANCES, Settings, get_settings
from rei.models.crm import CrmContact
from rei.models.user import AIProviderConfig, User
from rei.services.ai_service import (
    PROVIDER_CONFIGS,
    ai_complete,
    ai_research,
    decrypt_api_key,
    encrypt_api_key,
    extract_conversation_data_with_db,
    get_user_knowledge,
    mask_api_key,
)
from rei.services.rag_service import rebuild_all_embeddings, retrieve_relevant_knowledge

logger = logging.getLogger(__name__)
ai_router = APIRouter(prefix="/ai", tags=["ai"])


# ── Schemas ───────────────────────────────────────────────────────────────


class AdminConfigUpdate(BaseModel):
    active_provider: Optional[str] = None
    active_model: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    nvidia_api_key: Optional[str] = None
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


class TestRequest(BaseModel):
    message: str


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


# ── Helpers ───────────────────────────────────────────────────────────────


def _require_superadmin(user: User) -> None:
    """Raise 403 if the user is not an admin."""
    if not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Super admin access required")


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
    """Serialize config with masked keys."""
    anthropic_masked = ""
    nvidia_masked = ""
    if config.anthropic_api_key:
        anthropic_masked = mask_api_key(
            decrypt_api_key(config.anthropic_api_key, _settings().ai_encryption_key)
        )
    if config.nvidia_api_key:
        nvidia_masked = mask_api_key(
            decrypt_api_key(config.nvidia_api_key, _settings().ai_encryption_key)
        )

    return {
        "id": config.id,
        "active_provider": config.active_provider,
        "active_model": config.active_model,
        "anthropic_api_key": anthropic_masked,
        "anthropic_configured": bool(config.anthropic_api_key),
        "nvidia_api_key": nvidia_masked,
        "nvidia_configured": bool(config.nvidia_api_key),
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

    if body.anthropic_api_key is not None:
        config.anthropic_api_key = encrypt_api_key(
            body.anthropic_api_key, settings.ai_encryption_key
        )

    if body.nvidia_api_key is not None:
        config.nvidia_api_key = encrypt_api_key(
            body.nvidia_api_key, settings.ai_encryption_key
        )

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

    return {
        "total_requests": config.total_requests,
        "total_tokens": config.total_tokens,
        "per_user": per_user,
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

    available_providers = [
        {
            "id": pid,
            "display_name": pc["display_name"],
            "models": pc["models"],
            "default_model": pc["default_model"],
        }
        for pid, pc in PROVIDER_CONFIGS.items()
    ]

    return {
        "active_provider": effective_provider,
        "active_model": effective_model,
        "available_providers": available_providers,
        "can_override": config.allow_user_override,
        "can_bring_own_key": config.user_can_bring_own_key,
        "has_own_keys": has_own_anthropic or has_own_nvidia,
        "override_enabled": user.ai_override_enabled,
        "own_anthropic_configured": has_own_anthropic,
        "own_nvidia_configured": has_own_nvidia,
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
        task_type="general",
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
    # If over allowance: allow if user has own key OR has universal credits.
    allowance = AI_PLAN_ALLOWANCES.get(user.plan, AI_PLAN_ALLOWANCES["starter"])
    allowance_cents = allowance["monthly_allowance_cents"]
    has_own_key = user.ai_override_enabled and bool(
        getattr(user, "ai_own_anthropic_key", None)
        or getattr(user, "ai_own_nvidia_key", None)
    )
    over_allowance = (user.ai_cost_cents or 0) >= allowance_cents
    if over_allowance and not has_own_key:
        # No own key — check if they have universal credits
        if (user.phone_credits_cents or 0) <= 0:
            raise HTTPException(
                status_code=429,
                detail="ai_limit_reached",
            )
        # Has credits → let through, credits will be deducted in ai_complete()

    result = await ai_complete(
        messages=messages,
        user_id=workspace_user_id(user),
        db=db,
        settings=settings,
        task_type=task,
        max_tokens=task_cfg["max_tokens"],
        temperature=task_cfg["temperature"],
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
