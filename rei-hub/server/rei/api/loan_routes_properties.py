"""Loan servicing API — Property (LandTrust) and Contract-for-Deed endpoints."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings, Settings
from rei.database import async_session_factory
from rei.models.user import (
    ContractForDeed,
    LandTrust,
    LoanDefault,
    LoanPayment,
    StateLawResearch,
    User,
)
from rei.services.loan_servicing import calculate_amortization, generate_account_number
from rei.services.state_law_service import research_state_laws
from rei.services.stripe_connect import create_connect_customer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/loans", tags=["loans"])

# ---------------------------------------------------------------------------
# Try to import GDrive storage service; fall back to path-only mode
# ---------------------------------------------------------------------------
try:
    from rei.services.storage_service import _gd_find_or_create_folder  # noqa: F401

    _GDRIVE_AVAILABLE = True
except ImportError:
    _GDRIVE_AVAILABLE = False


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class PropertyCreate(BaseModel):
    name: str
    trust_number: Optional[str] = None
    trustee: Optional[str] = None
    beneficiary: Optional[str] = None
    state: str
    property_address: str
    property_city: str
    property_state: str
    property_zip: str


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    trust_number: Optional[str] = None
    trustee: Optional[str] = None
    beneficiary: Optional[str] = None
    state: Optional[str] = None
    property_address: Optional[str] = None
    property_city: Optional[str] = None
    property_state: Optional[str] = None
    property_zip: Optional[str] = None
    status: Optional[str] = None
    admin_notes: Optional[str] = None
    loan_servicing_enabled: Optional[bool] = None
    bank_negotiation_enabled: Optional[bool] = None


class CFDCreate(BaseModel):
    land_trust_id: str
    buyer_name: str
    buyer_email: Optional[str] = None
    buyer_phone: Optional[str] = None
    buyer_mailing_address: Optional[str] = None
    purchase_price: float
    down_payment: float = 0.0
    loan_amount: float
    interest_rate: float
    term_months: int
    monthly_payment: float
    start_date: datetime
    first_payment_date: datetime
    has_balloon: bool = False
    balloon_month: Optional[int] = None
    balloon_amount: Optional[float] = None
    has_underlying_mortgage: bool = False
    mortgage_servicer: Optional[str] = None
    mortgage_balance: Optional[float] = None
    mortgage_monthly_payment: Optional[float] = None
    mortgage_account_number: Optional[str] = None
    late_fee_amount: float = 50.0
    late_fee_days: int = 15
    payment_method: str = "stripe"
    notes: Optional[str] = None


class CFDUpdate(BaseModel):
    buyer_name: Optional[str] = None
    buyer_email: Optional[str] = None
    buyer_phone: Optional[str] = None
    buyer_mailing_address: Optional[str] = None
    monthly_payment: Optional[float] = None
    late_fee_amount: Optional[float] = None
    late_fee_days: Optional[int] = None
    payment_method: Optional[str] = None
    has_underlying_mortgage: Optional[bool] = None
    mortgage_servicer: Optional[str] = None
    mortgage_balance: Optional[float] = None
    mortgage_monthly_payment: Optional[float] = None
    mortgage_account_number: Optional[str] = None
    status: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth dependency — loan servicing gatekeeper
# ---------------------------------------------------------------------------


async def get_current_user_with_loans(
    user: User = Depends(get_current_user),
) -> User:
    """Require loan_servicing_enabled or is_superadmin."""
    if user.is_superadmin or user.loan_servicing_enabled:
        return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Loan servicing is not enabled for your account.",
    )


# ---------------------------------------------------------------------------
# Background task helpers
# ---------------------------------------------------------------------------

_STATUS_TO_GDRIVE_FOLDER = {
    "current": "2 - Current Clients",
    "paid_off": "3 - Paid Off",
    "foreclosed": "4 - Foreclosed",
    "dead": "5 - Dead",
    "potential": "1 - Potential Clients",
}


async def _bg_research_state_laws(state: str, user_id: int) -> None:
    """Run state law research in a background task with its own DB session."""
    settings = get_settings()
    async with async_session_factory() as db:
        try:
            await research_state_laws(state, user_id, db, settings)
        except Exception:
            logger.exception(
                "Background state law research failed for state=%s", state
            )


# ---------------------------------------------------------------------------
# PROPERTY ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/properties")
async def list_properties(
    user_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """List land trusts. Superadmins see all; regular users see their own."""
    stmt = select(LandTrust)

    if user.is_superadmin:
        if user_id is not None:
            stmt = stmt.where(LandTrust.user_id == user_id)
    else:
        stmt = stmt.where(LandTrust.user_id == user.id)

    if status_filter:
        stmt = stmt.where(LandTrust.status == status_filter)

    stmt = stmt.order_by(LandTrust.created_at.desc())
    result = await db.execute(stmt)
    trusts = result.scalars().all()

    # Build response with active CFD summary per property
    items = []
    for t in trusts:
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
            "name": t.name,
            "trust_number": t.trust_number,
            "trustee": t.trustee,
            "beneficiary": t.beneficiary,
            "state": t.state,
            "property_address": t.property_address,
            "property_city": t.property_city,
            "property_state": t.property_state,
            "property_zip": t.property_zip,
            "status": t.status,
            "gdrive_folder_id": t.gdrive_folder_id,
            "loan_servicing_enabled": t.loan_servicing_enabled,
            "bank_negotiation_enabled": t.bank_negotiation_enabled,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
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


@router.post("/properties", status_code=status.HTTP_201_CREATED)
async def create_property(
    body: PropertyCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Create a new land trust / property."""
    land_trust = LandTrust(
        user_id=user.id,
        name=body.name,
        trust_number=body.trust_number,
        trustee=body.trustee,
        beneficiary=body.beneficiary,
        state=body.state,
        property_address=body.property_address,
        property_city=body.property_city,
        property_state=body.property_state,
        property_zip=body.property_zip,
        status="current",
    )

    # Build GDrive folder path (store path; actual creation deferred to gdrive service)
    folder_base = (
        f"ABF Clients/2 - Current Clients/{body.property_address}"
    )
    subfolders = [
        f"{folder_base}/Documents/Certified Mail",
        f"{folder_base}/Documents/Bank Correspondence",
        f"{folder_base}/Documents/Contracts",
        f"{folder_base}/Documents/Statements",
        f"{folder_base}/Loan Servicing",
    ]
    land_trust.gdrive_folder_id = folder_base
    logger.info(
        "GDrive folder structure planned for property %s: %s",
        body.property_address,
        subfolders,
    )

    db.add(land_trust)
    await db.commit()
    await db.refresh(land_trust)

    # Trigger background state law research
    background_tasks.add_task(_bg_research_state_laws, body.state, user.id)

    return {
        "land_trust": {
            "id": land_trust.id,
            "user_id": land_trust.user_id,
            "name": land_trust.name,
            "trust_number": land_trust.trust_number,
            "trustee": land_trust.trustee,
            "beneficiary": land_trust.beneficiary,
            "state": land_trust.state,
            "property_address": land_trust.property_address,
            "property_city": land_trust.property_city,
            "property_state": land_trust.property_state,
            "property_zip": land_trust.property_zip,
            "status": land_trust.status,
            "gdrive_folder_id": land_trust.gdrive_folder_id,
            "created_at": land_trust.created_at.isoformat() if land_trust.created_at else None,
        },
        "message": "Property created. State law research is running in the background.",
    }


