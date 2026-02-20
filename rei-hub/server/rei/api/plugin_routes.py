"""Plugin validation routes — machine-to-machine endpoints called by Helm Hub."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from rei.api.deps import get_db
from rei.config import get_settings
from rei.models.user import User

plugin_router = APIRouter(prefix="/plugin", tags=["plugin"])


class PluginValidationResponse(BaseModel):
    active: bool
    plan: str | None
    helm_addon: bool


@plugin_router.get("/validate", response_model=PluginValidationResponse)
async def validate_plugin(
    email: str,
    x_plugin_secret: str = Header(alias="X-Plugin-Secret"),
    db: AsyncSession = Depends(get_db),
) -> PluginValidationResponse:
    """Validate that a user has an active REI Hub subscription.

    Called by Helm Hub (machine-to-machine) with a shared secret header.
    """
    settings = get_settings()

    if x_plugin_secret != settings.plugin_shared_secret:
        raise HTTPException(status_code=403, detail="Invalid plugin secret")

    result = await db.execute(
        select(User)
        .options(selectinload(User.subscription))
        .where(User.email == email)
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    if user.subscription is None:
        return PluginValidationResponse(active=False, plan=None, helm_addon=False)

    sub = user.subscription

    if sub.status in ("trialing", "active"):
        if sub.trial_ends_at is not None and sub.trial_ends_at < datetime.now(timezone.utc):
            return PluginValidationResponse(
                active=False, plan=sub.plan, helm_addon=sub.helm_addon
            )
        return PluginValidationResponse(
            active=True, plan=sub.plan, helm_addon=sub.helm_addon
        )

    return PluginValidationResponse(
        active=False, plan=sub.plan, helm_addon=sub.helm_addon
    )
