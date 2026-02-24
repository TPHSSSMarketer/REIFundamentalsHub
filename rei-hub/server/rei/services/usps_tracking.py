"""USPS Web Tools API integration for certified mail tracking.

Uses httpx for HTTP requests and xml.etree.ElementTree for XML parsing.
No additional packages required.
"""

from __future__ import annotations

import json
import logging
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

USPS_API_URL = "https://secure.shippingapis.com/ShippingAPI.dll"


# ── Single package tracking ──────────────────────────────────────────────


async def track_package(
    tracking_number: str,
    usps_user_id: str,
) -> dict:
    """Track a USPS package by tracking number.

    Returns status, location, delivery info, and full history.
    """
    xml_request = (
        f'<TrackFieldRequest USERID="{usps_user_id}">'
        "<Revision>1</Revision>"
        "<ClientIp>127.0.0.1</ClientIp>"
        "<SourceId>REIHub</SourceId>"
        f'<TrackID ID="{tracking_number}"/>'
        "</TrackFieldRequest>"
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                USPS_API_URL,
                data={"API": "TrackV2", "XML": xml_request},
            )
            resp.raise_for_status()

        raw_xml = resp.text
        root = ET.fromstring(raw_xml)

        # Check for API-level error
        error_el = root.find(".//Error")
        if error_el is not None:
            error_desc = error_el.findtext("Description", "Unknown USPS error")
            return {
                "tracking_number": tracking_number,
                "status": "unknown",
                "error": error_desc,
            }

        track_info = root.find(".//TrackInfo")
        if track_info is None:
            return {
                "tracking_number": tracking_number,
                "status": "unknown",
                "error": "No tracking info returned",
            }

        # Parse TrackSummary (most recent event)
        summary = track_info.find("TrackSummary")
        current_event = ""
        current_location = ""
        event_date = None
        signed_by: Optional[str] = None

        if summary is not None:
            current_event = summary.findtext("Event", "")
            city = summary.findtext("EventCity", "")
            state = summary.findtext("EventState", "")
            current_location = f"{city}, {state}".strip(", ")
            event_date_str = summary.findtext("EventDate", "")
            event_time_str = summary.findtext("EventTime", "")
            event_date = _parse_usps_datetime(event_date_str, event_time_str)

            signed_name = summary.findtext("SignedForByName")
            if signed_name:
                signed_by = signed_name

        # Determine delivery status
        delivered = False
        delivered_date: Optional[datetime] = None
        signature_date: Optional[datetime] = None
        status = determine_status(current_event)

        if status == "delivered":
            delivered = True
            delivered_date = event_date
            if signed_by:
                signature_date = event_date

        # Parse TrackDetail elements (history)
        history: list[dict] = []
        for detail in track_info.findall("TrackDetail"):
            detail_event = detail.findtext("Event", "")
            detail_city = detail.findtext("EventCity", "")
            detail_state = detail.findtext("EventState", "")
            detail_date_str = detail.findtext("EventDate", "")
            detail_time_str = detail.findtext("EventTime", "")
            detail_dt = _parse_usps_datetime(detail_date_str, detail_time_str)

            history.append({
                "event": detail_event,
                "location": f"{detail_city}, {detail_state}".strip(", "),
                "datetime": detail_dt.isoformat() if detail_dt else None,
            })

            # Check history for delivery/signature if not found in summary
            if not delivered and "DELIVERED" in detail_event.upper():
                delivered = True
                delivered_date = detail_dt
                detail_signed = detail.findtext("SignedForByName")
                if detail_signed:
                    signed_by = detail_signed
                    signature_date = detail_dt

        return {
            "tracking_number": tracking_number,
            "status": status,
            "current_event": current_event,
            "current_location": current_location,
            "delivered": delivered,
            "delivered_date": delivered_date.isoformat() if delivered_date else None,
            "signed_by": signed_by,
            "signature_date": signature_date.isoformat() if signature_date else None,
            "history": history,
            "raw_response": raw_xml,
        }

    except Exception as exc:
        logger.exception("USPS tracking failed for %s", tracking_number)
        return {
            "tracking_number": tracking_number,
            "status": "unknown",
            "error": str(exc),
        }


# ── Status determination ─────────────────────────────────────────────────


def determine_status(event_text: str) -> str:
    """Determine a normalized status from USPS event text."""
    event_upper = event_text.upper()

    if "DELIVERED" in event_upper:
        return "delivered"
    if "ATTEMPTED" in event_upper or "NOTICE LEFT" in event_upper:
        return "attempted"
    if "RETURNED" in event_upper or "UNDELIVERABLE" in event_upper:
        return "returned"
    if any(
        kw in event_upper
        for kw in ("ACCEPTANCE", "SHIPPED", "IN TRANSIT", "ARRIVED")
    ):
        return "in_transit"

    return "in_transit"


