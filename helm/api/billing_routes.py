"""Billing API routes — Stripe and PayPal subscription management.

Endpoints:
- POST /billing/stripe/checkout        — Create Stripe Checkout Session
- POST /billing/stripe/portal          — Create Stripe Billing Portal session
- POST /billing/stripe/webhook         — Stripe webhook receiver
- POST /billing/paypal/subscribe       — Create PayPal subscription
- POST /billing/paypal/webhook         — PayPal webhook receiver
- GET  /billing/status                 — Current billing status for a tenant
- POST /billing/activate-plugin        — Manually activate a plugin (admin)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from helm.api.middleware import get_current_user, rate_limit, rate_limit_strict, rate_limit_webhook
from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

billing_router = APIRouter(prefix="/billing", tags=["billing"])


# ── Stripe Endpoints ─────────────────────────────────────────────────────────


@billing_router.post("/stripe/checkout", dependencies=[Depends(get_current_user), Depends(rate_limit_strict)])
async def stripe_create_checkout(request: Request):
    """Create a Stripe Checkout Session.

    Body::

        {
            "plan": "base" | "rei_plugin",
            "email": "customer@example.com",
            "tenant_id": "...",
            "customer_id": "cus_..." (optional, for existing customers)
        }
    """
    from helm.integrations.stripe_client import stripe_client

    if not stripe_client.is_configured:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    data = await request.json()
    plan = data.get("plan", "base")
    email = data.get("email", "")
    tenant_id = data.get("tenant_id", "")
    customer_id = data.get("customer_id")

    if not email and not customer_id:
        raise HTTPException(status_code=400, detail="Email or customer_id required")

    if plan == "base":
        session = await stripe_client.create_base_plan_checkout(
            tenant_id=tenant_id,
            customer_email=email,
            customer_id=customer_id,
        )
    elif plan == "rei_plugin":
        if not customer_id:
            raise HTTPException(
                status_code=400,
                detail="customer_id required for plugin upsell (existing customer)",
            )
        session = await stripe_client.create_rei_plugin_checkout(
            tenant_id=tenant_id,
            customer_id=customer_id,
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan}")

    if not session:
        raise HTTPException(status_code=502, detail="Failed to create checkout session")

    return {
        "checkout_url": session.get("url"),
        "session_id": session.get("id"),
    }


@billing_router.post("/stripe/portal", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def stripe_billing_portal(request: Request):
    """Create a Stripe Billing Portal session for self-serve management.

    Body: ``{"customer_id": "cus_...", "return_url": "..."}``
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


@billing_router.post("/stripe/webhook", dependencies=[Depends(rate_limit_webhook)])
async def stripe_webhook(request: Request):
    """Stripe webhook receiver — processes payment and subscription events.

    Handles:
    - checkout.session.completed → activate tenant / plugin
    - customer.subscription.updated → sync subscription status
    - customer.subscription.deleted → deactivate tenant / plugin
    - invoice.payment_failed → notify + flag tenant
    """
    from helm.integrations.stripe_client import stripe_client

    body = await request.body()
    sig_header = request.headers.get("Stripe-Signature", "")

    event = stripe_client.verify_webhook(body, sig_header)
    if not event:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = event.get("type", "")
    event_data = event.get("data", {}).get("object", {})

    logger.info("Stripe webhook: %s", event_type)

    if event_type == "checkout.session.completed":
        await _handle_stripe_checkout_completed(event_data)

    elif event_type == "customer.subscription.updated":
        await _handle_stripe_subscription_updated(event_data)

    elif event_type == "customer.subscription.deleted":
        await _handle_stripe_subscription_deleted(event_data)

    elif event_type == "invoice.payment_failed":
        await _handle_stripe_payment_failed(event_data)

    return {"status": "received"}


# ── PayPal Endpoints ─────────────────────────────────────────────────────────


