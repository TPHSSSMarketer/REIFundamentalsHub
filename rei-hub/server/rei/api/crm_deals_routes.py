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

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import get_settings
from rei.models.crm import CrmDeal, DealBuyerMatch, DealFile
from rei.models.negotiation import DealLien
from rei.models.user import User
from rei.services.buyer_matching import match_buyers_for_deal

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
    # Homeowner Financials (liens now in DealLien model)
    backTaxes: float | None = None
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
    # Marketing / Campaign Tracking
    campaignId: Optional[str] = None
    campaignType: Optional[str] = None
    campaignName: Optional[str] = None


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
    "backTaxes": "back_taxes",
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
    "campaignId": "campaign_id",
    "campaignType": "campaign_type",
    "campaignName": "campaign_name",
}

# Date fields need special parsing
_DATE_FIELDS = {"offerExpiresAt": "offer_expires_at", "inspectionDeadline": "inspection_deadline", "closingDate": "closing_date", "auctionDate": "auction_date"}


# ── Helpers ─────────────────────────────────────────────────


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


def _deal_to_dict(d: CrmDeal, liens: list[DealLien] | None = None) -> dict:
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
        # Homeowner Financials (liens loaded separately)
        "backTaxes": d.back_taxes,
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
        # Campaign tracking
        "campaignId": d.campaign_id,
        "campaignType": d.campaign_type,
        "campaignName": d.campaign_name,
        # ATTOM Owner / Mailing
        "ownerName": getattr(d, "owner_name", None),
        "ownerName2": getattr(d, "owner_name2", None),
        "ownerType": getattr(d, "owner_type", None),
        "mailingAddress": getattr(d, "mailing_address", None),
        "mailingCity": getattr(d, "mailing_city", None),
        "mailingState": getattr(d, "mailing_state", None),
        "mailingZip": getattr(d, "mailing_zip", None),
        # ATTOM Additional
        "censusTract": getattr(d, "census_tract", None),
        "municipality": getattr(d, "municipality", None),
        "countyUseCode": getattr(d, "county_use_code", None),
        "taxCodeArea": getattr(d, "tax_code_area", None),
        "lotNumber": getattr(d, "lot_number", None),
        "parkingType": getattr(d, "parking_type", None),
        "geoAccuracy": getattr(d, "geo_accuracy", None),
        # ATTOM Property Data
        "attomId": getattr(d, "attom_id", None),
        "apn": getattr(d, "apn", None),
        "fips": getattr(d, "fips", None),
        "county": getattr(d, "county", None),
        "subdivision": getattr(d, "subdivision", None),
        "schoolDistrict": getattr(d, "school_district", None),
        "legalDescription": getattr(d, "legal_description", None),
        "zoning": getattr(d, "zoning", None),
        "lotSizeAcres": getattr(d, "lot_size_acres", None),
        "stories": getattr(d, "stories", None),
        "bathroomsHalf": getattr(d, "bathrooms_half", None),
        "totalRooms": getattr(d, "total_rooms", None),
        "basementType": getattr(d, "basement_type", None),
        "basementSqft": getattr(d, "basement_sqft", None),
        "constructionType": getattr(d, "construction_type", None),
        "exteriorWalls": getattr(d, "exterior_walls", None),
        "roofType": getattr(d, "roof_type", None),
        "foundationType": getattr(d, "foundation_type", None),
        "heating": getattr(d, "heating", None),
        "cooling": getattr(d, "cooling", None),
        "waterType": getattr(d, "water_type", None),
        "sewerType": getattr(d, "sewer_type", None),
        "pool": getattr(d, "pool", None),
        "fireplaceCount": getattr(d, "fireplace_count", None),
        "parkingSpaces": getattr(d, "parking_spaces", None),
        "absenteeOwner": getattr(d, "absentee_owner", None),
        # ATTOM Tax/Valuation
        "marketValue": getattr(d, "market_value", None),
        "marketLandValue": getattr(d, "market_land_value", None),
        "marketImprovementValue": getattr(d, "market_improvement_value", None),
        "assessedValue": getattr(d, "assessed_value", None),
        "assessedLandValue": getattr(d, "assessed_land_value", None),
        "assessedImprovementValue": getattr(d, "assessed_improvement_value", None),
        "taxYear": getattr(d, "tax_year", None),
        # ATTOM Appraised Values
        "appraisedTotalValue": getattr(d, "appraised_total_value", None),
        "appraisedLandValue": getattr(d, "appraised_land_value", None),
        "appraisedImprovementValue": getattr(d, "appraised_improvement_value", None),
        # ATTOM Calculated Values
        "calcTotalValue": getattr(d, "calc_total_value", None),
        "calcLandValue": getattr(d, "calc_land_value", None),
        "calcImprovementValue": getattr(d, "calc_improvement_value", None),
        # ATTOM Tax Per Sqft
        "taxPerSqft": getattr(d, "tax_per_sqft", None),
        # ATTOM Lot Detail
        "lotDepth": getattr(d, "lot_depth", None),
        "lotFrontage": getattr(d, "lot_frontage", None),
        # ATTOM Building Sizes
        "buildingSize": getattr(d, "building_size", None),
        "grossSize": getattr(d, "gross_size", None),
        # ATTOM Sale History & Liens
        "saleHistoryJson": getattr(d, "sale_history_json", None),
        "lienRecordsJson": getattr(d, "lien_records_json", None),
        # ATTOM Sale History
        "lastSaleDate": getattr(d, "last_sale_date", None),
        "lastSalePrice": getattr(d, "last_sale_price", None),
        "lastSaleBuyer": getattr(d, "last_sale_buyer", None),
        "lastSaleSeller": getattr(d, "last_sale_seller", None),
        # Timestamps
        "createdAt": d.created_at.isoformat() if d.created_at else None,
        "updatedAt": d.updated_at.isoformat() if d.updated_at else None,
        # Dynamic liens (loaded separately)
        "liens": [_lien_to_dict(l) for l in liens] if liens is not None else [],
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


