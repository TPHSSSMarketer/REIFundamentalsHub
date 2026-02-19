"""Billing routes — Stripe and PayPal subscription management."""

from __future__ import annotations

from datetime import datetime, timedelta

import httpx
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import Subscription, User
from rei.schemas.billing import (
    CancelSubscriptionResponse,
    CreatePayPalSubscriptionRequest,
    CreateStripeSubscriptionRequest,
    SubscriptionStatusResponse,
    WebhookResponse,
)

settings = get_settings()
billing_router = APIRouter(prefix="/billing", tags=["billing"])

# ── Pricing constants (amounts in cents) ──

PLANS: dict[str, dict[str, int]] = {
    "starter":   {"monthly": 9900,  "annual": 82500},
    "pro":       {"monthly": 15000, "annual": 125000},
    "team":      {"monthly": 25000, "annual": 208300},
    "helm_solo": {"monthly": 7900,  "annual": 65900},
    "helm_pro":  {"monthly": 14900, "annual": 124100},
}

HELM_ADDON: dict[str, dict[str, int]] = {
    "starter": {"monthly": 4900, "annual": 40800},
    "pro":     {"monthly": 7900, "annual": 65900},
    "team":    {"monthly": 0,    "annual": 0},
}


def _require_stripe() -> None:
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe not configured",
        )
    stripe.api_key = settings.stripe_secret_key


def _require_paypal() -> None:
    if not settings.paypal_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PayPal not configured",
        )


def _validate_plan(plan: str) -> None:
    if plan not in PLANS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan: {plan}. Must be one of: {', '.join(PLANS.keys())}",
        )


def _validate_billing_cycle(billing_cycle: str) -> None:
    if billing_cycle not in ("monthly", "annual"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="billing_cycle must be 'monthly' or 'annual'",
        )


def _calculate_amount_cents(plan: str, billing_cycle: str, add_helm_addon: bool) -> int:
    amount = PLANS[plan][billing_cycle]
    if add_helm_addon and plan in HELM_ADDON:
        amount += HELM_ADDON[plan][billing_cycle]
    return amount


async def _get_or_create_subscription(
    db: AsyncSession, user: User
) -> Subscription:
    """Return existing subscription or raise 404."""
    if user.subscription:
        return user.subscription
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No subscription found for this user",
    )


# ═══════════════════════════════════════════════════════════════
# GET /billing/status
# ═══════════════════════════════════════════════════════════════

@billing_router.get("/status", response_model=SubscriptionStatusResponse)
async def billing_status(current_user: User = Depends(get_current_user)):
    """Return current subscription status."""
    sub = current_user.subscription
    if sub is None:
        return SubscriptionStatusResponse()

    monthly_amount: int | None = None
    if sub.plan in PLANS and sub.billing_cycle in ("monthly", "annual"):
        monthly_amount = _calculate_amount_cents(
            sub.plan, sub.billing_cycle, sub.helm_addon and sub.plan in HELM_ADDON
        )

    return SubscriptionStatusResponse(
        plan=sub.plan,
        status=sub.status,
        billing_cycle=sub.billing_cycle,
        trial_ends_at=sub.trial_ends_at,
        current_period_end=sub.current_period_end,
        helm_addon=sub.helm_addon,
        stripe_subscription_id=sub.stripe_subscription_id,
        paypal_subscription_id=sub.paypal_subscription_id,
        monthly_amount=monthly_amount,
    )


# ═══════════════════════════════════════════════════════════════
# POST /billing/stripe/subscribe
# ═══════════════════════════════════════════════════════════════