@router.get("/properties/{trust_id}")
async def get_property(
    trust_id: str,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Get full property detail with active CFD, recent payments, and defaults."""
    result = await db.execute(
        select(LandTrust).where(LandTrust.id == trust_id)
    )
    land_trust = result.scalar_one_or_none()
    if not land_trust:
        raise HTTPException(status_code=404, detail="Property not found")

    # Ownership check
    if not user.is_superadmin and land_trust.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Active CFD
    cfd_result = await db.execute(
        select(ContractForDeed).where(
            ContractForDeed.land_trust_id == trust_id,
            ContractForDeed.is_active.is_(True),
        )
    )
    active_cfd = cfd_result.scalar_one_or_none()

    # Last 10 payments
    payments_result = await db.execute(
        select(LoanPayment)
        .where(LoanPayment.land_trust_id == trust_id)
        .order_by(LoanPayment.payment_date.desc())
        .limit(10)
    )
    recent_payments = payments_result.scalars().all()

    # Active default
    default_result = await db.execute(
        select(LoanDefault).where(
            LoanDefault.land_trust_id == trust_id,
            LoanDefault.status == "active",
        )
    )
    active_default = default_result.scalar_one_or_none()

    # State law research
    law_result = await db.execute(
        select(StateLawResearch).where(
            StateLawResearch.state == land_trust.property_state.upper()
        )
    )
    state_law = law_result.scalar_one_or_none()

    state_law_data = None
    if state_law:
        if user.is_superadmin:
            state_law_data = {
                "id": state_law.id,
                "state": state_law.state,
                "contract_for_deed": state_law.contract_for_deed,
                "owner_finance": state_law.owner_finance,
                "subject_to": state_law.subject_to,
                "rent_to_own": state_law.rent_to_own,
                "eviction_timeline": state_law.eviction_timeline,
                "foreclosure_process": state_law.foreclosure_process,
                "payment_collection": state_law.payment_collection,
                "citations": state_law.citations,
                "researched_at": state_law.researched_at.isoformat() if state_law.researched_at else None,
                "researched_by_provider": state_law.researched_by_provider,
                "is_verified": state_law.is_verified,
            }
        else:
            # Summary only for regular users
            state_law_data = {
                "state": state_law.state,
                "contract_for_deed": (state_law.contract_for_deed or "")[:500],
                "owner_finance": (state_law.owner_finance or "")[:500],
                "subject_to": (state_law.subject_to or "")[:500],
                "rent_to_own": (state_law.rent_to_own or "")[:500],
                "eviction_timeline": state_law.eviction_timeline,
                "foreclosure_process": (state_law.foreclosure_process or "")[:500],
                "payment_collection": (state_law.payment_collection or "")[:500],
                "researched_at": state_law.researched_at.isoformat() if state_law.researched_at else None,
                "is_verified": state_law.is_verified,
            }

    return {
        "land_trust": _serialize_land_trust(land_trust),
        "active_cfd": _serialize_cfd(active_cfd) if active_cfd else None,
        "recent_payments": [_serialize_payment(p) for p in recent_payments],
        "active_default": _serialize_default(active_default) if active_default else None,
        "state_law_research": state_law_data,
    }


@router.patch("/properties/{trust_id}")
async def update_property(
    trust_id: str,
    body: PropertyUpdate,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Update a land trust property."""
    result = await db.execute(
        select(LandTrust).where(LandTrust.id == trust_id)
    )
    land_trust = result.scalar_one_or_none()
    if not land_trust:
        raise HTTPException(status_code=404, detail="Property not found")

    if not user.is_superadmin and land_trust.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    updates = body.model_dump(exclude_unset=True)
    old_status = land_trust.status

    for field, value in updates.items():
        setattr(land_trust, field, value)

    land_trust.updated_at = datetime.utcnow()

    # Log GDrive folder move if status changed
    new_status = updates.get("status")
    if new_status and new_status != old_status:
        old_folder = _STATUS_TO_GDRIVE_FOLDER.get(old_status, old_status)
        new_folder = _STATUS_TO_GDRIVE_FOLDER.get(new_status, new_status)
        logger.info(
            "Property %s status changed: %s → %s. GDrive folder move: "
            "'ABF Clients/%s/%s' → 'ABF Clients/%s/%s'",
            trust_id,
            old_status,
            new_status,
            old_folder,
            land_trust.property_address,
            new_folder,
            land_trust.property_address,
        )

    await db.commit()
    await db.refresh(land_trust)

    return _serialize_land_trust(land_trust)


@router.get("/properties/{trust_id}/state-laws")
async def get_property_state_laws(
    trust_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return state law research for a property's state."""
    result = await db.execute(
        select(LandTrust).where(LandTrust.id == trust_id)
    )
    land_trust = result.scalar_one_or_none()
    if not land_trust:
        raise HTTPException(status_code=404, detail="Property not found")

    if not user.is_superadmin and land_trust.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    law_result = await db.execute(
        select(StateLawResearch).where(
            StateLawResearch.state == land_trust.property_state.upper()
        )
    )
    state_law = law_result.scalar_one_or_none()

    if not state_law:
        raise HTTPException(
            status_code=404,
            detail="No state law research found for this state.",
        )

    # Trigger background refresh if older than 90 days
    if state_law.researched_at:
        days_old = (datetime.utcnow() - state_law.researched_at).days
        if days_old > 90:
            background_tasks.add_task(
                _bg_research_state_laws,
                land_trust.property_state,
                user.id,
            )

    if user.is_superadmin:
        return {
            "id": state_law.id,
            "state": state_law.state,
            "contract_for_deed": state_law.contract_for_deed,
            "owner_finance": state_law.owner_finance,
            "subject_to": state_law.subject_to,
            "rent_to_own": state_law.rent_to_own,
            "eviction_timeline": state_law.eviction_timeline,
            "foreclosure_process": state_law.foreclosure_process,
            "payment_collection": state_law.payment_collection,
            "citations": state_law.citations,
            "researched_at": state_law.researched_at.isoformat() if state_law.researched_at else None,
            "researched_by_provider": state_law.researched_by_provider,
            "is_verified": state_law.is_verified,
            "admin_notes": None,
        }

    # Regular user: summaries only (exclude raw AI output length)
    return {
        "state": state_law.state,
        "contract_for_deed": (state_law.contract_for_deed or "")[:500],
        "owner_finance": (state_law.owner_finance or "")[:500],
        "subject_to": (state_law.subject_to or "")[:500],
        "rent_to_own": (state_law.rent_to_own or "")[:500],
        "eviction_timeline": state_law.eviction_timeline,
        "foreclosure_process": (state_law.foreclosure_process or "")[:500],
        "payment_collection": (state_law.payment_collection or "")[:500],
        "researched_at": state_law.researched_at.isoformat() if state_law.researched_at else None,
        "is_verified": state_law.is_verified,
    }


# ---------------------------------------------------------------------------
# CFD ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/cfds")
async def list_cfds(
    land_trust_id: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    is_active: Optional[bool] = Query(None),
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """List contracts for deed. Superadmins see all; regular users see their own."""
    stmt = select(ContractForDeed)

    if not user.is_superadmin:
        stmt = stmt.where(ContractForDeed.user_id == user.id)

    if land_trust_id:
        stmt = stmt.where(ContractForDeed.land_trust_id == land_trust_id)
    if status_filter:
        stmt = stmt.where(ContractForDeed.status == status_filter)
    if is_active is not None:
        stmt = stmt.where(ContractForDeed.is_active.is_(is_active))

    stmt = stmt.order_by(ContractForDeed.created_at.desc())
    result = await db.execute(stmt)
    cfds = result.scalars().all()

    items = []
    for c in cfds:
        # Fetch land trust summary
        lt_result = await db.execute(
            select(LandTrust).where(LandTrust.id == c.land_trust_id)
        )
        lt = lt_result.scalar_one_or_none()

        item = _serialize_cfd(c)
        item["land_trust"] = (
            {
                "id": lt.id,
                "name": lt.name,
                "property_address": lt.property_address,
                "property_state": lt.property_state,
                "status": lt.status,
            }
            if lt
            else None
        )
        items.append(item)

    return items


@router.post("/cfds", status_code=status.HTTP_201_CREATED)
async def create_cfd(
    body: CFDCreate,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Contract for Deed."""
    settings = get_settings()

    # Verify land trust belongs to user (unless superadmin)
    lt_result = await db.execute(
        select(LandTrust).where(LandTrust.id == body.land_trust_id)
    )
    land_trust = lt_result.scalar_one_or_none()
    if not land_trust:
        raise HTTPException(status_code=404, detail="Land trust not found")
    if not user.is_superadmin and land_trust.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Deactivate existing active CFDs for this land trust
    active_result = await db.execute(
        select(ContractForDeed).where(
            ContractForDeed.land_trust_id == body.land_trust_id,
            ContractForDeed.is_active.is_(True),
        )
    )
    for existing_cfd in active_result.scalars().all():
        existing_cfd.is_active = False

    # Generate account number (sync function — run via run_sync)
    account_number = await db.run_sync(
        lambda sync_session: generate_account_number(
            land_trust.property_state, sync_session
        )
    )

    # Calculate maturity date
    maturity_date = body.start_date + relativedelta(months=body.term_months)

    cfd = ContractForDeed(
        land_trust_id=body.land_trust_id,
        user_id=user.id,
        account_number=account_number,
        buyer_name=body.buyer_name,
        buyer_email=body.buyer_email,
        buyer_phone=body.buyer_phone,
        buyer_mailing_address=body.buyer_mailing_address,
        purchase_price=body.purchase_price,
        down_payment=body.down_payment,
        loan_amount=body.loan_amount,
        interest_rate=body.interest_rate,
        term_months=body.term_months,
        monthly_payment=body.monthly_payment,
        start_date=body.start_date,
        maturity_date=maturity_date,
        first_payment_date=body.first_payment_date,
        current_balance=body.loan_amount,
        has_balloon=body.has_balloon,
        balloon_month=body.balloon_month,
        balloon_amount=body.balloon_amount,
        late_fee_amount=body.late_fee_amount,
        late_fee_days=body.late_fee_days,
        payment_method=body.payment_method,
        has_underlying_mortgage=body.has_underlying_mortgage,
        mortgage_servicer=body.mortgage_servicer,
        mortgage_balance=body.mortgage_balance,
        mortgage_monthly_payment=body.mortgage_monthly_payment,
        mortgage_account_number=body.mortgage_account_number,
        notes=body.notes,
        is_active=True,
        status="active",
    )

    # Stripe customer creation (if payment method is stripe)
    if body.payment_method == "stripe" and body.buyer_email:
        try:
            stripe_result = await create_connect_customer(
                buyer_name=body.buyer_name,
                buyer_email=body.buyer_email,
                connect_account_id=user.stripe_connect_account_id or "",
                stripe_connect_secret_key=settings.stripe_connect_secret_key,
            )
            cfd.stripe_customer_id = stripe_result["customer_id"]
        except Exception:
            logger.exception(
                "Stripe customer creation failed for CFD buyer %s",
                body.buyer_name,
            )

    db.add(cfd)
    await db.commit()
    await db.refresh(cfd)

    # Generate amortization schedule
    amortization_schedule = calculate_amortization(
        loan_amount=body.loan_amount,
        annual_interest_rate=body.interest_rate,
        term_months=body.term_months,
        start_date=body.start_date,
    )

    return {
        "cfd": _serialize_cfd(cfd),
        "account_number": account_number,
        "amortization_schedule": amortization_schedule,
    }


@router.get("/cfds/{cfd_id}")
async def get_cfd(
    cfd_id: str,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Get full CFD detail with amortization, payments, and default info."""
    result = await db.execute(
        select(ContractForDeed).where(ContractForDeed.id == cfd_id)
    )
    cfd = result.scalar_one_or_none()
    if not cfd:
        raise HTTPException(status_code=404, detail="Contract for deed not found")

    if not user.is_superadmin and cfd.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Land trust
    lt_result = await db.execute(
        select(LandTrust).where(LandTrust.id == cfd.land_trust_id)
    )
    land_trust = lt_result.scalar_one_or_none()

    # Payment history
    payments_result = await db.execute(
        select(LoanPayment)
        .where(LoanPayment.cfd_id == cfd_id)
        .order_by(LoanPayment.payment_date.asc())
    )
    payments = payments_result.scalars().all()

    # Active default
    default_result = await db.execute(
        select(LoanDefault).where(
            LoanDefault.cfd_id == cfd_id,
            LoanDefault.status == "active",
        )
    )
    active_default = default_result.scalar_one_or_none()

    # Generate amortization schedule
    amortization_schedule = calculate_amortization(
        loan_amount=cfd.loan_amount,
        annual_interest_rate=cfd.interest_rate,
        term_months=cfd.term_months,
        start_date=cfd.start_date,
    )

    # Overlay actual payments on schedule
    payment_map: dict[int, LoanPayment] = {}
    for p in payments:
        if p.status == "completed":
            # Find closest schedule entry by due_date
            for i, entry in enumerate(amortization_schedule):
                sched_due = datetime.fromisoformat(entry["due_date"])
                if abs((sched_due - p.due_date).days) <= 15:
                    payment_map[i] = p
                    break

    for i, entry in enumerate(amortization_schedule):
        if i in payment_map:
            p = payment_map[i]
            entry["paid"] = True
            entry["actual_amount"] = p.amount
            entry["paid_date"] = p.payment_date.isoformat()
            entry["on_time"] = not p.is_late
        else:
            entry["paid"] = False
            entry["actual_amount"] = None
            entry["paid_date"] = None
            entry["on_time"] = None

    # Calculate next payment due
    now = datetime.utcnow()
    next_payment_due = None
    days_until_due = None

    for entry in amortization_schedule:
        if not entry["paid"]:
            next_due = datetime.fromisoformat(entry["due_date"])
            next_payment_due = entry["due_date"]
            delta = (next_due - now).days
            days_until_due = delta  # negative means days late
            break

    return {
        "cfd": _serialize_cfd(cfd),
        "land_trust": _serialize_land_trust(land_trust) if land_trust else None,
        "payment_history": [_serialize_payment(p) for p in payments],
        "amortization_schedule": amortization_schedule,
        "active_default": _serialize_default(active_default) if active_default else None,
        "next_payment_due": next_payment_due,
        "days_until_due": days_until_due,
    }


@router.patch("/cfds/{cfd_id}")
async def update_cfd(
    cfd_id: str,
    body: CFDUpdate,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Update a contract for deed."""
    result = await db.execute(
        select(ContractForDeed).where(ContractForDeed.id == cfd_id)
    )
    cfd = result.scalar_one_or_none()
    if not cfd:
        raise HTTPException(status_code=404, detail="Contract for deed not found")

    if not user.is_superadmin and cfd.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(cfd, field, value)

    cfd.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(cfd)

    return _serialize_cfd(cfd)


@router.get("/cfds/{cfd_id}/amortization")
async def get_cfd_amortization(
    cfd_id: str,
    user: User = Depends(get_current_user_with_loans),
    db: AsyncSession = Depends(get_db),
):
    """Return full amortization schedule with payments overlay."""
    result = await db.execute(
        select(ContractForDeed).where(ContractForDeed.id == cfd_id)
    )
    cfd = result.scalar_one_or_none()
    if not cfd:
        raise HTTPException(status_code=404, detail="Contract for deed not found")

    if not user.is_superadmin and cfd.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Generate amortization schedule
    schedule = calculate_amortization(
        loan_amount=cfd.loan_amount,
        annual_interest_rate=cfd.interest_rate,
        term_months=cfd.term_months,
        start_date=cfd.start_date,
    )

    # Fetch all completed payments
    payments_result = await db.execute(
        select(LoanPayment)
        .where(
            LoanPayment.cfd_id == cfd_id,
            LoanPayment.status == "completed",
        )
        .order_by(LoanPayment.due_date.asc())
    )
    payments = payments_result.scalars().all()

    # Build lookup: due_date → payment
    payment_by_due: dict[str, LoanPayment] = {}
    for p in payments:
        key = p.due_date.strftime("%Y-%m")
        payment_by_due[key] = p

    # Overlay
    for entry in schedule:
        sched_key = datetime.fromisoformat(entry["due_date"]).strftime("%Y-%m")
        entry["scheduled_amount"] = entry["payment_amount"]

        if sched_key in payment_by_due:
            p = payment_by_due[sched_key]
            entry["actual_amount"] = p.amount
            entry["paid"] = True
            entry["paid_date"] = p.payment_date.isoformat()
            entry["on_time"] = not p.is_late
        else:
            entry["actual_amount"] = None
            entry["paid"] = False
            entry["paid_date"] = None
            entry["on_time"] = None

    return schedule


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _serialize_land_trust(t: LandTrust) -> dict:
    return {
        "id": t.id,
        "user_id": t.user_id,
        "name": t.name,
        "trust_number": t.trust_number,
        "trustee": t.trustee,
        "beneficiary": t.beneficiary,
        "state": t.state,
        "property_address": t.property_address,
        "property_city": t.property_city,
        "property_state": t.property_state,
        "property_zip": t.property_zip,
        "status": t.status,
        "gdrive_folder_id": t.gdrive_folder_id,
        "loan_servicing_enabled": t.loan_servicing_enabled,
        "bank_negotiation_enabled": t.bank_negotiation_enabled,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _serialize_cfd(c: ContractForDeed) -> dict:
    return {
        "id": c.id,
        "land_trust_id": c.land_trust_id,
        "user_id": c.user_id,
        "account_number": c.account_number,
        "buyer_name": c.buyer_name,
        "buyer_email": c.buyer_email,
        "buyer_phone": c.buyer_phone,
        "buyer_mailing_address": c.buyer_mailing_address,
        "purchase_price": c.purchase_price,
        "down_payment": c.down_payment,
        "loan_amount": c.loan_amount,
        "interest_rate": c.interest_rate,
        "term_months": c.term_months,
        "monthly_payment": c.monthly_payment,
        "has_balloon": c.has_balloon,
        "balloon_month": c.balloon_month,
        "balloon_amount": c.balloon_amount,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "maturity_date": c.maturity_date.isoformat() if c.maturity_date else None,
        "first_payment_date": c.first_payment_date.isoformat() if c.first_payment_date else None,
        "current_balance": c.current_balance,
        "total_paid": c.total_paid,
        "total_interest_paid": c.total_interest_paid,
        "late_fee_amount": c.late_fee_amount,
        "late_fee_days": c.late_fee_days,
        "status": c.status,
        "is_active": c.is_active,
        "stripe_customer_id": c.stripe_customer_id,
        "payment_method": c.payment_method,
        "has_underlying_mortgage": c.has_underlying_mortgage,
        "mortgage_servicer": c.mortgage_servicer,
        "mortgage_balance": c.mortgage_balance,
        "mortgage_monthly_payment": c.mortgage_monthly_payment,
        "mortgage_account_number": c.mortgage_account_number,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


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
