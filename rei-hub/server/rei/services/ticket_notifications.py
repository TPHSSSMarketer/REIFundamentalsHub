"""Ticket Notification Service — Email + Telegram alerts for help tickets.

When a user submits a help ticket, two things happen:
1. An email is sent to support@reifundamentalshub.com with ticket details
2. A Telegram message is sent to the platform owner via a Telegram Bot

HOW IT WORKS (in plain English):
- User clicks "Submit Ticket" in the app
- Backend creates the ticket record in the database
- This service sends both notifications in parallel
- If either notification fails, the ticket is still created (notifications are best-effort)

TELEGRAM SETUP:
- The bot token and chat ID are stored in the encrypted credentials DB
  (SuperAdmin → Telegram settings)
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
    from rei.models.user import HelpTicket, User

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


# ── Email notification ───────────────────────────────────────────────

async def send_ticket_email(
    ticket: HelpTicket,
    user: User,
    settings: Settings,
) -> bool:
    """
    Send an email notification about a new help ticket to support.

    Uses the same SendGrid setup as the rest of the platform.
    """
    from rei.services.email import send_email

    subject = f"[Ticket #{ticket.id[:8]}] {ticket.subject}"

    # Build a nice HTML email with ticket details
    priority_colors = {
        "low": "#22c55e",
        "normal": "#3b82f6",
        "high": "#f59e0b",
        "urgent": "#ef4444",
    }
    priority_color = priority_colors.get(ticket.priority, "#3b82f6")

    html_content = f"""
    <h2 style="margin-top:0;">New Support Ticket</h2>

    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr>
            <td style="padding:8px 12px;background:#f8f9fa;font-weight:bold;width:140px;">Ticket ID</td>
            <td style="padding:8px 12px;">{ticket.id[:8]}</td>
        </tr>
        <tr>
            <td style="padding:8px 12px;background:#f8f9fa;font-weight:bold;">Submitted By</td>
            <td style="padding:8px 12px;">{user.full_name or user.email} ({user.email})</td>
        </tr>
        <tr>
            <td style="padding:8px 12px;background:#f8f9fa;font-weight:bold;">Category</td>
            <td style="padding:8px 12px;">{ticket.category.replace('_', ' ').title()}</td>
        </tr>
        <tr>
            <td style="padding:8px 12px;background:#f8f9fa;font-weight:bold;">Priority</td>
            <td style="padding:8px 12px;">
                <span style="background:{priority_color};color:#fff;padding:2px 10px;border-radius:12px;font-size:13px;">
                    {ticket.priority.upper()}
                </span>
            </td>
        </tr>
        <tr>
            <td style="padding:8px 12px;background:#f8f9fa;font-weight:bold;">Subject</td>
            <td style="padding:8px 12px;font-weight:bold;">{ticket.subject}</td>
        </tr>
    </table>

    <div style="background:#f8f9fa;padding:16px;border-radius:8px;margin:16px 0;">
        <strong>Description:</strong><br><br>
        {ticket.description.replace(chr(10), '<br>')}
    </div>

    <p style="color:#666;font-size:13px;">
        User ID: {user.id} &middot; Plan: {user.plan or 'N/A'}
    </p>
    """

    try:
        result = await send_email(
            to_email="support@reifundamentalshub.com",
            to_name="REIFundamentals Support",
            subject=subject,
            html_content=html_content,
            settings=settings,
        )
        if result:
            logger.info(f"Ticket email sent for ticket {ticket.id[:8]}")
        return result
    except Exception as e:
        logger.error(f"Failed to send ticket email: {e}")
        return False


# ── Telegram notification ────────────────────────────────────────────

async def send_ticket_telegram(
    ticket: HelpTicket,
    user: User,
    settings: Settings,
) -> bool:
    """
    Send a Telegram message about a new help ticket.

    The message goes to the platform owner's Telegram chat
    via the configured bot.  Reads bot_token and chat_id from
    the encrypted credentials DB (SuperAdmin → Telegram).
    """
    from rei.database import async_session_factory
    from rei.services.credentials_service import get_provider_credentials

    try:
        async with async_session_factory() as db:
            creds = await get_provider_credentials(db, "telegram")
    except Exception as e:
        logger.error("Failed to read Telegram credentials from DB: %s", e)
        return False

    if not creds:
        logger.info("Telegram credentials not found, skipping ticket notification")
        return False

    bot_token = creds.get("telegram_bot_token", "")
    chat_id = creds.get("telegram_chat_id", "")

    if not bot_token or not chat_id:
        logger.info("Telegram not configured (missing token or chat_id), skipping notification")
        return False

    # Build a clean Telegram message with emoji indicators
    priority_emoji = {
        "low": "🟢",
        "normal": "🔵",
        "high": "🟡",
        "urgent": "🔴",
    }
    emoji = priority_emoji.get(ticket.priority, "🔵")

    message = (
        f"{emoji} *New Support Ticket*\n\n"
        f"*Subject:* {_escape_markdown(ticket.subject)}\n"
        f"*From:* {_escape_markdown(user.full_name or user.email)}\n"
        f"*Email:* {_escape_markdown(user.email)}\n"
        f"*Category:* {ticket.category.replace('_', ' ').title()}\n"
        f"*Priority:* {ticket.priority.upper()}\n\n"
        f"*Description:*\n{_escape_markdown(ticket.description[:500])}"
    )

    if len(ticket.description) > 500:
        message += "\n\\.\\.\\. \\(truncated\\)"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{TELEGRAM_API_BASE}/bot{bot_token}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": message,
                    "parse_mode": "MarkdownV2",
                },
                timeout=10,
            )

            if resp.status_code == 200:
                logger.info(f"Telegram notification sent for ticket {ticket.id[:8]}")
                return True
            else:
                logger.warning(
                    f"Telegram API returned {resp.status_code}: {resp.text}"
                )
                return False

    except Exception as e:
        logger.error(f"Failed to send Telegram notification: {e}")
        return False


def _escape_markdown(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    special_chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
    for char in special_chars:
        text = text.replace(char, f'\\{char}')
    return text


# ── Send both notifications ──────────────────────────────────────────

async def notify_new_ticket(
    ticket: HelpTicket,
    user: User,
    settings: Settings,
) -> dict:
    """
    Send all notifications for a new help ticket.

    Sends email and Telegram in sequence (both are fast HTTP calls).
    Returns a dict showing which notifications succeeded.
    """
    email_ok = await send_ticket_email(ticket, user, settings)
    telegram_ok = await send_ticket_telegram(ticket, user, settings)

    return {
        "email_sent": email_ok,
        "telegram_sent": telegram_ok,
    }
