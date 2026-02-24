"""Loan servicing API — Payment, Default, Investor, Distribution, Admin, and Stripe Connect endpoints."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.api.loan_routes_properties import get_current_user_with_loans
from rei.config import get_settings, Settings
from rei.database import async_session_factory
from rei.models.user import (
    ContractForDeed,
    DistributionStatement,
    Investor,
    LandTrust,
    LoanDefault,
    LoanPayment,
    StateLawResearch,
    Task,
    User,
)
from rei.services.ai_service import encrypt_api_key
from rei.services.loan_servicing import (
    calculate_amortization,
    calculate_late_fee,
    calculate_payment_split,
    calculate_quarterly_distributions,
)
from rei.services.state_law_service import get_eviction_timeline, research_state_laws
from rei.services.stripe_connect import (
    confirm_payment as stripe_confirm_payment,
    create_connect_account_link,
    create_payment_intent,
    get_connect_account_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/loans", tags=["loans"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class RecordPaymentBody(BaseModel):
    cfd_id: str
    amount: float
    payment_date: datetime
    payment_method: str
    reference_number: Optional[str] = None
    notes: Optional[str] = None


class StripeCreateIntentBody(BaseModel):
    cfd_id: str
    amount: float


class StripeConfirmBody(BaseModel):
    payment_intent_id: str
    cfd_id: str


class CreateDefaultBody(BaseModel):
    cfd_id: str
    missed_payment_amount: float


class UpdateDefaultBody(BaseModel):
    status: Optional[str] = None
    notice_1_sent_date: Optional[datetime] = None
    notice_2_sent_date: Optional[datetime] = None
    eviction_status: Optional[str] = None
    notes: Optional[str] = None


class InvestorCreateBody(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    entity_name: Optional[str] = None
    distribution_percentage: float = 4.0
    payment_method: str = "check"
    bank_name: Optional[str] = None
    routing_number: Optional[str] = None
    account_number_bank: Optional[str] = None
    notes: Optional[str] = None


class InvestorUpdateBody(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    entity_name: Optional[str] = None
    distribution_percentage: Optional[float] = None
    payment_method: Optional[str] = None
    bank_name: Optional[str] = None
    routing_number: Optional[str] = None
    account_number_bank: Optional[str] = None
    notes: Optional[str] = None


class GenerateDistributionBody(BaseModel):
    period_start: datetime
    period_end: datetime
    quarter: Optional[str] = None


class EnableLoanServicingBody(BaseModel):
    pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _mask_number(encrypted_val: Optional[str]) -> Optional[str]:
    """Return masked version: '***' + last 4 chars, or None."""
    if not encrypted_val:
        return None
    return f"***{encrypted_val[-4:]}" if len(encrypted_val) >= 4 else "***"


def _serialize_payment(p: LoanPayment) -> dict:
    return {
        "id": p.id,
        "cfd_id": p.cfd_id,
        "land_trust_id": p.land_trust_id,
        "amount": p.amount,
        "principal_portion": p.principal_portion,
        "interest_portion": p.interest_portion,
        "late_fee_portion": p.late_fee_portion,
        "payment_date": p.payment_date.isoformat() if p.payment_date else None,
        "due_date": p.due_date.isoformat() if p.due_date else None,
        "is_late": p.is_late,
        "days_late": p.days_late,
        "payment_method": p.payment_method,
        "reference_number": p.reference_number,
        "status": p.status,
        "balance_after": p.balance_after,
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _serialize_default(d: LoanDefault) -> dict:
    return {
        "id": d.id,
        "cfd_id": d.cfd_id,
        "land_trust_id": d.land_trust_id,
        "default_date": d.default_date.isoformat() if d.default_date else None,
        "missed_payment_amount": d.missed_payment_amount,
        "total_amount_due": d.total_amount_due,
        "notice_1_type": d.notice_1_type,
        "notice_1_sent_date": d.notice_1_sent_date.isoformat() if d.notice_1_sent_date else None,
        "notice_1_cure_deadline": d.notice_1_cure_deadline.isoformat() if d.notice_1_cure_deadline else None,
        "notice_2_type": d.notice_2_type,
        "notice_2_sent_date": d.notice_2_sent_date.isoformat() if d.notice_2_sent_date else None,
        "notice_2_cure_deadline": d.notice_2_cure_deadline.isoformat() if d.notice_2_cure_deadline else None,
        "status": d.status,
        "cured_date": d.cured_date.isoformat() if d.cured_date else None,
        "cured_amount": d.cured_amount,
        "eviction_filed_date": d.eviction_filed_date.isoformat() if d.eviction_filed_date else None,
        "eviction_status": d.eviction_status,
        "notes": d.notes,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _serialize_investor(inv: Investor) -> dict:
    return {
        "id": inv.id,
        "admin_user_id": inv.admin_user_id,
        "name": inv.name,
        "email": inv.email,
        "phone": inv.phone,
        "entity_name": inv.entity_name,
        "distribution_percentage": inv.distribution_percentage,
        "payment_method": inv.payment_method,
        "bank_name": inv.bank_name,
        "routing_number": _mask_number(inv.routing_number),
        "account_number_bank": _mask_number(inv.account_number_bank),
        "is_active": inv.is_active,
        "notes": inv.notes,
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "updated_at": inv.updated_at.isoformat() if inv.updated_at else None,
    }


# ---------------------------------------------------------------------------
# PAYMENT ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/payments")
async def list_payments(
    cfd_id: Optional[str] = Query(None),
    land_trust_id: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return filtered payment history."""
    stmt = select(LoanPayment)

    if not user.is_superadmin:
        stmt = stmt.where(LoanPayment.user_id == user.id)

    if cfd_id:
        stmt = stmt.where(LoanPayment.cfd_id == cfd_id)
    if land_trust_id:
        stmt = stmt.where(LoanPayment.land_trust_id == land_trust_id)
    if start_date:
        stmt = stmt.where(LoanPayment.payment_date >= start_date)
    if end_date:
        stmt = stmt.where(LoanPayment.payment_date <= end_date)
    if status_filter:
        stmt = stmt.where(LoanPayment.status == status_filter)

    stmt = stmt.order_by(LoanPayment.payment_date.desc())
    result = await db.execute(stmt)
    payments = result.scalars().all()

    return [_serialize_payment(p) for p in payments]


