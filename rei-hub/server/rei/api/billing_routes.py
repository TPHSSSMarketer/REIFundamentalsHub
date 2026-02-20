"""Billing routes — plan catalog, subscription status, Stripe/PayPal checkout & webhooks."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import (
    PLANS,
    TRIAL_DAYS,
    get_addon_price_id,
    get_paypal_addon_plan_id,
    get_paypal_plan_id,
    get_plan_price_id,
    get_settings,
)
from rei.models.user import User
from rei.services import paypal as paypal_service
from rei.services.email import (
    send_payment_failed_email,
    send_subscription_active_email,
    send_subscription_canceled_email,
)

logger = logging.getLogger(__name__)
billing_router = APIRouter(prefix="/billing", tags=["billing"])


# ── Schemas ─────────────────────────────────────────────────────────────


class CreateCheckoutRequest(BaseModel):
    plan: str = Field(description="One of: starter, pro, team")
    interval: str = Field(description="monthly or annual")
    payment_method: str = Field(description="stripe or paypal")
    helm_addon: bool = False


# ── Helpers ─────────────────────────────────────────────────────────────


def _sanitised_plans() -> dict:
    """Return PLANS dict without Stripe/PayPal internal IDs."""
    out = {}
    for key, plan in PLANS.items():
        out[key] = {
            k: v
            for k, v in plan.items()
            if k
            not in (
                "stripe_monthly_price_id",
                "stripe_annual_price_id",
                "paypal_monthly_plan_id",
                "paypal_annual_plan_id",
            )
        }
    return out


def _user_features(user: User) -> list[str]:
    plan_key = getattr(user, "plan", "starter") or "starter"
    return PLANS.get(plan_key, {}).get("features", [])


def _is_subscription_active(user: User) -> bool:
    sub_status = getattr(user, "subscription_status", "trialing")
    if sub_status in ("trialing", "active"):
        return True
    return False


def _is_trial_active(user: User) -> bool:
    sub_status = getattr(user, "subscription_status", "")
    trial_ends = getattr(user, "trial_ends_at", None)
    if sub_status == "trialing" and trial_ends and trial_ends > datetime.utcnow():
        return True
    return False


def _days_remaining_in_trial(user: User) -> int | None:
    if not _is_trial_active(user):
        return None
    trial_ends = getattr(user, "trial_ends_at", None)
    if trial_ends is None:
        return None
    delta = trial_ends - datetime.utcnow()
    return max(0, delta.days)


def _can_access(user: User) -> dict[str, bool]:
    features = _user_features(user)
    sub_status = getattr(user, "subscription_status", "trialing")
    trial_ok = _is_trial_active(user)

    # If subscription is canceled/past_due AND trial is expired → no access
    if sub_status in ("canceled", "past_due") and not trial_ok:
        return {f: False for f in features}

    return {f: True for f in features}


def _resolve_plan_from_paypal_plan_id(paypal_plan_id: str) -> tuple[str, str] | None:
    """Match a PayPal plan_id back to (plan_key, interval).

    Returns None if the plan_id doesn't match any configured plan.
    """
    settings = get_settings()
    for plan_key in PLANS:
        for interval in ("monthly", "annual"):
            if get_paypal_plan_id(plan_key, interval, settings) == paypal_plan_id:
                return (plan_key, interval)
            if get_paypal_addon_plan_id(plan_key, interval, settings) == paypal_plan_id:
                return (plan_key, interval)
    return None


# ═══════════════════════════════════════════════════════════════
# GET /billing/plans — public
# ═══════════════════════════════════════════════════════════════


@billing_router.get("/plans")
async def list_plans():
    """Return the plan catalog. No auth required."""
    return {
        "plans": _sanitised_plans(),
        "trial_days": TRIAL_DAYS,
    }


# ═══════════════════════════════════════════════════════════════
# GET /billing/status — authenticated
# ═══════════════════════════════════════════════════════════════


@billing_router.get("/status")
async def billing_status(current_user: User = Depends(get_current_user)):
    """Return the current user's subscription status."""
    plan_key = getattr(current_user, "plan", "starter") or "starter"
    sub_status = getattr(current_user, "subscription_status", "trialing")
    billing_interval = getattr(current_user, "billing_interval", "monthly")
    trial_ends = getattr(current_user, "trial_ends_at", None)
    sub_ends = getattr(current_user, "subscription_ends_at", None)
    helm_addon = getattr(current_user, "helm_addon_active", False)
    seats_used = getattr(current_user, "seats_used", 1)

    return {
        "plan": plan_key,
        "billing_interval": billing_interval,
        "subscription_status": sub_status,
        "trial_ends_at": trial_ends.isoformat() if trial_ends else None,
        "subscription_ends_at": sub_ends.isoformat() if sub_ends else None,
        "helm_addon_active": helm_addon,
        "seats_used": seats_used,
        "is_trial_active": _is_trial_active(current_user),
        "days_remaining_in_trial": _days_remaining_in_trial(current_user),
        "features": _user_features(current_user),
        "can_access": _can_access(current_user),
    }


