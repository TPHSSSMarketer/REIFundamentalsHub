"""Admin routes — subscriber management dashboard endpoints."""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_db
from rei.config import PLANS
from rei.middleware.admin_gate import require_admin
from rei.models.user import User

logger = logging.getLogger(__name__)
admin_router = APIRouter(prefix="/admin", tags=["admin"])


# ── Schemas ──────────────────────────────────────────────────────────────


class AdjustPlanRequest(BaseModel):
    plan: str
    billing_interval: str
    subscription_status: str
    is_complimentary: bool | None = None
    loan_servicing_enabled: bool | None = None
    bank_negotiation_enabled: bool | None = None


# ── Helpers ──────────────────────────────────────────────────────────────


def _mask(value: str | None) -> str | None:
    """Mask a payment provider ID to show only the last 6 characters."""
    if not value:
        return None
    if len(value) <= 6:
        return value
    return f"...{value[-6:]}"


def _user_to_dict(user: User) -> dict:
    """Serialize a User to the subscriber list representation."""
    return {
        "user_id": user.id,
        "email": user.email,
        "name": user.full_name,
        "plan": user.plan,
        "billing_interval": user.billing_interval,
        "subscription_status": user.subscription_status,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "subscription_ends_at": (
            user.subscription_ends_at.isoformat() if user.subscription_ends_at else None
        ),
        "seats_used": user.seats_used,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "is_complimentary": getattr(user, "is_complimentary", False),
        "is_superadmin": getattr(user, "is_superadmin", False),
        "loan_servicing_enabled": getattr(user, "loan_servicing_enabled", False),
        "bank_negotiation_enabled": getattr(user, "bank_negotiation_enabled", False),
    }


def _user_to_detail(user: User) -> dict:
    """Serialize a User to the subscriber detail representation (masked IDs)."""
    base = _user_to_dict(user)
    base["stripe_customer_id"] = _mask(user.stripe_customer_id)
    base["stripe_subscription_id"] = _mask(user.stripe_subscription_id)
    base["paypal_subscription_id"] = _mask(user.paypal_subscription_id)
    return base


# ═══════════════════════════════════════════════════════════════
# GET /admin/subscribers
# ═══════════════════════════════════════════════════════════════


@admin_router.get("/subscribers")
async def list_subscribers(
    status: str | None = Query(None, description="Filter by subscription_status"),
    plan: str | None = Query(None, description="Filter by plan"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return a paginated list of all subscribers."""
    query = select(User)
    count_query = select(func.count()).select_from(User)

    if status:
        query = query.where(User.subscription_status == status)
        count_query = count_query.where(User.subscription_status == status)
    if plan:
        query = query.where(User.plan == plan)
        count_query = count_query.where(User.plan == plan)

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * per_page
    query = query.order_by(User.created_at.desc()).offset(offset).limit(per_page)
    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "subscribers": [_user_to_dict(u) for u in users],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ═══════════════════════════════════════════════════════════════
# GET /admin/subscribers/{user_id}
# ═══════════════════════════════════════════════════════════════


@admin_router.get("/subscribers/{user_id}")
async def get_subscriber(
    user_id: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return full subscriber detail for one user (payment IDs masked)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_detail(user)


# ═══════════════════════════════════════════════════════════════
# POST /admin/subscribers/{user_id}/adjust-plan
# ═══════════════════════════════════════════════════════════════


@admin_router.post("/subscribers/{user_id}/adjust-plan")
async def adjust_plan(
    user_id: int,
    body: AdjustPlanRequest,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Manually adjust a subscriber's plan."""
    if body.plan not in PLANS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid plan: {body.plan}. Must be one of: {', '.join(PLANS.keys())}",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.plan = body.plan
    user.billing_interval = body.billing_interval
    user.subscription_status = body.subscription_status
    if body.is_complimentary is not None:
        user.is_complimentary = body.is_complimentary
    if body.loan_servicing_enabled is not None:
        user.loan_servicing_enabled = body.loan_servicing_enabled
    if body.bank_negotiation_enabled is not None:
        user.bank_negotiation_enabled = body.bank_negotiation_enabled
    await db.commit()
    await db.refresh(user)

    logger.info("Admin manually adjusted plan for user %s", user_id)

    return _user_to_detail(user)


# ═══════════════════════════════════════════════════════════════
# POST /admin/subscribers/{user_id}/cancel
# ═══════════════════════════════════════════════════════════════


@admin_router.post("/subscribers/{user_id}/cancel")
async def cancel_subscriber(
    user_id: int,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a subscriber's subscription."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.subscription_status = "canceled"
    user.subscription_ends_at = datetime.utcnow()
    await db.commit()

    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# GET /admin/stats
# ═══════════════════════════════════════════════════════════════


@admin_router.get("/stats")
async def admin_stats(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregate subscriber statistics and MRR."""
    result = await db.execute(select(User))
    users = result.scalars().all()

    total_subscribers = len(users)
    active = 0
    trialing = 0
    past_due = 0
    canceled = 0
    by_plan: dict[str, int] = {k: 0 for k in PLANS}
    mrr_cents = 0

    for u in users:
        st = u.subscription_status
        if st == "active":
            active += 1
        elif st == "trialing":
            trialing += 1
        elif st == "past_due":
            past_due += 1
        elif st == "canceled":
            canceled += 1

        if u.plan in by_plan:
            by_plan[u.plan] += 1

        # MRR: only count active or trialing users
        if st in ("active", "trialing") and u.plan in PLANS:
            plan_data = PLANS[u.plan]
            if u.billing_interval == "annual":
                base = plan_data["annual_price_cents"] // 12
            else:
                base = plan_data["monthly_price_cents"]
            mrr_cents += base

    return {
        "total_subscribers": total_subscribers,
        "active": active,
        "trialing": trialing,
        "past_due": past_due,
        "canceled": canceled,
        "by_plan": by_plan,
        "mrr_cents": mrr_cents,
    }
