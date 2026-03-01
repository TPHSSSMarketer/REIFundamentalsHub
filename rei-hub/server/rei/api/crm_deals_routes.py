"""CRM Deals CRUD — each subscriber's deal pipeline."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.crm import CrmDeal
from rei.models.user import User
from rei.services.buyer_matching import match_buyers_for_deal
from rei.services.email import send_buyer_match_notification

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

    # Property Details
    propertyType: str | None = None
    bedrooms: int | None = None
    bathrooms: float | None = None
    squareFootage: int | None = None
    lotSize: str | None = None
    yearBuilt: int | None = None
    garage: str | None = None
    propertyCondition: str | None = None
    occupancyStatus: str | None = None
    repairsNeeded: str | None = None
    specialFeatures: str | None = None
    # Seller Motivation
    reasonForSelling: str | None = None
    motivationLevel: str | None = None
    timelineToSell: str | None = None
    askingPrice: float | None = None
    priceFlexible: str | None = None
    howEstablishedPrice: str | None = None
    bestCashOffer: float | None = None
    whatIfDoesntSell: str | None = None
    openToTerms: str | None = None
    # Listing Information
    isListed: str | None = None
    realtorName: str | None = None
    realtorPhone: str | None = None
    listingExpires: str | None = None
    howLongListed: str | None = None
    anyOffers: str | None = None
    previousOfferAmount: float | None = None
    # Homeowner Financials
    mortgageBalance: float | None = None
    mortgageBalance2nd: float | None = None
    monthlyMortgagePayment: float | None = None
    taxesInsuranceIncluded: str | None = None
    monthlyTaxAmount: float | None = None
    monthlyInsuranceAmount: float | None = None
    interestRate1st: float | None = None
    interestRate2nd: float | None = None
    loanType: str | None = None
    prepaymentPenalty: str | None = None
    mortgageCompany1st: str | None = None
    mortgageCompany2nd: str | None = None
    paymentsCurrent: str | None = None
    monthsBehind: int | None = None
    amountBehind: float | None = None
    backTaxes: float | None = None
    otherLiens: str | None = None
    otherLienAmount: float | None = None
    # Foreclosure Details
    foreclosureStatus: str | None = None
    auctionDate: str | None = None
    reinstatementAmount: float | None = None
    attorneyInvolved: str | None = None
    attorneyName: str | None = None
    attorneyPhone: str | None = None
    # Additional
    asIsValue: float | None = None
    exitStrategy: str | None = None
    unitDetails: str | None = None
    pipelineId: str | None = None
    # Buyer Linking
    buyerId: Optional[str] = None
    buyerName: Optional[str] = None
    buyerType: Optional[str] = None
    # Retail Buyer / Subject-To Details
    subjectToInterest: Optional[str] = None
    existingLoanServicer: Optional[str] = None
    dueOnSaleAware: Optional[str] = None
    insuranceAssignable: Optional[str] = None
    buyerDownPayment: Optional[float] = None
    sourceOfFunds: Optional[str] = None
    # Lender 2 per-lender fields
    monthlyPayment2nd: Optional[float] = None
    loanType2nd: Optional[str] = None
    prepaymentPenalty2nd: Optional[str] = None
    paymentsCurrent2nd: Optional[str] = None
    monthsBehind2nd: Optional[int] = None
    amountBehind2nd: Optional[float] = None
    # Lender 3 (3rd Lien)
    mortgageBalance3rd: Optional[float] = None
    monthlyPayment3rd: Optional[float] = None
    interestRate3rd: Optional[float] = None
    loanType3rd: Optional[str] = None
    prepaymentPenalty3rd: Optional[str] = None
    mortgageCompany3rd: Optional[str] = None
    paymentsCurrent3rd: Optional[str] = None
    monthsBehind3rd: Optional[int] = None
    amountBehind3rd: Optional[float] = None


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
    "propertyType": "property_type",
    "bedrooms": "bedrooms",
    "bathrooms": "bathrooms",
    "squareFootage": "square_footage",
    "lotSize": "lot_size",
    "yearBuilt": "year_built",
    "garage": "garage",
    "propertyCondition": "property_condition",
    "occupancyStatus": "occupancy_status",
    "repairsNeeded": "repairs_needed",
    "specialFeatures": "special_features",
    "reasonForSelling": "reason_for_selling",
    "motivationLevel": "motivation_level",
    "timelineToSell": "timeline_to_sell",
    "askingPrice": "asking_price",
    "priceFlexible": "price_flexible",
    "howEstablishedPrice": "how_established_price",
    "bestCashOffer": "best_cash_offer",
    "whatIfDoesntSell": "what_if_doesnt_sell",
    "openToTerms": "open_to_terms",
    "isListed": "is_listed",
    "realtorName": "realtor_name",
    "realtorPhone": "realtor_phone",
    "listingExpires": "listing_expires",
    "howLongListed": "how_long_listed",
    "anyOffers": "any_offers",
    "previousOfferAmount": "previous_offer_amount",
    "mortgageBalance": "mortgage_balance",
    "mortgageBalance2nd": "mortgage_balance_2nd",
    "monthlyMortgagePayment": "monthly_mortgage_payment",
    "taxesInsuranceIncluded": "taxes_insurance_included",
    "monthlyTaxAmount": "monthly_tax_amount",
    "monthlyInsuranceAmount": "monthly_insurance_amount",
    "interestRate1st": "interest_rate_1st",
    "interestRate2nd": "interest_rate_2nd",
    "loanType": "loan_type",
    "prepaymentPenalty": "prepayment_penalty",
    "mortgageCompany1st": "mortgage_company_1st",
    "mortgageCompany2nd": "mortgage_company_2nd",
    "paymentsCurrent": "payments_current",
    "monthsBehind": "months_behind",
    "amountBehind": "amount_behind",
    "backTaxes": "back_taxes",
    "otherLiens": "other_liens",
    "otherLienAmount": "other_lien_amount",
    "foreclosureStatus": "foreclosure_status",
    "reinstatementAmount": "reinstatement_amount",
    "attorneyInvolved": "attorney_involved",
    "attorneyName": "attorney_name",
    "attorneyPhone": "attorney_phone",
    "asIsValue": "as_is_value",
    "exitStrategy": "exit_strategy",
    "unitDetails": "unit_details",
    "pipelineId": "pipeline_id",
    "buyerId": "buyer_id",
    "buyerName": "buyer_name",
    "buyerType": "buyer_type",
    "subjectToInterest": "subject_to_interest",
    "existingLoanServicer": "existing_loan_servicer",
    "dueOnSaleAware": "due_on_sale_aware",
    "insuranceAssignable": "insurance_assignable",
    "buyerDownPayment": "buyer_down_payment",
    "sourceOfFunds": "source_of_funds",
    "monthlyPayment2nd": "monthly_payment_2nd",
    "loanType2nd": "loan_type_2nd",
    "prepaymentPenalty2nd": "prepayment_penalty_2nd",
    "paymentsCurrent2nd": "payments_current_2nd",
    "monthsBehind2nd": "months_behind_2nd",
    "amountBehind2nd": "amount_behind_2nd",
    "mortgageBalance3rd": "mortgage_balance_3rd",
    "monthlyPayment3rd": "monthly_payment_3rd",
    "interestRate3rd": "interest_rate_3rd",
    "loanType3rd": "loan_type_3rd",
    "prepaymentPenalty3rd": "prepayment_penalty_3rd",
    "mortgageCompany3rd": "mortgage_company_3rd",
    "paymentsCurrent3rd": "payments_current_3rd",
    "monthsBehind3rd": "months_behind_3rd",
    "amountBehind3rd": "amount_behind_3rd",
}

# Date fields need special parsing
_DATE_FIELDS = {"offerExpiresAt": "offer_expires_at", "inspectionDeadline": "inspection_deadline", "closingDate": "closing_date", "auctionDate": "auction_date"}


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
        # Property Details
        "propertyType": d.property_type,
        "bedrooms": d.bedrooms,
        "bathrooms": d.bathrooms,
        "squareFootage": d.square_footage,
        "lotSize": d.lot_size,
        "yearBuilt": d.year_built,
        "garage": d.garage,
        "propertyCondition": d.property_condition,
        "occupancyStatus": d.occupancy_status,
        "repairsNeeded": d.repairs_needed,
        "specialFeatures": d.special_features,
        # Seller Motivation
        "reasonForSelling": d.reason_for_selling,
        "motivationLevel": d.motivation_level,
        "timelineToSell": d.timeline_to_sell,
        "askingPrice": d.asking_price,
        "priceFlexible": d.price_flexible,
        "howEstablishedPrice": d.how_established_price,
        "bestCashOffer": d.best_cash_offer,
        "whatIfDoesntSell": d.what_if_doesnt_sell,
        "openToTerms": d.open_to_terms,
        # Listing Information
        "isListed": d.is_listed,
        "realtorName": d.realtor_name,
        "realtorPhone": d.realtor_phone,
        "listingExpires": d.listing_expires,
        "howLongListed": d.how_long_listed,
        "anyOffers": d.any_offers,
        "previousOfferAmount": d.previous_offer_amount,
        # Homeowner Financials
        "mortgageBalance": d.mortgage_balance,
        "mortgageBalance2nd": d.mortgage_balance_2nd,
        "monthlyMortgagePayment": d.monthly_mortgage_payment,
        "taxesInsuranceIncluded": d.taxes_insurance_included,
        "monthlyTaxAmount": d.monthly_tax_amount,
        "monthlyInsuranceAmount": d.monthly_insurance_amount,
        "interestRate1st": d.interest_rate_1st,
        "interestRate2nd": d.interest_rate_2nd,
        "loanType": d.loan_type,
        "prepaymentPenalty": d.prepayment_penalty,
        "mortgageCompany1st": d.mortgage_company_1st,
        "mortgageCompany2nd": d.mortgage_company_2nd,
        "paymentsCurrent": d.payments_current,
        "monthsBehind": d.months_behind,
        "amountBehind": d.amount_behind,
        "backTaxes": d.back_taxes,
        "otherLiens": d.other_liens,
        "otherLienAmount": d.other_lien_amount,
        # Foreclosure Details
        "foreclosureStatus": d.foreclosure_status,
        "auctionDate": d.auction_date.isoformat() if d.auction_date else None,
        "reinstatementAmount": d.reinstatement_amount,
        "attorneyInvolved": d.attorney_involved,
        "attorneyName": d.attorney_name,
        "attorneyPhone": d.attorney_phone,
        # Additional
        "asIsValue": d.as_is_value,
        "exitStrategy": d.exit_strategy,
        "unitDetails": d.unit_details,
        "pipelineId": d.pipeline_id,
        # Buyer Linking & Retail Subject-To Details
        "buyerId": d.buyer_id,
        "buyerName": d.buyer_name,
        "buyerType": d.buyer_type,
        "subjectToInterest": d.subject_to_interest,
        "existingLoanServicer": d.existing_loan_servicer,
        "dueOnSaleAware": d.due_on_sale_aware,
        "insuranceAssignable": d.insurance_assignable,
        "buyerDownPayment": d.buyer_down_payment,
        "sourceOfFunds": d.source_of_funds,
        "monthlyPayment2nd": d.monthly_payment_2nd,
        "loanType2nd": d.loan_type_2nd,
        "prepaymentPenalty2nd": d.prepayment_penalty_2nd,
        "paymentsCurrent2nd": d.payments_current_2nd,
        "monthsBehind2nd": d.months_behind_2nd,
        "amountBehind2nd": d.amount_behind_2nd,
        "mortgageBalance3rd": d.mortgage_balance_3rd,
        "monthlyPayment3rd": d.monthly_payment_3rd,
        "interestRate3rd": d.interest_rate_3rd,
        "loanType3rd": d.loan_type_3rd,
        "prepaymentPenalty3rd": d.prepayment_penalty_3rd,
        "mortgageCompany3rd": d.mortgage_company_3rd,
        "paymentsCurrent3rd": d.payments_current_3rd,
        "monthsBehind3rd": d.months_behind_3rd,
        "amountBehind3rd": d.amount_behind_3rd,
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
    # Accept stages from all 4 pipeline types
    valid_stages = {
        # Deals pipeline
        "lead", "contacted", "analysis", "offer", "under_contract",
        "due_diligence", "closing", "closed_won", "closed_lost",
        # Investor Buyers pipeline
        "new_lead", "qualified", "sent_deals", "negotiating", "funded", "inactive",
        # Retail Buyers pipeline
        "pre_approved", "showing", "offer_received",
        # Tax Deals pipeline
        "research", "auction", "won", "redemption_period", "clear_title", "disposed", "lost",
        # Shared
        "closed",
    }
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

    old_stage = deal.stage
    deal.stage = body.stage
    deal.updated_at = datetime.utcnow()
    await db.commit()

    # Trigger buyer matching when a deal moves to "under_contract"
    if body.stage == "under_contract" and old_stage != "under_contract":
        asyncio.create_task(
            _notify_matched_buyers(deal.id, user.id)
        )

    return {"detail": "Stage updated", "stage": deal.stage}


async def _notify_matched_buyers(deal_id: str, user_id: int) -> None:
    """Background task: find matching buyers and send them email notifications."""
    from rei.database import async_session_factory
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(CrmDeal).where(CrmDeal.id == deal_id)
            )
            deal = result.scalar_one_or_none()
            if not deal:
                return

            matched = await match_buyers_for_deal(deal, user_id, db)
            if not matched:
                logger.info("No buyers matched for deal %s", deal_id)
                return

            settings = get_settings()
            for buyer in matched:
                try:
                    await send_buyer_match_notification(
                        buyer_email=buyer.email,
                        buyer_name=buyer.name,
                        deal=deal,
                        settings=settings,
                    )
                    logger.info("Sent match notification to %s for deal %s", buyer.email, deal_id)
                except Exception as e:
                    logger.error("Failed to send match email to %s: %s", buyer.email, e)
    except Exception as e:
        logger.error("Error in buyer matching background task: %s", e)


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
