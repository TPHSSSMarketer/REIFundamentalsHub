"""Stripe Connect helpers for TPHS loan payment processing.

Uses httpx only — no additional packages. All calls use the TPHS Stripe
Connect credentials (never the REI Hub Stripe keys).
"""

from __future__ import annotations

import httpx

STRIPE_BASE = "https://api.stripe.com/v1"


async def create_connect_customer(
    buyer_name: str,
    buyer_email: str,
    connect_account_id: str,
    stripe_connect_secret_key: str,
) -> dict:
    """Create a Stripe customer on a connected account."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{STRIPE_BASE}/customers",
            auth=(stripe_connect_secret_key, ""),
            headers={"Stripe-Account": connect_account_id},
            data={
                "name": buyer_name,
                "email": buyer_email,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {"customer_id": data["id"]}


async def create_payment_intent(
    amount_cents: int,
    customer_id: str,
    connect_account_id: str,
    stripe_connect_secret_key: str,
    cfd_account_number: str,
    description: str,
) -> dict:
    """Create a payment intent on the connected account."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{STRIPE_BASE}/payment_intents",
            auth=(stripe_connect_secret_key, ""),
            headers={"Stripe-Account": connect_account_id},
            data={
                "amount": str(amount_cents),
                "currency": "usd",
                "customer": customer_id,
                "description": description,
                "metadata[account_number]": cfd_account_number,
                "metadata[source]": "tphs_payment_portal",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "payment_intent_id": data["id"],
        "client_secret": data["client_secret"],
    }


async def confirm_payment(
    payment_intent_id: str,
    connect_account_id: str,
    stripe_connect_secret_key: str,
) -> dict:
    """Retrieve a payment intent to check its status."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{STRIPE_BASE}/payment_intents/{payment_intent_id}",
            auth=(stripe_connect_secret_key, ""),
            headers={"Stripe-Account": connect_account_id},
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "status": data["status"],
        "amount": data["amount"],
        "charge_id": data.get("latest_charge", ""),
    }


async def create_connect_account_link(
    connect_account_id: str,
    stripe_secret_key: str,
    refresh_url: str,
    return_url: str,
) -> dict:
    """Create an account link for Stripe Connect onboarding."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{STRIPE_BASE}/account_links",
            auth=(stripe_secret_key, ""),
            data={
                "account": connect_account_id,
                "refresh_url": refresh_url,
                "return_url": return_url,
                "type": "account_onboarding",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {"url": data["url"]}


async def get_connect_account_status(
    connect_account_id: str,
    stripe_secret_key: str,
) -> dict:
    """Check the onboarding / capability status of a connected account."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{STRIPE_BASE}/accounts/{connect_account_id}",
            auth=(stripe_secret_key, ""),
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "charges_enabled": data["charges_enabled"],
        "payouts_enabled": data["payouts_enabled"],
        "details_submitted": data["details_submitted"],
    }
