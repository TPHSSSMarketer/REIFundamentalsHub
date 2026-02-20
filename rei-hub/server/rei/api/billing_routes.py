"""Billing routes — plan catalog, subscription status, checkout stubs, webhooks."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import PLANS, TRIAL_DAYS
from rei.models.user import User

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
# POST /billing/create-checkout — authenticated (stub)
# ═══════════════════════════════════════════════════════════════


@billing_router.post("/create-checkout")
async def create_checkout(
    body: CreateCheckoutRequest,
    current_user: User = Depends(get_current_user),
):
    """Create a checkout session. Stub — returns null until price IDs are configured."""
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

    return {
        "checkout_url": None,
        "message": "Stripe/PayPal not yet configured — price IDs pending",
    }


# ═══════════════════════════════════════════════════════════════
# POST /billing/webhook/stripe — no auth (stub)
# ═══════════════════════════════════════════════════════════════


@billing_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events. Stub — logs event type."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = body.get("type", "unknown")
    logger.info("Stripe webhook received: %s", event_type)
    return {"received": True}


# ═══════════════════════════════════════════════════════════════
# POST /billing/webhook/paypal — no auth (stub)
# ═══════════════════════════════════════════════════════════════


@billing_router.post("/webhook/paypal")
async def paypal_webhook(request: Request):
    """Handle PayPal webhook events. Stub — logs event type."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = body.get("event_type", "unknown")
    logger.info("PayPal webhook received: %s", event_type)
    return {"received": True}
