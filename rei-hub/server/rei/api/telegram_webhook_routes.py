"""Telegram Bot webhook routes — receives incoming messages from Telegram.

The /webhook endpoint is PUBLIC (Telegram calls it directly).
The /register endpoint is admin-only.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import User

logger = logging.getLogger(__name__)

telegram_webhook_router = APIRouter(
    prefix="/api/telegram",
    tags=["telegram"],
)


@telegram_webhook_router.post("/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive incoming Telegram updates (messages).

    This endpoint is called by Telegram's servers when someone messages
    the bot. It must respond quickly (within a few seconds) so we process
    the message in the background.

    No authentication — Telegram sends updates directly.
    """
    try:
        update = await request.json()
    except Exception:
        logger.warning("Telegram webhook received non-JSON body")
        return {"ok": True}

    # Only process message updates (not edited_message, callback_query, etc.)
    if "message" not in update:
        return {"ok": True}

    logger.info(
        "Telegram webhook update_id=%s from chat_id=%s",
        update.get("update_id", "?"),
        update.get("message", {}).get("chat", {}).get("id", "?"),
    )

    # Process in background so we respond to Telegram quickly
    from rei.services.telegram_channel_service import handle_telegram_message

    background_tasks.add_task(handle_telegram_message, update)

    return {"ok": True}


@telegram_webhook_router.post("/register-webhook")
async def register_webhook(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Register the Telegram webhook URL with the Bot API.

    Admin-only. Call this after setting up the bot token in admin settings.
    The webhook URL is auto-detected from the server's configured domain.
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Admin only")

    settings = get_settings()

    # Build the webhook URL from the server's configured public URL
    server_url = getattr(settings, "server_url", "") or ""

    if not server_url or "localhost" in server_url:
        raise HTTPException(
            status_code=400,
            detail="Cannot determine server public URL. Set server_public_url in config.",
        )

    webhook_url = f"{server_url.rstrip('/')}/api/telegram/webhook"

    from rei.services.telegram_channel_service import register_telegram_webhook

    success = await register_telegram_webhook(webhook_url)

    if success:
        return {"detail": f"Telegram webhook registered at {webhook_url}"}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to register Telegram webhook. Check bot token and server URL.",
        )


@telegram_webhook_router.get("/webhook-info")
async def get_webhook_info(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current Telegram webhook status. Admin-only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Admin only")

    import httpx
    from rei.services.telegram_channel_service import _get_bot_token

    bot_token = await _get_bot_token(db)
    if not bot_token:
        return {"configured": False, "detail": "No bot token configured"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://api.telegram.org/bot{bot_token}/getWebhookInfo"
            )
            resp.raise_for_status()
            info = resp.json().get("result", {})
            return {
                "configured": True,
                "url": info.get("url", ""),
                "has_custom_certificate": info.get("has_custom_certificate", False),
                "pending_update_count": info.get("pending_update_count", 0),
                "last_error_date": info.get("last_error_date"),
                "last_error_message": info.get("last_error_message"),
                "max_connections": info.get("max_connections"),
            }
    except Exception as exc:
        return {"configured": True, "error": str(exc)}