@billing_router.post("/stripe/subscribe")
async def stripe_subscribe(
    body: CreateStripeSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe subscription for the current user."""
    _require_stripe()
    _validate_plan(body.plan)
    _validate_billing_cycle(body.billing_cycle)

    sub = await _get_or_create_subscription(db, current_user)

    # 1. Create Stripe Customer if needed
    if not sub.stripe_customer_id:
        customer = stripe.Customer.create(email=current_user.email)
        sub.stripe_customer_id = customer.id
        await db.flush()

    # 2. Attach payment method to customer
    stripe.PaymentMethod.attach(body.payment_method_id, customer=sub.stripe_customer_id)

    # 3. Set as default payment method
    stripe.Customer.modify(
        sub.stripe_customer_id,
        invoice_settings={"default_payment_method": body.payment_method_id},
    )

    # 4. Calculate amount
    is_monthly = body.billing_cycle == "monthly"
    amount = _calculate_amount_cents(body.plan, body.billing_cycle, body.add_helm_addon)

    # 5. Determine trial days
    trial_days = 7 if sub.status == "trialing" else 0

    # 6. Create Stripe Subscription
    interval = "month" if is_monthly else "year"
    plan_label = body.plan.replace("_", " ").title()
    cycle_label = "Monthly" if is_monthly else "Annual"

    stripe_sub = stripe.Subscription.create(
        customer=sub.stripe_customer_id,
        items=[
            {
                "price_data": {
                    "currency": "usd",
                    "unit_amount": amount,
                    "recurring": {"interval": interval},
                    "product_data": {
                        "name": f"REI Hub {plan_label} ({cycle_label})",
                    },
                },
            }
        ],
        trial_period_days=trial_days if trial_days > 0 else None,
        expand=["latest_invoice.payment_intent"],
        metadata={"plan": body.plan, "billing_cycle": body.billing_cycle},
    )

    # 7. Update subscription row
    sub.stripe_subscription_id = stripe_sub.id
    sub.plan = body.plan
    sub.billing_cycle = body.billing_cycle
    sub.helm_addon = body.add_helm_addon or body.plan == "team"
    sub.status = "trialing" if trial_days > 0 else "active"

    if stripe_sub.current_period_end:
        sub.current_period_end = datetime.utcfromtimestamp(stripe_sub.current_period_end)

    await db.commit()

    # Extract client secret for frontend confirmation
    client_secret = None
    if stripe_sub.latest_invoice and stripe_sub.latest_invoice.payment_intent:
        client_secret = stripe_sub.latest_invoice.payment_intent.client_secret

    return {
        "subscription_id": stripe_sub.id,
        "client_secret": client_secret,
        "status": stripe_sub.status,
    }


# ═══════════════════════════════════════════════════════════════
# POST /billing/stripe/cancel
# ═══════════════════════════════════════════════════════════════

@billing_router.post("/stripe/cancel", response_model=CancelSubscriptionResponse)
async def stripe_cancel(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel Stripe subscription at period end."""
    _require_stripe()

    sub = await _get_or_create_subscription(db, current_user)
    if not sub.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No active Stripe subscription")

    stripe.Subscription.modify(sub.stripe_subscription_id, cancel_at_period_end=True)
    await db.commit()

    return CancelSubscriptionResponse(
        message="Subscription will cancel at period end",
        cancel_at_period_end=True,
    )


# ═══════════════════════════════════════════════════════════════
# POST /billing/stripe/webhook
# ═══════════════════════════════════════════════════════════════

@billing_router.post("/stripe/webhook", response_model=WebhookResponse)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Stripe webhook events. No auth required."""
    _require_stripe()

    raw_body = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            raw_body, sig_header, settings.stripe_webhook_secret
        )
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    event_type = event["type"]
    data_object = event["data"]["object"]

    # Look up subscription by stripe_subscription_id
    stripe_sub_id = data_object.get("id") or data_object.get("subscription")
    if not stripe_sub_id:
        return WebhookResponse(received=True)

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == stripe_sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return WebhookResponse(received=True)

    if event_type == "customer.subscription.updated":
        sub.status = data_object.get("status", sub.status)
        if data_object.get("current_period_end"):
            sub.current_period_end = datetime.utcfromtimestamp(data_object["current_period_end"])
        metadata = data_object.get("metadata", {})
        if "plan" in metadata:
            sub.plan = metadata["plan"]

    elif event_type == "customer.subscription.deleted":
        sub.status = "canceled"

    elif event_type == "invoice.payment_failed":
        sub.status = "past_due"

    elif event_type == "invoice.payment_succeeded":
        sub.status = "active"
        lines = data_object.get("lines", {}).get("data", [])
        if lines and lines[0].get("period", {}).get("end"):
            sub.current_period_end = datetime.utcfromtimestamp(
                lines[0]["period"]["end"]
            )

    await db.commit()
    return WebhookResponse(received=True)


# ═══════════════════════════════════════════════════════════════
# POST /billing/paypal/subscribe
# ═══════════════════════════════════════════════════════════════

@billing_router.post("/paypal/subscribe")
async def paypal_subscribe(
    body: CreatePayPalSubscriptionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a PayPal subscription for the current user."""
    _require_paypal()
    _validate_plan(body.plan)
    _validate_billing_cycle(body.billing_cycle)

    sub = await _get_or_create_subscription(db, current_user)
    base_url = settings.paypal_base_url
    is_monthly = body.billing_cycle == "monthly"

    # 1. Get PayPal access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            f"{base_url}/v1/oauth2/token",
            data={"grant_type": "client_credentials"},
            auth=(settings.paypal_client_id, settings.paypal_client_secret),
            headers={"Accept": "application/json"},
        )
        token_resp.raise_for_status()
        access_token = token_resp.json()["access_token"]

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        # 2. Calculate amount in dollars
        amount_cents = _calculate_amount_cents(body.plan, body.billing_cycle, body.add_helm_addon)
        amount_dollars = f"{amount_cents / 100:.2f}"

        interval_unit = "MONTH" if is_monthly else "YEAR"
        plan_label = body.plan.replace("_", " ").title()

        # 3. Create billing plan
        billing_plan_resp = await client.post(
            f"{base_url}/v1/billing/plans",
            headers=headers,
            json={
                "product_id": "PROD-REIHUB",
                "name": f"REI Hub {plan_label}",
                "billing_cycles": [
                    {
                        "frequency": {"interval_unit": interval_unit, "interval_count": 1},
                        "tenure_type": "TRIAL",
                        "sequence": 1,
                        "total_cycles": 1,
                        "pricing_scheme": {
                            "fixed_price": {"value": "0.00", "currency_code": "USD"},
                        },
                    },
                    {
                        "frequency": {"interval_unit": interval_unit, "interval_count": 1},
                        "tenure_type": "REGULAR",
                        "sequence": 2,
                        "total_cycles": 0,
                        "pricing_scheme": {
                            "fixed_price": {
                                "value": amount_dollars,
                                "currency_code": "USD",
                            },
                        },
                    },
                ],
                "payment_preferences": {
                    "auto_bill_outstanding": True,
                    "payment_failure_threshold": 3,
                },
            },
        )
        billing_plan_resp.raise_for_status()
        paypal_plan_id = billing_plan_resp.json()["id"]

        # 4. Create subscription
        sub_resp = await client.post(
            f"{base_url}/v1/billing/subscriptions",
            headers=headers,
            json={
                "plan_id": paypal_plan_id,
                "subscriber": {
                    "email_address": current_user.email,
                },
                "application_context": {
                    "brand_name": "REI Fundamentals Hub",
                    "return_url": f"{settings.cors_origins.split(',')[0].strip()}/billing/success",
                    "cancel_url": f"{settings.cors_origins.split(',')[0].strip()}/billing/cancel",
                },
            },
        )
        sub_resp.raise_for_status()
        sub_data = sub_resp.json()

    # 5. Update subscription row
    sub.paypal_subscription_id = sub_data["id"]
    sub.plan = body.plan
    sub.billing_cycle = body.billing_cycle
    sub.helm_addon = body.add_helm_addon or body.plan == "team"
    sub.status = "trialing"
    await db.commit()

    # Find approve link
    approve_url = ""
    for link in sub_data.get("links", []):
        if link.get("rel") == "approve":
            approve_url = link["href"]
            break

    return {
        "subscription_id": sub_data["id"],
        "approve_url": approve_url,
    }