@billing_router.post("/paypal/subscribe", dependencies=[Depends(get_current_user), Depends(rate_limit_strict)])
async def paypal_create_subscription(request: Request):
    """Create a PayPal subscription.

    Body::

        {
            "plan": "base" | "rei_plugin",
            "email": "customer@example.com",
            "name": "John Doe",
            "tenant_id": "..."
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

    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    if plan == "base":
        subscription = await paypal_client.create_base_plan_subscription(
            tenant_id=tenant_id,
            subscriber_email=email,
            subscriber_name=name,
        )
    elif plan == "rei_plugin":
        subscription = await paypal_client.create_rei_plugin_subscription(
            tenant_id=tenant_id,
            subscriber_email=email,
            subscriber_name=name,
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


@billing_router.post("/paypal/webhook", dependencies=[Depends(rate_limit_webhook)])
async def paypal_webhook(request: Request):
    """PayPal webhook receiver — processes subscription lifecycle events.

    Handles:
    - BILLING.SUBSCRIPTION.ACTIVATED → activate tenant / plugin
    - BILLING.SUBSCRIPTION.SUSPENDED → flag tenant
    - BILLING.SUBSCRIPTION.CANCELLED → deactivate tenant / plugin
    - PAYMENT.SALE.COMPLETED → log successful payment
    - BILLING.SUBSCRIPTION.PAYMENT.FAILED → notify + flag tenant
    """
    from helm.integrations.paypal_client import paypal_client

    body = await request.body()
    headers = {
        "PAYPAL-AUTH-ALGO": request.headers.get("PAYPAL-AUTH-ALGO", ""),
        "PAYPAL-CERT-URL": request.headers.get("PAYPAL-CERT-URL", ""),
        "PAYPAL-TRANSMISSION-ID": request.headers.get("PAYPAL-TRANSMISSION-ID", ""),
        "PAYPAL-TRANSMISSION-SIG": request.headers.get("PAYPAL-TRANSMISSION-SIG", ""),
        "PAYPAL-TRANSMISSION-TIME": request.headers.get("PAYPAL-TRANSMISSION-TIME", ""),
    }

    event = await paypal_client.verify_webhook(headers, body)
    if not event:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = event.get("event_type", "")
    resource = event.get("resource", {})

    logger.info("PayPal webhook: %s", event_type)

    if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
        await _handle_paypal_subscription_activated(resource)

    elif event_type in ("BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED"):
        await _handle_paypal_subscription_cancelled(resource)

    elif event_type == "BILLING.SUBSCRIPTION.SUSPENDED":
        await _handle_paypal_subscription_suspended(resource)

    elif event_type == "PAYMENT.SALE.COMPLETED":
        logger.info("PayPal payment completed: %s", resource.get("id"))

    return {"status": "received"}


# ── Billing Status ───────────────────────────────────────────────────────────


@billing_router.get("/status", dependencies=[Depends(get_current_user), Depends(rate_limit)])
async def billing_status(request: Request, user: dict = Depends(get_current_user)):
    """Get the billing status for the current tenant."""
    from helm.integrations.stripe_client import stripe_client
    from helm.integrations.paypal_client import paypal_client

    return {
        "stripe_configured": stripe_client.is_configured,
        "paypal_configured": paypal_client.is_configured,
        "publishable_key": settings.stripe_publishable_key or None,
        "paypal_client_id": settings.paypal_client_id or None,
        "paypal_mode": settings.paypal_mode,
        "plans": {
            "base": {
                "stripe_price_id": settings.stripe_base_plan_price_id or None,
                "paypal_plan_id": settings.paypal_base_plan_id or None,
            },
            "rei_plugin": {
                "stripe_price_id": settings.stripe_rei_plugin_price_id or None,
                "paypal_plan_id": settings.paypal_rei_plugin_plan_id or None,
            },
        },
    }


# ── Admin: Manual Plugin Activation ──────────────────────────────────────────


@billing_router.post("/activate-plugin", dependencies=[Depends(get_current_user), Depends(rate_limit_strict)])
async def activate_plugin(request: Request, user: dict = Depends(get_current_user)):
    """Manually activate or deactivate a plugin for a tenant (admin only).

    Body: ``{"tenant_id": "...", "plugin": "rei", "active": true}``
    """
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")

    data = await request.json()
    tenant_id = data.get("tenant_id", "")
    plugin_name = data.get("plugin", "")
    active = data.get("active", True)

    if not tenant_id or not plugin_name:
        raise HTTPException(status_code=400, detail="tenant_id and plugin required")

    success = await _toggle_plugin(tenant_id, plugin_name, active)
    if not success:
        raise HTTPException(status_code=404, detail="Tenant not found")

    action = "activated" if active else "deactivated"
    return {"status": f"Plugin '{plugin_name}' {action} for tenant {tenant_id}"}


# ── Webhook Handlers (Stripe) ────────────────────────────────────────────────


async def _handle_stripe_checkout_completed(session: dict) -> None:
    """Handle successful Stripe Checkout — activate tenant or plugin."""
    tenant_id = session.get("metadata", {}).get("tenant_id", "")
    price_id = session.get("metadata", {}).get("price_id", "")

    if not tenant_id:
        logger.warning("Stripe checkout completed but no tenant_id in metadata")
        return

    # Determine what was purchased
    if price_id == settings.stripe_rei_plugin_price_id:
        await _toggle_plugin(tenant_id, "rei", True)
        logger.info("REI plugin activated for tenant %s via Stripe", tenant_id)
    elif price_id == settings.stripe_base_plan_price_id:
        await _activate_tenant(tenant_id, stripe_customer_id=session.get("customer"))
        logger.info("Base plan activated for tenant %s via Stripe", tenant_id)
    else:
        logger.info("Stripe checkout completed for tenant %s, price %s", tenant_id, price_id)


async def _handle_stripe_subscription_updated(subscription: dict) -> None:
    """Handle Stripe subscription update — check for status changes."""
    tenant_id = subscription.get("metadata", {}).get("tenant_id", "")
    status = subscription.get("status", "")

    if not tenant_id:
        return

    if status in ("active", "trialing"):
        logger.info("Stripe subscription active for tenant %s", tenant_id)
    elif status in ("past_due", "unpaid"):
        logger.warning("Stripe subscription %s for tenant %s", status, tenant_id)


async def _handle_stripe_subscription_deleted(subscription: dict) -> None:
    """Handle Stripe subscription cancellation."""
    tenant_id = subscription.get("metadata", {}).get("tenant_id", "")
    if not tenant_id:
        return

    # Check which plan's items are being cancelled
    items = subscription.get("items", {}).get("data", [])
    for item in items:
        price_id = item.get("price", {}).get("id", "")
        if price_id == settings.stripe_rei_plugin_price_id:
            await _toggle_plugin(tenant_id, "rei", False)
            logger.info("REI plugin deactivated for tenant %s (subscription cancelled)", tenant_id)

    logger.info("Stripe subscription cancelled for tenant %s", tenant_id)


async def _handle_stripe_payment_failed(invoice: dict) -> None:
    """Handle Stripe payment failure — notify admin."""
    customer_id = invoice.get("customer", "")
    logger.warning("Stripe payment failed for customer %s", customer_id)


# ── Webhook Handlers (PayPal) ────────────────────────────────────────────────


async def _handle_paypal_subscription_activated(resource: dict) -> None:
    """Handle PayPal subscription activation."""
    tenant_id = resource.get("custom_id", "")
    plan_id = resource.get("plan_id", "")

    if not tenant_id:
        logger.warning("PayPal subscription activated but no custom_id (tenant_id)")
        return

    if plan_id == settings.paypal_rei_plugin_plan_id:
        await _toggle_plugin(tenant_id, "rei", True)
        logger.info("REI plugin activated for tenant %s via PayPal", tenant_id)
    elif plan_id == settings.paypal_base_plan_id:
        await _activate_tenant(tenant_id)
        logger.info("Base plan activated for tenant %s via PayPal", tenant_id)


async def _handle_paypal_subscription_cancelled(resource: dict) -> None:
    """Handle PayPal subscription cancellation."""
    tenant_id = resource.get("custom_id", "")
    plan_id = resource.get("plan_id", "")

    if not tenant_id:
        return

    if plan_id == settings.paypal_rei_plugin_plan_id:
        await _toggle_plugin(tenant_id, "rei", False)
        logger.info("REI plugin deactivated for tenant %s via PayPal", tenant_id)

    logger.info("PayPal subscription cancelled for tenant %s", tenant_id)


async def _handle_paypal_subscription_suspended(resource: dict) -> None:
    """Handle PayPal subscription suspension."""
    tenant_id = resource.get("custom_id", "")
    logger.warning("PayPal subscription suspended for tenant %s", tenant_id)


# ── DB Helpers ────────────────────────────────────────────────────────────────


async def _toggle_plugin(tenant_id: str, plugin_name: str, active: bool) -> bool:
    """Enable or disable a plugin in the tenant's agent_config."""
    try:
        from helm.models.database import Tenant, async_session
        from sqlalchemy import select

        async with async_session() as session:
            result = await session.execute(
                select(Tenant).where(Tenant.id == tenant_id)
            )
            tenant = result.scalar_one_or_none()
            if not tenant:
                return False

            config = tenant.agent_config or {}
            plugins = config.get("enabled_plugins", [])

            if active and plugin_name not in plugins:
                plugins.append(plugin_name)
            elif not active and plugin_name in plugins:
                plugins.remove(plugin_name)

            config["enabled_plugins"] = plugins
            tenant.agent_config = config
            await session.commit()

            logger.info(
                "Plugin '%s' %s for tenant %s",
                plugin_name,
                "activated" if active else "deactivated",
                tenant_id,
            )
            return True
    except Exception as exc:
        logger.error("Failed to toggle plugin: %s", exc)
        return False


async def _activate_tenant(tenant_id: str, stripe_customer_id: str | None = None) -> bool:
    """Activate a tenant's account after successful payment."""
    try:
        from helm.models.database import Tenant, async_session
        from sqlalchemy import select

        async with async_session() as session:
            result = await session.execute(
                select(Tenant).where(Tenant.id == tenant_id)
            )
            tenant = result.scalar_one_or_none()
            if not tenant:
                return False

            tenant.is_active = True
            await session.commit()
            return True
    except Exception as exc:
        logger.error("Failed to activate tenant: %s", exc)
        return False
