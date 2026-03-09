"""Negotiation Notification Service — multi-channel alerts for negotiation events.

ADMIN NOTIFICATIONS (Telegram + WhatsApp + Slack):
  Sent when users take actions — new request, new message.
  All three channels are optional: if not configured, silently skipped.

USER NOTIFICATIONS (Email + Telegram + WhatsApp + Slack):
  Sent when admin takes actions — accept/decline, activity, tracking, message.
  Email uses _send_with_template() so templates are editable in Admin → Email Templates.
  Telegram/WhatsApp/Slack use per-user settings from their profile.

SETUP (Admin channels):
  Telegram: SuperAdmin → Telegram → Bot Token + Chat ID
  WhatsApp: SuperAdmin → Twilio → WhatsApp From/To Numbers
  Slack:    SuperAdmin → Slack → Incoming Webhook URL

SETUP (User channels):
  Users configure their own Telegram Chat ID, WhatsApp number, or Slack webhook
  in Settings → Preferences → Notifications.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx

from rei.services.email import _send_with_template

if TYPE_CHECKING:
    from rei.config import Settings

logger = logging.getLogger(__name__)

TELEGRAM_API_BASE = "https://api.telegram.org"


# ── DB session helper ─────────────────────────────────────────────────

async def _get_db():
    """Create a standalone async db session for template lookups."""
    from rei.database import async_session_factory
    return async_session_factory()


# ── Multi-channel admin notification ──────────────────────────────────

async def _notify_admin(
    telegram_message: str,
    plain_message: str,
    settings: Settings,
) -> None:
    """Send an admin alert to all configured channels (Telegram, WhatsApp, Slack).

    Each channel is independent: if one fails or isn't configured, the others
    still fire. Errors are logged but never raised.

    Args:
        telegram_message: MarkdownV2-formatted message for Telegram.
        plain_message: Plain text message for WhatsApp and Slack.
        settings: App settings (used for Telegram bot token/chat ID).
    """
    # All channels use encrypted credentials from DB
    try:
        async with await _get_db() as db:
            # Telegram (reads bot_token + chat_id from encrypted credentials)
            await send_negotiation_telegram(telegram_message, db)

            # WhatsApp via Twilio
            try:
                from rei.services.whatsapp_service import send_whatsapp_message
                await send_whatsapp_message(plain_message, db=db)
            except Exception as e:
                logger.debug("WhatsApp notification skipped: %s", e)

            # Slack via Incoming Webhook
            try:
                from rei.services.slack_service import send_slack_message
                await send_slack_message(plain_message, db=db)
            except Exception as e:
                logger.debug("Slack notification skipped: %s", e)
    except Exception as e:
        logger.warning("Could not open DB session for notifications: %s", e)


# ── Multi-channel user notification ──────────────────────────────────


async def _notify_user(
    user_id: int,
    telegram_msg: str,
    plain_msg: str,
) -> None:
    """Send notifications to a user via their configured channels.

    Looks up the user's Telegram/WhatsApp/Slack preferences and sends
    to every enabled channel. Each channel is independent — failures
    are logged but never raised.

    Args:
        user_id: The user's DB id.
        telegram_msg: MarkdownV2-formatted message for Telegram.
        plain_msg: Plain text message for WhatsApp and Slack.
    """
    from rei.models.user import User
    from sqlalchemy import select

    try:
        async with await _get_db() as db:
            result = await db.execute(select(User).filter(User.id == user_id))
            user = result.scalar_one_or_none()
            if not user:
                logger.warning("User %s not found for notification", user_id)
                return

            # Telegram — reuse admin bot token from DB, send to user's chat_id
            if user.telegram_enabled and user.telegram_chat_id:
                try:
                    await _send_user_telegram(telegram_msg, user.telegram_chat_id, db)
                except Exception as e:
                    logger.debug("User Telegram notification failed for user %s: %s", user_id, e)

            # WhatsApp — admin's Twilio creds, user's phone number
            if user.whatsapp_enabled and user.whatsapp_phone_number:
                try:
                    await _send_user_whatsapp(plain_msg, user.whatsapp_phone_number, db)
                except Exception as e:
                    logger.debug("User WhatsApp notification failed for user %s: %s", user_id, e)

            # Slack — user's own webhook URL
            if user.slack_enabled and user.slack_webhook_url:
                try:
                    await _send_user_slack(plain_msg, user.slack_webhook_url)
                except Exception as e:
                    logger.debug("User Slack notification failed for user %s: %s", user_id, e)
    except Exception as e:
        logger.warning("Could not send user notifications for user %s: %s", user_id, e)


async def _send_user_telegram(message: str, chat_id: str, db) -> bool:
    """Send a Telegram message to a user using the admin bot token from DB."""
    from rei.services.credentials_service import get_provider_credentials

    creds = await get_provider_credentials(db, "telegram")
    bot_token = (creds or {}).get("telegram_bot_token", "")
    if not bot_token or not chat_id:
        return False

    # NOTE: Callers already escape dynamic values with _escape_markdown().
    # Do NOT re-escape here or bold/italic formatting will break.
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
            return resp.status_code == 200
    except Exception as e:
        logger.error("Failed to send user Telegram message: %s", e)
        return False


async def _send_user_whatsapp(message: str, to_number: str, db) -> bool:
    """Send a WhatsApp message to a user via admin's Twilio creds."""
    from rei.services.credentials_service import get_provider_credentials

    creds = await get_provider_credentials(db, "twilio")
    if not creds:
        return False

    account_sid = creds.get("twilio_account_sid", "")
    auth_token = creds.get("twilio_auth_token", "")
    from_number = creds.get("twilio_whatsapp_from_number", "")

    if not all([account_sid, auth_token, from_number]):
        return False

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                auth=(account_sid, auth_token),
                data={
                    "From": f"whatsapp:{from_number}",
                    "To": f"whatsapp:{to_number}",
                    "Body": message,
                },
                timeout=15,
            )
            return resp.status_code in (200, 201)
    except Exception as e:
        logger.error("Failed to send user WhatsApp message: %s", e)
        return False


