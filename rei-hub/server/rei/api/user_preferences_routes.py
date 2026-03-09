"""
User notification-preferences endpoints.

GET  /api/user/notifications/preferences  → current user's channel settings
PATCH /api/user/notifications/preferences → partial update
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.user import User

user_preferences_router = APIRouter(
    prefix="/user/notifications",
    tags=["user-preferences"],
)

_NOTIFICATION_FIELDS = (
    "telegram_enabled",
    "telegram_chat_id",
    "whatsapp_enabled",
    "whatsapp_phone_number",
    "slack_enabled",
    "slack_webhook_url",
    "assistant_channel",
    "voice_enabled",
)


class UpdateNotificationPrefsBody(BaseModel):
    telegram_enabled: Optional[bool] = None
    telegram_chat_id: Optional[str] = None
    whatsapp_enabled: Optional[bool] = None
    whatsapp_phone_number: Optional[str] = None
    slack_enabled: Optional[bool] = None
    slack_webhook_url: Optional[str] = None
    assistant_channel: Optional[str] = None  # "web", "telegram", "whatsapp", "slack"
    voice_enabled: Optional[bool] = None


def _prefs_dict(user: User) -> dict:
    return {f: getattr(user, f, None) for f in _NOTIFICATION_FIELDS}


@user_preferences_router.get("/preferences")
async def get_notification_preferences(
    user: User = Depends(get_current_user),
):
    """Return the authenticated user's notification channel settings."""
    return _prefs_dict(user)


@user_preferences_router.patch("/preferences")
async def update_notification_preferences(
    body: UpdateNotificationPrefsBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Partially update the user's notification channel settings."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    for field, value in updates.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)
    return _prefs_dict(user)