# ═══════════════════════════════════════════════════════════════
# POST /billing/paypal/webhook
# ═══════════════════════════════════════════════════════════════

@billing_router.post("/paypal/webhook", response_model=WebhookResponse)
async def paypal_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle PayPal webhook events. No auth required."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = body.get("event_type", "")
    resource = body.get("resource", {})
    paypal_sub_id = resource.get("id", "")

    if not paypal_sub_id:
        return WebhookResponse(received=True)

    result = await db.execute(
        select(Subscription).where(Subscription.paypal_subscription_id == paypal_sub_id)
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        return WebhookResponse(received=True)

    if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
        sub.status = "active"
    elif event_type == "BILLING.SUBSCRIPTION.CANCELLED":
        sub.status = "canceled"
    elif event_type == "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        sub.status = "past_due"
    elif event_type == "PAYMENT.SALE.COMPLETED":
        sub.status = "active"
        if sub.billing_cycle == "annual":
            sub.current_period_end = datetime.utcnow() + timedelta(days=365)
        else:
            sub.current_period_end = datetime.utcnow() + timedelta(days=30)

    await db.commit()
    return WebhookResponse(received=True)


# ═══════════════════════════════════════════════════════════════
# POST /billing/addon/helm
# ═══════════════════════════════════════════════════════════════

@billing_router.post("/addon/helm")
async def addon_helm(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle Helm Hub add-on on the user's subscription."""
    sub = await _get_or_create_subscription(db, current_user)

    if sub.plan == "team":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Helm Hub is already included in Team plan",
        )

    # If they have a Stripe subscription, add addon item
    if sub.stripe_subscription_id and settings.stripe_secret_key:
        stripe.api_key = settings.stripe_secret_key

        addon_plan = sub.plan if sub.plan in HELM_ADDON else "starter"
        billing_cycle = sub.billing_cycle or "monthly"
        addon_amount = HELM_ADDON[addon_plan][billing_cycle]

        if addon_amount > 0:
            interval = "month" if billing_cycle == "monthly" else "year"
            plan_label = addon_plan.replace("_", " ").title()
            cycle_label = "Monthly" if billing_cycle == "monthly" else "Annual"

            stripe.SubscriptionItem.create(
                subscription=sub.stripe_subscription_id,
                price_data={
                    "currency": "usd",
                    "unit_amount": addon_amount,
                    "recurring": {"interval": interval},
                    "product_data": {
                        "name": f"Helm Hub Add-on ({plan_label} {cycle_label})",
                    },
                },
            )

    sub.helm_addon = True
    await db.commit()

    return {"message": "Helm Hub add-on activated", "helm_addon": True}