# ── Batch tracking ───────────────────────────────────────────────────────


async def track_multiple(
    tracking_numbers: list[str],
    usps_user_id: str,
) -> list[dict]:
    """Track up to 10 packages in one API call.

    USPS supports batch tracking in a single request.
    """
    numbers = tracking_numbers[:10]

    track_ids = "".join(f'<TrackID ID="{t}"/>' for t in numbers)
    xml_request = (
        f'<TrackFieldRequest USERID="{usps_user_id}">'
        "<Revision>1</Revision>"
        "<ClientIp>127.0.0.1</ClientIp>"
        "<SourceId>REIHub</SourceId>"
        f"{track_ids}"
        "</TrackFieldRequest>"
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                USPS_API_URL,
                data={"API": "TrackV2", "XML": xml_request},
            )
            resp.raise_for_status()

        raw_xml = resp.text
        root = ET.fromstring(raw_xml)

        results: list[dict] = []
        for track_info in root.findall(".//TrackInfo"):
            tn = track_info.get("ID", "")

            # Check for per-package error
            error_el = track_info.find("Error")
            if error_el is not None:
                results.append({
                    "tracking_number": tn,
                    "status": "unknown",
                    "error": error_el.findtext("Description", "Unknown error"),
                })
                continue

            summary = track_info.find("TrackSummary")
            current_event = ""
            current_location = ""
            delivered = False
            delivered_date: Optional[datetime] = None
            signed_by: Optional[str] = None

            if summary is not None:
                current_event = summary.findtext("Event", "")
                city = summary.findtext("EventCity", "")
                state = summary.findtext("EventState", "")
                current_location = f"{city}, {state}".strip(", ")

                event_date_str = summary.findtext("EventDate", "")
                event_time_str = summary.findtext("EventTime", "")
                event_dt = _parse_usps_datetime(event_date_str, event_time_str)

                signed_name = summary.findtext("SignedForByName")
                if signed_name:
                    signed_by = signed_name

                if "DELIVERED" in current_event.upper():
                    delivered = True
                    delivered_date = event_dt

            results.append({
                "tracking_number": tn,
                "status": determine_status(current_event),
                "current_event": current_event,
                "current_location": current_location,
                "delivered": delivered,
                "delivered_date": (
                    delivered_date.isoformat() if delivered_date else None
                ),
                "signed_by": signed_by,
            })

        return results

    except Exception as exc:
        logger.exception("USPS batch tracking failed")
        return [
            {"tracking_number": tn, "status": "unknown", "error": str(exc)}
            for tn in numbers
        ]


# ── Correspondence record updater ────────────────────────────────────────


async def update_correspondence_tracking(
    correspondence_id: str,
    db,
    settings,
) -> Optional[dict]:
    """Update a single correspondence record with latest USPS status.

    Called by background processor.
    """
    from rei.models.user import NegotiationCorrespondence

    corr = db.query(NegotiationCorrespondence).filter_by(
        id=correspondence_id
    ).first()
    if not corr:
        return None
    if not corr.usps_tracking_number:
        return None

    result = await track_package(
        corr.usps_tracking_number,
        settings.usps_user_id,
    )

    corr.usps_status = result.get("status")
    corr.usps_last_checked = datetime.utcnow()
    corr.usps_raw_response = json.dumps(result)

    if result.get("delivered"):
        corr.usps_delivered_date = result.get("delivered_date")
        corr.usps_signed_by = result.get("signed_by")
        corr.usps_signature_date = result.get("signature_date")
        corr.status = "delivered"

    db.commit()
    return result


# ── Internal helpers ─────────────────────────────────────────────────────


def _parse_usps_datetime(
    date_str: str, time_str: str = ""
) -> Optional[datetime]:
    """Parse USPS date/time strings into a datetime object."""
    if not date_str:
        return None
    try:
        combined = f"{date_str} {time_str}".strip()
        # USPS returns dates like "October 15, 2024" or "October 15, 2024 10:30 am"
        for fmt in (
            "%B %d, %Y %I:%M %p",
            "%B %d, %Y %I:%M%p",
            "%B %d, %Y",
            "%m/%d/%Y %I:%M %p",
            "%m/%d/%Y",
        ):
            try:
                return datetime.strptime(combined, fmt)
            except ValueError:
                continue
        # Last resort: date only
        return datetime.strptime(date_str, "%B %d, %Y")
    except (ValueError, TypeError):
        logger.debug("Could not parse USPS datetime: %s %s", date_str, time_str)
        return None
