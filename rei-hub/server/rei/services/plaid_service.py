"""Plaid API service — Proof of Funds verification via httpx."""

from __future__ import annotations

import logging
import math
import uuid
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger(__name__)

_PLAID_BASE_URLS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}


def get_base_url(settings) -> str:
    """Return the correct Plaid API base URL for the configured environment."""
    env = getattr(settings, "plaid_env", "sandbox")
    return _PLAID_BASE_URLS.get(env, _PLAID_BASE_URLS["sandbox"])


def _auth_body(settings) -> dict:
    """Return the client_id + secret fields used in every Plaid request."""
    return {
        "client_id": settings.plaid_client_id,
        "secret": settings.plaid_secret,
    }


async def create_link_token(user_id: str, settings) -> str:
    """Create a Plaid Link token for the given user.

    POST /link/token/create
    Returns the ``link_token`` string.
    """
    base = get_base_url(settings)
    products = [p.strip() for p in settings.plaid_products.split(",")]
    country_codes = [c.strip() for c in settings.plaid_country_codes.split(",")]

    payload = {
        **_auth_body(settings),
        "client_name": "REIFundamentals Hub",
        "user": {"client_user_id": user_id},
        "products": products,
        "country_codes": country_codes,
        "language": "en",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base}/link/token/create",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()["link_token"]


async def exchange_public_token(public_token: str, settings) -> str:
    """Exchange a Plaid public token for a persistent access token.

    POST /item/public_token/exchange
    Returns the ``access_token`` string.
    """
    base = get_base_url(settings)

    payload = {
        **_auth_body(settings),
        "public_token": public_token,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base}/item/public_token/exchange",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def get_balance(access_token: str, settings) -> list[dict]:
    """Fetch account balances for a linked item.

    POST /accounts/balance/get
    Returns a list of account dicts with balance information.
    """
    base = get_base_url(settings)

    payload = {
        **_auth_body(settings),
        "access_token": access_token,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base}/accounts/balance/get",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        return resp.json().get("accounts", [])


def _mask_balance(amount: float) -> str:
    """Round a balance down to the nearest $10,000 for privacy display.

    e.g. $47,500 → "Verified: $40,000+"
    """
    floored = int(math.floor(amount / 10_000) * 10_000)
    return f"Verified: ${floored:,}+"


async def verify_funds(access_token: str, required_amount: float, settings) -> dict:
    """Check whether the user has sufficient funds in any single account.

    Returns a verification result dict.
    """
    accounts = await get_balance(access_token, settings)

    best_available = 0.0
    for acct in accounts:
        balances = acct.get("balances", {})
        available = balances.get("available") or balances.get("current") or 0.0
        if available > best_available:
            best_available = float(available)

    return {
        "verified": best_available >= required_amount,
        "available_balance": best_available,
        "required_amount": required_amount,
        "accounts_checked": len(accounts),
        "verified_at": datetime.utcnow().isoformat(),
    }


def generate_pof_certificate(
    user, verification_result: dict, property_address: str, settings
) -> dict:
    """Build a Proof of Funds certificate dict.

    The ``verified_amount_display`` shows the exact required amount that was
    verified (e.g. "$50,000") rather than the buyer's full balance.
    """
    now = datetime.utcnow()
    required = verification_result["required_amount"]
    verified_display = f"${required:,.0f}"

    return {
        "certificate_id": str(uuid.uuid4()),
        "verified": verification_result["verified"],
        "buyer_name": user.full_name or user.email,
        "buyer_email": user.email,
        "required_amount": required,
        "verified_amount_display": verified_display,
        "available_balance": verified_display,
        "property_address": property_address,
        "issued_at": now.isoformat(),
        "expires_at": (now + timedelta(hours=24)).isoformat(),
        "issuer": "REIFundamentals Hub Verification Service",
    }
