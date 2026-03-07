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

from rei.services.email import send_email

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
    Also sends email to user confirming receipt of request.
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

    # Send email confirmation to user
    subject = "Negotiation Request Received"
    html_content = f"""
    <h2>Thank You for Your Request</h2>
    <p>Hi {user_name},</p>
    <p>We've received your negotiation request for the following property:</p>
    <div style="background:#f8f9fa;padding:12px;border-radius:6px;margin:16px 0;">
        <strong>Property:</strong> {property_address}<br>
        <strong>Services Requested:</strong> {service_types}
    </div>
    <p>Our team will review your request and get back to you shortly with next steps.</p>
    <p>Thank you for choosing REIFundamentals!</p>
    """

    try:
        await send_email(user_email, user_name, subject, html_content, settings)
        logger.info(f"New request confirmation email sent to {user_email}")
    except Exception as e:
        logger.error(f"Failed to send new request email to {user_email}: {e}")


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
    # Build status-specific subject and body
    if new_status == "accepted":
        subject = "Negotiation Request Accepted"
        status_text = "accepted and approved"
        next_steps = "Our team will begin creating cases and starting work on your request. You'll receive updates as we progress."
    elif new_status == "info_requested":
        subject = "More Information Needed"
        status_text = "received, but we need more information"
        next_steps = "Please reply to this email with the additional details our team has requested. Once we receive your information, we'll proceed with your request."
    elif new_status == "declined":
        subject = "Negotiation Request Update"
        status_text = "received, but unfortunately could not be processed"
        next_steps = "If you believe this was in error or have questions, please reach out to our support team for further assistance."
    else:
        subject = "Negotiation Request Update"
        status_text = f"has been updated to {new_status}"
        next_steps = "Check your dashboard for more details."

    html_content = f"""
    <h2>Request Status Update</h2>
    <p>Hi there,</p>
    <p>Your negotiation request (ID: <strong>{request_id}</strong>) has been <strong>{status_text}</strong>.</p>
    <p>{next_steps}</p>
    <p>If you have any questions, please don't hesitate to contact our support team.</p>
    <p>Thank you for using REIFundamentals!</p>
    """

    try:
        await send_email(user_email, "", subject, html_content, settings)
        logger.info(f"Request update email ({new_status}) sent to {user_email}")
    except Exception as e:
        logger.error(f"Failed to send request update email to {user_email}: {e}")


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
    Do NOT include admin_note.
    """
    subject = "Case Update"
    html_content = f"""
    <h2>New Update on Your Case</h2>
    <p>Hi there,</p>
    <p>There's a new update on your negotiation case (ID: <strong>{case_id}</strong>):</p>
    <div style="background:#f8f9fa;padding:16px;border-radius:6px;margin:16px 0;line-height:1.6;">
        {user_summary.replace(chr(10), '<br>')}
    </div>
    <p>Log in to your dashboard to see the full details and reply if needed.</p>
    <p>Thank you for choosing REIFundamentals!</p>
    """

    try:
        await send_email(user_email, "", subject, html_content, settings)
        logger.info(f"Activity update email sent for case {case_id} to {user_email}")
    except Exception as e:
        logger.error(f"Failed to send activity update email for case {case_id}: {e}")


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
    subject = f"Tracking Update — {tracking_status}"
    html_content = f"""
    <h2>Tracking Status Update</h2>
    <p>Hi there,</p>
    <p>The tracking status for your negotiation case (ID: <strong>{case_id}</strong>) has been updated:</p>
    <div style="background:#f8f9fa;padding:16px;border-radius:6px;margin:16px 0;">
        <strong>Current Status:</strong> {tracking_status}<br>
        <strong>Case Reference:</strong> {case_id}
    </div>
    <p>Log in to your dashboard to view more details about your case.</p>
    <p>Thank you for using REIFundamentals!</p>
    """

    try:
        await send_email(user_email, "", subject, html_content, settings)
        logger.info(f"Tracking update email sent for case {case_id} to {user_email}")
    except Exception as e:
        logger.error(f"Failed to send tracking update email for case {case_id}: {e}")


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
        # Send Telegram to admin that user sent a message
        message = f"💬 *New message from user* in case {_escape_markdown(case_id)}"
        await send_negotiation_telegram(message, settings)
    elif sender_role == "admin":
        # Send email to user that admin sent a message
        subject = "New Message on Your Case"
        html_content = f"""
        <h2>New Message</h2>
        <p>Hi there,</p>
        <p>You have a new message regarding your negotiation case (ID: <strong>{case_id}</strong>).</p>
        <p>Log in to your dashboard to view and reply to your message.</p>
        <p>Thank you for using REIFundamentals!</p>
        """

        try:
            await send_email(recipient_email, "", subject, html_content, settings)
            logger.info(f"New message notification email sent for case {case_id} to {recipient_email}")
        except Exception as e:
            logger.error(f"Failed to send message notification email for case {case_id}: {e}")


# ── Internal helpers ─────────────────────────────────────────────────


def _escape_markdown(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    special_chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
    for char in special_chars:
        text = text.replace(char, f'\\{char}')
    return text
