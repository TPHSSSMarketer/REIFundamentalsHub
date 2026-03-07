"""USPS Tracking API V3.2 (OAuth 2.0) integration for certified mail tracking.

Replaces the legacy Web Tools XML API (retired Jan 2026) with the new
REST/JSON Tracking 3.2 endpoint at apis.usps.com.

Authentication uses OAuth 2.0 Client Credentials flow:
  POST https://apis.usps.com/oauth2/v3/token
  → Bearer token (valid ~8 hours, cached in-memory)

Tracking endpoint:
  POST https://apis.usps.com/tracking/v3r2/tracking
  Body: [{ "trackingNumber": "..." }]
"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Token cache ─────────────────────────────────────────────────────────

_token_cache: dict = {
    "access_token": None,
    "expires_at": 0,
}


async def _get_access_token(
    client_id: str,
    client_secret: str,
    base_url: str = "https://apis.usps.com",
) -> str:
    """Obtain (or return cached) OAuth 2.0 Bearer token from USPS.

    Tokens are valid for ~8 hours. We cache and reuse until 5 minutes
    before expiry.
    """
    # Return cached token if still valid (with 5-min buffer)
    if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 300:
        return _token_cache["access_token"]

    token_url = f"{base_url}/oauth2/v3/token"
    payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "client_credentials",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            token_url,
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()

    data = resp.json()
    access_token = data["access_token"]
    expires_in = data.get("expires_in", 28800)  # Default 8 hours

    _token_cache["access_token"] = access_token
    _token_cache["expires_at"] = time.time() + expires_in

    logger.info("USPS OAuth token obtained, expires in %d seconds", expires_in)
    return access_token


# ── Single package tracking ──────────────────────────────────────────────


async def track_package(
    tracking_number: str,
    client_id: str,
    client_secret: str,
    base_url: str = "https://apis.usps.com",
) -> dict:
    """Track a USPS package by tracking number using the V3.2 REST API.

    Returns status, location, delivery info, and full event history.
    """
    try:
        token = await _get_access_token(client_id, client_secret, base_url)

        tracking_url = f"{base_url}/tracking/v3r2/tracking"
        payload = [{"trackingNumber": tracking_number}]

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                tracking_url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )

        # Handle 401 by refreshing token once and retrying
        if resp.status_code == 401:
            _token_cache["access_token"] = None
            _token_cache["expires_at"] = 0
            token = await _get_access_token(client_id, client_secret, base_url)
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    tracking_url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )

        resp.raise_for_status()
        data = resp.json()

        # V3.2 returns an array of tracking results
        if not data or not isinstance(data, list):
            return {
                "tracking_number": tracking_number,
                "status": "unknown",
                "error": "Empty response from USPS",
            }

        result = data[0]
        return _parse_tracking_result(result, tracking_number)

    except httpx.HTTPStatusError as exc:
        logger.exception("USPS tracking HTTP error for %s: %s", tracking_number, exc.response.status_code)
        error_body = ""
        try:
            error_body = exc.response.text
        except Exception:
            pass
        return {
            "tracking_number": tracking_number,
            "status": "unknown",
            "error": f"HTTP {exc.response.status_code}: {error_body[:200]}",
        }
    except Exception as exc:
        logger.exception("USPS tracking failed for %s", tracking_number)
        return {
            "tracking_number": tracking_number,
            "status": "unknown",
            "error": str(exc),
        }


# ── Status determination ─────────────────────────────────────────────────


def determine_status(status_text: str, status_category: str = "") -> str:
    """Determine a normalized status from USPS status fields."""
    text_upper = (status_text or "").upper()
    cat_upper = (status_category or "").upper()

    if "DELIVERED" in text_upper or "DELIVERED" in cat_upper:
        return "delivered"
    if "ATTEMPTED" in text_upper or "NOTICE LEFT" in text_upper:
        return "attempted"
    if "RETURNED" in text_upper or "UNDELIVERABLE" in text_upper:
        return "returned"
    if any(
        kw in text_upper
        for kw in ("ACCEPTANCE", "SHIPPED", "IN TRANSIT", "ARRIVED", "TRANSIT")
    ):
        return "in_transit"
    if "PRE-SHIPMENT" in text_upper or "PRE_SHIPMENT" in cat_upper:
        return "pre_shipment"

    return "in_transit"


# ── Batch tracking ───────────────────────────────────────────────────────


async def track_multiple(
    tracking_numbers: list[str],
    client_id: str,
    client_secret: str,
    base_url: str = "https://apis.usps.com",
) -> list[dict]:
    """Track up to 35 packages in one API call.

    V3.2 supports 1-35 items per request.
    """
    numbers = tracking_numbers[:35]

    try:
        token = await _get_access_token(client_id, client_secret, base_url)

        tracking_url = f"{base_url}/tracking/v3r2/tracking"
        payload = [{"trackingNumber": tn} for tn in numbers]

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                tracking_url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )

        # Handle 401 by refreshing token once
        if resp.status_code == 401:
            _token_cache["access_token"] = None
            _token_cache["expires_at"] = 0
            token = await _get_access_token(client_id, client_secret, base_url)
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    tracking_url,
                    json=payload,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )

        resp.raise_for_status()
        data = resp.json()

        if not isinstance(data, list):
            return [
                {"tracking_number": tn, "status": "unknown", "error": "Unexpected response format"}
                for tn in numbers
            ]

        results: list[dict] = []
        for i, item in enumerate(data):
            tn = item.get("trackingNumber", numbers[i] if i < len(numbers) else "")
            results.append(_parse_tracking_result(item, tn))

        return results

    except Exception as exc:
        logger.exception("USPS batch tracking failed")
        return [
            {"tracking_number": tn, "status": "unknown", "error": str(exc)}
            for tn in numbers
        ]


# ── Credential resolution ────────────────────────────────────────────────


async def get_usps_credentials(
    async_db=None,
    settings=None,
) -> tuple[str, str, str]:
    """Resolve USPS OAuth credentials from the database (SuperAdmin)
    first, falling back to environment variables.

    Returns (client_id, client_secret, base_url).
    """
    from rei.config import get_settings
    if settings is None:
        settings = get_settings()

    client_id = settings.usps_client_id
    client_secret = settings.usps_client_secret
    base_url = settings.usps_api_url or "https://apis.usps.com"

    # Try database (SuperAdmin credentials) — single source of truth
    if async_db is not None:
        try:
            from rei.services.credentials_service import get_provider_credentials
            creds = await get_provider_credentials(async_db, "usps")
            if creds:
                if creds.get("usps_client_id"):
                    client_id = creds["usps_client_id"]
                if creds.get("usps_client_secret"):
                    client_secret = creds["usps_client_secret"]
                if creds.get("usps_api_url"):
                    base_url = creds["usps_api_url"]
        except Exception as exc:
            logger.warning("Failed to read USPS credentials from DB: %s", exc)

    return client_id, client_secret, base_url


# ── Correspondence record updater ────────────────────────────────────────


async def update_correspondence_tracking(
    correspondence_id: str,
    async_db,
    settings,
) -> Optional[dict]:
    """Update a single correspondence record with latest USPS status.

    Called by background processor and bank negotiation routes.
    Uses async_db (AsyncSession) for both credential lookup and record updates.
    Returns None if model is not available or record not found.
    """
    try:
        from sqlalchemy import select
        from rei.models.user import NegotiationCorrespondence
    except ImportError:
        logger.warning(
            "NegotiationCorrespondence model not found — skipping USPS tracking update for %s",
            correspondence_id,
        )
        return None

    result_row = await async_db.execute(
        select(NegotiationCorrespondence).where(
            NegotiationCorrespondence.id == correspondence_id
        )
    )
    corr = result_row.scalar_one_or_none()
    if not corr:
        return None
    if not corr.usps_tracking_number:
        return None

    # Guard: skip records already in final status
    if corr.usps_status in ("delivered", "returned"):
        logger.info(
            "Skipping %s — already %s",
            corr.usps_tracking_number,
            corr.usps_status,
        )
        return None

    # Resolve credentials from DB (SuperAdmin) or env vars
    client_id, client_secret, base_url = await get_usps_credentials(
        async_db=async_db, settings=settings,
    )

    if not client_id or not client_secret:
        logger.error("USPS credentials not configured. Set them in SuperAdmin → Credentials → USPS.")
        return {
            "tracking_number": corr.usps_tracking_number,
            "status": "unknown",
            "error": "USPS credentials not configured",
        }

    result = await track_package(
        corr.usps_tracking_number,
        client_id,
        client_secret,
        base_url,
    )

    corr.usps_status = result.get("status")
    corr.usps_last_checked = datetime.utcnow()
    corr.usps_raw_response = json.dumps(result)

    if result.get("delivered"):
        corr.usps_delivered_date = result.get("delivered_date")
        corr.usps_signed_by = result.get("signed_by")
        corr.usps_signature_date = result.get("signature_date")
        corr.status = "delivered"

    await async_db.commit()
    return result


# ── Internal helpers ─────────────────────────────────────────────────────


def _parse_tracking_result(item: dict, tracking_number: str) -> dict:
    """Parse a single V3.2 tracking response object into our standard format."""

    # Check for error in response
    error = item.get("error") or item.get("errorMessage")
    if error:
        return {
            "tracking_number": tracking_number,
            "status": "unknown",
            "error": str(error),
        }

    status_text = item.get("status", "")
    status_category = item.get("statusCategory", "")
    status_summary = item.get("statusSummary", "")
    status = determine_status(status_text, status_category)

    dest_city = item.get("destinationCity", "")
    dest_state = item.get("destinationState", "")
    current_location = f"{dest_city}, {dest_state}".strip(", ")

    delivered = status == "delivered"
    delivered_date: Optional[str] = None
    signed_by: Optional[str] = None
    signature_date: Optional[str] = None

    # Parse tracking events for delivery/signature details
    history: list[dict] = []
    tracking_events = item.get("trackingEvents", [])

    for event in tracking_events:
        event_type = event.get("eventType", "")
        event_city = event.get("eventCity", "")
        event_state = event.get("eventState", "")
        event_zip = event.get("eventZIPCode", "")
        event_date = event.get("eventTimestamp", "")

        location = f"{event_city}, {event_state}".strip(", ")
        if event_zip:
            location = f"{location} {event_zip}".strip()

        history.append({
            "event": event_type,
            "location": location,
            "datetime": event_date,
        })

        # Check for delivery details
        if "DELIVERED" in event_type.upper():
            delivered = True
            delivered_date = event_date
            if not current_location:
                current_location = location

    # Extract signed-by from status summary if present
    if delivered and status_summary:
        summary_upper = status_summary.upper()
        if "SIGNED" in summary_upper:
            # Try to extract signed-by name from summary
            signed_by = _extract_signed_by(status_summary)
            signature_date = delivered_date

    # Use first event as current location if not set
    if not current_location and history:
        current_location = history[0].get("location", "")

    return {
        "tracking_number": tracking_number,
        "status": status,
        "current_event": status_text,
        "current_location": current_location,
        "delivered": delivered,
        "delivered_date": delivered_date,
        "signed_by": signed_by,
        "signature_date": signature_date,
        "status_summary": status_summary,
        "history": history,
        "raw_response": json.dumps(item),
    }


def _extract_signed_by(summary: str) -> Optional[str]:
    """Try to extract a signed-by name from the status summary text."""
    # Common patterns: "Signed for by: JOHN DOE" or "signed by J DOE"
    import re
    patterns = [
        r"[Ss]igned\s+(?:for\s+)?by[:\s]+([A-Z][A-Z\s.]+)",
        r"[Ss]igned[:\s]+([A-Z][A-Z\s.]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, summary)
        if match:
            return match.group(1).strip()
    return None


async def update_activity_tracking(
    async_db,
    settings,
) -> None:
    """Update USPS tracking for all non-final negotiation activity records.

    Similar to update_correspondence_tracking but works with NegotiationActivity
    records instead of NegotiationCorrespondence.

    Filters:
    - Only records with usps_tracking_number set
    - Skip records where tracking_status in final states (delivered, returned)
    - Calls track_package() for each and updates tracking fields
    - If delivered, triggers notify_tracking_update
    """
    from sqlalchemy import select, and_
    from rei.models.negotiation import NegotiationActivity

    # Find activity records needing tracking update
    result = await async_db.execute(
        select(NegotiationActivity).where(
            and_(
                NegotiationActivity.usps_tracking_number.isnot(None),
                NegotiationActivity.tracking_status.notin_(
                    ["delivered", "returned"]
                ),
            )
        )
    )
    pending = result.scalars().all()

    if not pending:
        logger.debug("No pending activity tracking records to update")
        return

    logger.info("Processing %d pending activity tracking records", len(pending))

    # Resolve credentials from DB (SuperAdmin) or env vars
    client_id, client_secret, base_url = await get_usps_credentials(
        async_db=async_db, settings=settings,
    )

    if not client_id or not client_secret:
        logger.error("USPS credentials not configured. Set them in SuperAdmin → Credentials → USPS.")
        return

    for activity in pending:
        try:
            result = await track_package(
                activity.usps_tracking_number,
                client_id,
                client_secret,
                base_url,
            )

            old_status = activity.tracking_status
            activity.tracking_status = result.get("status")
            activity.usps_last_checked = datetime.utcnow()
            activity.usps_raw_response = json.dumps(result)

            if result.get("delivered"):
                activity.usps_delivered_date = result.get("delivered_date")
                activity.usps_signed_by = result.get("signed_by")
                activity.tracking_status = "delivered"

                # Notify user that tracking status changed to delivered
                try:
                    from rei.services.negotiation_notifications import notify_tracking_update
                    from rei.models.negotiation import NegotiationCase
                    from rei.models.user import User
                    case = await async_db.get(NegotiationCase, activity.case_id)
                    if case:
                        owner = await async_db.get(User, case.user_id)
                        if owner:
                            await notify_tracking_update(
                                case_id=str(activity.case_id),
                                tracking_status="delivered",
                                user_email=owner.email,
                                settings=settings,
                                user_id=case.user_id,
                            )
                except Exception as e:
                    logger.warning("Failed to send delivered notification: %s", e)

            if result.get("status") == "returned":
                activity.tracking_status = "returned"

                # Notify user that package was returned
                try:
                    from rei.services.negotiation_notifications import notify_tracking_update
                    from rei.models.negotiation import NegotiationCase
                    from rei.models.user import User
                    case = await async_db.get(NegotiationCase, activity.case_id)
                    if case:
                        owner = await async_db.get(User, case.user_id)
                        if owner:
                            await notify_tracking_update(
                                case_id=str(activity.case_id),
                                tracking_status="returned",
                                user_email=owner.email,
                                settings=settings,
                                user_id=case.user_id,
                            )
                except Exception as e:
                    logger.warning("Failed to send returned notification: %s", e)

            await async_db.commit()

            if old_status != activity.tracking_status:
                logger.info(
                    "Activity %s tracking updated: %s → %s",
                    activity.id[:8],
                    old_status,
                    activity.tracking_status,
                )

            # Small delay to avoid rate limits
            import asyncio
            await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(
                "Tracking update failed for activity %s: %s",
                activity.id[:8],
                e,
            )
            continue


def _parse_usps_datetime(
    date_str: str, time_str: str = ""
) -> Optional[datetime]:
    """Parse USPS date/time strings into a datetime object.

    Kept for backwards compatibility with existing correspondence records.
    """
    if not date_str:
        return None
    try:
        combined = f"{date_str} {time_str}".strip()
        for fmt in (
            "%B %d, %Y %I:%M %p",
            "%B %d, %Y %I:%M%p",
            "%B %d, %Y",
            "%m/%d/%Y %I:%M %p",
            "%m/%d/%Y",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%d",
        ):
            try:
                return datetime.strptime(combined, fmt)
            except ValueError:
                continue
        return datetime.strptime(date_str, "%B %d, %Y")
    except (ValueError, TypeError):
        logger.debug("Could not parse USPS datetime: %s %s", date_str, time_str)
        return None
