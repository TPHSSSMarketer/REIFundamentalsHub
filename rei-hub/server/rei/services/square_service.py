"""Square Payments API Service — Payment processing for rent, deposits, etc.

Free developer access. Transaction fees: 2.6% + $0.15 per transaction.
Sign up at squareup.com/developers.

Docs: https://developer.squareup.com/docs/payments-api/overview
"""

from __future__ import annotations

import logging
import uuid
from typing import Optional

import httpx

from rei.config import get_settings
from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)

# Use sandbox for development, production for live
SQUARE_SANDBOX_BASE = "https://connect.squareupsandbox.com/v2"
SQUARE_PRODUCTION_BASE = "https://connect.squareup.com/v2"


async def _get_credentials(db=None) -> dict:
    """Resolve Square API credentials from config or credentials DB."""
    settings = get_settings()
    access_token = settings.square_access_token
    application_id = settings.square_application_id
    location_id = settings.square_location_id

    if access_token:
        return {
            "access_token": access_token,
            "application_id": application_id,
            "location_id": location_id,
        }

    if db:
        creds = await get_provider_credentials(db, "square")
        if creds:
            return {
                "access_token": creds.get("square_access_token", ""),
                "application_id": creds.get("square_application_id", ""),
                "location_id": creds.get("square_location_id", ""),
            }

    return {"access_token": "", "application_id": "", "location_id": ""}


def _get_base_url(access_token: str) -> str:
    """Determine API base URL — sandbox tokens start with specific prefixes."""
    if access_token.startswith("EAAAl") or access_token.startswith("sandbox"):
        return SQUARE_SANDBOX_BASE
    return SQUARE_PRODUCTION_BASE


async def create_payment(
    amount_cents: int,
    source_id: str,
    description: str = "",
    db=None,
) -> Optional[dict]:
    """Create a payment using Square Payments API.

    Args:
        amount_cents: Amount in cents (e.g. 15000 = $150.00).
        source_id: Payment source (nonce from Square Web Payments SDK).
        description: Optional payment description / note.

    Returns:
        {
            "payment_id": str,
            "status": str,          # "COMPLETED", "PENDING", "FAILED"
            "amount_cents": int,
            "amount_dollars": float,
            "receipt_url": str | None,
            "created_at": str,
            "source": str,
        }
        or None if the API call fails.
    """
    creds = await _get_credentials(db)
    if not creds["access_token"]:
        logger.warning("Square API credentials not configured")
        return None

    base_url = _get_base_url(creds["access_token"])
    idempotency_key = str(uuid.uuid4())

    body = {
        "idempotency_key": idempotency_key,
        "source_id": source_id,
        "amount_money": {
            "amount": amount_cents,
            "currency": "USD",
        },
    }

    if creds["location_id"]:
        body["location_id"] = creds["location_id"]
    if description:
        body["note"] = description

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{base_url}/payments",
                json=body,
                headers={
                    "Authorization": f"Bearer {creds['access_token']}",
                    "Content-Type": "application/json",
                    "Square-Version": "2024-01-18",
                },
            )
            if resp.status_code in (200, 201):
                raw = resp.json()
                payment = raw.get("payment", {})
                amount = payment.get("amount_money", {})

                return {
                    "payment_id": payment.get("id", ""),
                    "status": payment.get("status", "UNKNOWN"),
                    "amount_cents": amount.get("amount", amount_cents),
                    "amount_dollars": amount.get("amount", amount_cents) / 100,
                    "receipt_url": payment.get("receipt_url"),
                    "created_at": payment.get("created_at", ""),
                    "source": "Square Payments API",
                }
            else:
                error_body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                errors = error_body.get("errors", [])
                error_msg = errors[0].get("detail", resp.text[:200]) if errors else resp.text[:200]
                logger.warning("Square Payments API error %s: %s", resp.status_code, error_msg)
    except Exception as e:
        logger.warning("Square Payments API request failed: %s", e)

    return None


async def list_payments(
    limit: int = 20,
    db=None,
) -> Optional[dict]:
    """List recent payments from Square.

    Returns:
        {
            "payments": [
                {
                    "payment_id": str,
                    "status": str,
                    "amount_cents": int,
                    "amount_dollars": float,
                    "description": str,
                    "created_at": str,
                }
            ],
            "total": int,
            "source": str,
        }
        or None if the API call fails.
    """
    creds = await _get_credentials(db)
    if not creds["access_token"]:
        logger.warning("Square API credentials not configured")
        return None

    base_url = _get_base_url(creds["access_token"])

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            params = {"sort_order": "DESC", "limit": min(limit, 100)}
            if creds["location_id"]:
                params["location_id"] = creds["location_id"]

            resp = await client.get(
                f"{base_url}/payments",
                params=params,
                headers={
                    "Authorization": f"Bearer {creds['access_token']}",
                    "Square-Version": "2024-01-18",
                },
            )
            if resp.status_code == 200:
                raw = resp.json()
                payments_raw = raw.get("payments", [])

                payments = []
                for p in payments_raw:
                    amount = p.get("amount_money", {})
                    payments.append({
                        "payment_id": p.get("id", ""),
                        "status": p.get("status", "UNKNOWN"),
                        "amount_cents": amount.get("amount", 0),
                        "amount_dollars": amount.get("amount", 0) / 100,
                        "description": p.get("note", ""),
                        "created_at": p.get("created_at", ""),
                    })

                return {
                    "payments": payments,
                    "total": len(payments),
                    "source": "Square Payments API",
                }
            else:
                logger.warning("Square list payments error %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.warning("Square list payments request failed: %s", e)

    return None


async def get_locations(db=None) -> Optional[list]:
    """Get available Square locations (for configuration).

    Returns list of {id, name, address} or None.
    """
    creds = await _get_credentials(db)
    if not creds["access_token"]:
        return None

    base_url = _get_base_url(creds["access_token"])

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{base_url}/locations",
                headers={
                    "Authorization": f"Bearer {creds['access_token']}",
                    "Square-Version": "2024-01-18",
                },
            )
            if resp.status_code == 200:
                raw = resp.json()
                locations = []
                for loc in raw.get("locations", []):
                    addr = loc.get("address", {})
                    locations.append({
                        "id": loc.get("id", ""),
                        "name": loc.get("name", ""),
                        "address": f"{addr.get('address_line_1', '')}, {addr.get('locality', '')} {addr.get('administrative_district_level_1', '')}".strip(", "),
                    })
                return locations
    except Exception as e:
        logger.warning("Square locations request failed: %s", e)

    return None