# ═══════════════════════════════════════════════════════════════
# POST /billing/create-checkout — authenticated
# ═══════════════════════════════════════════════════════════════


@billing_router.post("/create-checkout")
async def create_checkout(
    body: CreateCheckoutRequest,
    current_user: User = Depends(get_current_user),
):
    """Create a Stripe or PayPal checkout session for the requested plan."""
    if body.plan not in PLANS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan: {body.plan}. Must be one of: {', '.join(PLANS.keys())}",
        )
    if body.interval not in ("monthly", "annual"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="interval must be 'monthly' or 'annual'",
        )
    if body.payment_method not in ("stripe", "paypal"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="payment_method must be 'stripe' or 'paypal'",
        )

    settings = get_settings()

    if body.payment_method == "paypal":
        return await _create_paypal_checkout(body, current_user, settings)

    return await _create_stripe_checkout(body, current_user, settings)


async def _create_stripe_checkout(
    body: CreateCheckoutRequest, current_user: User, settings
) -> dict:
    """Create a Stripe Checkout Session."""
    if not settings.stripe_secret_key:
        return {
            "checkout_url": None,
            "message": "Stripe not yet configured — price IDs pending",
        }

    main_price_id = get_plan_price_id(body.plan, body.interval, settings)
    if not main_price_id:
        return {
            "checkout_url": None,
            "message": "Stripe not yet configured — price IDs pending",
        }

    line_items = [{"price": main_price_id, "quantity": 1}]

    if body.helm_addon and body.plan != "team":
        addon_price_id = get_addon_price_id(body.plan, body.interval, settings)
        if addon_price_id:
            line_items.append({"price": addon_price_id, "quantity": 1})

    try:
        stripe.api_key = settings.stripe_secret_key
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=line_items,
            success_url=f"{settings.hub_url}/billing?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.hub_url}/billing",
            customer_email=current_user.email,
            subscription_data={
                "trial_period_days": TRIAL_DAYS,
                "metadata": {
                    "user_id": str(current_user.id),
                    "plan": body.plan,
                    "interval": body.interval,
                    "helm_addon": str(body.helm_addon),
                },
            },
            metadata={"user_id": str(current_user.id)},
        )
    except stripe.StripeError as e:
        logger.error("Stripe checkout error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stripe error: {e.user_message or str(e)}",
        ) from e

    return {"checkout_url": session.url, "message": "ok"}


async def _create_paypal_checkout(
    body: CreateCheckoutRequest, current_user: User, settings
) -> dict:
    """Create a PayPal Subscription via the Subscriptions API."""
    if not settings.paypal_client_id:
        return {
            "checkout_url": None,
            "message": "PayPal not yet configured",
        }

    plan_id = get_paypal_plan_id(body.plan, body.interval, settings)
    if not plan_id:
        return {
            "checkout_url": None,
            "message": "PayPal not yet configured — plan IDs pending",
        }

    return_url = (
        f"{settings.hub_url}/billing"
        f"?paypal=success&plan={body.plan}&interval={body.interval}"
        f"&helm_addon={str(body.helm_addon).lower()}"
    )
    cancel_url = f"{settings.hub_url}/billing?paypal=cancel"

    try:
        response = await paypal_service.create_subscription(
            plan_id=plan_id,
            user_email=current_user.email,
            user_id=str(current_user.id),
            return_url=return_url,
            cancel_url=cancel_url,
            settings=settings,
        )
    except Exception as e:
        logger.error("PayPal subscription creation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"PayPal error: {e}",
        ) from e

    # Find the approval URL from response links
    approval_url = None
    for link in response.get("links", []):
        if link.get("rel") == "approve":
            approval_url = link.get("href")
            break

    if not approval_url:
        logger.error("PayPal subscription response missing approval link: %s", response)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PayPal did not return an approval URL",
        )

    # NOTE: PayPal doesn't support multiple plans in one subscription.
    # If helm_addon is true and plan != team, the addon would need to be
    # a separate subscription. For now we handle only the main plan here.
    # Addon billing for PayPal users will be handled in a future iteration.

    return {"checkout_url": approval_url, "message": "ok"}


