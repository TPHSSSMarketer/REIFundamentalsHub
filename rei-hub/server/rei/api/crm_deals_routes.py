"""CRM Deals CRUD — each subscriber's deal pipeline."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.crm import CrmDeal
from rei.models.user import User

logger = logging.getLogger(__name__)

crm_deals_router = APIRouter(prefix="/crm/deals", tags=["crm-deals"])


# ── Pydantic Schemas ────────────────────────────────────────


class CreateDealBody(BaseModel):
    title: str = ""
    address: str = ""
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    stage: Optional[str] = "lead"

    # Pricing
    listPrice: Optional[float] = None
    offerPrice: Optional[float] = None
    purchasePrice: Optional[float] = None
    arv: Optional[float] = None

    # Acquisition
    earnestMoney: Optional[float] = None
    downPayment: Optional[float] = None
    closingCostsBuyer: Optional[float] = None
    loanOriginationFee: Optional[float] = None
    appraisalFee: Optional[float] = None
    inspectionFee: Optional[float] = None
    titleInsurance: Optional[float] = None
    attorneyFee: Optional[float] = None
    surveyFee: Optional[float] = None
    otherAcquisitionCosts: Optional[float] = None

    # Rehab
    rehabEstimate: Optional[float] = None
    rehabActual: Optional[float] = None
    permitFees: Optional[float] = None
    architectFees: Optional[float] = None
    holdingCostsDuringRehab: Optional[float] = None

    # Financing
    loanAmount: Optional[float] = None
    interestRate: Optional[float] = None
    loanTermMonths: Optional[int] = None
    monthlyMortgagePI: Optional[float] = None
    pmiMonthly: Optional[float] = None

    # Expenses
    propertyTaxAnnual: Optional[float] = None
    insuranceAnnual: Optional[float] = None
    propertyMgmtPercent: Optional[float] = None
    propertyMgmtFlat: Optional[float] = None
    vacancyPercent: Optional[float] = None
    maintenancePercent: Optional[float] = None
    hoaMonthly: Optional[float] = None
    utilitiesMonthly: Optional[float] = None
    otherExpensesMonthly: Optional[float] = None

    # Income
    monthlyRent: Optional[float] = None
    otherMonthlyIncome: Optional[float] = None

    # Computed
    allInCost: Optional[float] = None
    totalMonthlyExpenses: Optional[float] = None
    monthlyCashFlow: Optional[float] = None
    annualCashFlow: Optional[float] = None
    cashOnCash: Optional[float] = None
    capRate: Optional[float] = None
    roiPercent: Optional[float] = None
    debtServiceCoverageRatio: Optional[float] = None

    # Deal info
    contactId: Optional[str] = None
    contactName: Optional[str] = None
    offerExpiresAt: Optional[str] = None
    inspectionDeadline: Optional[str] = None
    closingDate: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None
    isUrgent: Optional[bool] = False
    passedReason: Optional[str] = None


class UpdateDealBody(CreateDealBody):
    """Same fields, all optional for partial updates."""
    title: Optional[str] = None  # type: ignore[assignment]
    address: Optional[str] = None  # type: ignore[assignment]


class UpdateStageBody(BaseModel):
    stage: str


# ── Field Mapping ───────────────────────────────────────────

# Maps camelCase JS keys to snake_case DB column names
_FIELD_MAP: dict[str, str] = {
    "title": "title",
    "address": "address",
    "city": "city",
    "state": "state",
    "zip": "zip",
    "stage": "stage",
    "listPrice": "list_price",
    "offerPrice": "offer_price",
    "purchasePrice": "purchase_price",
    "arv": "arv",
    "earnestMoney": "earnest_money",
    "downPayment": "down_payment",
    "closingCostsBuyer": "closing_costs_buyer",
    "loanOriginationFee": "loan_origination_fee",
    "appraisalFee": "appraisal_fee",
    "inspectionFee": "inspection_fee",
    "titleInsurance": "title_insurance",
    "attorneyFee": "attorney_fee",
    "surveyFee": "survey_fee",
    "otherAcquisitionCosts": "other_acquisition_costs",
    "rehabEstimate": "rehab_estimate",
    "rehabActual": "rehab_actual",
    "permitFees": "permit_fees",
    "architectFees": "architect_fees",
    "holdingCostsDuringRehab": "holding_costs_during_rehab",
    "loanAmount": "loan_amount",
    "interestRate": "interest_rate",
    "loanTermMonths": "loan_term_months",
    "monthlyMortgagePI": "monthly_mortgage_pi",
    "pmiMonthly": "pmi_monthly",
    "propertyTaxAnnual": "property_tax_annual",
    "insuranceAnnual": "insurance_annual",
    "propertyMgmtPercent": "property_mgmt_percent",
    "propertyMgmtFlat": "property_mgmt_flat",
    "vacancyPercent": "vacancy_percent",
    "maintenancePercent": "maintenance_percent",
    "hoaMonthly": "hoa_monthly",
    "utilitiesMonthly": "utilities_monthly",
    "otherExpensesMonthly": "other_expenses_monthly",
    "monthlyRent": "monthly_rent",
    "otherMonthlyIncome": "other_monthly_income",
    "allInCost": "all_in_cost",
    "totalMonthlyExpenses": "total_monthly_expenses",
    "monthlyCashFlow": "monthly_cash_flow",
    "annualCashFlow": "annual_cash_flow",
    "cashOnCash": "cash_on_cash",
    "capRate": "cap_rate",
    "roiPercent": "roi_percent",
    "debtServiceCoverageRatio": "debt_service_coverage_ratio",
    "contactId": "contact_id",
    "contactName": "contact_name",
    "source": "source",
    "notes": "notes",
    "isUrgent": "is_urgent",
    "passedReason": "passed_reason",
}

# Date fields need special parsing
_DATE_FIELDS = {"offerExpiresAt": "offer_expires_at", "inspectionDeadline": "inspection_deadline", "closingDate": "closing_date"}


# ── Helpers ─────────────────────────────────────────────────


def _deal_to_dict(d: CrmDeal) -> dict:
    return {
        "id": d.id,
        "title": d.title or "",
        "address": d.address or "",
        "city": d.city,
        "state": d.state,
        "zip": d.zip,
        "stage": d.stage or "lead",
        # Pricing
        "listPrice": d.list_price,
        "offerPrice": d.offer_price,
        "purchasePrice": d.purchase_price,
        "arv": d.arv,
        # Acquisition
        "earnestMoney": d.earnest_money,
        "downPayment": d.down_payment,
        "closingCostsBuyer": d.closing_costs_buyer,
        "loanOriginationFee": d.loan_origination_fee,
        "appraisalFee": d.appraisal_fee,
        "inspectionFee": d.inspection_fee,
        "titleInsurance": d.title_insurance,
        "attorneyFee": d.attorney_fee,
        "surveyFee": d.survey_fee,
        "otherAcquisitionCosts": d.other_acquisition_costs,
        # Rehab
        "rehabEstimate": d.rehab_estimate,
        "rehabActual": d.rehab_actual,
        "permitFees": d.permit_fees,
        "architectFees": d.architect_fees,
        "holdingCostsDuringRehab": d.holding_costs_during_rehab,
        # Financing
        "loanAmount": d.loan_amount,
        "interestRate": d.interest_rate,
        "loanTermMonths": d.loan_term_months,
        "monthlyMortgagePI": d.monthly_mortgage_pi,
        "pmiMonthly": d.pmi_monthly,
        # Expenses
        "propertyTaxAnnual": d.property_tax_annual,
        "insuranceAnnual": d.insurance_annual,
        "propertyMgmtPercent": d.property_mgmt_percent,
        "propertyMgmtFlat": d.property_mgmt_flat,
        "vacancyPercent": d.vacancy_percent,
        "maintenancePercent": d.maintenance_percent,
        "hoaMonthly": d.hoa_monthly,
        "utilitiesMonthly": d.utilities_monthly,
        "otherExpensesMonthly": d.other_expenses_monthly,
        # Income
        "monthlyRent": d.monthly_rent,
        "otherMonthlyIncome": d.other_monthly_income,
        # Computed
        "allInCost": d.all_in_cost,
        "totalMonthlyExpenses": d.total_monthly_expenses,
        "monthlyCashFlow": d.monthly_cash_flow,
        "annualCashFlow": d.annual_cash_flow,
        "cashOnCash": d.cash_on_cash,
        "capRate": d.cap_rate,
        "roiPercent": d.roi_percent,
        "debtServiceCoverageRatio": d.debt_service_coverage_ratio,
        # Deal info
        "contactId": d.contact_id,
        "contactName": d.contact_name,
        "offerExpiresAt": d.offer_expires_at.isoformat() if d.offer_expires_at else None,
        "inspectionDeadline": d.inspection_deadline.isoformat() if d.inspection_deadline else None,
        "closingDate": d.closing_date.isoformat() if d.closing_date else None,
        "source": d.source,
        "notes": d.notes,
        "isUrgent": d.is_urgent or False,
        "passedReason": d.passed_reason,
        "createdAt": d.created_at.isoformat() if d.created_at else None,
        "updatedAt": d.updated_at.isoformat() if d.updated_at else None,
    }


def _apply_updates(deal: CrmDeal, updates: dict) -> None:
    """Apply camelCase updates dict to snake_case model columns."""
    for js_key, db_col in _FIELD_MAP.items():
        if js_key in updates:
            setattr(deal, db_col, updates[js_key])

    for js_key, db_col in _DATE_FIELDS.items():
        if js_key in updates and updates[js_key] is not None:
            try:
                setattr(deal, db_col, datetime.fromisoformat(updates[js_key]))
            except (ValueError, TypeError):
                pass


# ── Endpoints ───────────────────────────────────────────────


@crm_deals_router.get("")
async def list_deals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all deals for the current subscriber."""
    result = await db.execute(
        select(CrmDeal)
        .where(CrmDeal.user_id == user.id, CrmDeal.is_deleted == False)
        .order_by(CrmDeal.created_at.desc())
    )
    deals = result.scalars().all()
    return [_deal_to_dict(d) for d in deals]


