"""Twilio Programmable Fax integration for bank negotiation correspondence.

Uses httpx only — no additional packages. Authenticates with existing
Twilio credentials from config.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TWILIO_FAX_BASE = "https://fax.twilio.com/v1"


# ── Send fax ─────────────────────────────────────────────────────────────


async def send_fax(
    to_number: str,
    from_number: str,
    media_url: str,
    account_sid: str,
    auth_token: str,
    quality: str = "fine",
) -> dict:
    """Send a fax via Twilio.

    Args:
        to_number: Destination fax number in E.164 format (+12125551234).
        from_number: Your Twilio fax-capable number in E.164 format.
        media_url: Publicly accessible URL to the PDF document.
        account_sid: Twilio Account SID.
        auth_token: Twilio Auth Token.
        quality: Fax quality — "standard", "fine", or "superfine".

    Returns:
        Dict with fax_sid, status, to, from, and created_at.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{TWILIO_FAX_BASE}/Faxes",
            auth=(account_sid, auth_token),
            data={
                "To": to_number,
                "From": from_number,
                "MediaUrl": media_url,
                "Quality": quality,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "fax_sid": data["sid"],
        "status": data["status"],
        "to": data["to"],
        "from": data["from"],
        "created_at": data.get("date_created"),
    }


# ── Get fax status ──────────────────────────────────────────────────────


async def get_fax_status(
    fax_sid: str,
    account_sid: str,
    auth_token: str,
) -> dict:
    """Get current status of a sent fax.

    Returns:
        Dict with fax_sid, status, pages, duration, price, delivered_at.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{TWILIO_FAX_BASE}/Faxes/{fax_sid}",
            auth=(account_sid, auth_token),
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "fax_sid": fax_sid,
        "status": data.get("status"),
        "pages": data.get("num_pages"),
        "duration": data.get("duration"),
        "price": data.get("price"),
        "delivered_at": data.get("date_updated"),
    }


# ── Send fax to a negotiation recipient ─────────────────────────────────


async def send_fax_to_recipient(
    recipient,
    media_url: str,
    settings,
) -> dict:
    """Send fax to a NegotiationRecipient.

    Validates that a fax number exists on the recipient before sending.
    """
    if not recipient.fax:
        return {
            "success": False,
            "error": "No fax number on file",
        }

    try:
        fax_number = clean_phone_to_e164(recipient.fax)
    except ValueError as exc:
        return {
            "success": False,
            "error": str(exc),
        }

    try:
        result = await send_fax(
            to_number=fax_number,
            from_number=settings.twilio_phone_number
            if hasattr(settings, "twilio_phone_number")
            else "",
            media_url=media_url,
            account_sid=settings.twilio_account_sid,
            auth_token=settings.twilio_auth_token,
        )
    except httpx.HTTPStatusError as exc:
        logger.error(
            "Twilio fax send failed: %s %s",
            exc.response.status_code,
            exc.response.text[:500],
        )
        return {
            "success": False,
            "error": f"Twilio error ({exc.response.status_code})",
        }
    except Exception as exc:
        logger.exception("Fax send failed")
        return {
            "success": False,
            "error": str(exc),
        }

    return {
        "success": True,
        "fax_sid": result["fax_sid"],
        "status": result["status"],
    }


# ── Phone number formatting ─────────────────────────────────────────────


def clean_phone_to_e164(phone: str) -> str:
    """Convert various US phone formats to E.164.

    Examples:
        (212) 555-1234  -> +12125551234
        212-555-1234    -> +12125551234
        1-212-555-1234  -> +12125551234
        +12125551234    -> +12125551234

    Raises:
        ValueError: If the phone number cannot be parsed.
    """
    digits = re.sub(r"\D", "", phone)

    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"

    raise ValueError(f"Cannot parse phone number to E.164: {phone}")


# ── Correspondence record updater ────────────────────────────────────────


async def update_fax_status(
    correspondence_id: str,
    db,
    settings,
) -> Optional[dict]:
    """Update correspondence record with latest fax status from Twilio.

    Called by background processor.
    """
    from rei.models.user import NegotiationCorrespondence

    corr = db.query(NegotiationCorrespondence).filter_by(
        id=correspondence_id
    ).first()
    if not corr:
        return None
    if not corr.twilio_fax_sid:
        return None

    try:
        result = await get_fax_status(
            corr.twilio_fax_sid,
            settings.twilio_account_sid,
            settings.twilio_auth_token,
        )
    except Exception:
        logger.exception("Fax status check failed for %s", correspondence_id)
        return None

    corr.fax_status = result.get("status")
    corr.fax_pages = result.get("pages")
    corr.fax_duration_seconds = result.get("duration")

    if result.get("status") == "delivered":
        corr.fax_delivered_at = datetime.utcnow()
        corr.status = "delivered"

    db.commit()
    return result
