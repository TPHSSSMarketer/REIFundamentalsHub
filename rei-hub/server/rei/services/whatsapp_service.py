"""WhatsApp notification service — send messages via Twilio WhatsApp API.

Setup:
  1. Enable WhatsApp in your Twilio console: https://console.twilio.com/
  2. Register a WhatsApp sender (Twilio Sandbox for testing, or a business number)
  3. In SuperAdmin → Twilio credentials, add the WhatsApp From Number
     (format: +1234567890 — Twilio prepends 'whatsapp:' automatically)
  4. Add the admin's WhatsApp number in SuperAdmin → Twilio → WhatsApp To Number

Uses the same Twilio Account SID / Auth Token already configured for phone/SMS.
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)


async def send_whatsapp_message(
    message: str,
    db=None,
) -> bool:
    """Send a WhatsApp message to the admin via Twilio's WhatsApp API.

    Args:
        message: Plain text message body.
        db: Async database session for reading Twilio credentials.

    Returns True on success, False if not configured or on error.
    """
    creds = await _get_twilio_whatsapp_creds(db)
    if not creds:
        logger.info("WhatsApp not configured — skipping notification")
        return False

    account_sid = creds["account_sid"]
    auth_token = creds["auth_token"]
    from_number = creds["from_number"]
    to_number = creds["to_number"]

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

            if resp.status_code in (200, 201):
                logger.info("WhatsApp notification sent successfully")
                return True
            else:
                logger.warning(
                    "Twilio WhatsApp API returned %s: %s",
                    resp.status_code,
                    resp.text[:300],
                )
                return False

    except Exception as e:
        logger.error("Failed to send WhatsApp notification: %s", e)
        return False


async def _get_twilio_whatsapp_creds(db) -> dict | None:
    """Read Twilio + WhatsApp credentials from encrypted provider credentials.

    Returns dict with account_sid, auth_token, from_number, to_number.
    Returns None if any required field is missing.
    """
    if not db:
        return None
    try:
        from rei.services.credentials_service import get_provider_credentials

        creds = await get_provider_credentials(db, "twilio")
        if not creds:
            return None

        account_sid = creds.get("twilio_account_sid", "")
        auth_token = creds.get("twilio_auth_token", "")
        from_number = creds.get("twilio_whatsapp_from_number", "")
        to_number = creds.get("twilio_whatsapp_to_number", "")

        if not all([account_sid, auth_token, from_number, to_number]):
            return None

        return {
            "account_sid": account_sid,
            "auth_token": auth_token,
            "from_number": from_number,
            "to_number": to_number,
        }
    except Exception as e:
        logger.warning("Could not load Twilio WhatsApp credentials: %s", e)
        return None