@crm_deals_router.get("/{deal_id}")
async def get_deal(
    deal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single deal by ID."""
    result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == user.id,
            CrmDeal.is_deleted == False,
        )
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    return _deal_to_dict(deal)


@crm_deals_router.post("", status_code=status.HTTP_201_CREATED)
async def create_deal(
    body: CreateDealBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new deal."""
    now = datetime.utcnow()
    deal = CrmDeal(user_id=user.id, created_at=now, updated_at=now)

    updates = body.model_dump(exclude_none=True)
    _apply_updates(deal, updates)

    db.add(deal)
    await db.commit()
    await db.refresh(deal)
    return _deal_to_dict(deal)


@crm_deals_router.patch("/{deal_id}")
async def update_deal(
    deal_id: str,
    body: UpdateDealBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing deal (partial update)."""
    result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == user.id,
            CrmDeal.is_deleted == False,
        )
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    updates = body.model_dump(exclude_none=True)
    _apply_updates(deal, updates)

    deal.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(deal)
    return _deal_to_dict(deal)


@crm_deals_router.patch("/{deal_id}/stage")
async def update_deal_stage(
    deal_id: str,
    body: UpdateStageBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update only the stage (optimized for drag-and-drop pipeline)."""
    valid_stages = {"lead", "analysis", "offer", "under_contract", "due_diligence", "closing", "closed_won", "closed_lost"}
    if body.stage not in valid_stages:
        raise HTTPException(status_code=400, detail=f"Invalid stage: {body.stage}")

    result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == user.id,
            CrmDeal.is_deleted == False,
        )
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal.stage = body.stage
    deal.updated_at = datetime.utcnow()
    await db.commit()
    return {"detail": "Stage updated", "stage": deal.stage}


@crm_deals_router.delete("/{deal_id}")
async def delete_deal(
    deal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a deal."""
    result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == user.id,
        )
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal.is_deleted = True
    await db.commit()
    return {"detail": "Deal deleted"}
