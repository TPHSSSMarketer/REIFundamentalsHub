"""User and Subscription SQLAlchemy models."""

from __future__ import annotations

from datetime import datetime, timedelta

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

    # ── Plaid (Proof of Funds) ────────────────────────────────────
    plaid_access_token: Mapped[str | None] = mapped_column(String, nullable=True)
    plaid_linked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

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