# ═══════════════════════════════════════════════════════════════
# POST /billing/webhook/stripe — no auth
# ═══════════════════════════════════════════════════════════════


@billing_router.post("/webhook/stripe")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Stripe webhook events."""
    settings = get_settings()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not settings.stripe_webhook_secret:
        logger.info("Stripe webhook received (no secret configured, skipping verification)")
        return {"received": True}

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.stripe_webhook_secret
        )
    except ValueError:
        logger.warning("Stripe webhook: invalid payload")
        return {"received": True}
    except stripe.SignatureVerificationError:
        logger.warning("Stripe webhook: invalid signature")
        return {"received": True}

    event_type = event["type"]
    data_object = event["data"]["object"]
    logger.info("Stripe webhook received: %s", event_type)

    try:
        if event_type == "checkout.session.completed":
            await _handle_stripe_checkout_completed(data_object, db)
        elif event_type == "customer.subscription.updated":
            await _handle_stripe_subscription_updated(data_object, db)
        elif event_type == "customer.subscription.deleted":
            await _handle_stripe_subscription_deleted(data_object, db)
        elif event_type == "invoice.payment_failed":
            await _handle_stripe_payment_failed(data_object, db)
        else:
            logger.info("Unhandled Stripe event type: %s", event_type)
    except Exception:
        logger.exception("Error processing Stripe event %s", event_type)

    return {"received": True}


async def _handle_stripe_checkout_completed(data_object: dict, db: AsyncSession) -> None:
    metadata = data_object.get("metadata", {})
    user_id = metadata.get("user_id")
    subscription_id = data_object.get("subscription")
    customer_id = data_object.get("customer")

    if not user_id:
        logger.warning("checkout.session.completed: no user_id in metadata")
        return

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("checkout.session.completed: user %s not found", user_id)
        return

    # Read plan details from subscription metadata
    sub_metadata = data_object.get("subscription_data", {}).get("metadata", metadata)
    plan = sub_metadata.get("plan", user.plan)
    interval = sub_metadata.get("interval", user.billing_interval)
    helm_addon = sub_metadata.get("helm_addon", "False").lower() == "true"

    user.subscription_status = "active"
    user.stripe_subscription_id = subscription_id
    user.stripe_customer_id = customer_id
    user.plan = plan
    user.billing_interval = interval
    user.helm_addon_active = helm_addon
    await db.commit()
    logger.info("User %s activated: plan=%s interval=%s", user_id, plan, interval)

    asyncio.create_task(send_subscription_active_email(user, get_settings()))


async def _handle_stripe_subscription_updated(data_object: dict, db: AsyncSession) -> None:
    sub_id = data_object.get("id")
    new_status = data_object.get("status", "")

    if not sub_id:
        return

    result = await db.execute(
        select(User).where(User.stripe_subscription_id == sub_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("subscription.updated: no user with subscription %s", sub_id)
        return

    user.subscription_status = new_status
    await db.commit()
    logger.info("User %s subscription updated: status=%s", user.id, new_status)


async def _handle_stripe_subscription_deleted(data_object: dict, db: AsyncSession) -> None:
    sub_id = data_object.get("id")
    if not sub_id:
        return

    result = await db.execute(
        select(User).where(User.stripe_subscription_id == sub_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("subscription.deleted: no user with subscription %s", sub_id)
        return

    user.subscription_status = "canceled"
    await db.commit()
    logger.info("User %s subscription canceled", user.id)

    asyncio.create_task(send_subscription_canceled_email(user, get_settings()))


async def _handle_stripe_payment_failed(data_object: dict, db: AsyncSession) -> None:
    customer_id = data_object.get("customer")
    if not customer_id:
        return

    result = await db.execute(
        select(User).where(User.stripe_customer_id == customer_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("invoice.payment_failed: no user with customer %s", customer_id)
        return

    user.subscription_status = "past_due"
    await db.commit()
    logger.info("User %s marked past_due", user.id)

    asyncio.create_task(send_payment_failed_email(user, get_settings()))


# ═══════════════════════════════════════════════════════════════
# POST /billing/portal — authenticated
# ═══════════════════════════════════════════════════════════════


@billing_router.post("/portal")
async def billing_portal(current_user: User = Depends(get_current_user)):
    """Create a Stripe billing portal session."""
    if not current_user.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No billing account found",
        )

    settings = get_settings()

    if not settings.stripe_secret_key:
        return {"portal_url": None}

    try:
        stripe.api_key = settings.stripe_secret_key
        session = stripe.billing_portal.Session.create(
            customer=current_user.stripe_customer_id,
            return_url=f"{settings.hub_url}/billing",
        )
    except stripe.StripeError as e:
        logger.error("Stripe portal error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stripe error: {e.user_message or str(e)}",
        ) from e

    return {"portal_url": session.url}


# ═══════════════════════════════════════════════════════════════
# POST /billing/cancel — authenticated
# ═══════════════════════════════════════════════════════════════


@billing_router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel the current user's subscription immediately."""
    settings = get_settings()

    current_user.subscription_status = "canceled"
    current_user.subscription_ends_at = datetime.utcnow()

    # Attempt to cancel Stripe subscription
    if current_user.stripe_subscription_id and settings.stripe_secret_key:
        try:
            stripe.api_key = settings.stripe_secret_key
            stripe.Subscription.cancel(current_user.stripe_subscription_id)
        except Exception:
            logger.exception(
                "Failed to cancel Stripe subscription %s for user %s",
                current_user.stripe_subscription_id,
                current_user.id,
            )

    # Attempt to cancel PayPal subscription
    if current_user.paypal_subscription_id and settings.paypal_client_id:
        try:
            await paypal_service.cancel_subscription(
                current_user.paypal_subscription_id, settings
            )
        except Exception:
            logger.exception(
                "Failed to cancel PayPal subscription %s for user %s",
                current_user.paypal_subscription_id,
                current_user.id,
            )

    await db.commit()

    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# POST /billing/webhook/paypal — no auth
