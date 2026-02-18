"""Hub-facing billing API routes — called by REIFundamentals Hub.

These endpoints allow the Hub frontend (running on hub.reifundamentals.com)
to create checkout sessions, manage subscriptions, and check billing status
through Helm's payment infrastructure.

Mounted at: /api/hub/billing/
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from helm.api.middleware import get_current_user, rate_limit, rate_limit_strict
from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

hub_billing_router = APIRouter(prefix="/hub/billing", tags=["hub-billing"])


# ── Billing Status (public config for Hub frontend) ──────────────────────────


@hub_billing_router.get("/config")
async def hub_billing_config():
    """Public billing configuration for the Hub frontend.

    Returns publishable keys and plan IDs so the Hub can render
    payment buttons without needing to store these values itself.
    No authentication required — these are public-facing values.
    """
    from helm.integrations.stripe_client import stripe_client
    from helm.integrations.paypal_client import paypal_client

    return {
        "stripe": {
            "configured": stripe_client.is_configured,
            "publishable_key": settings.stripe_publishable_key or None,
            "plans": {
                "base": settings.stripe_base_plan_price_id or None,
                "rei_plugin": settings.stripe_rei_plugin_price_id or None,
            },
        },
        "paypal": {
            "configured": paypal_client.is_configured,
            "client_id": settings.paypal_client_id or None,
            "mode": settings.paypal_mode,
            "plans": {
                "base": settings.paypal_base_plan_id or None,
                "rei_plugin": settings.paypal_rei_plugin_plan_id or None,
            },
        },
    }


# ── Stripe Checkout (Hub-initiated) ─────────────────────────────────────────


@hub_billing_router.post(
    "/stripe/checkout",
    dependencies=[Depends(rate_limit_strict)],
)
async def hub_stripe_checkout(request: Request):
    """Create a Stripe Checkout session for a Hub user.

    Body::

        {
            "plan": "base" | "rei_plugin",
            "email": "customer@example.com",
            "tenant_id": "...",
            "customer_id": "cus_..." (optional),
            "success_url": "https://hub.reifundamentals.com/billing/success",
            "cancel_url": "https://hub.reifundamentals.com/billing/cancel"
        }

    The Hub passes its own success/cancel URLs so the user is
    redirected back to the Hub after checkout — not to Helm's frontend.
    """
    from helm.integrations.stripe_client import stripe_client

    if not stripe_client.is_configured:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    data = await request.json()
    plan = data.get("plan", "base")
    email = data.get("email", "")
    tenant_id = data.get("tenant_id", "")
    customer_id = data.get("customer_id")
    success_url = data.get("success_url")
    cancel_url = data.get("cancel_url")

    if not email and not customer_id:
        raise HTTPException(status_code=400, detail="Email or customer_id required")

    # Resolve the price ID
    if plan == "base":
        price_id = settings.stripe_base_plan_price_id
    elif plan == "rei_plugin":
        price_id = settings.stripe_rei_plugin_price_id
    else:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan}")

    if not price_id:
        raise HTTPException(status_code=503, detail=f"Price ID not configured for plan: {plan}")

    session = await stripe_client.create_checkout_session(
        price_id=price_id,
        tenant_id=tenant_id,
        customer_email=email if not customer_id else None,
        customer_id=customer_id,
        success_url=success_url,
        cancel_url=cancel_url,
    )

    if not session:
        raise HTTPException(status_code=502, detail="Failed to create checkout session")

    return {
        "checkout_url": session.get("url"),
        "session_id": session.get("id"),
    }


# ── Stripe Billing Portal (Hub-initiated) ───────────────────────────────────


@hub_billing_router.post(
    "/stripe/portal",
    dependencies=[Depends(rate_limit)],
)
async def hub_stripe_portal(request: Request):
    """Create a Stripe Billing Portal session for a Hub user.

    Body::

        {
            "customer_id": "cus_...",
            "return_url": "https://hub.reifundamentals.com/account"
        }
    """
    from helm.integrations.stripe_client import stripe_client

    if not stripe_client.is_configured:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    data = await request.json()
    customer_id = data.get("customer_id", "")
    return_url = data.get("return_url")

    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id required")

    session = await stripe_client.create_portal_session(customer_id, return_url)
    if not session:
        raise HTTPException(status_code=502, detail="Failed to create portal session")

    return {"portal_url": session.get("url")}


# ── PayPal Subscribe (Hub-initiated) ────────────────────────────────────────


@hub_billing_router.post(
    "/paypal/subscribe",
    dependencies=[Depends(rate_limit_strict)],
)
async def hub_paypal_subscribe(request: Request):
    """Create a PayPal subscription for a Hub user.

    Body::

        {
            "plan": "base" | "rei_plugin",
            "email": "customer@example.com",
            "name": "John Doe",
            "tenant_id": "...",
            "return_url": "https://hub.reifundamentals.com/billing/success",
            "cancel_url": "https://hub.reifundamentals.com/billing/cancel"
        }
    """
    from helm.integrations.paypal_client import paypal_client

    if not paypal_client.is_configured:
        raise HTTPException(status_code=503, detail="PayPal not configured")

    data = await request.json()
    plan = data.get("plan", "base")
    email = data.get("email", "")
    name = data.get("name", "")
    tenant_id = data.get("tenant_id", "")
    return_url = data.get("return_url")
    cancel_url = data.get("cancel_url")

    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    if plan == "base":
        subscription = await paypal_client.create_base_plan_subscription(
            tenant_id=tenant_id,
            subscriber_email=email,
            subscriber_name=name,
            return_url=return_url,
            cancel_url=cancel_url,
        )
    elif plan == "rei_plugin":
        subscription = await paypal_client.create_rei_plugin_subscription(
            tenant_id=tenant_id,
            subscriber_email=email,
            subscriber_name=name,
            return_url=return_url,
            cancel_url=cancel_url,
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan}")

    if not subscription:
        raise HTTPException(status_code=502, detail="Failed to create subscription")

    # Find the approval link
    approve_url = None
    for link in subscription.get("links", []):
        if link.get("rel") == "approve":
            approve_url = link.get("href")
            break

    return {
        "subscription_id": subscription.get("id"),
        "approve_url": approve_url,
        "status": subscription.get("status"),
    }


# ── Subscription Status Check ───────────────────────────────────────────────


@hub_billing_router.get(
    "/subscription/{tenant_id}",
    dependencies=[Depends(rate_limit)],
)
async def hub_subscription_status(tenant_id: str):
    """Check a tenant's subscription and plugin status.

    Called by the Hub to determine what features are available for a tenant.
    """
    try:
        from helm.models.database import Tenant, async_session
        from sqlalchemy import select

        async with async_session() as session:
            result = await session.execute(
                select(Tenant).where(Tenant.id == tenant_id)
            )
            tenant = result.scalar_one_or_none()
            if not tenant:
                raise HTTPException(status_code=404, detail="Tenant not found")

            agent_config = tenant.agent_config or {}
            enabled_plugins = agent_config.get("enabled_plugins", [])

            return {
                "tenant_id": tenant_id,
                "is_active": tenant.is_active,
                "enabled_plugins": enabled_plugins,
                "has_rei_plugin": "rei" in enabled_plugins,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to check subscription status: %s", exc)
        raise HTTPException(status_code=500, detail="Internal error")
