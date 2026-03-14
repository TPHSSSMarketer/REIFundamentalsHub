"""CRM models — Contacts, Deals, and Portfolio Properties.

Each subscriber gets their own isolated CRM data via user_id FK.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from rei.database import Base


# ── Contact ────────────────────────────────────────────────


class CrmContact(Base):
    __tablename__ = "crm_contacts"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String, nullable=False, default="")
    first_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    role: Mapped[str] = mapped_column(String, nullable=False, default="seller")
    company: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    buying_entity: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # JSON-serialized string arrays
    tags_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default="[]")
    markets_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default="[]")

    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    preferred_channel: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    last_contacted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    interaction_count: Mapped[int] = mapped_column(Integer, default=0)
    date_added: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_activity: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=datetime.utcnow)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Buyer Criteria ─────────────────────────────────────────


class BuyerCriteria(Base):
    """Stores buyer/investor deal preferences for matching against deals."""
    __tablename__ = "buyer_criteria"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    buyer_contact_id: Mapped[str] = mapped_column(String, nullable=False, index=True)

    # JSON arrays of accepted values
    property_types_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default="[]")
    markets_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default="[]")
    conditions_accepted_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default="[]")
    financing_types_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default="[]")

    # Budget range
    min_budget: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    max_budget: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # Timeline & status
    timeline_to_purchase: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Deal ───────────────────────────────────────────────────


class CrmDeal(Base):
    __tablename__ = "crm_deals"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String, nullable=False, default="")
    address: Mapped[str] = mapped_column(String, nullable=False, default="")
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    zip: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    stage: Mapped[str] = mapped_column(String, nullable=False, default="lead", index=True)

    # Pricing & Valuation
    list_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    offer_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    purchase_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    arv: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # Acquisition Costs
    earnest_money: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    down_payment: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    closing_costs_buyer: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    loan_origination_fee: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    appraisal_fee: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    inspection_fee: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    title_insurance: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    attorney_fee: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    survey_fee: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    other_acquisition_costs: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # Rehab / Renovation
    rehab_estimate: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    rehab_actual: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    permit_fees: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    architect_fees: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    holding_costs_during_rehab: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # Financing
    loan_amount: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    interest_rate: Mapped[Optional[float]] = mapped_column(Numeric(8, 4), nullable=True)
    loan_term_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    monthly_mortgage_pi: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    pmi_monthly: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # Monthly Operating Expenses
    property_tax_annual: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    insurance_annual: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    property_mgmt_percent: Mapped[Optional[float]] = mapped_column(Numeric(8, 4), nullable=True)
    property_mgmt_flat: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    vacancy_percent: Mapped[Optional[float]] = mapped_column(Numeric(8, 4), nullable=True)
    maintenance_percent: Mapped[Optional[float]] = mapped_column(Numeric(8, 4), nullable=True)
    hoa_monthly: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    utilities_monthly: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    other_expenses_monthly: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # Income
    monthly_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    other_monthly_income: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # Computed / Summary
    all_in_cost: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    total_monthly_expenses: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    monthly_cash_flow: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    annual_cash_flow: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    cash_on_cash: Mapped[Optional[float]] = mapped_column(Numeric(8, 4), nullable=True)
    cap_rate: Mapped[Optional[float]] = mapped_column(Numeric(8, 4), nullable=True)
    roi_percent: Mapped[Optional[float]] = mapped_column(Numeric(8, 4), nullable=True)
    debt_service_coverage_ratio: Mapped[Optional[float]] = mapped_column(Numeric(8, 4), nullable=True)

    # Deal Info
    contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    offer_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    inspection_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    closing_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    passed_reason: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Property Details ──
    property_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bedrooms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bathrooms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    square_footage: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lot_size: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    year_built: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    garage: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    property_condition: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    occupancy_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    repairs_needed: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    special_features: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── ATTOM Property Data (auto-populated from property lookup) ──
    attom_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    apn: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # Assessor Parcel Number
    fips: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # County FIPS code
    county: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    subdivision: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    school_district: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    legal_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    zoning: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    lot_size_acres: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    stories: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    bathrooms_half: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_rooms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    basement_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    basement_sqft: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    construction_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    exterior_walls: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    roof_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    foundation_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    heating: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cooling: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    water_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sewer_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    pool: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    fireplace_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    parking_spaces: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    absentee_owner: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── ATTOM Owner / Mailing (auto-populated) ──
    owner_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    owner_name2: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    owner_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mailing_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mailing_city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mailing_state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mailing_zip: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── ATTOM Additional Property Fields ──
    census_tract: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    municipality: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    county_use_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tax_code_area: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    lot_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    parking_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    geo_accuracy: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── ATTOM Appraised Values ──
    appraised_total_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    appraised_land_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    appraised_improvement_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # ── ATTOM Calculated Values ──
    calc_total_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    calc_land_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    calc_improvement_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # ── ATTOM Tax Per Sqft ──
    tax_per_sqft: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # ── ATTOM Lot Detail ──
    lot_depth: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    lot_frontage: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── ATTOM Building Sizes ──
    building_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    gross_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # ── ATTOM Sale History JSON ──
    sale_history_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # ── ATTOM Lien/Mortgage Records JSON ──
    lien_records_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # ── ATTOM Tax / Valuation (auto-populated) ──
    market_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    market_land_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    market_improvement_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    assessed_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    assessed_land_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    assessed_improvement_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    tax_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # ── ATTOM Sale History (most recent, auto-populated) ──
    last_sale_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_sale_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    last_sale_buyer: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_sale_seller: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Raw ATTOM data (complete JSON dump for anything not mapped above) ──
    attom_raw_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Seller Motivation ──
    reason_for_selling: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    motivation_level: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    timeline_to_sell: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    asking_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    price_flexible: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    how_established_price: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    best_cash_offer: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    what_if_doesnt_sell: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    open_to_terms: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Listing Information ──
    is_listed: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    realtor_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    realtor_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    listing_expires: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    how_long_listed: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    any_offers: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    previous_offer_amount: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # ── Homeowner Financials ──
    # Liens are now stored in the DealLien model (dynamic, unlimited).
    # Only keeping back_taxes as a deal-level field since it's not a lien.
    back_taxes: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)

    # ── Foreclosure Details ──
    foreclosure_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    auction_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reinstatement_amount: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    attorney_involved: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    attorney_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    attorney_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Additional Valuation ──
    as_is_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    exit_strategy: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Multi-Unit Details (JSON) ──
    unit_details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # ── AI Underwriting ──
    underwriting_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=None)

    # ── AI Photo Analysis (overall property condition) ──
    property_condition_grade: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)  # A-F
    estimated_total_repairs: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True, default=None)

    # ── Geocoding ──
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ── Pipeline ──
    pipeline_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="pipeline-deals")

    # ── Buyer Linking ──
    buyer_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    buyer_name: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    buyer_type: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)  # investor, retail, wholesaler

    # ── Retail Buyer / Subject-To Details ──
    subject_to_interest: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)  # yes, no, maybe
    existing_loan_servicer: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    due_on_sale_aware: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)  # yes, no
    insurance_assignable: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)  # yes, no, unknown
    buyer_down_payment: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True, default=None)
    source_of_funds: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)

    # ── Marketing / Campaign Tracking ──
    campaign_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    campaign_type: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)  # email, sms, direct_mail
    campaign_name: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)  # denormalized for quick display

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Portfolio Property ─────────────────────────────────────


class CrmPortfolioProperty(Base):
    __tablename__ = "crm_portfolio_properties"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    address: Mapped[str] = mapped_column(String, nullable=False, default="")
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    zip: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    property_type: Mapped[str] = mapped_column(String, nullable=False, default="single_family")
    units: Mapped[int] = mapped_column(Integer, default=1)

    purchase_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    purchase_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    rehab_cost: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    current_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    loan_balance: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    monthly_mortgage: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    monthly_rent: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_deal_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)

    # ── Geocoding ──
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Deal Files (Photos + Documents) ───────────────────────


class DealFile(Base):
    """Stores photos and documents attached to a deal."""
    __tablename__ = "deal_files"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    deal_id: Mapped[str] = mapped_column(String, nullable=False, index=True)

    # "photo" or "document"
    file_type: Mapped[str] = mapped_column(String, nullable=False, default="photo")
    # Photo categories: front, back, kitchen, living_room, bedroom_1, bedroom_2, bedroom_3,
    #   bathroom_1, bathroom_2, garage, yard, miscellaneous
    # Document categories: contract, inspection, title, appraisal, insurance, disclosure, other
    category: Mapped[str] = mapped_column(String, nullable=False, default="miscellaneous")

    file_name: Mapped[str] = mapped_column(String, nullable=False, default="")
    mime_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # bytes
    file_content: Mapped[str] = mapped_column(Text, nullable=False)  # base64 encoded
    thumbnail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # base64 small thumbnail

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Transaction phase: buying, selling, holding (for document organization)
    transaction_phase: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)

    # AI Document Intelligence — stores analysis results as JSON
    analysis_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    analysis_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # pending/completed/failed
    # AI Photo Analysis — per-photo condition assessment
    photo_analysis_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Admin-only visibility flag — negotiation docs hidden from regular users
    admin_only: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── Deal Buyer Matches ────────────────────────────────────


class DealBuyerMatch(Base):
    """Stores matched buyers for a deal — user reviews before sending emails."""
    __tablename__ = "deal_buyer_matches"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    deal_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    buyer_contact_id: Mapped[str] = mapped_column(String, nullable=False)
    buyer_name: Mapped[str] = mapped_column(String, nullable=False, default="")
    buyer_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    buying_entity: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # "pending" = matched but not emailed, "sent" = email sent, "skipped" = user chose not to send
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── Market Zip Codes (SuperAdmin managed) ─────────────────


class ContentImage(Base):
    """Stores AI-generated images for ContentHub — serves via public URL for social media APIs."""
    __tablename__ = "content_images"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    platform: Mapped[str] = mapped_column(String, nullable=False)  # facebook, instagram, linkedin, youtube_thumb, blog, youtube_short
    topic: Mapped[str] = mapped_column(String, nullable=False, default="")
    prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")  # image generation prompt used
    image_b64: Mapped[str] = mapped_column(Text, nullable=False)  # base64-encoded PNG
    mime_type: Mapped[str] = mapped_column(String, nullable=False, default="image/png")
    width: Mapped[int] = mapped_column(Integer, nullable=False, default=1024)
    height: Mapped[int] = mapped_column(Integer, nullable=False, default=1024)

    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # 7 days from creation
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ContentEntry(Base):
    """Stores all ContentHub source articles, generated waterfall content, and inspiration.

    Has its OWN embedding system (ContentEmbedding) — separate from Voice AI RAG.
    """
    __tablename__ = "content_entries"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Classification
    content_type: Mapped[str] = mapped_column(String, nullable=False)  # source_article, waterfall, inspiration
    platform: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # facebook, instagram, etc.

    # Source info
    source_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Content
    topic: Mapped[str] = mapped_column(String, nullable=False, default="")
    content_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Full waterfall JSON

    # Tags & categorization
    tags_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")  # JSON array

    # Performance tracking
    rating: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # worked, flopped, pending
    performance_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    engagement_count: Mapped[int] = mapped_column(Integer, default=0)

    # Multi-Business scoping
    business_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    content_type_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    audience_segment_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ContentPublishRecord(Base):
    """Tracks when and where content was published to social platforms."""
    __tablename__ = "content_publish_records"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content_entry_id: Mapped[str] = mapped_column(String, nullable=False, index=True)

    platform: Mapped[str] = mapped_column(String, nullable=False)
    platform_post_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="success")  # success, pending, failed
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Engagement metrics (updated later)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    views: Mapped[int] = mapped_column(Integer, default=0)

    # Multi-Business scoping
    business_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    wordpress_site_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    published_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ContentEmbedding(Base):
    """Vector embeddings for ContentHub semantic search — SEPARATE from Voice AI RAG."""
    __tablename__ = "content_embeddings"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    content_entry_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    embedding: Mapped[str] = mapped_column(Text, nullable=False)  # JSON list of 384 floats
    model_name: Mapped[str] = mapped_column(String, default="all-MiniLM-L6-v2")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MarketZipCode(Base):
    """Maps zip codes to market names. Managed by SuperAdmin via CSV upload."""
    __tablename__ = "market_zip_codes"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    zip_code: Mapped[str] = mapped_column(String, nullable=False, index=True, unique=True)
    market_name: Mapped[str] = mapped_column(String, nullable=False)
    state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
