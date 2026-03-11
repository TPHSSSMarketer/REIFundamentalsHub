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
from rei.models.user import (
    AIUsageByProvider, FaxLog, KnowledgeEntry, PhoneCredit, SmsMessage, User,
)

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

        # MRR: only count active, paid users (exclude trials & complimentary)
        if st == "active" and not getattr(u, "is_complimentary", False) and u.plan in PLANS:
            plan_data = PLANS[u.plan]
            if u.billing_interval == "annual":
                base = plan_data["annual_price_cents"] // 12
            else:
                base = plan_data["monthly_price_cents"]
            mrr_cents += base

    # ── Credit & Revenue aggregates ──────────────────────────────
    # Total phone credits balance across all users
    credits_q = select(func.coalesce(func.sum(User.phone_credits_cents), 0))
    total_credits_balance_cents = (await db.execute(credits_q)).scalar() or 0

    # Total AI cost (current billing period) across all users
    ai_cost_q = select(func.coalesce(func.sum(User.ai_cost_cents), 0))
    total_ai_cost_cents = (await db.execute(ai_cost_q)).scalar() or 0

    # Total AI requests & tokens (all time)
    ai_req_q = select(func.coalesce(func.sum(User.ai_total_requests), 0))
    total_ai_requests = (await db.execute(ai_req_q)).scalar() or 0
    ai_tok_q = select(func.coalesce(func.sum(User.ai_total_tokens), 0))
    total_ai_tokens = (await db.execute(ai_tok_q)).scalar() or 0

    # Phone usage totals
    phone_min_q = select(func.coalesce(func.sum(User.phone_minutes_used), 0))
    total_phone_minutes = (await db.execute(phone_min_q)).scalar() or 0
    phone_sms_q = select(func.coalesce(func.sum(User.phone_sms_used), 0))
    total_phone_sms = (await db.execute(phone_sms_q)).scalar() or 0

    # SMS received (inbound) — queried from SmsMessage table
    sms_recv_q = (
        select(func.count())
        .select_from(SmsMessage)
        .where(SmsMessage.direction == "inbound")
    )
    total_sms_received = (await db.execute(sms_recv_q)).scalar() or 0

    # Fax sent (outbound) and received (inbound) — from FaxLog table
    fax_sent_q = (
        select(func.count())
        .select_from(FaxLog)
        .where(FaxLog.direction == "outbound")
    )
    total_fax_sent = (await db.execute(fax_sent_q)).scalar() or 0

    fax_recv_q = (
        select(func.count())
        .select_from(FaxLog)
        .where(FaxLog.direction == "inbound")
    )
    total_fax_received = (await db.execute(fax_recv_q)).scalar() or 0

    # Fax cost (total pages × per-page pricing from FaxLog.cost)
    fax_cost_q = select(
        func.coalesce(func.sum(FaxLog.cost), 0.0)
    )
    total_fax_cost = float((await db.execute(fax_cost_q)).scalar() or 0)

    # Email usage totals
    email_q = select(func.coalesce(func.sum(User.email_credits_used), 0))
    total_emails_sent = (await db.execute(email_q)).scalar() or 0

    # Credit purchase revenue (money brought in from users buying credits)
    credit_revenue_q = select(
        func.coalesce(func.sum(PhoneCredit.amount_paid_cents), 0)
    )
    total_credit_revenue_cents = (await db.execute(credit_revenue_q)).scalar() or 0

    # Total credits purchased (value given to users)
    credit_purchased_q = select(
        func.coalesce(func.sum(PhoneCredit.credits_cents), 0)
    )
    total_credits_purchased_cents = (await db.execute(credit_purchased_q)).scalar() or 0

    # Per-provider AI usage (current month)
    current_month = datetime.utcnow().strftime("%Y-%m")
    prov_q = (
        select(AIUsageByProvider)
        .where(AIUsageByProvider.month == current_month)
        .order_by(AIUsageByProvider.total_requests.desc())
    )
    prov_rows = (await db.execute(prov_q)).scalars().all()
    ai_by_provider = [
        {
            "provider": r.provider,
            "model": r.model,
            "requests": r.total_requests,
            "tokens": r.total_tokens,
            "cost_cents": r.cost_cents,
        }
        for r in prov_rows
    ]

    return {
        "total_subscribers": total_subscribers,
        "active": active,
        "trialing": trialing,
        "past_due": past_due,
        "canceled": canceled,
        "by_plan": by_plan,
        "mrr_cents": mrr_cents,
        # Credit & usage metrics
        "total_credits_balance_cents": total_credits_balance_cents,
        "total_ai_cost_cents": total_ai_cost_cents,
        "total_ai_requests": total_ai_requests,
        "total_ai_tokens": total_ai_tokens,
        "total_phone_minutes": total_phone_minutes,
        "total_phone_sms": total_phone_sms,
        "total_sms_received": total_sms_received,
        "total_fax_sent": total_fax_sent,
        "total_fax_received": total_fax_received,
        "total_fax_cost": total_fax_cost,
        "total_emails_sent": total_emails_sent,
        # Revenue from credit purchases
        "total_credit_revenue_cents": total_credit_revenue_cents,
        "total_credits_purchased_cents": total_credits_purchased_cents,
        # AI by provider this month
        "ai_by_provider": ai_by_provider,
        "current_month": current_month,
    }


# ════════════════════════════════════════════════════════════════════════
# SYSTEM HEALTH — Tools Tab
# ════════════════════════════════════════════════════════════════════════


