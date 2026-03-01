"""CRM models — Contacts, Deals, and Portfolio Properties.

Each subscriber gets their own isolated CRM data via user_id FK.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
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
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # JSON-serialized string arrays
    tags_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")
    markets_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")

    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    preferred_channel: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    last_contacted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    interaction_count: Mapped[int] = mapped_column(Integer, default=0)
    date_added: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_activity: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=datetime.utcnow)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
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
    stage: Mapped[str] = mapped_column(String, nullable=False, default="lead")

    # Pricing & Valuation
    list_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    offer_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    purchase_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    arv: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Acquisition Costs
    earnest_money: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    down_payment: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    closing_costs_buyer: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loan_origination_fee: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    appraisal_fee: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    inspection_fee: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    title_insurance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    attorney_fee: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    survey_fee: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    other_acquisition_costs: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Rehab / Renovation
    rehab_estimate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rehab_actual: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    permit_fees: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    architect_fees: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    holding_costs_during_rehab: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Financing
    loan_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    interest_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loan_term_months: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    monthly_mortgage_pi: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pmi_monthly: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Monthly Operating Expenses
    property_tax_annual: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    insurance_annual: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    property_mgmt_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    property_mgmt_flat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    vacancy_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    maintenance_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hoa_monthly: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    utilities_monthly: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    other_expenses_monthly: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Income
    monthly_rent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    other_monthly_income: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Computed / Summary
    all_in_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_monthly_expenses: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    monthly_cash_flow: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    annual_cash_flow: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cash_on_cash: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cap_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    roi_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    debt_service_coverage_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

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

    # ── Seller Motivation ──
    reason_for_selling: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    motivation_level: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    timeline_to_sell: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    asking_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    price_flexible: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    how_established_price: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    best_cash_offer: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    what_if_doesnt_sell: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    open_to_terms: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Listing Information ──
    is_listed: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    realtor_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    realtor_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    listing_expires: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    how_long_listed: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    any_offers: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    previous_offer_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ── Homeowner Financials ──
    mortgage_balance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    mortgage_balance_2nd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    monthly_mortgage_payment: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    taxes_insurance_included: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    monthly_tax_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    monthly_insurance_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    interest_rate_1st: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    interest_rate_2nd: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loan_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    prepayment_penalty: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mortgage_company_1st: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    mortgage_company_2nd: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    payments_current: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    months_behind: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    amount_behind: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    back_taxes: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    other_liens: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    other_lien_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ── Foreclosure Details ──
    foreclosure_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    auction_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reinstatement_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    attorney_involved: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    attorney_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    attorney_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Additional Valuation ──
    as_is_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    exit_strategy: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Multi-Unit Details (JSON) ──
    unit_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

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
    buyer_down_payment: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=None)
    source_of_funds: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
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
    purchase_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rehab_cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loan_balance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    monthly_mortgage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    monthly_rent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