@crm_deals_router.get("/source-analytics")
async def deal_source_analytics(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate deal data by source and campaign for KPI tracking.

    Returns per-source stats: deal count, total value, won count, avg days to close,
    and per-campaign breakdowns within each source.
    """
    uid = workspace_user_id(user)
    result = await db.execute(
        select(CrmDeal).where(CrmDeal.user_id == uid, CrmDeal.is_deleted == False)  # noqa: E712
    )
    deals = result.scalars().all()

    # Aggregate by source
    source_map: dict[str, dict] = {}
    campaign_map: dict[str, dict] = {}

    for d in deals:
        src = d.source or "unknown"
        if src not in source_map:
            source_map[src] = {
                "source": src,
                "totalDeals": 0,
                "totalValue": 0.0,
                "wonDeals": 0,
                "wonValue": 0.0,
                "avgOfferPrice": 0.0,
                "_offer_sum": 0.0,
                "_offer_count": 0,
            }
        s = source_map[src]
        s["totalDeals"] += 1
        deal_val = d.purchase_price or d.offer_price or d.list_price or 0
        s["totalValue"] += deal_val

        if d.stage == "closed_won":
            s["wonDeals"] += 1
            s["wonValue"] += deal_val

        if d.offer_price:
            s["_offer_sum"] += d.offer_price
            s["_offer_count"] += 1

        # Campaign breakdown
        if d.campaign_id:
            cid = d.campaign_id
            if cid not in campaign_map:
                campaign_map[cid] = {
                    "campaignId": cid,
                    "campaignName": d.campaign_name or "Unknown Campaign",
                    "campaignType": d.campaign_type or "unknown",
                    "source": src,
                    "totalDeals": 0,
                    "wonDeals": 0,
                    "totalValue": 0.0,
                }
            cm = campaign_map[cid]
            cm["totalDeals"] += 1
            cm["totalValue"] += deal_val
            if d.stage == "closed_won":
                cm["wonDeals"] += 1

    # Finalize averages
    sources = []
    for s in source_map.values():
        s["avgOfferPrice"] = round(s["_offer_sum"] / s["_offer_count"], 2) if s["_offer_count"] > 0 else 0
        s["conversionRate"] = round((s["wonDeals"] / s["totalDeals"]) * 100, 1) if s["totalDeals"] > 0 else 0
        del s["_offer_sum"]
        del s["_offer_count"]
        sources.append(s)

    # Sort by total deals descending
    sources.sort(key=lambda x: x["totalDeals"], reverse=True)
    campaigns_list = sorted(campaign_map.values(), key=lambda x: x["totalDeals"], reverse=True)

    return {
        "sources": sources,
        "campaigns": campaigns_list,
        "totalDeals": len(deals),
        "totalWon": sum(1 for d in deals if d.stage == "closed_won"),
        "totalValue": sum(d.purchase_price or d.offer_price or d.list_price or 0 for d in deals),
    }


@crm_deals_router.get("/campaigns")
async def list_campaigns_for_deals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all email + SMS campaigns for the campaign selector dropdown."""
    from rei.models.user import EmailCampaign, SmsCampaign

    uid = workspace_user_id(user)
    campaigns: list[dict] = []

    # Email campaigns
    result = await db.execute(
        select(EmailCampaign)
        .where(EmailCampaign.user_id == uid)
        .order_by(EmailCampaign.created_at.desc())
    )
    for c in result.scalars().all():
        campaigns.append({
            "id": c.id,
            "name": c.name,
            "type": "email",
            "status": c.status,
        })

    # SMS campaigns
    result = await db.execute(
        select(SmsCampaign)
        .where(SmsCampaign.user_id == uid)
        .order_by(SmsCampaign.created_at.desc())
    )
    for c in result.scalars().all():
        campaigns.append({
            "id": c.id,
            "name": c.name,
            "type": "sms",
            "status": c.status,
        })

    return campaigns


@crm_deals_router.get("")
async def list_deals(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all deals for the current subscriber."""
    result = await db.execute(
        select(CrmDeal)
        .where(CrmDeal.user_id == workspace_user_id(user), CrmDeal.is_deleted == False)
        .order_by(CrmDeal.created_at.desc())
    )
    deals = result.scalars().all()

    # Batch-fetch front photo thumbnails for all deals
    deal_ids = [d.id for d in deals]
    front_thumbs: dict[str, str] = {}
    if deal_ids:
        thumb_result = await db.execute(
            select(DealFile.deal_id, DealFile.thumbnail)
            .where(
                DealFile.user_id == workspace_user_id(user),
                DealFile.deal_id.in_(deal_ids),
                DealFile.file_type == "photo",
                DealFile.category == "front",
                DealFile.thumbnail.isnot(None),
            )
            .order_by(DealFile.created_at.desc())
        )
        for row in thumb_result:
            if row.deal_id not in front_thumbs:
                front_thumbs[row.deal_id] = row.thumbnail

    # Batch-fetch liens for all deals
    liens_by_deal: dict[str, list[DealLien]] = {did: [] for did in deal_ids}
    if deal_ids:
        lien_result = await db.execute(
            select(DealLien)
            .where(DealLien.deal_id.in_(deal_ids), DealLien.user_id == workspace_user_id(user))
            .order_by(DealLien.sort_order, DealLien.created_at)
        )
        for lien in lien_result.scalars().all():
            liens_by_deal.setdefault(lien.deal_id, []).append(lien)

    result_list = []
    for d in deals:
        data = _deal_to_dict(d, liens=liens_by_deal.get(d.id, []))
        data["frontPhotoThumbnail"] = front_thumbs.get(d.id)
        result_list.append(data)
    return result_list


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
            CrmDeal.user_id == workspace_user_id(user),
            CrmDeal.is_deleted == False,
        )
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Load liens for this deal
    lien_result = await db.execute(
        select(DealLien)
        .where(DealLien.deal_id == deal_id, DealLien.user_id == workspace_user_id(user))
        .order_by(DealLien.sort_order, DealLien.created_at)
    )
    liens = lien_result.scalars().all()
    return _deal_to_dict(deal, liens=list(liens))


@crm_deals_router.post("", status_code=status.HTTP_201_CREATED)
async def create_deal(
    body: CreateDealBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new deal."""
    now = datetime.utcnow()
    deal = CrmDeal(user_id=workspace_user_id(user), created_at=now, updated_at=now)

    updates = body.model_dump(exclude_none=True)
    _apply_updates(deal, updates)

    # Default title to address when not explicitly provided
    if not deal.title and deal.address:
        deal.title = deal.address

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
            CrmDeal.user_id == workspace_user_id(user),
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
        "new_lead", "qualified", "active_buyer", "sent_deals", "negotiating", "funded", "inactive",
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
            CrmDeal.user_id == workspace_user_id(user),
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

    # When deal moves to "under_contract", find matching buyers and STORE them
    # (user reviews and manually sends emails from the deal detail page)
    if body.stage == "under_contract" and old_stage != "under_contract":
        asyncio.create_task(
            _store_matched_buyers(deal.id, workspace_user_id(user))
        )

    return {"detail": "Stage updated", "stage": deal.stage}


async def _store_matched_buyers(deal_id: str, user_id: int) -> None:
    """Background task: find matching buyers and store them for user review."""
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

            # Store each match as a pending record for user to review
            for buyer in matched:
                existing = await db.execute(
                    select(DealBuyerMatch).where(
                        DealBuyerMatch.deal_id == deal_id,
                        DealBuyerMatch.buyer_contact_id == buyer.contact_id,
                    )
                )
                if existing.scalar_one_or_none():
                    continue  # Already matched — skip duplicate

                match_record = DealBuyerMatch(
                    user_id=user_id,
                    deal_id=deal_id,
                    buyer_contact_id=buyer.contact_id,
                    buyer_name=buyer.name,
                    buyer_email=buyer.email,
                    buying_entity=buyer.buying_entity,
                    status="pending",
                )

                db.add(match_record)

            await db.commit()
            logger.info(
                "Stored %d buyer matches for deal %s (pending user review)",
                len(matched), deal_id,
            )
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
            CrmDeal.user_id == workspace_user_id(user),
        )
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal.is_deleted = True
    await db.commit()
    return {"detail": "Deal deleted"}