@router.post("/payments/record")
async def record_payment(
    body: RecordPaymentBody,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Record a manual loan payment."""
    # Get CFD and verify ownership
    cfd_result = await db.execute(
        select(ContractForDeed).where(ContractForDeed.id == body.cfd_id)
    )
    cfd = cfd_result.scalar_one_or_none()
    if not cfd:
        raise HTTPException(status_code=404, detail="Contract for deed not found")
    if not user.is_superadmin and cfd.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Get land trust
    lt_result = await db.execute(
        select(LandTrust).where(LandTrust.id == cfd.land_trust_id)
    )
    land_trust = lt_result.scalar_one_or_none()

    # Get due_date from amortization schedule for current month
    schedule = calculate_amortization(
        loan_amount=cfd.loan_amount,
        annual_interest_rate=cfd.interest_rate,
        term_months=cfd.term_months,
        start_date=cfd.start_date,
    )

    # Find the due date for the payment month
    payment_month_key = body.payment_date.strftime("%Y-%m")
    due_date = body.payment_date  # fallback
    for entry in schedule:
        entry_date = datetime.fromisoformat(entry["due_date"])
        if entry_date.strftime("%Y-%m") == payment_month_key:
            due_date = entry_date
            break

    # Calculate late fee and days late
    days_late = max(0, (body.payment_date - due_date).days)
    is_late = days_late > cfd.late_fee_days
    late_fee = calculate_late_fee(cfd, body.payment_date, due_date)

    # Calculate P&I split
    split = calculate_payment_split(
        payment_amount=body.amount,
        current_balance=cfd.current_balance,
        annual_interest_rate=cfd.interest_rate,
        monthly_payment=cfd.monthly_payment,
    )

    principal_portion = split["principal"]
    interest_portion = split["interest"]

    # Create LoanPayment record
    balance_after = cfd.current_balance - principal_portion
    payment = LoanPayment(
        cfd_id=cfd.id,
        land_trust_id=cfd.land_trust_id,
        user_id=cfd.user_id,
        amount=body.amount,
        principal_portion=principal_portion,
        interest_portion=interest_portion,
        late_fee_portion=late_fee,
        payment_date=body.payment_date,
        due_date=due_date,
        is_late=is_late,
        days_late=days_late,
        payment_method=body.payment_method,
        reference_number=body.reference_number,
        status="completed",
        balance_after=max(balance_after, 0),
        notes=body.notes,
    )
    db.add(payment)

    # Update CFD balances
    cfd.current_balance = max(balance_after, 0)
    cfd.total_paid += body.amount
    cfd.total_interest_paid += interest_portion

    # Handle default curing
    if cfd.status == "default":
        default_result = await db.execute(
            select(LoanDefault).where(
                LoanDefault.cfd_id == cfd.id,
                LoanDefault.status == "active",
            )
        )
        active_default = default_result.scalar_one_or_none()
        if active_default and body.amount >= active_default.total_amount_due:
            active_default.status = "cured"
            active_default.cured_date = datetime.utcnow()
            active_default.cured_amount = body.amount
            cfd.status = "active"

    await db.commit()
    await db.refresh(payment)

    return {
        "payment": _serialize_payment(payment),
        "balance_after": payment.balance_after,
        "is_late": is_late,
        "late_fee": late_fee,
        "principal": principal_portion,
        "interest": interest_portion,
    }


@router.post("/payments/stripe/create-intent")
async def create_stripe_intent(
    body: StripeCreateIntentBody,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe payment intent for a CFD payment."""
    settings = get_settings()

    cfd_result = await db.execute(
        select(ContractForDeed).where(ContractForDeed.id == body.cfd_id)
    )
    cfd = cfd_result.scalar_one_or_none()
    if not cfd:
        raise HTTPException(status_code=404, detail="Contract for deed not found")
    if not user.is_superadmin and cfd.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if not cfd.stripe_customer_id:
        raise HTTPException(
            status_code=400,
            detail="No Stripe customer ID on this contract. Set up Stripe first.",
        )

    amount_cents = int(body.amount * 100)
    result = await create_payment_intent(
        amount_cents=amount_cents,
        customer_id=cfd.stripe_customer_id,
        connect_account_id=settings.stripe_connect_account_id,
        stripe_connect_secret_key=settings.stripe_connect_secret_key,
        cfd_account_number=cfd.account_number,
        description=f"Loan payment for {cfd.account_number}",
    )

    return {
        "client_secret": result["client_secret"],
        "payment_intent_id": result["payment_intent_id"],
    }


@router.post("/payments/stripe/confirm")
async def confirm_stripe_payment(
    body: StripeConfirmBody,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Confirm a Stripe payment and record it if succeeded."""
    settings = get_settings()

    cfd_result = await db.execute(
        select(ContractForDeed).where(ContractForDeed.id == body.cfd_id)
    )
    cfd = cfd_result.scalar_one_or_none()
    if not cfd:
        raise HTTPException(status_code=404, detail="Contract for deed not found")
    if not user.is_superadmin and cfd.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await stripe_confirm_payment(
        payment_intent_id=body.payment_intent_id,
        connect_account_id=settings.stripe_connect_account_id,
        stripe_connect_secret_key=settings.stripe_connect_secret_key,
    )

    if result["status"] != "succeeded":
        return {"payment": None, "status": result["status"]}

    # Record payment automatically (same logic as record_payment)
    amount = result["amount"] / 100  # cents to dollars
    now = datetime.utcnow()

    # Get due_date from amortization schedule
    schedule = calculate_amortization(
        loan_amount=cfd.loan_amount,
        annual_interest_rate=cfd.interest_rate,
        term_months=cfd.term_months,
        start_date=cfd.start_date,
    )

    payment_month_key = now.strftime("%Y-%m")
    due_date = now
    for entry in schedule:
        entry_date = datetime.fromisoformat(entry["due_date"])
        if entry_date.strftime("%Y-%m") == payment_month_key:
            due_date = entry_date
            break

    days_late = max(0, (now - due_date).days)
    is_late = days_late > cfd.late_fee_days
    late_fee = calculate_late_fee(cfd, now, due_date)

    split = calculate_payment_split(
        payment_amount=amount,
        current_balance=cfd.current_balance,
        annual_interest_rate=cfd.interest_rate,
        monthly_payment=cfd.monthly_payment,
    )

    principal_portion = split["principal"]
    interest_portion = split["interest"]
    balance_after = max(cfd.current_balance - principal_portion, 0)

    payment = LoanPayment(
        cfd_id=cfd.id,
        land_trust_id=cfd.land_trust_id,
        user_id=cfd.user_id,
        amount=amount,
        principal_portion=principal_portion,
        interest_portion=interest_portion,
        late_fee_portion=late_fee,
        payment_date=now,
        due_date=due_date,
        is_late=is_late,
        days_late=days_late,
        payment_method="stripe",
        stripe_payment_intent_id=body.payment_intent_id,
        stripe_charge_id=result.get("charge_id", ""),
        status="completed",
        balance_after=balance_after,
    )
    db.add(payment)

    # Update CFD balances
    cfd.current_balance = balance_after
    cfd.total_paid += amount
    cfd.total_interest_paid += interest_portion

    # Handle default curing
    if cfd.status == "default":
        default_result = await db.execute(
            select(LoanDefault).where(
                LoanDefault.cfd_id == cfd.id,
                LoanDefault.status == "active",
            )
        )
        active_default = default_result.scalar_one_or_none()
        if active_default and amount >= active_default.total_amount_due:
            active_default.status = "cured"
            active_default.cured_date = datetime.utcnow()
            active_default.cured_amount = amount
            cfd.status = "active"

    await db.commit()
    await db.refresh(payment)

    return {"payment": _serialize_payment(payment), "status": "succeeded"}


# ---------------------------------------------------------------------------
# DEFAULT ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/defaults")
async def list_defaults(
    cfd_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return defaults for user's CFDs. Superadmin sees all."""
    stmt = select(LoanDefault)

    if not user.is_superadmin:
        stmt = stmt.where(LoanDefault.user_id == user.id)

    if cfd_id:
        stmt = stmt.where(LoanDefault.cfd_id == cfd_id)
    if status_filter:
        stmt = stmt.where(LoanDefault.status == status_filter)

    stmt = stmt.order_by(LoanDefault.default_date.desc())
    result = await db.execute(stmt)
    defaults = result.scalars().all()

    return [_serialize_default(d) for d in defaults]


@router.post("/defaults")
async def create_default(
    body: CreateDefaultBody,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Create a loan default record with state-specific notice timeline."""
    # Get CFD
    cfd_result = await db.execute(
        select(ContractForDeed).where(ContractForDeed.id == body.cfd_id)
    )
    cfd = cfd_result.scalar_one_or_none()
    if not cfd:
        raise HTTPException(status_code=404, detail="Contract for deed not found")
    if not user.is_superadmin and cfd.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Get LandTrust
    lt_result = await db.execute(
        select(LandTrust).where(LandTrust.id == cfd.land_trust_id)
    )
    land_trust = lt_result.scalar_one_or_none()
    if not land_trust:
        raise HTTPException(status_code=404, detail="Land trust not found")

    # Get eviction timeline for the property state
    timeline = await get_eviction_timeline(land_trust.property_state, db)

    today = datetime.utcnow()

    notice_1_cure_deadline = today + timedelta(days=timeline["notice_1_days"])
    notice_2_cure_deadline = notice_1_cure_deadline + timedelta(days=timeline["notice_2_days"])

    total_amount_due = body.missed_payment_amount + cfd.late_fee_amount

    # Create LoanDefault
    loan_default = LoanDefault(
        cfd_id=cfd.id,
        land_trust_id=land_trust.id,
        user_id=cfd.user_id,
        default_date=today,
        missed_payment_amount=body.missed_payment_amount,
        total_amount_due=total_amount_due,
        notice_1_type=timeline["notice_1_type"],
        notice_1_cure_deadline=notice_1_cure_deadline,
        notice_2_type=timeline["notice_2_type"],
        notice_2_cure_deadline=notice_2_cure_deadline,
        status="active",
    )
    db.add(loan_default)

    # Update CFD status
    cfd.status = "default"

    address = land_trust.property_address

    # Create Task records directly
    task_1 = Task(
        user_id=cfd.user_id,
        title=f"Send {timeline['notice_1_type']} for {address}",
        due_date=today,
        task_type="manual",
        priority="urgent",
        deal_id=None,
        contact_id=None,
    )
    task_2 = Task(
        user_id=cfd.user_id,
        title=f"Cure deadline: {address}",
        due_date=notice_1_cure_deadline,
        task_type="manual",
        priority="high",
        deal_id=None,
        contact_id=None,
    )
    task_3 = Task(
        user_id=cfd.user_id,
        title=f"Send {timeline['notice_2_type']} for {address}",
        due_date=notice_1_cure_deadline + timedelta(days=1),
        task_type="manual",
        priority="high",
        deal_id=None,
        contact_id=None,
    )
    db.add_all([task_1, task_2, task_3])

    await db.commit()
    await db.refresh(loan_default)

    return {
        "default": _serialize_default(loan_default),
        "notice_timeline": {
            "notice_1_type": timeline["notice_1_type"],
            "notice_1_cure_deadline": notice_1_cure_deadline.isoformat(),
            "notice_2_type": timeline["notice_2_type"],
            "notice_2_cure_deadline": notice_2_cure_deadline.isoformat(),
            "state_law_summary": timeline.get("filing_requirements", ""),
        },
    }


@router.patch("/defaults/{default_id}")
async def update_default(
    default_id: str,
    body: UpdateDefaultBody,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Update a loan default record."""
    result = await db.execute(
        select(LoanDefault).where(LoanDefault.id == default_id)
    )
    loan_default = result.scalar_one_or_none()
    if not loan_default:
        raise HTTPException(status_code=404, detail="Default not found")
    if not user.is_superadmin and loan_default.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    updates = body.model_dump(exclude_unset=True)

    for field, value in updates.items():
        setattr(loan_default, field, value)

    # Handle status transitions
    if updates.get("status") == "cured":
        # Update CFD status back to active
        cfd_result = await db.execute(
            select(ContractForDeed).where(ContractForDeed.id == loan_default.cfd_id)
        )
        cfd = cfd_result.scalar_one_or_none()
        if cfd:
            cfd.status = "active"
        if not loan_default.cured_date:
            loan_default.cured_date = datetime.utcnow()

    if updates.get("status") == "eviction":
        # Get land trust for address
        lt_result = await db.execute(
            select(LandTrust).where(LandTrust.id == loan_default.land_trust_id)
        )
        land_trust = lt_result.scalar_one_or_none()
        address = land_trust.property_address if land_trust else "Unknown"

        eviction_task = Task(
            user_id=loan_default.user_id,
            title=f"File eviction for {address}",
            due_date=datetime.utcnow(),
            priority="urgent",
            task_type="manual",
            deal_id=None,
            contact_id=None,
        )
        db.add(eviction_task)

    await db.commit()
    await db.refresh(loan_default)

    return _serialize_default(loan_default)


# ---------------------------------------------------------------------------
# INVESTOR ENDPOINTS (superadmin only)
# ---------------------------------------------------------------------------


@router.get("/investors")
async def list_investors(
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return all investors. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    result = await db.execute(
        select(Investor).order_by(Investor.name)
    )
    investors = result.scalars().all()

    return [_serialize_investor(inv) for inv in investors]


@router.post("/investors", status_code=status.HTTP_201_CREATED)
async def create_investor(
    body: InvestorCreateBody,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Create a new investor. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    settings = get_settings()

    # Encrypt bank numbers
    encrypted_routing = None
    if body.routing_number:
        encrypted_routing = encrypt_api_key(body.routing_number, settings.ai_encryption_key)
    encrypted_account = None
    if body.account_number_bank:
        encrypted_account = encrypt_api_key(body.account_number_bank, settings.ai_encryption_key)

    investor = Investor(
        admin_user_id=user.id,
        name=body.name,
        email=body.email,
        phone=body.phone,
        entity_name=body.entity_name,
        distribution_percentage=body.distribution_percentage,
        payment_method=body.payment_method,
        bank_name=body.bank_name,
        routing_number=encrypted_routing,
        account_number_bank=encrypted_account,
        notes=body.notes,
    )
    db.add(investor)
    await db.commit()
    await db.refresh(investor)

    return _serialize_investor(investor)


@router.patch("/investors/{investor_id}")
async def update_investor(
    investor_id: str,
    body: InvestorUpdateBody,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Update an investor. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    settings = get_settings()

    result = await db.execute(
        select(Investor).where(Investor.id == investor_id)
    )
    investor = result.scalar_one_or_none()
    if not investor:
        raise HTTPException(status_code=404, detail="Investor not found")

    updates = body.model_dump(exclude_unset=True)

    # Re-encrypt bank numbers if provided
    if "routing_number" in updates and updates["routing_number"]:
        updates["routing_number"] = encrypt_api_key(
            updates["routing_number"], settings.ai_encryption_key
        )
    if "account_number_bank" in updates and updates["account_number_bank"]:
        updates["account_number_bank"] = encrypt_api_key(
            updates["account_number_bank"], settings.ai_encryption_key
        )

    for field, value in updates.items():
        setattr(investor, field, value)

    investor.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(investor)

    return _serialize_investor(investor)


@router.delete("/investors/{investor_id}")
async def delete_investor(
    investor_id: str,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete an investor. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    result = await db.execute(
        select(Investor).where(Investor.id == investor_id)
    )
    investor = result.scalar_one_or_none()
    if not investor:
        raise HTTPException(status_code=404, detail="Investor not found")

    investor.is_active = False
    investor.updated_at = datetime.utcnow()
    await db.commit()

    return {"success": True}


# ---------------------------------------------------------------------------
# DISTRIBUTION ENDPOINTS (superadmin only)
# ---------------------------------------------------------------------------


@router.get("/distributions")
async def list_distributions(
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return all distribution statements. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    result = await db.execute(
        select(DistributionStatement).order_by(DistributionStatement.period_start.desc())
    )
    statements = result.scalars().all()

    return [
        {
            "id": s.id,
            "period_type": s.period_type,
            "period_start": s.period_start.isoformat() if s.period_start else None,
            "period_end": s.period_end.isoformat() if s.period_end else None,
            "quarter": s.quarter,
            "total_collected": s.total_collected,
            "total_late_fees": s.total_late_fees,
            "total_investor_distributions": s.total_investor_distributions,
            "total_entity_distribution": s.total_entity_distribution,
            "status": s.status,
            "distributed_at": s.distributed_at.isoformat() if s.distributed_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in statements
    ]


@router.post("/distributions/generate")
async def generate_distribution(
    body: GenerateDistributionBody,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Generate a quarterly distribution statement. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    # Query all completed payments in the period
    payments_result = await db.execute(
        select(LoanPayment).where(
            LoanPayment.payment_date >= body.period_start,
            LoanPayment.payment_date <= body.period_end,
            LoanPayment.status == "completed",
        )
    )
    payments = payments_result.scalars().all()

    # Get all active investors
    investors_result = await db.execute(
        select(Investor).where(Investor.is_active.is_(True))
    )
    investors = investors_result.scalars().all()

    # Calculate distributions
    dist_data = calculate_quarterly_distributions(payments, investors)

    # Build property breakdown
    property_breakdown = []
    trust_ids = set(p.land_trust_id for p in payments)
    total_investor_pct = sum(
        inv.distribution_percentage for inv in investors if inv.is_active
    )

    for trust_id in trust_ids:
        lt_result = await db.execute(
            select(LandTrust).where(LandTrust.id == trust_id)
        )
        land_trust = lt_result.scalar_one_or_none()

        trust_payments = [p for p in payments if p.land_trust_id == trust_id]
        trust_collected = sum(p.amount for p in trust_payments)
        trust_late_fees = sum(p.late_fee_portion for p in trust_payments)
        investor_amt = trust_collected * (total_investor_pct / 100)
        entity_amt = trust_collected - investor_amt

        property_breakdown.append({
            "land_trust_id": trust_id,
            "address": land_trust.property_address if land_trust else "Unknown",
            "collected": round(trust_collected, 2),
            "late_fees": round(trust_late_fees, 2),
            "investor_amount": round(investor_amt, 2),
            "entity_amount": round(entity_amt, 2),
        })

    # Create DistributionStatement
    statement = DistributionStatement(
        admin_user_id=user.id,
        period_type="quarterly",
        period_start=body.period_start,
        period_end=body.period_end,
        quarter=body.quarter,
        total_collected=dist_data["total_collected"],
        total_late_fees=dist_data["total_late_fees"],
        total_investor_distributions=dist_data["investor_total"],
        total_entity_distribution=dist_data["entity_amount"],
        property_breakdown=json.dumps(property_breakdown),
        investor_breakdown=json.dumps(dist_data["investor_breakdown"]),
        status="draft",
    )
    db.add(statement)
    await db.commit()
    await db.refresh(statement)

    return {
        "statement": {
            "id": statement.id,
            "period_type": statement.period_type,
            "period_start": statement.period_start.isoformat(),
            "period_end": statement.period_end.isoformat(),
            "quarter": statement.quarter,
            "total_collected": statement.total_collected,
            "total_late_fees": statement.total_late_fees,
            "total_investor_distributions": statement.total_investor_distributions,
            "total_entity_distribution": statement.total_entity_distribution,
            "status": statement.status,
            "created_at": statement.created_at.isoformat(),
        },
        "breakdown": {
            "property_breakdown": property_breakdown,
            "investor_breakdown": dist_data["investor_breakdown"],
        },
    }


@router.post("/distributions/{distribution_id}/finalize")
async def finalize_distribution(
    distribution_id: str,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Finalize a distribution statement. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    result = await db.execute(
        select(DistributionStatement).where(DistributionStatement.id == distribution_id)
    )
    statement = result.scalar_one_or_none()
    if not statement:
        raise HTTPException(status_code=404, detail="Distribution statement not found")

    statement.status = "finalized"
    statement.distributed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(statement)

    return {
        "id": statement.id,
        "status": statement.status,
        "distributed_at": statement.distributed_at.isoformat(),
    }


@router.get("/distributions/{distribution_id}/pdf")
async def get_distribution_pdf_data(
    distribution_id: str,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return full distribution data for frontend PDF generation. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    result = await db.execute(
        select(DistributionStatement).where(DistributionStatement.id == distribution_id)
    )
    statement = result.scalar_one_or_none()
    if not statement:
        raise HTTPException(status_code=404, detail="Distribution statement not found")

    # Parse stored JSON breakdowns
    property_breakdown = []
    if statement.property_breakdown:
        try:
            property_breakdown = json.loads(statement.property_breakdown)
        except json.JSONDecodeError:
            pass

    investor_breakdown = []
    if statement.investor_breakdown:
        try:
            investor_breakdown = json.loads(statement.investor_breakdown)
        except json.JSONDecodeError:
            pass

    return {
        "statement": {
            "id": statement.id,
            "period_type": statement.period_type,
            "period_start": statement.period_start.isoformat() if statement.period_start else None,
            "period_end": statement.period_end.isoformat() if statement.period_end else None,
            "quarter": statement.quarter,
            "total_collected": statement.total_collected,
            "total_late_fees": statement.total_late_fees,
            "total_investor_distributions": statement.total_investor_distributions,
            "total_entity_distribution": statement.total_entity_distribution,
            "status": statement.status,
            "distributed_at": statement.distributed_at.isoformat() if statement.distributed_at else None,
            "created_at": statement.created_at.isoformat() if statement.created_at else None,
        },
        "property_breakdown": property_breakdown,
        "investor_breakdown": investor_breakdown,
    }


# ---------------------------------------------------------------------------
# ADMIN ENDPOINTS (superadmin only)
# ---------------------------------------------------------------------------


@router.get("/admin/all-properties")
async def admin_list_all_properties(
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return ALL land trusts across all users. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    result = await db.execute(
        select(LandTrust).order_by(LandTrust.created_at.desc())
    )
    trusts = result.scalars().all()

    items = []
    for t in trusts:
        # Get user email
        user_result = await db.execute(
            select(User).where(User.id == t.user_id)
        )
        owner = user_result.scalar_one_or_none()

        # Active CFD summary
        cfd_result = await db.execute(
            select(ContractForDeed).where(
                ContractForDeed.land_trust_id == t.id,
                ContractForDeed.is_active.is_(True),
            )
        )
        active_cfds = cfd_result.scalars().all()

        items.append({
            "id": t.id,
            "user_id": t.user_id,
            "user_email": owner.email if owner else None,
            "name": t.name,
            "property_address": t.property_address,
            "property_city": t.property_city,
            "property_state": t.property_state,
            "property_zip": t.property_zip,
            "status": t.status,
            "loan_servicing_enabled": t.loan_servicing_enabled,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "active_cfds": [
                {
                    "id": c.id,
                    "account_number": c.account_number,
                    "buyer_name": c.buyer_name,
                    "current_balance": c.current_balance,
                    "monthly_payment": c.monthly_payment,
                    "status": c.status,
                }
                for c in active_cfds
            ],
        })

    return items


@router.get("/admin/all-cfds")
async def admin_list_all_cfds(
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return ALL active CFDs. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    result = await db.execute(
        select(ContractForDeed)
        .where(ContractForDeed.is_active.is_(True))
        .order_by(ContractForDeed.created_at.desc())
    )
    cfds = result.scalars().all()

    items = []
    for c in cfds:
        lt_result = await db.execute(
            select(LandTrust).where(LandTrust.id == c.land_trust_id)
        )
        land_trust = lt_result.scalar_one_or_none()

        user_result = await db.execute(
            select(User).where(User.id == c.user_id)
        )
        owner = user_result.scalar_one_or_none()

        item = {
            "id": c.id,
            "account_number": c.account_number,
            "buyer_name": c.buyer_name,
            "current_balance": c.current_balance,
            "monthly_payment": c.monthly_payment,
            "interest_rate": c.interest_rate,
            "status": c.status,
            "user_id": c.user_id,
            "user_email": owner.email if owner else None,
            "land_trust": {
                "id": land_trust.id,
                "name": land_trust.name,
                "property_address": land_trust.property_address,
                "property_state": land_trust.property_state,
            } if land_trust else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        items.append(item)

    return items


@router.get("/admin/state-laws/{state}")
async def admin_get_state_laws(
    state: str,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return full StateLawResearch for a state. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    result = await db.execute(
        select(StateLawResearch).where(StateLawResearch.state == state.upper())
    )
    research = result.scalar_one_or_none()
    if not research:
        raise HTTPException(status_code=404, detail=f"No research found for state {state}")

    return {
        "id": research.id,
        "state": research.state,
        "contract_for_deed": research.contract_for_deed,
        "owner_finance": research.owner_finance,
        "subject_to": research.subject_to,
        "rent_to_own": research.rent_to_own,
        "eviction_timeline": research.eviction_timeline,
        "foreclosure_process": research.foreclosure_process,
        "payment_collection": research.payment_collection,
        "citations": research.citations,
        "researched_at": research.researched_at.isoformat() if research.researched_at else None,
        "researched_by_provider": research.researched_by_provider,
        "last_updated": research.last_updated.isoformat() if research.last_updated else None,
        "is_verified": research.is_verified,
    }


@router.patch("/admin/state-laws/{state}")
async def admin_refresh_state_laws(
    state: str,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Trigger fresh state law research in background. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    settings = get_settings()

    # Force fresh research by clearing existing record's researched_at
    result = await db.execute(
        select(StateLawResearch).where(StateLawResearch.state == state.upper())
    )
    existing = result.scalar_one_or_none()
    if existing:
        # Set researched_at far back to force refresh
        existing.researched_at = datetime(2000, 1, 1)
        await db.commit()

    # Run research in background via async task
    async def _bg_refresh():
        async with async_session_factory() as bg_db:
            try:
                await research_state_laws(state.upper(), user.id, bg_db, settings)
            except Exception:
                logger.exception("Background state law refresh failed for %s", state)

    import asyncio
    asyncio.create_task(_bg_refresh())

    return {"message": f"Research triggered for {state}"}


@router.post("/admin/enable/{user_id}")
async def admin_enable_loan_servicing(
    user_id: int,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Enable loan servicing for a user. Superadmin only."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")

    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    target_user.loan_servicing_enabled = True
    await db.commit()

    return {"success": True, "message": f"Loan servicing enabled for user {user_id}"}


# ---------------------------------------------------------------------------
# STRIPE CONNECT ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/stripe-connect/status")
async def stripe_connect_status(
    user: User = Depends(get_current_user_with_loans),
):
    """Check Stripe Connect account status."""
    settings = get_settings()

    result = await get_connect_account_status(
        connect_account_id=settings.stripe_connect_account_id,
        stripe_secret_key=settings.stripe_connect_secret_key,
    )

    return result


@router.get("/stripe-connect/onboard")
async def stripe_connect_onboard(
    user: User = Depends(get_current_user_with_loans),
):
    """Get Stripe Connect onboarding URL."""
    settings = get_settings()
    base_url = settings.hub_url

    result = await create_connect_account_link(
        connect_account_id=settings.stripe_connect_account_id,
        stripe_secret_key=settings.stripe_connect_secret_key,
        refresh_url=f"{base_url}/loan-servicing",
        return_url=f"{base_url}/loan-servicing?stripe_connected=true",
    )

    return {"onboard_url": result["url"]}


@router.post("/stripe-connect/callback")
async def stripe_connect_callback(
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Mark user's Stripe Connect as enabled."""
    user.stripe_connect_enabled = True
    await db.commit()

    return {"connected": True}