async def _send_user_slack(message: str, webhook_url: str) -> bool:
    """Send a Slack message to a user's own webhook URL."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                webhook_url,
                json={"text": message},
                timeout=10,
            )
            return resp.status_code == 200
    except Exception as e:
        logger.error("Failed to send user Slack message: %s", e)
        return False


# ── Telegram notification (core) ─────────────────────────────────────


async def send_negotiation_telegram(
    message: str,
    db,
) -> bool:
    """
    Send a Telegram message to the admin chat about a negotiation event.

    Reads bot_token and chat_id from the encrypted credentials DB
    (SuperAdmin → Telegram settings).
    Message is sent with MarkdownV2 parse mode.
    """
    from rei.services.credentials_service import get_provider_credentials

    creds = await get_provider_credentials(db, "telegram")
    if not creds:
        logger.info("Telegram credentials not found, skipping negotiation notification")
        return False

    bot_token = creds.get("telegram_bot_token", "")
    chat_id = creds.get("telegram_chat_id", "")

    if not bot_token or not chat_id:
        logger.info("Telegram not configured (missing token or chat_id), skipping notification")
        return False

    # NOTE: Callers (notify_new_request, notify_info_response, etc.) already
    # escape dynamic values with _escape_markdown().  Do NOT re-escape here
    # or MarkdownV2 formatting chars like * for bold will be corrupted.

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


async def notify_info_response(
    property_address: str,
    user_name: str,
    user_email: str,
    response_text: str,
    settings: Settings,
) -> None:
    """Notify admin when a user responds to an info request.

    Sends a clear Telegram/Slack message indicating this is a RESPONSE
    (not a new request) and includes a preview of the user's message.
    """
    # Truncate long messages for the notification
    preview = response_text[:300] + "..." if len(response_text) > 300 else response_text

    telegram_msg = (
        f"💬 *User Responded to Info Request*\n\n"
        f"*Property:* {_escape_markdown(property_address)}\n"
        f"*From:* {_escape_markdown(user_name)}\n"
        f"*Email:* {_escape_markdown(user_email)}\n\n"
        f"*Their response:*\n{_escape_markdown(preview)}"
    )

    plain_msg = (
        f"💬 User Responded to Info Request\n"
        f"Property: {property_address}\n"
        f"From: {user_name} ({user_email})\n\n"
        f"Their response:\n{preview}"
    )

    await _notify_admin(telegram_msg, plain_msg, settings)


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

    telegram_msg = (
        f"🏦 *New Negotiation Request*\n\n"
        f"*Property:* {_escape_markdown(property_address)}\n"
        f"*Services:* {_escape_markdown(service_types)}\n"
        f"*From:* {_escape_markdown(user_name)}\n"
        f"*Email:* {_escape_markdown(user_email)}\n"
        f"*Deal ID:* {_escape_markdown(deal_id)}"
    )

    plain_msg = (
        f"🏦 New Negotiation Request\n"
        f"Property: {property_address}\n"
        f"Services: {service_types}\n"
        f"From: {user_name} ({user_email})"
    )

    await _notify_admin(telegram_msg, plain_msg, settings)

    # Send templated email confirmation to user
    hub_url = settings.hub_url
    try:
        async with await _get_db() as db:
            await _send_with_template(
                template_type="negotiation_request_confirmation",
                to_email=user_email,
                to_name=user_name,
                variables={
                    "user_name": user_name,
                    "property_address": property_address,
                    "service_types": service_types,
                },
                default_subject="Negotiation Request Received",
                default_body=(
                    f"<p>Hi {user_name},</p>"
                    f"<p>We've received your negotiation request for the following property:</p>"
                    f'<div style="background:#f8f9fa;padding:12px;border-radius:6px;margin:16px 0;">'
                    f"<strong>Property:</strong> {property_address}<br>"
                    f"<strong>Services Requested:</strong> {service_types}"
                    f"</div>"
                    f"<p>Our team will review your request and get back to you shortly with next steps.</p>"
                ),
                cta_text="View Your Dashboard",
                cta_url=f"{hub_url}/negotiations",
                settings=settings,
                db=db,
            )
        logger.info(f"New request confirmation email sent to {user_email}")
    except Exception as e:
        logger.error(f"Failed to send new request email to {user_email}: {e}")


async def notify_request_update(
    request_id: str,
    new_status: str,
    user_email: str,
    settings: Settings,
    user_id: int | None = None,
) -> None:
    """
    Notify user when admin accepts, requests info, or declines their request.

    Sends email to user with status update and next steps.
    Uses status-specific templates so each can be customised independently.
    """
    hub_url = settings.hub_url

    # Map status → template_type and defaults
    STATUS_MAP = {
        "accepted": {
            "template_type": "negotiation_request_accepted",
            "default_subject": "Negotiation Request Accepted",
            "default_body": (
                f"<p>Hi there,</p>"
                f"<p>Your negotiation request (ID: <strong>{request_id}</strong>) has been "
                f"<strong>accepted and approved</strong>.</p>"
                f"<p>Our team will begin creating cases and starting work on your request. "
                f"You'll receive updates as we progress.</p>"
            ),
        },
        "info_requested": {
            "template_type": "negotiation_request_info_needed",
            "default_subject": "More Information Needed",
            "default_body": (
                f"<p>Hi there,</p>"
                f"<p>Your negotiation request (ID: <strong>{request_id}</strong>) has been "
                f"<strong>received, but we need more information</strong>.</p>"
                f"<p>Please reply to this email with the additional details our team has requested. "
                f"Once we receive your information, we'll proceed with your request.</p>"
            ),
        },
        "declined": {
            "template_type": "negotiation_request_declined",
            "default_subject": "Negotiation Request Update",
            "default_body": (
                f"<p>Hi there,</p>"
                f"<p>Your negotiation request (ID: <strong>{request_id}</strong>) has been "
                f"<strong>received, but unfortunately could not be processed</strong>.</p>"
                f"<p>If you believe this was in error or have questions, please reach out to our "
                f"support team for further assistance.</p>"
            ),
        },
    }

    mapping = STATUS_MAP.get(new_status, {
        "template_type": "negotiation_request_accepted",  # fallback
        "default_subject": "Negotiation Request Update",
        "default_body": (
            f"<p>Hi there,</p>"
            f"<p>Your negotiation request (ID: <strong>{request_id}</strong>) "
            f"has been updated to <strong>{new_status}</strong>.</p>"
            f"<p>Check your dashboard for more details.</p>"
        ),
    })

    try:
        async with await _get_db() as db:
            await _send_with_template(
                template_type=mapping["template_type"],
                to_email=user_email,
                to_name="",
                variables={"request_id": request_id},
                default_subject=mapping["default_subject"],
                default_body=mapping["default_body"],
                cta_text="View Your Dashboard",
                cta_url=f"{hub_url}/negotiations",
                settings=settings,
                db=db,
            )
        logger.info(f"Request update email ({new_status}) sent to {user_email}")
    except Exception as e:
        logger.error(f"Failed to send request update email to {user_email}: {e}")

    # Also notify user via their configured channels
    if user_id:
        telegram_msg = f"📋 *Negotiation request update*: {_escape_markdown(new_status)}"
        plain_msg = f"📋 Your negotiation request has been updated to: {new_status}. Log in to view details."
        await _notify_user(user_id, telegram_msg, plain_msg)


# ── Activity notifications ───────────────────────────────────────────


async def notify_new_activity(
    case_id: str,
    user_summary: str,
    user_email: str,
    settings: Settings,
    user_id: int | None = None,
) -> None:
    """
    Notify user when admin logs a new activity in their case.

    Sends the sanitized user_summary (AI-generated) via email.
    Do NOT include admin_note.
    """
    hub_url = settings.hub_url
    formatted_summary = user_summary.replace(chr(10), "<br>")

    try:
        async with await _get_db() as db:
            await _send_with_template(
                template_type="negotiation_case_update",
                to_email=user_email,
                to_name="",
                variables={
                    "case_id": case_id,
                    "user_summary": formatted_summary,
                },
                default_subject="Case Update",
                default_body=(
                    f"<p>Hi there,</p>"
                    f"<p>There's a new update on your negotiation case "
                    f"(ID: <strong>{case_id}</strong>):</p>"
                    f'<div style="background:#f8f9fa;padding:16px;border-radius:6px;'
                    f'margin:16px 0;line-height:1.6;">'
                    f"{formatted_summary}"
                    f"</div>"
                    f"<p>Log in to your dashboard to see the full details and reply if needed.</p>"
                ),
                cta_text="View Case Details",
                cta_url=f"{hub_url}/negotiations",
                settings=settings,
                db=db,
            )
        logger.info(f"Activity update email sent for case {case_id} to {user_email}")
    except Exception as e:
        logger.error(f"Failed to send activity update email for case {case_id}: {e}")

    # Also notify user via their configured channels
    if user_id:
        # Truncate summary for messaging channels
        short_summary = user_summary[:200] + ("..." if len(user_summary) > 200 else "")
        telegram_msg = f"📝 *Case update* for {_escape_markdown(case_id)}\n{_escape_markdown(short_summary)}"
        plain_msg = f"📝 Case update for {case_id}: {short_summary}"
        await _notify_user(user_id, telegram_msg, plain_msg)


# ── Tracking notifications ───────────────────────────────────────────


async def notify_tracking_update(
    case_id: str,
    tracking_status: str,
    user_email: str,
    settings: Settings,
    user_id: int | None = None,
) -> None:
    """
    Push tracking status changes to user via email + their configured channels.

    Called when USPS or Fax tracking status changes on a correspondence/activity.
    """
    hub_url = settings.hub_url

    try:
        async with await _get_db() as db:
            await _send_with_template(
                template_type="negotiation_tracking_update",
                to_email=user_email,
                to_name="",
                variables={
                    "case_id": case_id,
                    "tracking_status": tracking_status,
                },
                default_subject=f"Tracking Update — {tracking_status}",
                default_body=(
                    f"<p>Hi there,</p>"
                    f"<p>The tracking status for your negotiation case "
                    f"(ID: <strong>{case_id}</strong>) has been updated:</p>"
                    f'<div style="background:#f8f9fa;padding:16px;border-radius:6px;margin:16px 0;">'
                    f"<strong>Current Status:</strong> {tracking_status}<br>"
                    f"<strong>Case Reference:</strong> {case_id}"
                    f"</div>"
                    f"<p>Log in to your dashboard to view more details about your case.</p>"
                ),
                cta_text="View Tracking",
                cta_url=f"{hub_url}/negotiations",
                settings=settings,
                db=db,
            )
        logger.info(f"Tracking update email sent for case {case_id} to {user_email}")
    except Exception as e:
        logger.error(f"Failed to send tracking update email for case {case_id}: {e}")

    # Also notify user via their configured channels
    if user_id:
        telegram_msg = f"📦 *Tracking update* for case {_escape_markdown(case_id)}: {_escape_markdown(tracking_status)}"
        plain_msg = f"📦 Tracking update for case {case_id}: {tracking_status}"
        await _notify_user(user_id, telegram_msg, plain_msg)


# ── Chat message notifications ───────────────────────────────────────


async def notify_new_message(
    case_id: str,
    sender_role: str,
    recipient_email: str,
    settings: Settings,
    user_id: int | None = None,
) -> None:
    """
    Notify the other party when a chat message is received.

    If sender is user → Notify admin (Telegram + WhatsApp + Slack)
    If sender is admin → Send email + user channels (Telegram/WhatsApp/Slack)
    """
    if sender_role == "user":
        # Notify admin via all configured channels
        telegram_msg = f"💬 *New message from user* in case {_escape_markdown(case_id)}"
        plain_msg = f"💬 New message from user in case {case_id}"
        await _notify_admin(telegram_msg, plain_msg, settings)
    elif sender_role == "admin":
        # Send templated email to user that admin sent a message
        hub_url = settings.hub_url

        try:
            async with await _get_db() as db:
                await _send_with_template(
                    template_type="negotiation_new_message",
                    to_email=recipient_email,
                    to_name="",
                    variables={"case_id": case_id},
                    default_subject="New Message on Your Case",
                    default_body=(
                        f"<p>Hi there,</p>"
                        f"<p>You have a new message regarding your negotiation case "
                        f"(ID: <strong>{case_id}</strong>).</p>"
                        f"<p>Log in to your dashboard to view and reply to your message.</p>"
                    ),
                    cta_text="View Messages",
                    cta_url=f"{hub_url}/negotiations",
                    settings=settings,
                    db=db,
                )
            logger.info(f"New message notification email sent for case {case_id} to {recipient_email}")
        except Exception as e:
            logger.error(f"Failed to send message notification email for case {case_id}: {e}")

        # Also notify user via their configured channels
        if user_id:
            telegram_msg = f"💬 *New message from your negotiator* on case {_escape_markdown(case_id)}"
            plain_msg = f"💬 New message from your negotiator on case {case_id}. Log in to view."
            await _notify_user(user_id, telegram_msg, plain_msg)


# ── Internal helpers ─────────────────────────────────────────────────


def _escape_markdown(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    special_chars = ['_', '*', '[', ']', '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
    for char in special_chars:
        text = text.replace(char, f'\\{char}')
    return text
