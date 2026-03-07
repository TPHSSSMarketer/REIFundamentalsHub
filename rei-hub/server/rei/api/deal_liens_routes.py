"""Deal Liens CRUD — dynamic lien records per CRM deal."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.crm import CrmDeal
from rei.models.negotiation import DealLien
from rei.models.user import User

logger = logging.getLogger(__name__)

deal_liens_router = APIRouter(prefix="/api/crm/deals", tags=["deal-liens"])


# ── Pydantic Schemas ────────────────────────────────────────


class CreateLienBody(BaseModel):
    lienType: str
    lienHolder: str = ""
    accountNumber: Optional[str] = None
    balance: Optional[float] = None
    monthlyPayment: Optional[float] = None
    interestRate: Optional[float] = None
    loanDate: Optional[str] = None
    maturityDate: Optional[str] = None
    status: Optional[str] = None
    paymentsCurrent: Optional[str] = None
    monthsBehind: Optional[int] = None
    amountBehind: Optional[float] = None
    loanType: Optional[str] = None
    prepaymentPenalty: Optional[str] = None
    taxesInsuranceIncluded: Optional[str] = None
    notes: Optional[str] = None
    sortOrder: int = 0


class UpdateLienBody(BaseModel):
    lienType: Optional[str] = None
    lienHolder: Optional[str] = None
    accountNumber: Optional[str] = None
    balance: Optional[float] = None
    monthlyPayment: Optional[float] = None
    interestRate: Optional[float] = None
    loanDate: Optional[str] = None
    maturityDate: Optional[str] = None
    status: Optional[str] = None
    paymentsCurrent: Optional[str] = None
    monthsBehind: Optional[int] = None
    amountBehind: Optional[float] = None
    loanType: Optional[str] = None
    prepaymentPenalty: Optional[str] = None
    taxesInsuranceIncluded: Optional[str] = None
    notes: Optional[str] = None
    sortOrder: Optional[int] = None


# camelCase → snake_case mapping
_LIEN_FIELD_MAP = {
    "lienType": "lien_type",
    "lienHolder": "lien_holder",
    "accountNumber": "account_number",
    "balance": "balance",
    "monthlyPayment": "monthly_payment",
    "interestRate": "interest_rate",
    "loanDate": "loan_date",
    "maturityDate": "maturity_date",
    "status": "status",
    "paymentsCurrent": "payments_current",
    "monthsBehind": "months_behind",
    "amountBehind": "amount_behind",
    "loanType": "loan_type",
    "prepaymentPenalty": "prepayment_penalty",
    "taxesInsuranceIncluded": "taxes_insurance_included",
    "notes": "notes",
    "sortOrder": "sort_order",
}


def _lien_to_dict(l: DealLien) -> dict:
    return {
        "id": l.id,
        "dealId": l.deal_id,
        "lienType": l.lien_type,
        "lienHolder": l.lien_holder or "",
        "accountNumber": l.account_number,
        "balance": l.balance,
        "monthlyPayment": l.monthly_payment,
        "interestRate": l.interest_rate,
        "loanDate": l.loan_date,
        "maturityDate": l.maturity_date,
        "status": l.status,
        "paymentsCurrent": l.payments_current,
        "monthsBehind": l.months_behind,
        "amountBehind": l.amount_behind,
        "loanType": l.loan_type,
        "prepaymentPenalty": l.prepayment_penalty,
        "taxesInsuranceIncluded": l.taxes_insurance_included,
        "notes": l.notes,
        "sortOrder": l.sort_order,
        "createdAt": l.created_at.isoformat() if l.created_at else None,
        "updatedAt": l.updated_at.isoformat() if l.updated_at else None,
    }


# ── Endpoints ───────────────────────────────────────────────


@deal_liens_router.get("/{deal_id}/liens")
async def list_liens(
    deal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all liens for a deal."""
    uid = workspace_user_id(user)

    # Verify deal exists and belongs to user
    deal_result = await db.execute(
        select(CrmDeal.id).where(
            CrmDeal.id == deal_id, CrmDeal.user_id == uid, CrmDeal.is_deleted == False
        )
    )
    if not deal_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Deal not found")

    result = await db.execute(
        select(DealLien)
        .where(DealLien.deal_id == deal_id, DealLien.user_id == uid)
        .order_by(DealLien.sort_order, DealLien.created_at)
    )
    return [_lien_to_dict(l) for l in result.scalars().all()]


@deal_liens_router.post("/{deal_id}/liens", status_code=status.HTTP_201_CREATED)
async def create_lien(
    deal_id: str,
    body: CreateLienBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a lien to a deal."""
    uid = workspace_user_id(user)

    # Verify deal
    deal_result = await db.execute(
        select(CrmDeal.id).where(
            CrmDeal.id == deal_id, CrmDeal.user_id == uid, CrmDeal.is_deleted == False
        )
    )
    if not deal_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Deal not found")

    now = datetime.utcnow()
    lien = DealLien(deal_id=deal_id, user_id=uid, created_at=now, updated_at=now)

    updates = body.model_dump(exclude_none=True)
    for js_key, db_col in _LIEN_FIELD_MAP.items():
        if js_key in updates:
            setattr(lien, db_col, updates[js_key])

    db.add(lien)
    await db.commit()
    await db.refresh(lien)
    return _lien_to_dict(lien)


@deal_liens_router.patch("/{deal_id}/liens/{lien_id}")
async def update_lien(
    deal_id: str,
    lien_id: str,
    body: UpdateLienBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a lien."""
    uid = workspace_user_id(user)
    result = await db.execute(
        select(DealLien).where(
            DealLien.id == lien_id,
            DealLien.deal_id == deal_id,
            DealLien.user_id == uid,
        )
    )
    lien = result.scalar_one_or_none()
    if not lien:
        raise HTTPException(status_code=404, detail="Lien not found")

    updates = body.model_dump(exclude_none=True)
    for js_key, db_col in _LIEN_FIELD_MAP.items():
        if js_key in updates:
            setattr(lien, db_col, updates[js_key])

    lien.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(lien)
    return _lien_to_dict(lien)


@deal_liens_router.delete("/{deal_id}/liens/{lien_id}")
async def delete_lien(
    deal_id: str,
    lien_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a lien."""
    uid = workspace_user_id(user)
    result = await db.execute(
        select(DealLien).where(
            DealLien.id == lien_id,
            DealLien.deal_id == deal_id,
            DealLien.user_id == uid,
        )
    )
    lien = result.scalar_one_or_none()
    if not lien:
        raise HTTPException(status_code=404, detail="Lien not found")

    await db.delete(lien)
    await db.commit()
    return {"detail": "Lien deleted"}
