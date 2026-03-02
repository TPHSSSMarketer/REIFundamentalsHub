"""Reporting & Analytics API endpoints.

All analytics in one router.  Contacts/deals live in Supabase (browser-only);
pipeline endpoints query the backend-local DealAnalyzerResult table as a
lightweight proxy.  Portfolio, Loans, Negotiations, and Revenue sections
query fully local SQLAlchemy models.
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func, and_, case, extract
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import PLANS
from rei.models.user import (
    BankNegotiation,
    ContractForDeed,
    DistributionStatement,
    LandTrust,
    LoanDefault,
    LoanPayment,
    NegotiationCorrespondence,
    NegotiationFollowUp,
    User,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ---------------------------------------------------------------------------
# Date range helper
# ---------------------------------------------------------------------------


def get_date_range(
    period: str,
    start_date: Optional[date],
    end_date: Optional[date],
) -> tuple[datetime, datetime]:
    """Resolve *period* string to a ``(start, end)`` datetime pair."""
    now = datetime.utcnow()
    today = now.date()

    if period == "30d":
        return now - timedelta(days=30), now
    if period == "90d":
        return now - timedelta(days=90), now
    if period == "365d":
        return now - timedelta(days=365), now
    if period == "this_month":
        start = today.replace(day=1)
        return datetime(start.year, start.month, 1), now
    if period == "last_month":
        first_this = today.replace(day=1)
        last_month_end = first_this - timedelta(days=1)
        last_month_start = last_month_end.replace(day=1)
        return (
            datetime(last_month_start.year, last_month_start.month, 1),
            datetime(
                last_month_end.year,
                last_month_end.month,
                last_month_end.day,
                23, 59, 59,
            ),
        )
    if period == "ytd":
        return datetime(today.year, 1, 1), now
    if period == "custom" and start_date and end_date:
        return (
            datetime.combine(start_date, datetime.min.time()),
            datetime.combine(end_date, datetime.max.time()),
        )
    # Default: 30 days
    return now - timedelta(days=30), now


# ---------------------------------------------------------------------------
# Ownership helpers
# ---------------------------------------------------------------------------


def _user_filter(model_cls, user: User):
    """Return a where-clause that limits rows to the current user unless
    the user is a superadmin (who sees all users' data)."""
    if user.is_superadmin:
        return True  # no restriction
    return model_cls.user_id == user.id


# ═══════════════════════════════════════════════════════════════════════════
# DEAL PIPELINE ENDPOINTS
# Contacts and deals are stored in Supabase and accessed directly by the
# React frontend.  The backend SQLite has no Deal / Contact models.
# These endpoints return structural zeros and will be populated once a
# Supabase admin client or data-sync is wired in.
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/pipeline/overview")
async def pipeline_overview(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Deal pipeline overview — placeholder until deal data flows to backend."""
    get_date_range(period, start_date, end_date)  # validate params

    return {
        "total_leads": 0,
        "active_deals": 0,
        "closed_won": 0,
        "closed_lost": 0,
        "conversion_rate": 0.0,
        "avg_deal_size": 0.0,
        "total_pipeline_value": 0.0,
        "avg_days_to_close": 0.0,
        "leads_by_source": [],
        "deals_by_stage": [],
    }


@router.get("/pipeline/trend")
async def pipeline_trend(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Daily/weekly lead + deal counts — placeholder."""
    get_date_range(period, start_date, end_date)

    return {
        "labels": [],
        "leads": [],
        "deals_opened": [],
        "deals_closed": [],
    }


@router.get("/pipeline/funnel")
async def pipeline_funnel(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pipeline funnel — placeholder stages."""
    get_date_range(period, start_date, end_date)

    return [
        {"stage": "Lead", "count": 0},
        {"stage": "Contacted", "count": 0},
        {"stage": "Offer Made", "count": 0},
        {"stage": "Under Contract", "count": 0},
        {"stage": "Closed", "count": 0},
    ]


# ═══════════════════════════════════════════════════════════════════════════
# PORTFOLIO ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════


@router.get("/portfolio/overview")
async def portfolio_overview(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Portfolio overview based on LandTrust + ContractForDeed data."""
    dt_start, dt_end = get_date_range(period, start_date, end_date)

    # ── Base filters ──────────────────────────────────────────────
    uf = _user_filter(LandTrust, user)

    # Total properties
    total_q = select(func.count()).select_from(LandTrust).where(uf)
    total_properties = (await db.execute(total_q)).scalar() or 0

    # Portfolio value = sum of purchase prices from active CFDs
    value_q = (
        select(func.coalesce(func.sum(ContractForDeed.purchase_price), 0.0))
        .join(LandTrust, ContractForDeed.land_trust_id == LandTrust.id)
        .where(ContractForDeed.is_active.is_(True))
    )
    if not user.is_superadmin:
        value_q = value_q.where(ContractForDeed.user_id == user.id)
    total_portfolio_value = float((await db.execute(value_q)).scalar() or 0)

    # Total debt = sum of current_balance on active CFDs
    debt_q = (
        select(func.coalesce(func.sum(ContractForDeed.current_balance), 0.0))
        .join(LandTrust, ContractForDeed.land_trust_id == LandTrust.id)
        .where(ContractForDeed.is_active.is_(True))
    )
    if not user.is_superadmin:
        debt_q = debt_q.where(ContractForDeed.user_id == user.id)
    total_debt = float((await db.execute(debt_q)).scalar() or 0)
    total_equity = total_portfolio_value - total_debt

    # Properties by type (use LandTrust.status as proxy for type)
    by_type_q = (
        select(LandTrust.status, func.count())
        .where(uf)
        .group_by(LandTrust.status)
    )
    by_type_rows = (await db.execute(by_type_q)).all()
    properties_by_type = [
        {"type": row[0] or "unknown", "count": row[1]}
        for row in by_type_rows
    ]

    # Properties by state
    by_state_q = (
        select(
            LandTrust.property_state,
            func.count(),
        )
        .where(uf)
        .group_by(LandTrust.property_state)
    )
    by_state_rows = (await db.execute(by_state_q)).all()

    properties_by_state = []
    for row in by_state_rows:
        st = row[0] or "unknown"
        cnt = row[1]
        # Sum purchase prices for properties in this state
        sv_q = (
            select(func.coalesce(func.sum(ContractForDeed.purchase_price), 0.0))
            .join(LandTrust, ContractForDeed.land_trust_id == LandTrust.id)
            .where(
                LandTrust.property_state == row[0],
                ContractForDeed.is_active.is_(True),
            )
        )
        if not user.is_superadmin:
            sv_q = sv_q.where(ContractForDeed.user_id == user.id)
        state_val = float((await db.execute(sv_q)).scalar() or 0)
        properties_by_state.append({"state": st, "count": cnt, "value": state_val})

    # Average property value
    avg_property_value = (
        total_portfolio_value / total_properties if total_properties else 0.0
    )

    # Acquisition trend — last 12 months
    twelve_months_ago = datetime.utcnow() - timedelta(days=365)
    trend_q = (
        select(
            func.strftime("%Y-%m", LandTrust.created_at).label("month"),
            func.count().label("count"),
        )
        .where(uf, LandTrust.created_at >= twelve_months_ago)
        .group_by("month")
        .order_by("month")
    )
    trend_rows = (await db.execute(trend_q)).all()

    acquisition_trend = []
    for row in trend_rows:
        mo = row[0]
        cnt = row[1]
        # Sum purchase prices for this month
        mv_q = (
            select(func.coalesce(func.sum(ContractForDeed.purchase_price), 0.0))
            .join(LandTrust, ContractForDeed.land_trust_id == LandTrust.id)
            .where(func.strftime("%Y-%m", LandTrust.created_at) == mo)
        )
        if not user.is_superadmin:
            mv_q = mv_q.where(ContractForDeed.user_id == user.id)
        mo_val = float((await db.execute(mv_q)).scalar() or 0)
        acquisition_trend.append({"month": mo, "count": cnt, "value": mo_val})

    return {
        "total_properties": total_properties,
        "total_portfolio_value": total_portfolio_value,
        "total_equity": total_equity,
        "properties_by_type": properties_by_type,
        "properties_by_state": properties_by_state,
        "avg_property_value": avg_property_value,
        "acquisition_trend": acquisition_trend,
    }


@router.get("/portfolio/properties")
async def portfolio_properties(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated property list with key metrics per property."""
    uf = _user_filter(LandTrust, user)

    # Total count
    count_q = select(func.count()).select_from(LandTrust).where(uf)
    total = (await db.execute(count_q)).scalar() or 0

    # Paginated properties
    offset = (page - 1) * per_page
    props_q = (
        select(LandTrust)
        .where(uf)
        .order_by(LandTrust.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    props = (await db.execute(props_q)).scalars().all()

    items = []
    for p in props:
        # Get active CFD for purchase_price / current_balance
        cfd_q = select(ContractForDeed).where(
            ContractForDeed.land_trust_id == p.id,
            ContractForDeed.is_active.is_(True),
        )
        cfd = (await db.execute(cfd_q)).scalar_one_or_none()

        purchase_price = cfd.purchase_price if cfd else 0.0
        current_balance = cfd.current_balance if cfd else 0.0
        equity = purchase_price - current_balance

        items.append({
            "id": p.id,
            "address": p.property_address,
            "state": p.property_state,
            "purchase_price": purchase_price,
            "current_value": purchase_price,
            "equity": equity,
            "status": p.status,
            "acquired_date": (
                p.created_at.isoformat() if p.created_at else None
            ),
        })

    return {"properties": items, "total": total, "page": page}


# ═══════════════════════════════════════════════════════════════════════════
# LOAN SERVICING ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════


def _check_loan_access(user: User) -> None:
    """403 if user lacks loan servicing access."""
    if not user.is_superadmin and not user.loan_servicing_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Loan Servicing not enabled",
        )


@router.get("/loans/overview")
async def loans_overview(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Loan servicing overview metrics."""
    _check_loan_access(user)
    dt_start, dt_end = get_date_range(period, start_date, end_date)
    uf_cfd = _user_filter(ContractForDeed, user)
    uf_pay = _user_filter(LoanPayment, user)
    uf_def = _user_filter(LoanDefault, user)

    # ── Active CFDs ───────────────────────────────────────────────
    active_q = (
        select(func.count())
        .select_from(ContractForDeed)
        .where(uf_cfd, ContractForDeed.is_active.is_(True))
    )
    total_active_cfds = (await db.execute(active_q)).scalar() or 0

    # ── Total portfolio balance ───────────────────────────────────
    bal_q = (
        select(func.coalesce(func.sum(ContractForDeed.current_balance), 0.0))
        .where(uf_cfd, ContractForDeed.is_active.is_(True))
    )
    total_portfolio_balance = float((await db.execute(bal_q)).scalar() or 0)

    # ── Payment aggregates in period ──────────────────────────────
    pay_base = and_(
        uf_pay,
        LoanPayment.status == "completed",
        LoanPayment.payment_date >= dt_start,
        LoanPayment.payment_date <= dt_end,
    )
    collected_q = select(
        func.coalesce(func.sum(LoanPayment.amount), 0.0),
        func.coalesce(func.sum(LoanPayment.principal_portion), 0.0),
        func.coalesce(func.sum(LoanPayment.interest_portion), 0.0),
        func.coalesce(func.sum(LoanPayment.late_fee_portion), 0.0),
        func.coalesce(func.sum(LoanPayment.servicing_fee_amount), 0.0),
    ).where(pay_base)
    pay_row = (await db.execute(collected_q)).one()
    total_collected_period = float(pay_row[0])
    total_principal_period = float(pay_row[1])
    total_interest_period = float(pay_row[2])
    total_late_fees_period = float(pay_row[3])
    servicing_fees_collected = float(pay_row[4])

    # ── Defaults ──────────────────────────────────────────────────
    active_def_q = (
        select(func.count())
        .select_from(LoanDefault)
        .where(uf_def, LoanDefault.status == "active")
    )
    active_defaults = (await db.execute(active_def_q)).scalar() or 0

    cured_def_q = (
        select(func.count())
        .select_from(LoanDefault)
        .where(
            uf_def,
            LoanDefault.status == "cured",
            LoanDefault.cured_date >= dt_start,
            LoanDefault.cured_date <= dt_end,
        )
    )
    cured_defaults_period = (await db.execute(cured_def_q)).scalar() or 0

    delinquency_rate = (
        (active_defaults / total_active_cfds * 100) if total_active_cfds else 0.0
    )

    # ── Average days late ─────────────────────────────────────────
    avg_late_q = (
        select(func.avg(LoanPayment.days_late))
        .where(uf_pay, LoanPayment.is_late.is_(True))
    )
    avg_days_late = float((await db.execute(avg_late_q)).scalar() or 0)

    # ── Collection trend — last 12 months ─────────────────────────
    twelve_months_ago = datetime.utcnow() - timedelta(days=365)
    trend_q = (
        select(
            func.strftime("%Y-%m", LoanPayment.payment_date).label("month"),
            func.coalesce(func.sum(LoanPayment.amount), 0.0),
            func.coalesce(func.sum(LoanPayment.principal_portion), 0.0),
            func.coalesce(func.sum(LoanPayment.interest_portion), 0.0),
            func.coalesce(func.sum(LoanPayment.late_fee_portion), 0.0),
        )
        .where(
            uf_pay,
            LoanPayment.status == "completed",
            LoanPayment.payment_date >= twelve_months_ago,
        )
        .group_by("month")
        .order_by("month")
    )
    trend_rows = (await db.execute(trend_q)).all()
    collection_trend = [
        {
            "month": r[0],
            "collected": float(r[1]),
            "principal": float(r[2]),
            "interest": float(r[3]),
            "late_fees": float(r[4]),
        }
        for r in trend_rows
    ]

    # ── CFDs by status ────────────────────────────────────────────
    status_q = (
        select(
            ContractForDeed.status,
            func.count(),
            func.coalesce(func.sum(ContractForDeed.current_balance), 0.0),
        )
        .where(uf_cfd)
        .group_by(ContractForDeed.status)
    )
    status_rows = (await db.execute(status_q)).all()
    cfds_by_status = [
        {"status": r[0], "count": r[1], "balance": float(r[2])}
        for r in status_rows
    ]

    # ── Investor distributions in period ──────────────────────────
    dist_q = (
        select(
            func.coalesce(
                func.sum(DistributionStatement.total_investor_distributions), 0.0
            )
        )
        .where(
            DistributionStatement.period_start >= dt_start,
            DistributionStatement.period_end <= dt_end,
        )
    )
    if not user.is_superadmin:
        dist_q = dist_q.where(DistributionStatement.admin_user_id == user.id)
    investor_distributions_period = float((await db.execute(dist_q)).scalar() or 0)

    return {
        "total_active_cfds": total_active_cfds,
        "total_portfolio_balance": total_portfolio_balance,
        "total_collected_period": total_collected_period,
        "total_principal_period": total_principal_period,
        "total_interest_period": total_interest_period,
        "total_late_fees_period": total_late_fees_period,
        "active_defaults": active_defaults,
        "cured_defaults_period": cured_defaults_period,
        "delinquency_rate": round(delinquency_rate, 2),
        "avg_days_late": round(avg_days_late, 1),
        "collection_trend": collection_trend,
        "cfds_by_status": cfds_by_status,
        "servicing_fees_collected": servicing_fees_collected,
        "investor_distributions_period": investor_distributions_period,
    }


@router.get("/loans/payments")
async def loans_payments(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    cfd_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    payment_method: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated payment history with totals."""
    _check_loan_access(user)
    dt_start, dt_end = get_date_range(period, start_date, end_date)
    uf = _user_filter(LoanPayment, user)

    base_filters = [
        uf,
        LoanPayment.payment_date >= dt_start,
        LoanPayment.payment_date <= dt_end,
    ]
    if cfd_id:
        base_filters.append(LoanPayment.cfd_id == cfd_id)
    if status_filter:
        base_filters.append(LoanPayment.status == status_filter)
    if payment_method:
        base_filters.append(LoanPayment.payment_method == payment_method)

    where = and_(*base_filters)

    # Totals
    totals_q = select(
        func.coalesce(func.sum(LoanPayment.amount), 0.0),
        func.coalesce(func.sum(LoanPayment.principal_portion), 0.0),
        func.coalesce(func.sum(LoanPayment.interest_portion), 0.0),
        func.coalesce(func.sum(LoanPayment.late_fee_portion), 0.0),
        func.count(),
    ).where(where)
    t = (await db.execute(totals_q)).one()

    # Count for pagination
    total_count = t[4]

    # Paginated rows
    offset = (page - 1) * per_page
    rows_q = (
        select(LoanPayment)
        .where(where)
        .order_by(LoanPayment.payment_date.desc())
        .offset(offset)
        .limit(per_page)
    )
    payments = (await db.execute(rows_q)).scalars().all()

    return {
        "payments": [
            {
                "id": p.id,
                "cfd_id": p.cfd_id,
                "amount": p.amount,
                "principal_portion": p.principal_portion,
                "interest_portion": p.interest_portion,
                "late_fee_portion": p.late_fee_portion,
                "payment_date": (
                    p.payment_date.isoformat() if p.payment_date else None
                ),
                "due_date": p.due_date.isoformat() if p.due_date else None,
                "is_late": p.is_late,
                "days_late": p.days_late,
                "payment_method": p.payment_method,
                "status": p.status,
                "balance_after": p.balance_after,
                "servicing_fee_amount": p.servicing_fee_amount,
                "notes": p.notes,
                "created_at": (
                    p.created_at.isoformat() if p.created_at else None
                ),
            }
            for p in payments
        ],
        "totals": {
            "collected": float(t[0]),
            "principal": float(t[1]),
            "interest": float(t[2]),
            "late_fees": float(t[3]),
            "count": total_count,
        },
        "page": page,
        "total": total_count,
    }


# ═══════════════════════════════════════════════════════════════════════════
# BANK NEGOTIATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════


def _check_negotiation_access(user: User) -> None:
    """403 if user lacks bank negotiation access."""
    if not user.is_superadmin and not user.bank_negotiation_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bank Negotiation not enabled",
        )


@router.get("/negotiations/overview")
async def negotiations_overview(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bank negotiation analytics overview."""
    _check_negotiation_access(user)
    dt_start, dt_end = get_date_range(period, start_date, end_date)
    uf_neg = _user_filter(BankNegotiation, user)
    uf_corr = _user_filter(NegotiationCorrespondence, user)

    # ── Status counts ─────────────────────────────────────────────
    active_q = (
        select(func.count())
        .select_from(BankNegotiation)
        .where(
            uf_neg,
            BankNegotiation.status.in_(["active", "pending_response"]),
        )
    )
    total_active = (await db.execute(active_q)).scalar() or 0

    approved_q = (
        select(func.count())
        .select_from(BankNegotiation)
        .where(uf_neg, BankNegotiation.status == "approved")
    )
    total_approved = (await db.execute(approved_q)).scalar() or 0

    denied_q = (
        select(func.count())
        .select_from(BankNegotiation)
        .where(uf_neg, BankNegotiation.status == "denied")
    )
    total_denied = (await db.execute(denied_q)).scalar() or 0

    completed_q = (
        select(func.count())
        .select_from(BankNegotiation)
        .where(uf_neg, BankNegotiation.status == "completed")
    )
    total_completed = (await db.execute(completed_q)).scalar() or 0

    closed_total = total_approved + total_denied
    approval_rate = (
        (total_approved / closed_total * 100) if closed_total else 0.0
    )

    # ── Letters sent / delivered in period ─────────────────────────
    sent_q = (
        select(func.count())
        .select_from(NegotiationCorrespondence)
        .where(
            uf_corr,
            NegotiationCorrespondence.sent_date >= dt_start,
            NegotiationCorrespondence.sent_date <= dt_end,
        )
    )
    letters_sent_period = (await db.execute(sent_q)).scalar() or 0

    delivered_q = (
        select(func.count())
        .select_from(NegotiationCorrespondence)
        .where(
            uf_corr,
            NegotiationCorrespondence.status == "delivered",
            NegotiationCorrespondence.sent_date >= dt_start,
            NegotiationCorrespondence.sent_date <= dt_end,
        )
    )
    letters_delivered_period = (await db.execute(delivered_q)).scalar() or 0

    delivery_rate = (
        (letters_delivered_period / letters_sent_period * 100)
        if letters_sent_period
        else 0.0
    )

    # ── Average days to response ──────────────────────────────────
    # Approximation: days between negotiation created_at and updated_at
    # for negotiations that moved past "active".
    resp_q = (
        select(
            func.avg(
                func.julianday(BankNegotiation.updated_at)
                - func.julianday(BankNegotiation.created_at)
            )
        )
        .where(
            uf_neg,
            BankNegotiation.status.notin_(["active", "pending_response"]),
        )
    )
    avg_days_to_response = float((await db.execute(resp_q)).scalar() or 0)

    # ── By negotiation type ───────────────────────────────────────
    by_type_q = (
        select(
            BankNegotiation.negotiation_type,
            func.count(),
            func.sum(
                case(
                    (BankNegotiation.status == "approved", 1),
                    else_=0,
                )
            ),
            func.sum(
                case(
                    (BankNegotiation.status == "denied", 1),
                    else_=0,
                )
            ),
        )
        .where(uf_neg)
        .group_by(BankNegotiation.negotiation_type)
    )
    type_rows = (await db.execute(by_type_q)).all()
    by_negotiation_type = [
        {
            "type": r[0],
            "count": r[1],
            "approved": int(r[2] or 0),
            "denied": int(r[3] or 0),
        }
        for r in type_rows
    ]

    # ── By bank — top 10 ─────────────────────────────────────────
    by_bank_q = (
        select(
            BankNegotiation.bank_name,
            func.count(),
            BankNegotiation.status,
        )
        .where(uf_neg)
        .group_by(BankNegotiation.bank_name, BankNegotiation.status)
        .order_by(func.count().desc())
        .limit(10)
    )
    bank_rows = (await db.execute(by_bank_q)).all()
    by_bank = [
        {"bank_name": r[0], "count": r[1], "status": r[2]}
        for r in bank_rows
    ]

    # ── Letter series progress ────────────────────────────────────
    def _letter_count(letter_num: int):
        q = (
            select(func.count())
            .select_from(NegotiationCorrespondence)
            .where(
                uf_corr,
                NegotiationCorrespondence.letter_number == letter_num,
            )
        )
        return q

    l1_sent = (await db.execute(_letter_count(1))).scalar() or 0
    l2_sent = (await db.execute(_letter_count(2))).scalar() or 0
    l3_sent = (await db.execute(_letter_count(3))).scalar() or 0

    # Negotiations where all 3 letters sent
    all3_q = (
        select(func.count(func.distinct(NegotiationCorrespondence.negotiation_id)))
        .where(uf_corr, NegotiationCorrespondence.letter_number == 3)
    )
    all_3_complete = (await db.execute(all3_q)).scalar() or 0

    letter_series_progress = {
        "letter_1_sent": l1_sent,
        "letter_2_sent": l2_sent,
        "letter_3_sent": l3_sent,
        "all_3_complete": all_3_complete,
    }

    # ── Follow-ups ────────────────────────────────────────────────
    now = datetime.utcnow()
    seven_days = now + timedelta(days=7)
    uf_fu = _user_filter(NegotiationFollowUp, user)

    pending_q = (
        select(func.count())
        .select_from(NegotiationFollowUp)
        .where(
            uf_fu,
            NegotiationFollowUp.completed.is_(False),
            NegotiationFollowUp.due_date <= seven_days,
            NegotiationFollowUp.due_date >= now,
        )
    )
    pending_followups = (await db.execute(pending_q)).scalar() or 0

    overdue_q = (
        select(func.count())
        .select_from(NegotiationFollowUp)
        .where(
            uf_fu,
            NegotiationFollowUp.completed.is_(False),
            NegotiationFollowUp.due_date < now,
        )
    )
    overdue_followups = (await db.execute(overdue_q)).scalar() or 0

    return {
        "total_active": total_active,
        "total_approved": total_approved,
        "total_denied": total_denied,
        "total_completed": total_completed,
        "approval_rate": round(approval_rate, 2),
        "letters_sent_period": letters_sent_period,
        "letters_delivered_period": letters_delivered_period,
        "delivery_rate": round(delivery_rate, 2),
        "avg_days_to_response": round(avg_days_to_response, 1),
        "by_negotiation_type": by_negotiation_type,
        "by_bank": by_bank,
        "letter_series_progress": letter_series_progress,
        "pending_followups": pending_followups,
        "overdue_followups": overdue_followups,
    }


# ═══════════════════════════════════════════════════════════════════════════
# REVENUE & BILLING ENDPOINTS  (superadmin only)
# ═══════════════════════════════════════════════════════════════════════════


def _check_superadmin(user: User) -> None:
    if not user.is_superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required",
        )


def _plan_monthly_cents(plan: str, interval: str) -> int:
    """Return monthly-equivalent price in cents for a given plan + interval."""
    plan_data = PLANS.get(plan, {})
    if interval == "annual":
        return int(plan_data.get("annual_price_cents", 0) / 12)
    return plan_data.get("monthly_price_cents", 0)


@router.get("/revenue/overview")
async def revenue_overview(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Platform-wide revenue metrics — superadmin only."""
    _check_superadmin(user)
    dt_start, dt_end = get_date_range(period, start_date, end_date)

    # ── Active subscribers ────────────────────────────────────────
    active_q = (
        select(func.count())
        .select_from(User)
        .where(User.subscription_status == "active")
    )
    total_active_subscribers = (await db.execute(active_q)).scalar() or 0

    # ── MRR calculation ───────────────────────────────────────────
    active_users_q = select(User).where(User.subscription_status == "active")
    active_users = (await db.execute(active_users_q)).scalars().all()

    mrr_cents = 0
    revenue_by_plan: dict[str, dict] = {}
    for u in active_users:
        monthly = _plan_monthly_cents(u.plan, u.billing_interval)
        mrr_cents += monthly

        plan_name = u.plan
        if plan_name not in revenue_by_plan:
            revenue_by_plan[plan_name] = {"plan": plan_name, "count": 0, "mrr": 0.0}
        revenue_by_plan[plan_name]["count"] += 1
        revenue_by_plan[plan_name]["mrr"] += monthly / 100.0

    mrr = mrr_cents / 100.0
    arr = mrr * 12

    # ── New subscribers in period ─────────────────────────────────
    new_q = (
        select(func.count())
        .select_from(User)
        .where(
            User.subscription_status == "active",
            User.created_at >= dt_start,
            User.created_at <= dt_end,
        )
    )
    new_subscribers_period = (await db.execute(new_q)).scalar() or 0

    # ── Churn in period ───────────────────────────────────────────
    churn_q = (
        select(func.count())
        .select_from(User)
        .where(
            User.subscription_status.in_(["canceled", "expired"]),
            User.updated_at >= dt_start,
            User.updated_at <= dt_end,
        )
    )
    churn_period = (await db.execute(churn_q)).scalar() or 0

    # Subscribers at start of period
    subs_start_q = (
        select(func.count())
        .select_from(User)
        .where(
            User.subscription_status == "active",
            User.created_at < dt_start,
        )
    )
    subs_at_start = (await db.execute(subs_start_q)).scalar() or 0
    churn_rate = (
        (churn_period / subs_at_start * 100) if subs_at_start else 0.0
    )

    avg_revenue_per_user = (
        mrr / total_active_subscribers if total_active_subscribers else 0.0
    )

    # ── Feature-enabled counts ────────────────────────────────────
    loan_q = (
        select(func.count())
        .select_from(User)
        .where(User.loan_servicing_enabled.is_(True))
    )
    loan_servicing_enabled_count = (await db.execute(loan_q)).scalar() or 0

    bank_q = (
        select(func.count())
        .select_from(User)
        .where(User.bank_negotiation_enabled.is_(True))
    )
    bank_negotiation_enabled_count = (await db.execute(bank_q)).scalar() or 0

    # ── Servicing fees collected in period ─────────────────────────
    svc_q = (
        select(func.coalesce(func.sum(LoanPayment.servicing_fee_amount), 0.0))
        .where(
            LoanPayment.status == "completed",
            LoanPayment.payment_date >= dt_start,
            LoanPayment.payment_date <= dt_end,
        )
    )
    servicing_fees_collected_period = float(
        (await db.execute(svc_q)).scalar() or 0
    )

    # ── Revenue trend — last 12 months ────────────────────────────
    # Approximate: count users created per month as "new" and
    # users canceled per month as "churned".
    twelve_months_ago = datetime.utcnow() - timedelta(days=365)

    new_trend_q = (
        select(
            func.strftime("%Y-%m", User.created_at).label("month"),
            func.count(),
        )
        .where(
            User.subscription_status == "active",
            User.created_at >= twelve_months_ago,
        )
        .group_by("month")
        .order_by("month")
    )
    new_rows = {r[0]: r[1] for r in (await db.execute(new_trend_q)).all()}

    churn_trend_q = (
        select(
            func.strftime("%Y-%m", User.updated_at).label("month"),
            func.count(),
        )
        .where(
            User.subscription_status.in_(["canceled", "expired"]),
            User.updated_at >= twelve_months_ago,
        )
        .group_by("month")
        .order_by("month")
    )
    churn_rows = {r[0]: r[1] for r in (await db.execute(churn_trend_q)).all()}

    all_months = sorted(set(list(new_rows.keys()) + list(churn_rows.keys())))
    revenue_trend = [
        {
            "month": m,
            "mrr": mrr,  # current MRR — historical would need snapshots
            "new": new_rows.get(m, 0),
            "churned": churn_rows.get(m, 0),
        }
        for m in all_months
    ]

    return {
        "total_active_subscribers": total_active_subscribers,
        "mrr": round(mrr, 2),
        "arr": round(arr, 2),
        "new_subscribers_period": new_subscribers_period,
        "churn_period": churn_period,
        "churn_rate": round(churn_rate, 2),
        "avg_revenue_per_user": round(avg_revenue_per_user, 2),
        "revenue_by_plan": list(revenue_by_plan.values()),
        "loan_servicing_enabled_count": loan_servicing_enabled_count,
        "bank_negotiation_enabled_count": bank_negotiation_enabled_count,
        "servicing_fees_collected_period": servicing_fees_collected_period,
        "revenue_trend": revenue_trend,
    }


@router.get("/revenue/subscribers")
async def revenue_subscribers(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Paginated subscriber list — superadmin only."""
    _check_superadmin(user)

    count_q = (
        select(func.count())
        .select_from(User)
        .where(User.subscription_status == "active")
    )
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * per_page
    rows_q = (
        select(User)
        .where(User.subscription_status == "active")
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    users = (await db.execute(rows_q)).scalars().all()

    return {
        "subscribers": [
            {
                "id": u.id,
                "email": u.email,
                "plan": u.plan,
                "subscription_start": (
                    u.created_at.isoformat() if u.created_at else None
                ),
                "mrr_contribution": round(
                    _plan_monthly_cents(u.plan, u.billing_interval) / 100.0, 2
                ),
                "loan_servicing_enabled": u.loan_servicing_enabled,
                "bank_negotiation_enabled": u.bank_negotiation_enabled,
                "last_active": (
                    u.updated_at.isoformat() if u.updated_at else None
                ),
            }
            for u in users
        ],
        "total": total,
        "page": page,
    }


# ═══════════════════════════════════════════════════════════════════════════
# EXPORT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════


def _csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    """Build a CSV StreamingResponse from a list of dicts."""
    if not rows:
        output = io.StringIO()
        output.write("")
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            },
        )

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/pipeline")
async def export_pipeline(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """CSV export of deal pipeline data."""
    dt_start, dt_end = get_date_range(period, start_date, end_date)
    start_str = dt_start.strftime("%Y-%m-%d")
    end_str = dt_end.strftime("%Y-%m-%d")

    # Pipeline data is in Supabase — return empty CSV with headers
    rows: list[dict] = []
    return _csv_response(rows, f"pipeline_{start_str}_{end_str}.csv")


@router.get("/export/portfolio")
async def export_portfolio(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """CSV export of portfolio properties."""
    uf = _user_filter(LandTrust, user)
    props = (
        await db.execute(
            select(LandTrust).where(uf).order_by(LandTrust.created_at.desc())
        )
    ).scalars().all()

    rows = []
    for p in props:
        cfd_q = select(ContractForDeed).where(
            ContractForDeed.land_trust_id == p.id,
            ContractForDeed.is_active.is_(True),
        )
        cfd = (await db.execute(cfd_q)).scalar_one_or_none()
        purchase_price = cfd.purchase_price if cfd else 0.0
        current_balance = cfd.current_balance if cfd else 0.0

        rows.append({
            "id": p.id,
            "address": p.property_address,
            "city": p.property_city,
            "state": p.property_state,
            "zip": p.property_zip,
            "status": p.status,
            "purchase_price": purchase_price,
            "current_balance": current_balance,
            "equity": purchase_price - current_balance,
            "acquired_date": (
                p.created_at.strftime("%Y-%m-%d") if p.created_at else ""
            ),
        })

    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    return _csv_response(rows, f"portfolio_{date_str}.csv")


@router.get("/export/loans")
async def export_loans(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """CSV export of loan payment history."""
    _check_loan_access(user)
    dt_start, dt_end = get_date_range(period, start_date, end_date)
    uf = _user_filter(LoanPayment, user)

    payments = (
        await db.execute(
            select(LoanPayment)
            .where(
                uf,
                LoanPayment.payment_date >= dt_start,
                LoanPayment.payment_date <= dt_end,
            )
            .order_by(LoanPayment.payment_date.desc())
        )
    ).scalars().all()

    rows = [
        {
            "id": p.id,
            "cfd_id": p.cfd_id,
            "amount": p.amount,
            "principal": p.principal_portion,
            "interest": p.interest_portion,
            "late_fee": p.late_fee_portion,
            "servicing_fee": p.servicing_fee_amount,
            "payment_date": (
                p.payment_date.strftime("%Y-%m-%d") if p.payment_date else ""
            ),
            "due_date": (
                p.due_date.strftime("%Y-%m-%d") if p.due_date else ""
            ),
            "is_late": p.is_late,
            "days_late": p.days_late,
            "payment_method": p.payment_method,
            "status": p.status,
            "balance_after": p.balance_after,
        }
        for p in payments
    ]

    start_str = dt_start.strftime("%Y-%m-%d")
    end_str = dt_end.strftime("%Y-%m-%d")
    return _csv_response(rows, f"loan_payments_{start_str}_{end_str}.csv")


@router.get("/export/negotiations")
async def export_negotiations(
    period: str = Query("30d"),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """CSV export of negotiation correspondence log."""
    _check_negotiation_access(user)
    dt_start, dt_end = get_date_range(period, start_date, end_date)
    uf = _user_filter(NegotiationCorrespondence, user)

    corr = (
        await db.execute(
            select(NegotiationCorrespondence)
            .where(
                uf,
                NegotiationCorrespondence.sent_date >= dt_start,
                NegotiationCorrespondence.sent_date <= dt_end,
            )
            .order_by(NegotiationCorrespondence.sent_date.desc())
        )
    ).scalars().all()

    rows = [
        {
            "id": c.id,
            "negotiation_id": c.negotiation_id,
            "recipient_id": c.recipient_id,
            "send_method": c.send_method,
            "sent_date": (
                c.sent_date.strftime("%Y-%m-%d") if c.sent_date else ""
            ),
            "letter_number": c.letter_number,
            "letter_type": c.letter_type,
            "usps_tracking_number": c.usps_tracking_number or "",
            "usps_status": c.usps_status or "",
            "fax_status": c.fax_status or "",
            "status": c.status,
        }
        for c in corr
    ]

    start_str = dt_start.strftime("%Y-%m-%d")
    end_str = dt_end.strftime("%Y-%m-%d")
    return _csv_response(rows, f"negotiations_{start_str}_{end_str}.csv")