@admin_router.get("/system-health")
async def system_health(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return system health data for the admin Tools tab.

    Includes: database table counts, provider credential statuses,
    Qdrant connectivity, and knowledge base stats.
    """
    from rei.services.credentials_service import get_all_credential_statuses
    from rei.models.user import CrmDeal, CrmContact, HelpTicket, ContentEntry
    from rei.models.negotiation import NegotiationCase

    # ── Database table counts ────────────────────────────
    counts = {}
    table_queries = {
        "users": select(func.count()).select_from(User),
        "deals": select(func.count()).select_from(CrmDeal),
        "contacts": select(func.count()).select_from(CrmContact),
        "knowledge_entries": select(func.count()).select_from(KnowledgeEntry),
        "knowledge_platform": select(func.count()).select_from(KnowledgeEntry).where(
            KnowledgeEntry.user_id.is_(None)
        ),
        "knowledge_user": select(func.count()).select_from(KnowledgeEntry).where(
            KnowledgeEntry.user_id.isnot(None)
        ),
        "negotiation_cases": select(func.count()).select_from(NegotiationCase),
        "help_tickets": select(func.count()).select_from(HelpTicket),
        "content_entries": select(func.count()).select_from(ContentEntry),
    }

    for key, q in table_queries.items():
        try:
            counts[key] = (await db.execute(q)).scalar() or 0
        except Exception as exc:
            logger.warning("Failed to count %s: %s", key, exc)
            counts[key] = -1  # -1 signals error

    # ── Provider credential statuses ─────────────────────
    try:
        provider_statuses = await get_all_credential_statuses(db)
    except Exception as exc:
        logger.warning("Failed to get credential statuses: %s", exc)
        provider_statuses = []

    # ── Qdrant health check ──────────────────────────────
    qdrant_status = {"status": "not_configured", "message": "No Qdrant credentials found"}
    try:
        from rei.services.rag_service import _get_qdrant
        client = await _get_qdrant()
        if client:
            # Try listing collections as a health check
            collections = await client.get_collections()
            collection_names = [c.name for c in collections.collections]
            qdrant_status = {
                "status": "connected",
                "message": f"{len(collection_names)} collections found",
                "collections": collection_names,
            }
        else:
            qdrant_status = {
                "status": "not_configured",
                "message": "Qdrant credentials not set up",
            }
    except Exception as exc:
        qdrant_status = {
            "status": "error",
            "message": f"Connection failed: {str(exc)[:200]}",
        }

    return {
        "database_counts": counts,
        "providers": [
            {
                "name": p["provider_name"],
                "configured": p["configured"],
                "last_updated": p.get("last_updated"),
            }
            for p in provider_statuses
        ],
        "qdrant": qdrant_status,
    }


@admin_router.post("/test-provider/{provider_name}")
async def test_provider(
    provider_name: str,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Test connectivity for a specific provider. Admin only."""
    from rei.services.credentials_service import (
        get_provider_credentials,
        test_provider_connection,
    )

    creds = await get_provider_credentials(db, provider_name)
    if not creds:
        return {"status": "error", "message": f"No credentials configured for {provider_name}"}

    result = await test_provider_connection(provider_name, creds)
    return result


@admin_router.post("/rebuild-knowledge-embeddings")
async def rebuild_knowledge_embeddings(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Rebuild all knowledge base embeddings in Qdrant. Admin only."""
    from rei.services.rag_service import rebuild_all_embeddings

    try:
        # Rebuild platform entries (user_id=0 used for "all platform")
        # Actually rebuild for admin user which includes platform entries
        count = await rebuild_all_embeddings(user_id=0, db=db)
        return {"status": "completed", "entries_rebuilt": count}
    except Exception as exc:
        logger.error("Failed to rebuild knowledge embeddings: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])


@admin_router.post("/rebuild-content-embeddings")
async def rebuild_content_embeddings_admin(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Rebuild content hub embeddings in Qdrant for ALL subscribers.

    ContentHub uses per-user collections (content_user_{id}), so this
    iterates through every user who has content entries and rebuilds each.
    """
    from rei.services.content_hub_service import rebuild_content_embeddings
    from rei.models.crm import ContentEntry

    try:
        # Find all distinct user_ids that have content entries
        result = await db.execute(
            select(ContentEntry.user_id).distinct()
        )
        user_ids = [row[0] for row in result.all() if row[0] is not None]

        total_count = 0
        user_results = []
        for uid in user_ids:
            try:
                count = await rebuild_content_embeddings(user_id=uid, db=db)
                total_count += count
                user_results.append({"user_id": uid, "entries": count, "status": "ok"})
            except Exception as user_exc:
                logger.warning("Failed to rebuild content for user %d: %s", uid, user_exc)
                user_results.append({"user_id": uid, "entries": 0, "status": "error"})

        return {
            "status": "completed",
            "entries_rebuilt": total_count,
            "users_processed": len(user_ids),
            "details": user_results,
        }
    except Exception as exc:
        logger.error("Failed to rebuild content embeddings: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])


@admin_router.post("/test-telegram")
async def test_telegram(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Send a test Telegram notification. Admin only."""
    try:
        from rei.services.telegram_channel_service import send_telegram_text
        from rei.services.credentials_service import get_provider_credentials

        tg_creds = await get_provider_credentials(db, "telegram")
        if not tg_creds or not tg_creds.get("telegram_bot_token"):
            return {"status": "error", "message": "Telegram bot token not configured"}

        chat_id = tg_creds.get("telegram_chat_id", "")
        if not chat_id:
            return {"status": "error", "message": "Telegram chat ID not configured"}

        success = await send_telegram_text(
            chat_id=chat_id,
            text="✅ *REI Fundamentals Hub* — System health check\nTelegram connection is working\\!",
            db=db,
        )

        if success:
            return {"status": "connected", "message": "Test message sent to Telegram"}
        else:
            return {"status": "error", "message": "Failed to send test message"}
    except Exception as exc:
        return {"status": "error", "message": f"Telegram test failed: {str(exc)[:200]}"}
