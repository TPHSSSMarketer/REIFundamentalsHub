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
    helm_addon_active: Mapped[bool] = mapped_column(Boolean, default=False)
    helm_addon_billing_interval: Mapped[str | None] = mapped_column(String, nullable=True)
    seats_used: Mapped[int] = mapped_column(Integer, default=1)
    trial_reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Company / Documents ──────────────────────────────────────
    company_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # ── Plaid (Proof of Funds) ────────────────────────────────────
    plaid_access_token: Mapped[str | None] = mapped_column(String, nullable=True)
    plaid_linked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # ── Email Marketing credits ───────────────────────────────────
    email_credits_used: Mapped[int] = mapped_column(Integer, default=0)
    email_credits_reset_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )

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
    helm_addon: Mapped[bool] = mapped_column(Boolean, default=False)
    billing_cycle: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped[User] = relationship("User", back_populates="subscription")


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
