"""
User notification-preferences endpoints.

GET  /api/user/notifications/preferences  → current user's channel settings
PATCH /api/user/notifications/preferences → partial update
POST /api/user/notifications/voice-preview → generate a TTS preview clip
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
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
    "preferred_voice",
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
    preferred_voice: Optional[str] = None  # alloy, echo, fable, onyx, nova, shimmer


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


_VALID_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}

_VOICE_PREVIEWS = {
    "alloy": "Hi there! I'm Alloy — a balanced, neutral voice. How can I help with your deals today?",
    "echo": "Hey! I'm Echo — clear and smooth. Ready to help you manage your pipeline.",
    "fable": "Hello! I'm Fable — expressive and warm. Let's find your next investment opportunity!",
    "onyx": "Good day. I'm Onyx — deep and authoritative. Let's review your real estate portfolio.",
    "nova": "Hi! I'm Nova — warm and natural. I'm here to help you with your investing business!",
    "shimmer": "Hey there! I'm Shimmer — bright and energetic! Let's dive into your deal analysis!",
}


class VoicePreviewBody(BaseModel):
    voice: str  # alloy, echo, fable, onyx, nova, shimmer


@user_preferences_router.post("/voice-preview")
async def voice_preview(
    body: VoicePreviewBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a short TTS preview clip for the selected voice.

    Returns audio/ogg bytes that the frontend can play directly.
    """
    voice = body.voice.lower().strip()
    if voice not in _VALID_VOICES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid voice. Choose from: {', '.join(sorted(_VALID_VOICES))}",
        )

    # Get OpenAI key from admin credentials
    from rei.services.credentials_service import get_provider_credentials

    creds = await get_provider_credentials(db, "openai")
    openai_key = creds.get("openai_api_key", "") if creds else ""
    if not openai_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OpenAI API key not configured. Ask your admin to set it in Admin > Credentials.",
        )

    # Generate the preview audio in MP3 format (browser-compatible)
    import httpx
    import logging

    logger = logging.getLogger(__name__)

    preview_text = _VOICE_PREVIEWS.get(voice, f"Hi, I'm {voice}. How can I help?")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/audio/speech",
                headers={
                    "Authorization": f"Bearer {openai_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1",
                    "input": preview_text,
                    "voice": voice,
                    "response_format": "mp3",  # MP3 plays in all browsers
                },
            )
            resp.raise_for_status()
            audio_bytes = resp.content
    except Exception as exc:
        logger.error("Voice preview TTS failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to generate voice preview. Please try again.",
        )

    if not audio_bytes:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to generate voice preview. Please try again.",
        )

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": f"inline; filename=preview-{voice}.mp3"},
    )
