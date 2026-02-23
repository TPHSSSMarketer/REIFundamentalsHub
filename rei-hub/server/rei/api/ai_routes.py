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

from rei.api.deps import get_current_user, get_db
from rei.config import Settings, get_settings
from rei.models.user import AIProviderConfig, User
from rei.services.ai_service import (
    PROVIDER_CONFIGS,
    ai_complete,
    ai_research,
    decrypt_api_key,
    encrypt_api_key,
    mask_api_key,
)

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


class ResearchRequest(BaseModel):
    query: str
    context: Optional[str] = ""


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
    """Return usage statistics across all users."""
    _require_superadmin(user)
    config = await _get_or_create_global_config(db)

    # Get per-user stats from users who have overrides enabled
    result = await db.execute(
        select(User).where(User.ai_override_enabled.is_(True))
    )
    users_with_overrides = result.scalars().all()

    per_user = []
    for u in users_with_overrides:
        per_user.append({
            "user_id": u.id,
            "email": u.email,
            "provider": u.ai_provider_override or config.active_provider,
            "model": u.ai_model_override or config.active_model,
            "requests": 0,  # Per-user tracking would need a separate table
            "tokens": 0,
        })

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
        user_id=user.id,
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
        user_id=user.id,
        db=db,
        settings=settings,
        context=body.context or "",
    )

    return {
        "content": result["content"],
        "provider": result["provider"],
        "model": result["model"],
    }