# ═══════════════════════════════════════════════════════════════


@billing_router.post("/webhook/paypal")
async def paypal_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle PayPal webhook events."""
    try:
        body = await request.json()
    except Exception:
        return {"received": True}

    event_type = body.get("event_type", "unknown")
    resource = body.get("resource", {})
    logger.info("PayPal webhook received: %s", event_type)

    try:
        if event_type == "BILLING.SUBSCRIPTION.ACTIVATED":
            await _handle_paypal_subscription_activated(resource, db)
        elif event_type == "BILLING.SUBSCRIPTION.CANCELLED":
            await _handle_paypal_subscription_cancelled(resource, db)
        elif event_type == "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
            await _handle_paypal_subscription_payment_failed(resource, db)
        else:
            logger.info("Unhandled PayPal event type: %s", event_type)
    except Exception:
        logger.exception("Error processing PayPal event %s", event_type)

    return {"received": True}


async def _handle_paypal_subscription_activated(resource: dict, db: AsyncSession) -> None:
    user_id = resource.get("custom_id")
    subscription_id = resource.get("id")
    paypal_plan_id = resource.get("plan_id", "")

    if not user_id:
        logger.warning("PayPal ACTIVATED: no custom_id (user_id) in resource")
        return

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("PayPal ACTIVATED: user %s not found", user_id)
        return

    # Resolve plan + interval from the PayPal plan_id
    resolved = _resolve_plan_from_paypal_plan_id(paypal_plan_id)
    if resolved:
        plan, interval = resolved
    else:
        # Fallback: keep the user's existing plan/interval
        plan = user.plan
        interval = user.billing_interval
        logger.warning(
            "PayPal ACTIVATED: could not resolve plan_id %s, keeping existing plan=%s",
            paypal_plan_id,
            plan,
        )

    user.subscription_status = "active"
    user.paypal_subscription_id = subscription_id
    user.plan = plan
    user.billing_interval = interval
    await db.commit()
    logger.info("User %s activated via PayPal: plan=%s interval=%s", user_id, plan, interval)

    asyncio.create_task(send_subscription_active_email(user, get_settings()))


async def _handle_paypal_subscription_cancelled(resource: dict, db: AsyncSession) -> None:
    subscription_id = resource.get("id")
    if not subscription_id:
        return

    result = await db.execute(
        select(User).where(User.paypal_subscription_id == subscription_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("PayPal CANCELLED: no user with subscription %s", subscription_id)
        return

    user.subscription_status = "canceled"
    await db.commit()
    logger.info("User %s PayPal subscription canceled", user.id)

    asyncio.create_task(send_subscription_canceled_email(user, get_settings()))


async def _handle_paypal_subscription_payment_failed(resource: dict, db: AsyncSession) -> None:
    subscription_id = resource.get("id")
    if not subscription_id:
        return

    result = await db.execute(
        select(User).where(User.paypal_subscription_id == subscription_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("PayPal PAYMENT.FAILED: no user with subscription %s", subscription_id)
        return

    user.subscription_status = "past_due"
    await db.commit()
    logger.info("User %s marked past_due via PayPal", user.id)

    asyncio.create_task(send_payment_failed_email(user, get_settings()))
