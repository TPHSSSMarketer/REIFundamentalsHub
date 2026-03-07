"""Negotiation Notification Service — Email + Telegram alerts for negotiation events.

When users submit negotiation requests or receive updates on their cases,
notifications are sent to both admin (via Telegram) and users (via email).

TWO-SIDED NOTIFICATIONS:
1. User submits a request → Telegram alert to admin (Chris) with deal snapshot
2. Admin accepts/declines/requests info → Email to user with status update
3. Admin logs activity → Email to user with sanitized summary
4. Package tracking updates → Push to user when status changes

TELEGRAM SETUP:
- The bot token is stored in Settings (telegram_bot_token)
- The chat ID is stored in Settings (telegram_chat_id)
- To find your chat_id: message the bot, then visit
  https://api.telegram.org/bot<TOKEN>/getUpdates
  and look for the chat.id in the response
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from rei.config import Settings

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


# ── Telegram notification (core) ─────────────────────────────────────


async def send_negotiation_telegram(
    message: str,
    settings: Settings,
) -> bool:
    """
    Send a Telegram message to the admin chat about a negotiation event.

    Uses the same bot setup as ticket_notifications.py.
    Message is sent with MarkdownV2 parse mode.
    """
    bot_token = getattr(settings, "telegram_bot_token", "") or ""
    chat_id = getattr(settings, "telegram_chat_id", "") or ""

    if not bot_token or not chat_id:
        logger.info("Telegram not configured, skipping negotiation notification")
        return False

    # Escape special characters for MarkdownV2
    escaped_message = _escape_markdown(message)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{TELEGRAM_API_BASE}/bot{bot_token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": escaped_message,
                    "parse_mode": "MarkdownV2",
                },
                timeout=10,
            )

            if resp.status_code == 200:
                logger.info("Telegram negotiation notification sent successfully")
                return True
            else:
                logger.warning(
                    f"Telegram API returned {resp.status_code}: {resp.text}"
                )
                return False

    except Exception as e:
        logger.error(f"Failed to send negotiation Telegram notification: {e}")
        return False


# ── User request notifications ───────────────────────────────────────


async def notify_new_request(
    request_data: dict,
    user_email: str,
    user_name: str,
    settings: Settings,
) -> None:
    """
    Notify admin when a user submits a new negotiation request.

    Sends a Telegram message with request summary (property, service types, user).
    """
    property_address = request_data.get("property_address", "Unknown")
    service_types = request_data.get("service_types_json", "[]")
    deal_id = request_data.get("deal_id", "")

    message = (
        f"🏦 *New Negotiation Request*\n\n"
        f"*Property:* {_escape_markdown(property_address)}\n"
        f"*Services:* {_escape_markdown(service_types)}\n"
        f"*From:* {_escape_markdown(user_name)}\n"
        f"*Email:* {_escape_markdown(user_email)}\n"
        f"*Deal ID:* {_escape_markdown(deal_id)}"
    )

    await send_negotiation_telegram(message, settings)

    # TODO: Send email notification to user confirming receipt of request


async def notify_request_update(
    request_id: str,
    new_status: str,
    user_email: str,
    settings: Settings,
) -> None:
    """
    Notify user when admin accepts, requests info, or declines their request.

    Sends email to user with status update and next steps.
    """
    # TODO: Send email to user with request status update
    # Subject: "Negotiation Request Update: [request_id]"
    # Body: Include status, what happens next, reply instructions
    # Also send Telegram/WhatsApp/Slack notification to admin logging this action
    pass


# ── Activity notifications ───────────────────────────────────────────


async def notify_new_activity(
    case_id: str,
    user_summary: str,
    user_email: str,
    settings: Settings,
) -> None:
    """
    Notify user when admin logs a new activity in their case.

    Sends the sanitized user_summary (AI-generated) via email.
    """
    # TODO: Send email to user with activity summary
    # Subject: "Case [case_id] Update"
    # Body: Include user_summary with formatting
    # Do NOT include admin_note or attachments
    pass


# ── Tracking notifications ───────────────────────────────────────────


async def notify_tracking_update(
    case_id: str,
    tracking_status: str,
    user_email: str,
    settings: Settings,
) -> None:
    """
    Push tracking status changes to user.

    Called when USPS or Fax tracking status changes on a correspondence/activity.
    """
    # TODO: Send email/SMS to user with tracking update
    # e.g., "Package delivered", "Attempted delivery", "In transit"
    # Include tracking number, delivery date/time if available
    pass


# ── Chat message notifications ───────────────────────────────────────


async def notify_new_message(
    case_id: str,
    sender_role: str,
    recipient_email: str,
    settings: Settings,
) -> None:
    """
    Notify the other party when a chat message is received.

    If sender is user → Send Telegram to admin
    If sender is admin → Send email to user
    """
    if sender_role == "user":
        # TODO: Send Telegram to admin that user sent a message
        message = f"💬 *New message from user* in case {_escape_markdown(case_id)}"
        await send_negotiation_telegram(message, settings)
    elif sender_role == "admin":
        # TODO: Send email to user that admin sent a message
        pass


# ── Internal helpers ─────────────────────────────────────────────────


def _escape_markdown(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    special_chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
    for char in special_chars:
        text = text.replace(char, f'\\{char}')
    return text
