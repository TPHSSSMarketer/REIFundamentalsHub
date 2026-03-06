"""Lead Capture Website and Submission models."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, Boolean, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from rei.database import Base


class LeadCaptureSite(Base):
    __tablename__ = "lead_capture_sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    company_slug: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    template_type: Mapped[str] = mapped_column(String, nullable=False)
    # 'motivated_sellers', 'cash_buyers', 'investor_agent', 'agent', 'company_credibility',
    # 'mobile_homes', 'land', 'rent_to_own', 'owner_finance', 'note_buying'
    config_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    # JSON: company_name, headline, description, phone, email, primary_color, market, logo_url, form_fields, etc.
    published_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="draft")  # 'draft' or 'published'
    total_views: Mapped[int] = mapped_column(Integer, default=0)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    submissions: Mapped[list["LeadSubmission"]] = relationship(
        "LeadSubmission", back_populates="site", lazy="selectin"
    )
    owner: Mapped["User"] = relationship("User", lazy="selectin")


class LeadSubmission(Base):
    __tablename__ = "lead_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    site_id: Mapped[int] = mapped_column(Integer, ForeignKey("lead_capture_sites.id"), nullable=False)
    # Form data stored as JSON
    form_data_json: Mapped[str] = mapped_column(Text, nullable=False)
    # Extracted fields for quick access
    lead_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    lead_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    lead_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    lead_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source_ip: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # CRM integration
    crm_contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    crm_deal_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Relationships
    site: Mapped["LeadCaptureSite"] = relationship(
        "LeadCaptureSite", back_populates="submissions"
    )


class LeadCaptureDailyStats(Base):
    __tablename__ = "lead_capture_daily_stats"
    __table_args__ = (
        UniqueConstraint("site_id", "date", name="uq_site_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    site_id: Mapped[int] = mapped_column(Integer, ForeignKey("lead_capture_sites.id"), nullable=False)
    date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    page_views: Mapped[int] = mapped_column(Integer, default=0)
    submissions: Mapped[int] = mapped_column(Integer, default=0)
    unique_visitors: Mapped[int] = mapped_column(Integer, default=0)
