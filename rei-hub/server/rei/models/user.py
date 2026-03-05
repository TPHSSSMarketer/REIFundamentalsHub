"""User and Subscription SQLAlchemy models."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from rei.database import Base

_TRIAL_DAYS = 7


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Subscription fields (inline on user) ──────────────────────────
    plan: Mapped[str] = mapped_column(String, default="starter")
    billing_interval: Mapped[str] = mapped_column(String, default="monthly")
    subscription_status: Mapped[str] = mapped_column(String, default="trialing")
    trial_ends_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True, default=lambda: datetime.utcnow() + timedelta(days=_TRIAL_DAYS)
    )
    subscription_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String, nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String, nullable=True)
    paypal_subscription_id: Mapped[str | None] = mapped_column(String, nullable=True)
    helm_addon_active: Mapped[bool] = mapped_column(Boolean, default=False)  # DEPRECATED — kept for DB compatibility
    helm_addon_billing_interval: Mapped[str | None] = mapped_column(String, nullable=True)  # DEPRECATED — kept for DB compatibility
    seats_used: Mapped[int] = mapped_column(Integer, default=1)
    trial_reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Onboarding ─────────────────────────────────────────────
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_step: Mapped[int] = mapped_column(Integer, default=0)
    # tracks last completed step (1-6)

    # ── Company / Documents ──────────────────────────────────────
    company_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    company_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    company_city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    company_state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    company_zip: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    company_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    company_website: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Investing Profile ────────────────────────────────────────
    investing_experience: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # "beginner", "intermediate", "experienced"
    deal_types: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # JSON list: ["subject_to", "cash_purchase", "owner_financing", "lease_option", "fix_and_flip"]
    primary_market: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # city/state they invest in
    storage_provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # "google_drive" or "dropbox" — chosen during onboarding

    # ── Plaid (Proof of Funds) ────────────────────────────────────
    plaid_access_token: Mapped[str | None] = mapped_column(String, nullable=True)
    plaid_linked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # ── Email Marketing credits ───────────────────────────────────
    email_credits_used: Mapped[int] = mapped_column(Integer, default=0)
    email_credits_reset_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )

    # ── Phone System ───────────────────────────────────────────────
    phone_minutes_used: Mapped[int] = mapped_column(Integer, default=0)
    phone_sms_used: Mapped[int] = mapped_column(Integer, default=0)
    phone_credits_cents: Mapped[int] = mapped_column(Integer, default=0)
    # NEVER resets — rolls over indefinitely
    phone_usage_reset_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    twilio_subaccount_sid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    twilio_subaccount_auth_token: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )

    # ── Notification Preferences ──────────────────────────────────
    lead_email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)

    # ── Deal Analyzer Preferences ─────────────────────────────────
    analyzer_arv_multiplier: Mapped[float] = mapped_column(
        Float, default=0.70)
    analyzer_default_closing_costs_pct: Mapped[float] = mapped_column(
        Float, default=0.03)
    analyzer_default_agent_commission_pct: Mapped[float] = mapped_column(
        Float, default=0.06)
    analyzer_default_holding_months: Mapped[int] = mapped_column(
        Integer, default=6)
    analyzer_default_monthly_holding_cost: Mapped[float] = mapped_column(
        Float, default=1000.00)
    analyzer_min_profit: Mapped[float] = mapped_column(
        Float, default=20000.00)
    analyzer_min_roi_pct: Mapped[float] = mapped_column(
        Float, default=0.15)
    analyzer_sub2_default_interest_rate: Mapped[float] = mapped_column(
        Float, default=0.04)
    analyzer_sub2_default_rental_income: Mapped[float] = mapped_column(
        Float, default=1500.00)
    analyzer_sub2_default_vacancy_pct: Mapped[float] = mapped_column(
        Float, default=0.08)
    analyzer_sub2_default_mgmt_pct: Mapped[float] = mapped_column(
        Float, default=0.10)
    analyzer_of_default_interest_rate: Mapped[float] = mapped_column(
        Float, default=0.06)
    analyzer_of_default_term_years: Mapped[int] = mapped_column(
        Integer, default=30)
    analyzer_of_default_down_pct: Mapped[float] = mapped_column(
        Float, default=0.10)
    analyzer_lo_default_option_term_years: Mapped[int] = mapped_column(
        Integer, default=3)
    analyzer_lo_default_monthly_credit_pct: Mapped[float] = mapped_column(
        Float, default=0.20)
    analyzer_blend_cash_pct: Mapped[float] = mapped_column(
        Float, default=0.50)

    # ── Google Calendar ──────────────────────────────────────────
    google_calendar_token: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # JSON OAuth token
    google_calendar_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )
    google_calendar_sync: Mapped[bool] = mapped_column(
        Boolean, default=False
    )

    # ── Microsoft Outlook ─────────────────────────────────────────
    outlook_calendar_token: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # JSON OAuth token
    outlook_calendar_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )
    outlook_calendar_sync: Mapped[bool] = mapped_column(
        Boolean, default=False
    )

    # ── Apple iCal (CalDAV) ───────────────────────────────────────
    caldav_username: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )
    caldav_password_encrypted: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # AES encrypted iCloud app-specific password
    caldav_calendar_url: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )
    caldav_sync: Mapped[bool] = mapped_column(
        Boolean, default=False
    )

    # ── Universal iCal feed ───────────────────────────────────────
    ical_feed_token: Mapped[str] = mapped_column(
        String, default=lambda: str(uuid.uuid4())
    )  # unique token for public .ics feed URL

    # ── Reminder preferences ──────────────────────────────────────
    task_reminder_email: Mapped[bool] = mapped_column(
        Boolean, default=True
    )
    task_reminder_sms: Mapped[bool] = mapped_column(
        Boolean, default=False
    )

    # ── AI Provider override (if admin allows) ──────────────────
    ai_provider_override: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # NULL = use global, set = use this provider
    ai_model_override: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    ai_own_anthropic_key: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # Encrypted — user's own Anthropic key
    ai_own_nvidia_key: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # Encrypted — user's own NVIDIA key
    ai_override_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False)

    # ── Per-User AI Usage Tracking ────────────────────────────
    ai_total_requests: Mapped[int] = mapped_column(
        Integer, default=0)
    ai_total_tokens: Mapped[int] = mapped_column(
        Integer, default=0)
    ai_last_request_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    ai_cost_cents: Mapped[int] = mapped_column(
        Integer, default=0)
    # Cumulative AI cost in cents for current billing period
    ai_cost_reset_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    # When the cost counter last reset (start of current month)
    ai_reminder_75_sent: Mapped[bool] = mapped_column(
        Boolean, default=False)
    # True once we've emailed about 75% usage (25% remaining)
    ai_reminder_90_sent: Mapped[bool] = mapped_column(
        Boolean, default=False)
    # True once we've emailed about 90% usage (10% remaining)
    ai_reminder_95_sent: Mapped[bool] = mapped_column(
        Boolean, default=False)
    # True once we've emailed about 95% usage (5% remaining)

    # ── Loan Servicing ─────────────────────────────────────────
    loan_servicing_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False)
    loan_servicing_onboarding_complete: Mapped[bool] = mapped_column(
        Boolean, default=False)
    stripe_connect_account_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    stripe_connect_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False)
    is_superadmin: Mapped[bool] = mapped_column(
        Boolean, default=False)
    is_complimentary: Mapped[bool] = mapped_column(
        Boolean, default=False)

    # ── Team / Seat Management ─────────────────────────────────
    owner_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # NULL = account owner, non-NULL = team member under that owner

    # ── Bank Negotiation ────────────────────────────────────────
    bank_negotiation_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False)

    # ── Google OAuth Login ───────────────────────────────────────
    google_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, unique=True)
    google_avatar_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Google Drive (per-user) ──────────────────────────────────
    google_drive_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON OAuth token
    google_drive_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Dropbox (per-user) ───────────────────────────────────────
    dropbox_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dropbox_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Social Media (per-user OAuth tokens) ───────────────────
    facebook_page_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: page_id, access_token, page_name
    facebook_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    linkedin_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: access_token, expires_at
    linkedin_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    x_twitter_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: access_token, refresh_token
    x_twitter_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    instagram_token: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON: ig_user_id (uses facebook page token)
    instagram_connected: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Loan Servicing Tenant Config ──────────────────────────

    # Stripe Connect (per business)
    loan_stripe_connect_account_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    loan_stripe_connect_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False)
    loan_stripe_publishable_key: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)

    # Company branding (for payment portal)
    loan_company_name: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # e.g. "TriPoint Home Solutions"
    # Falls back to user's company name

    loan_company_logo_url: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # URL to company logo for portal header

    loan_portal_primary_color: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, default="#1B3A6B")
    # Hex color for portal branding

    # Distribution settings (per business)
    loan_default_investor_pct: Mapped[float] = mapped_column(
        Float, default=4.0)
    # Default investor distribution %
    # Was hardcoded to 4% — now per business

    # REI Hub platform servicing fee
    loan_servicing_fee_pct: Mapped[float] = mapped_column(
        Float, default=0.0)
    # % of each payment taken by REI Hub
    # Set by superadmin per business
    # e.g. 1.5 = 1.5% of each collection

    loan_servicing_fee_stripe_account: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # REI Hub's Stripe account ID
    # for receiving platform fees
    # Set globally via config but stored
    # per user for audit trail

    # Legacy subscription relationship (kept for backwards compat)
    subscription: Mapped[Subscription | None] = relationship(
        "Subscription", back_populates="user", uselist=False
    )


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), unique=True, nullable=False
    )
    plan: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String, nullable=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String, nullable=True)
    paypal_subscription_id: Mapped[str | None] = mapped_column(String, nullable=True)
    helm_addon: Mapped[bool] = mapped_column(Boolean, default=False)  # DEPRECATED — kept for DB compatibility
    billing_cycle: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped[User] = relationship("User", back_populates="subscription")


class Invitation(Base):
    """Pending team-member invitations."""

    __tablename__ = "invitations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String, nullable=False)
    token: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pending")
    # "pending", "accepted", "expired", "canceled"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    joined_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )


class ProofOfFundsCertificate(Base):
    __tablename__ = "pof_certificates"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    verified: Mapped[bool] = mapped_column(Boolean)
    buyer_name: Mapped[str] = mapped_column(String)
    buyer_email: Mapped[str] = mapped_column(String)
    required_amount: Mapped[float] = mapped_column(Float)
    available_balance_display: Mapped[str] = mapped_column(String)
    property_address: Mapped[str] = mapped_column(String)
    issued_at: Mapped[datetime] = mapped_column(DateTime)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    certificate_data: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PofRequest(Base):
    __tablename__ = "pof_requests"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    requestor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    buyer_email: Mapped[str] = mapped_column(String)
    buyer_name: Mapped[str] = mapped_column(String)
    property_address: Mapped[str] = mapped_column(String)
    required_amount: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String, default="pending")
    request_token: Mapped[str] = mapped_column(String, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    certificate_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    deal_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DocumentTemplate(Base):
    __tablename__ = "document_templates"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String)
    file_name: Mapped[str] = mapped_column(String)
    file_content: Mapped[str] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    merge_fields: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class GeneratedContract(Base):
    __tablename__ = "generated_contracts"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    template_id: Mapped[str] = mapped_column(ForeignKey("document_templates.id"))
    deal_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    file_name: Mapped[str] = mapped_column(String)
    homeowner_name: Mapped[str] = mapped_column(String)
    buying_entity: Mapped[str] = mapped_column(String)
    property_address: Mapped[str] = mapped_column(String)
    purchase_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    closing_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    emd_amount: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    additional_clauses: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    custom_fields: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    storage_provider: Mapped[str] = mapped_column(String)
    storage_path: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    storage_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ContractChecklistTemplate(Base):
    __tablename__ = "contract_checklist_templates"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

# ═══════════════════════════════════════════════════════════════
# Email Marketing models
# ═══════════════════════════════════════════════════════════════


class EmailDomain(Base):
    __tablename__ = "email_domains"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    domain: Mapped[str] = mapped_column(String)
    from_name: Mapped[str] = mapped_column(String)
    from_email: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="pending")
    # pending, verified, failed
    provider: Mapped[str] = mapped_column(String)
    provider_domain_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    dns_records: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EmailList(Base):
    __tablename__ = "email_lists"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    deal_type: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    document_template_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DealContractChecklist(Base):
    __tablename__ = "deal_contract_checklists"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )
    name: Mapped[str] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    subscriber_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EmailSubscriber(Base):
    __tablename__ = "email_subscribers"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    deal_id: Mapped[str] = mapped_column(String)
    checklist_template_id: Mapped[str] = mapped_column(
        ForeignKey("contract_checklist_templates.id")
    )
    name: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="not_started")
    document_template_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    generated_contract_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    signed_file_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    signed_file_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    list_id: Mapped[str] = mapped_column(ForeignKey("email_lists.id"))
    email: Mapped[str] = mapped_column(String)
    first_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="subscribed")
    # subscribed, unsubscribed, bounced, complained
    contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    custom_fields: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subscribed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    unsubscribed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    subject: Mapped[str] = mapped_column(String)
    preview_text: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    html_content: Mapped[str] = mapped_column(Text)
    plain_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String, default="custom")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class LetterOfIntent(Base):
    __tablename__ = "letters_of_intent"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )


class EmailCampaign(Base):
    __tablename__ = "email_campaigns"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    subject: Mapped[str] = mapped_column(String)
    preview_text: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    html_content: Mapped[str] = mapped_column(Text)
    plain_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    from_domain_id: Mapped[str] = mapped_column(ForeignKey("email_domains.id"))
    list_id: Mapped[str] = mapped_column(ForeignKey("email_lists.id"))
    status: Mapped[str] = mapped_column(String, default="draft")
    # draft, scheduled, sending, sent, paused
    provider_used: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    total_sent: Mapped[int] = mapped_column(Integer, default=0)
    total_delivered: Mapped[int] = mapped_column(Integer, default=0)
    total_opened: Mapped[int] = mapped_column(Integer, default=0)
    total_clicked: Mapped[int] = mapped_column(Integer, default=0)
    total_bounced: Mapped[int] = mapped_column(Integer, default=0)
    total_unsubscribed: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EmailSequence(Base):
    __tablename__ = "email_sequences"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    list_id: Mapped[str] = mapped_column(ForeignKey("email_lists.id"))
    from_domain_id: Mapped[str] = mapped_column(ForeignKey("email_domains.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EmailSequenceStep(Base):
    __tablename__ = "email_sequence_steps"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    sequence_id: Mapped[str] = mapped_column(ForeignKey("email_sequences.id"))
    step_number: Mapped[int] = mapped_column(Integer)
    delay_days: Mapped[int] = mapped_column(Integer, default=0)
    subject: Mapped[str] = mapped_column(String)
    html_content: Mapped[str] = mapped_column(Text)
    plain_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class EmailSequenceEnrollment(Base):
    __tablename__ = "email_sequence_enrollments"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    sequence_id: Mapped[str] = mapped_column(ForeignKey("email_sequences.id"))
    subscriber_id: Mapped[str] = mapped_column(ForeignKey("email_subscribers.id"))
    current_step: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String, default="active")
    next_send_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    enrolled_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ═══════════════════════════════════════════════════════════════
# Phone System models
# ═══════════════════════════════════════════════════════════════


class PhoneNumber(Base):
    __tablename__ = "phone_numbers"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    number: Mapped[str] = mapped_column(String)  # E.164 e.g. +15551234567
    friendly_name: Mapped[str] = mapped_column(String)
    twilio_sid: Mapped[str] = mapped_column(String)
    number_type: Mapped[str] = mapped_column(String)  # "local", "toll_free"
    capabilities: Mapped[str] = mapped_column(String)  # JSON list: ["voice","sms","fax"]
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    forward_to: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    use_softphone: Mapped[bool] = mapped_column(Boolean, default=False)
    monthly_cost: Mapped[float] = mapped_column(Float, default=0.00)
    status: Mapped[str] = mapped_column(String, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


    # ── AI Call Routing ──────────────────────────────────────────
    ai_mode: Mapped[str] = mapped_column(
        String, default="off"
    )  # "off", "always", "when_unavailable", "after_hours"
    ai_agent_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # DEPRECATED — use persona_id instead
    persona_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # FK to personas — which persona handles calls for this number
    ring_targets: Mapped[str] = mapped_column(
        String, default='["softphone"]'
    )  # JSON: ["softphone"], ["cell"], or ["softphone", "cell"]
    cell_forward_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # Cell phone number to ring when ring_targets includes "cell"
    ai_schedule: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # JSON: {"start": "09:00", "end": "17:00", "timezone": "America/New_York", "days": [1,2,3,4,5]}
    user_available: Mapped[bool] = mapped_column(
        Boolean, default=True
    )  # Toggle: is the user available to take calls right now?

    # ── Ring Schedule (when softphone/cell should ring) ──────────
    ring_schedule: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # JSON: controls when each device rings. Example:
    # {
    #   "softphone": {"days": [1,2,3,4,5], "start": "08:00", "end": "20:00"},
    #   "cell":      {"days": [1,2,3,4,5], "start": "09:00", "end": "18:00"},
    #   "timezone":  "America/New_York"
    # }
    # Outside these windows, that device won't ring (AI handles instead)


class CallLog(Base):
    __tablename__ = "call_logs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone_number_id: Mapped[str] = mapped_column(ForeignKey("phone_numbers.id"))
    twilio_call_sid: Mapped[str] = mapped_column(String)
    direction: Mapped[str] = mapped_column(String)  # "inbound", "outbound"
    from_number: Mapped[str] = mapped_column(String)
    to_number: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    recording_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    recording_sid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    transcription: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    disposition: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cost: Mapped[float] = mapped_column(Float, default=0.00)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SmsMessage(Base):
    __tablename__ = "sms_messages"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone_number_id: Mapped[str] = mapped_column(ForeignKey("phone_numbers.id"))
    twilio_message_sid: Mapped[str] = mapped_column(String)
    direction: Mapped[str] = mapped_column(String)  # "inbound", "outbound"
    from_number: Mapped[str] = mapped_column(String)
    to_number: Mapped[str] = mapped_column(String)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String)
    campaign_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cost: Mapped[float] = mapped_column(Float, default=0.00)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SmsCampaign(Base):
    __tablename__ = "sms_campaigns"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    message_template: Mapped[str] = mapped_column(Text)
    phone_number_id: Mapped[str] = mapped_column(ForeignKey("phone_numbers.id"))
    list_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_numbers: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON list of phone numbers, e.g. '["+15551234567","+15559876543"]'
    status: Mapped[str] = mapped_column(String, default="draft")
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    total_sent: Mapped[int] = mapped_column(Integer, default=0)
    total_delivered: Mapped[int] = mapped_column(Integer, default=0)
    total_replied: Mapped[int] = mapped_column(Integer, default=0)
    total_opted_out: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0.00)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class VoicemailDrop(Base):
    __tablename__ = "voicemail_drops"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    drop_type: Mapped[str] = mapped_column(String)  # "recorded","uploaded","ai_personalized"
    audio_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    script_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    elevenlabs_voice_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_ai_personalized: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class VoicemailDropCampaign(Base):
    __tablename__ = "voicemail_drop_campaigns"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    voicemail_drop_id: Mapped[str] = mapped_column(ForeignKey("voicemail_drops.id"))
    phone_number_id: Mapped[str] = mapped_column(ForeignKey("phone_numbers.id"))
    status: Mapped[str] = mapped_column(String, default="draft")
    total_sent: Mapped[int] = mapped_column(Integer, default=0)
    total_delivered: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0.00)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FaxLog(Base):
    __tablename__ = "fax_logs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    twilio_fax_sid: Mapped[str] = mapped_column(String)
    direction: Mapped[str] = mapped_column(String)  # "inbound", "outbound"
    from_number: Mapped[str] = mapped_column(String)
    to_number: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String)
    pages: Mapped[int] = mapped_column(Integer, default=0)
    media_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    deal_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, default=None)
    cost: Mapped[float] = mapped_column(Float, default=0.00)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class DealAnalyzerResult(Base):
    __tablename__ = "deal_analyzer_results"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    deal_id: Mapped[str] = mapped_column(String, nullable=False)
    analyzer_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class DealNote(Base):
    __tablename__ = "deal_notes"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    deal_id: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PhoneCredit(Base):
    __tablename__ = "phone_credits"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    deal_id: Mapped[str] = mapped_column(String)
    included_options: Mapped[str] = mapped_column(String)
    homeowner_name: Mapped[str] = mapped_column(String)
    property_address: Mapped[str] = mapped_column(String)
    purchase_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    as_is_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    existing_mortgage_balance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    monthly_payment: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    interest_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    owner_finance_down: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lease_option_term: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    lease_monthly_payment: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    option_purchase_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    additional_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    generated_file_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    storage_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    bundle_name: Mapped[str] = mapped_column(String)  # "starter","growth","power"
    amount_paid_cents: Mapped[int] = mapped_column(Integer)
    credits_cents: Mapped[int] = mapped_column(Integer)
    credits_remaining_cents: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════
# Calendar & Task Management models
# ═══════════════════════════════════════════════════════════════


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")
    # pending, in_progress, completed, cancelled
    priority: Mapped[str] = mapped_column(String, default="medium")
    # low, medium, high, urgent
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    due_time: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    deal_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    call_log_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    task_type: Mapped[str] = mapped_column(String, default="manual")
    # manual, callback, closing, pof_expiry, contract_deadline, follow_up, appointment
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    recurrence_rule: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    reminder_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    event_type: Mapped[str] = mapped_column(String, default="appointment")
    # appointment, closing, follow_up, callback, reminder, task
    start_datetime: Mapped[datetime] = mapped_column(DateTime)
    end_datetime: Mapped[datetime] = mapped_column(DateTime)
    all_day: Mapped[bool] = mapped_column(Boolean, default=False)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    deal_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    task_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Google Calendar
    google_event_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    google_calendar_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Microsoft Outlook
    outlook_event_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # CalDAV (Apple iCal)
    caldav_uid: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # UUID used as CalDAV event UID
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    reminder_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    recurrence_rule: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════
# AI Provider Configuration
# ═══════════════════════════════════════════════════════════════


class AIProviderConfig(Base):
    __tablename__ = "ai_provider_configs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4()))

    # NULL = global config, user_id = per-user
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True)

    # Active provider: anthropic, nvidia_kimi, nvidia_minimax, nvidia_aiq
    active_provider: Mapped[str] = mapped_column(
        String, default="anthropic")

    # Active model per provider
    active_model: Mapped[str] = mapped_column(
        String, default="claude-sonnet-4-6")

    # Admin API keys (encrypted)
    anthropic_api_key: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    nvidia_api_key: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # One NVIDIA key works for all NVIDIA models

    # Per-user override settings
    allow_user_override: Mapped[bool] = mapped_column(
        Boolean, default=False)
    # If True: user can select their own provider
    user_can_bring_own_key: Mapped[bool] = mapped_column(
        Boolean, default=False)
    # If True: user can enter their own API keys

    # Usage tracking
    total_requests: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════
# Loan Servicing models
# ═══════════════════════════════════════════════════════════════


class LandTrust(Base):
    __tablename__ = "land_trusts"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    trust_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    trustee: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    beneficiary: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    state: Mapped[str] = mapped_column(String)
    property_address: Mapped[str] = mapped_column(String)
    property_city: Mapped[str] = mapped_column(String)
    property_state: Mapped[str] = mapped_column(String)
    property_zip: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(
        String, default="potential")
    gdrive_folder_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    state_law_research: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    state_law_researched_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    state_law_provider: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    admin_notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    loan_servicing_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False)
    bank_negotiation_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class ContractForDeed(Base):
    __tablename__ = "contracts_for_deed"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    land_trust_id: Mapped[str] = mapped_column(
        ForeignKey("land_trusts.id"))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))
    account_number: Mapped[str] = mapped_column(
        String, unique=True)
    buyer_name: Mapped[str] = mapped_column(String)
    buyer_email: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    buyer_phone: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    buyer_mailing_address: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    purchase_price: Mapped[float] = mapped_column(Float)
    down_payment: Mapped[float] = mapped_column(
        Float, default=0.0)
    loan_amount: Mapped[float] = mapped_column(Float)
    interest_rate: Mapped[float] = mapped_column(Float)
    term_months: Mapped[int] = mapped_column(Integer)
    monthly_payment: Mapped[float] = mapped_column(Float)
    has_balloon: Mapped[bool] = mapped_column(
        Boolean, default=False)
    balloon_month: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True)
    balloon_amount: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True)
    start_date: Mapped[datetime] = mapped_column(DateTime)
    maturity_date: Mapped[datetime] = mapped_column(DateTime)
    first_payment_date: Mapped[datetime] = mapped_column(
        DateTime)
    current_balance: Mapped[float] = mapped_column(Float)
    total_paid: Mapped[float] = mapped_column(
        Float, default=0.0)
    total_interest_paid: Mapped[float] = mapped_column(
        Float, default=0.0)
    late_fee_amount: Mapped[float] = mapped_column(
        Float, default=50.0)
    late_fee_days: Mapped[int] = mapped_column(
        Integer, default=15)
    status: Mapped[str] = mapped_column(
        String, default="active")
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True)
    stripe_customer_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    payment_method: Mapped[str] = mapped_column(
        String, default="stripe")
    has_underlying_mortgage: Mapped[bool] = mapped_column(
        Boolean, default=False)
    mortgage_servicer: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    mortgage_balance: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True)
    mortgage_monthly_payment: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True)
    mortgage_account_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class LoanPayment(Base):
    __tablename__ = "loan_payments"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    cfd_id: Mapped[str] = mapped_column(
        ForeignKey("contracts_for_deed.id"))
    land_trust_id: Mapped[str] = mapped_column(
        ForeignKey("land_trusts.id"))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))
    amount: Mapped[float] = mapped_column(Float)
    principal_portion: Mapped[float] = mapped_column(
        Float, default=0.0)
    interest_portion: Mapped[float] = mapped_column(
        Float, default=0.0)
    late_fee_portion: Mapped[float] = mapped_column(
        Float, default=0.0)
    payment_date: Mapped[datetime] = mapped_column(DateTime)
    due_date: Mapped[datetime] = mapped_column(DateTime)
    is_late: Mapped[bool] = mapped_column(
        Boolean, default=False)
    days_late: Mapped[int] = mapped_column(
        Integer, default=0)
    payment_method: Mapped[str] = mapped_column(String)
    stripe_payment_intent_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    stripe_charge_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    reference_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    status: Mapped[str] = mapped_column(
        String, default="pending")
    balance_after: Mapped[float] = mapped_column(Float)
    servicing_fee_amount: Mapped[float] = mapped_column(
        Float, default=0.0)
    servicing_fee_pct: Mapped[float] = mapped_column(
        Float, default=0.0)
    net_amount: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True)
    # amount - servicing_fee_amount
    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class LoanDefault(Base):
    __tablename__ = "loan_defaults"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    cfd_id: Mapped[str] = mapped_column(
        ForeignKey("contracts_for_deed.id"))
    land_trust_id: Mapped[str] = mapped_column(
        ForeignKey("land_trusts.id"))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))
    default_date: Mapped[datetime] = mapped_column(DateTime)
    missed_payment_amount: Mapped[float] = mapped_column(Float)
    total_amount_due: Mapped[float] = mapped_column(Float)
    notice_1_type: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    notice_1_sent_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    notice_1_cure_deadline: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    notice_1_document_url: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    notice_2_type: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    notice_2_sent_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    notice_2_cure_deadline: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    notice_2_document_url: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    status: Mapped[str] = mapped_column(
        String, default="active")
    cured_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    cured_amount: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True)
    eviction_filed_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    eviction_status: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class Investor(Base):
    __tablename__ = "investors"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    admin_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    email: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    entity_name: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    distribution_percentage: Mapped[float] = mapped_column(
        Float, default=4.0)
    payment_method: Mapped[str] = mapped_column(
        String, default="check")
    bank_name: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    routing_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    account_number_bank: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True)
    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class DistributionStatement(Base):
    __tablename__ = "distribution_statements"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    admin_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))
    period_type: Mapped[str] = mapped_column(String)
    period_start: Mapped[datetime] = mapped_column(DateTime)
    period_end: Mapped[datetime] = mapped_column(DateTime)
    quarter: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    total_collected: Mapped[float] = mapped_column(
        Float, default=0.0)
    total_late_fees: Mapped[float] = mapped_column(
        Float, default=0.0)
    total_investor_distributions: Mapped[float] = mapped_column(
        Float, default=0.0)
    total_entity_distribution: Mapped[float] = mapped_column(
        Float, default=0.0)
    property_breakdown: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    investor_breakdown: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String, default="draft")
    distributed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    gdrive_url: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class StateLawResearch(Base):
    __tablename__ = "state_law_research"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    state: Mapped[str] = mapped_column(
        String, unique=True)
    contract_for_deed: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    owner_finance: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    subject_to: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    rent_to_own: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    eviction_timeline: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    foreclosure_process: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    payment_collection: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    citations: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    researched_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)
    researched_by_provider: Mapped[str] = mapped_column(
        String, default="nvidia_aiq")
    last_updated: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)
    is_verified: Mapped[bool] = mapped_column(
        Boolean, default=False)


# ═══════════════════════════════════════════════
# Bank Negotiation Models
# ═══════════════════════════════════════════════


class BankNegotiation(Base):
    __tablename__ = "bank_negotiations"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))

    # Can link to existing LandTrust
    # A property can be in BOTH loan servicing
    # AND bank negotiation simultaneously
    land_trust_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # Not a FK — optional link

    # Property info (duplicated here in case
    # no land trust exists yet)
    property_address: Mapped[str] = mapped_column(
        String)
    property_city: Mapped[str] = mapped_column(
        String)
    property_state: Mapped[str] = mapped_column(
        String)
    property_zip: Mapped[str] = mapped_column(
        String)

    # Bank / Servicer info
    bank_name: Mapped[str] = mapped_column(String)
    loan_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    loan_balance: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True)

    # Negotiation type
    negotiation_type: Mapped[str] = mapped_column(
        String, default="short_sale")
    # short_sale, loan_modification,
    # deed_in_lieu, payoff, other

    # Our position
    our_offer: Mapped[Optional[float]] = mapped_column(
        Float, nullable=True)
    target_outcome: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)

    # Status
    status: Mapped[str] = mapped_column(
        String, default="active")
    # active, pending_response, approved,
    # denied, withdrawn, completed

    # Google Drive
    gdrive_folder_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)

    # Admin notes (superadmin only)
    admin_notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)

    # Feature flag — admin enables per user
    bank_negotiation_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False)

    # Next follow-up date (auto-set 30 days
    # after last correspondence)
    next_followup_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class NegotiationRecipient(Base):
    __tablename__ = "negotiation_recipients"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    negotiation_id: Mapped[str] = mapped_column(
        ForeignKey("bank_negotiations.id"))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))

    # Recipient type
    recipient_type: Mapped[str] = mapped_column(
        String)
    # ceo, general_counsel,
    # registered_agent, respa_address

    # Contact info (AI researched)
    name: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    title: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # e.g. "Chief Executive Officer"

    # Full contact profile
    mailing_address: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    mailing_city: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    mailing_state: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    mailing_zip: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    fax: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)

    # AI research metadata
    ai_researched: Mapped[bool] = mapped_column(
        Boolean, default=False)
    ai_researched_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    ai_research_provider: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    ai_confidence: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # high, medium, low
    ai_sources: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    # JSON list of sources used

    # Manual override flag
    manually_verified: Mapped[bool] = mapped_column(
        Boolean, default=False)
    # User can mark as verified after
    # confirming contact info is correct

    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class NegotiationDocument(Base):
    __tablename__ = "negotiation_documents"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    negotiation_id: Mapped[str] = mapped_column(
        ForeignKey("bank_negotiations.id"))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))

    # Document info
    document_type: Mapped[str] = mapped_column(
        String)
    # hardship_letter, qwr, dispute_letter,
    # authorization, bank_statement, other

    document_name: Mapped[str] = mapped_column(
        String)

    # Sent date (same date to all recipients)
    sent_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)

    # Google Drive URL
    gdrive_url: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    gdrive_file_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)

    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class NegotiationCorrespondence(Base):
    __tablename__ = "negotiation_correspondence"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    negotiation_id: Mapped[str] = mapped_column(
        ForeignKey("bank_negotiations.id"))
    document_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # Links to NegotiationDocument
    recipient_id: Mapped[str] = mapped_column(
        ForeignKey("negotiation_recipients.id"))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))

    # Send method
    send_method: Mapped[str] = mapped_column(
        String)
    # certified_mail, fax, email, phone

    sent_date: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)

    # ── Certified Mail Tracking ──────────────
    # USPS tracking per recipient
    usps_tracking_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    usps_signature_tracking_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # Separate tracking # for signature card

    # USPS delivery status
    usps_status: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # in_transit, delivered, attempted,
    # returned, unknown
    usps_delivered_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    usps_signed_by: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # Name on signature
    usps_signature_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    usps_last_checked: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    usps_raw_response: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    # Full USPS API response JSON

    # ── Fax Tracking ─────────────────────────
    twilio_fax_sid: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    fax_status: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # queued, processing, sending,
    # delivered, no-answer, busy,
    # failed, canceled
    fax_confirmation_number: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    fax_pages: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True)
    fax_duration_seconds: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True)
    fax_delivered_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)

    # ── Email Tracking ────────────────────────
    email_message_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    email_status: Mapped[Optional[str]] = mapped_column(
        String, nullable=True)
    # sent, delivered, opened, bounced
    email_opened_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)

    # ── Letter Series Tracking ─────────────────
    letter_number: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=1)
    # 1, 2, or 3
    letter_type: Mapped[Optional[str]] = mapped_column(
        String, nullable=True, default="initial")
    # initial, followup, final_demand

    # ── Follow-up ─────────────────────────────
    followup_due_date: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    # Auto-set 30 days after sent_date
    followup_completed: Mapped[bool] = mapped_column(
        Boolean, default=False)
    followup_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)

    # General status
    status: Mapped[str] = mapped_column(
        String, default="sent")
    # sent, delivered, confirmed,
    # failed, pending

    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


class NegotiationFollowUp(Base):
    __tablename__ = "negotiation_followups"

    id: Mapped[str] = mapped_column(String,
        primary_key=True,
        default=lambda: str(uuid.uuid4()))
    negotiation_id: Mapped[str] = mapped_column(
        ForeignKey("bank_negotiations.id"))
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"))

    due_date: Mapped[datetime] = mapped_column(
        DateTime)
    # Auto-set 30 days after last contact

    follow_up_type: Mapped[str] = mapped_column(
        String, default="general")
    # general, check_status, send_reminder,
    # escalate

    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)

    completed: Mapped[bool] = mapped_column(
        Boolean, default=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True)
    completed_notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════════════
# Voice AI Models — AIAgent, KnowledgeEntry, ConversationLog
# ═══════════════════════════════════════════════════════════════════════


# ── NEW MODEL: AI Agent ─────────────────────────────────────────────────
# Stores each AI agent persona (Grace, Marcus, Sofia, or custom agents)

class AIAgent(Base):
    __tablename__ = "ai_agents"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Agent identity
    name: Mapped[str] = mapped_column(String)  # "Grace", "Marcus", "Sofia"
    role: Mapped[str] = mapped_column(String)  # "lead_qualifier", "appointment_setter", "follow_up"
    personality: Mapped[str] = mapped_column(String)  # "Warm & empathetic", "Direct & confident", etc.

    # ElevenLabs voice configuration
    elevenlabs_voice_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    elevenlabs_agent_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # ElevenLabs Conversational AI agent ID

    # AI brain configuration
    system_prompt: Mapped[str] = mapped_column(
        Text,
        default=""
    )  # The base instruction prompt for Claude — tells the agent how to behave

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ── NEW MODEL: Knowledge Base ───────────────────────────────────────────
# Two-tier knowledge: platform-level scripts + account-level company data

class KnowledgeEntry(Base):
    __tablename__ = "knowledge_entries"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )  # NULL = platform-level (available to all users)

    # Content
    name: Mapped[str] = mapped_column(String)  # e.g. "Lead Qualification Script", "Company Info"
    entry_type: Mapped[str] = mapped_column(
        String
    )  # "platform_script", "account_data", "custom_script", "objection_handler"
    content: Mapped[str] = mapped_column(Text)  # The actual knowledge text / script

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ── NEW MODEL: Knowledge Embedding (RAG) ──────────────────────────────
# Stores vector embeddings for knowledge entries to enable semantic search


class KnowledgeEmbedding(Base):
    __tablename__ = "knowledge_embeddings"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    entry_id: Mapped[str] = mapped_column(
        String, ForeignKey("knowledge_entries.id"), unique=True
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )  # Mirrors KnowledgeEntry.user_id for fast filtering

    # Embedding data
    embedding: Mapped[str] = mapped_column(Text)  # JSON list of 384 floats
    model_name: Mapped[str] = mapped_column(
        String, default="all-MiniLM-L6-v2"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── NEW MODEL: Conversation Log ────────────────────────────────────────
# Records every AI voice conversation with full transcript + analysis

class ConversationLog(Base):
    __tablename__ = "conversation_logs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    call_log_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("call_logs.id", use_alter=True), nullable=True
    )
    agent_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("ai_agents.id"), nullable=True
    )  # DEPRECATED — use persona_id
    persona_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # FK to personas — unified agent/persona reference

    # Conversation data
    elevenlabs_conversation_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # ElevenLabs session ID
    transcript: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # JSON: [{"role": "agent", "text": "..."}, {"role": "caller", "text": "..."}]

    # AI-extracted data from the call
    extracted_data: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # JSON: {"name": "John", "email": "...", "property_address": "...", "phone": "..."}

    # Mood & deal analysis
    caller_mood: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # "interested", "eager", "skeptical", "frustrated", "neutral"
    deal_eagerness: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )  # 1-10 scale (10 = very eager to do a deal)

    # Outcome
    outcome: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # "qualified", "not_qualified", "appointment_set", "callback_requested", "transferred_to_human"
    summary: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # AI-generated call summary paragraph

    # Status
    status: Mapped[str] = mapped_column(
        String, default="in_progress"
    )  # "in_progress", "completed", "failed"
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ── Scheduled Callbacks (AI-booked appointments) ─────────────────────

class ScheduledCallback(Base):
    """
    A callback appointment booked by the AI during a call.

    When the AI agent says "I'll have someone call you back Thursday at 2 PM",
    it creates one of these. The system then triggers an outbound call at the
    scheduled time — either AI-powered or flagged for the human investor.
    """

    __tablename__ = "scheduled_callbacks"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    contact_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_phone: Mapped[str] = mapped_column(String, nullable=False)
    contact_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    property_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # When to call back
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    timezone: Mapped[str] = mapped_column(String, default="America/New_York")

    # Who makes the callback
    callback_type: Mapped[str] = mapped_column(
        String, default="ai"
    )  # "ai" = AI agent calls, "human" = just notify the investor
    agent_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("ai_agents.id"), nullable=True
    )  # DEPRECATED — use persona_id
    persona_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # FK to personas — unified agent/persona reference
    phone_number_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("phone_numbers.id"), nullable=True
    )

    # Context from original conversation
    notes: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # AI's notes about what to discuss
    original_conversation_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("conversation_logs.id", use_alter=True), nullable=True
    )

    # Status tracking
    status: Mapped[str] = mapped_column(
        String, default="scheduled"
    )  # "scheduled", "in_progress", "completed", "failed", "cancelled", "no_answer"
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    last_attempt_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    result_conversation_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # Links to the conversation log from the callback call

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── Call Campaigns (bulk AI outbound calling) ─────────────────────────

class CallCampaign(Base):
    """
    A bulk outbound calling campaign.

    The investor uploads a list of contacts (or selects from CRM), picks an
    AI agent, and schedules the campaign. The system calls each contact
    automatically with spacing between calls.
    """

    __tablename__ = "call_campaigns"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Campaign configuration
    agent_id: Mapped[str] = mapped_column(
        String, ForeignKey("ai_agents.id"), nullable=False
    )  # DEPRECATED — use persona_id
    persona_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # FK to personas — unified agent/persona reference
    phone_number_id: Mapped[str] = mapped_column(
        String, ForeignKey("phone_numbers.id"), nullable=False
    )

    # Schedule
    start_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )  # When to start calling (null = manual start)
    calling_window_start: Mapped[str] = mapped_column(
        String, default="09:00"
    )  # Don't call before this time
    calling_window_end: Mapped[str] = mapped_column(
        String, default="17:00"
    )  # Don't call after this time
    calling_days: Mapped[str] = mapped_column(
        String, default="[1,2,3,4,5]"
    )  # JSON array of days (1=Mon, 7=Sun)
    timezone: Mapped[str] = mapped_column(String, default="America/New_York")
    seconds_between_calls: Mapped[int] = mapped_column(
        Integer, default=30
    )  # Spacing between calls

    # Stats
    total_contacts: Mapped[int] = mapped_column(Integer, default=0)
    calls_made: Mapped[int] = mapped_column(Integer, default=0)
    calls_answered: Mapped[int] = mapped_column(Integer, default=0)
    calls_no_answer: Mapped[int] = mapped_column(Integer, default=0)
    calls_failed: Mapped[int] = mapped_column(Integer, default=0)
    leads_qualified: Mapped[int] = mapped_column(Integer, default=0)
    appointments_set: Mapped[int] = mapped_column(Integer, default=0)

    # Status
    status: Mapped[str] = mapped_column(
        String, default="draft"
    )  # "draft", "scheduled", "running", "paused", "completed", "cancelled"

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )


class CampaignContact(Base):
    """
    A single contact within a calling campaign.

    Tracks the status and result of each individual call in the campaign.
    """

    __tablename__ = "campaign_contacts"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    campaign_id: Mapped[str] = mapped_column(
        String, ForeignKey("call_campaigns.id"), nullable=False
    )
    contact_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_phone: Mapped[str] = mapped_column(String, nullable=False)
    contact_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    property_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Custom context for this specific contact (injected into AI prompt)
    context_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Call result
    status: Mapped[str] = mapped_column(
        String, default="pending"
    )  # "pending", "calling", "completed", "no_answer", "failed", "skipped"
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=2)

    # Outcome from the AI call
    conversation_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("conversation_logs.id", use_alter=True), nullable=True
    )
    outcome: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # "qualified", "not_qualified", "appointment_set", etc.
    deal_eagerness: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    called_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── Help Tickets ──────────────────────────────────────────────────────

class HelpTicket(Base):
    """
    A support ticket submitted by a user.

    When created:
    - An email is sent to support@reifundamentalshub.com
    - A Telegram notification is sent to the platform owner
    """

    __tablename__ = "help_tickets"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    subject: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(
        String, default="general"
    )  # "general", "billing", "phone", "ai_voice", "technical", "feature_request"
    priority: Mapped[str] = mapped_column(
        String, default="normal"
    )  # "low", "normal", "high", "urgent"
    status: Mapped[str] = mapped_column(
        String, default="open"
    )  # "open", "in_progress", "waiting_on_user", "resolved", "closed"

    # Optional: attach to a specific resource
    related_resource_type: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # "phone_number", "campaign", "agent", etc.
    related_resource_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )

    # Admin response
    admin_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SavedMarket(Base):
    """
    A real estate market saved by a user for tracking and comparison.

    Users can save multiple markets with key metrics:
    - Median home price and rental rates
    - Inventory and days on market
    - Price trends
    - Custom notes
    """

    __tablename__ = "saved_markets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    state: Mapped[str] = mapped_column(String(2), nullable=False)
    median_home_price: Mapped[float] = mapped_column(Float, default=0)
    median_rent: Mapped[float] = mapped_column(Float, default=0)
    avg_days_on_market: Mapped[int] = mapped_column(Integer, default=0)
    inventory_count: Mapped[int] = mapped_column(Integer, default=0)
    price_change_pct: Mapped[float] = mapped_column(Float, default=0)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Geocoding ──
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=True
    )
