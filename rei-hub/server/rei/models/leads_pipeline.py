"""Leads Pipeline models — LeadList, Lead, and MarketingTouch.

Separate from CRM contacts/deals. Used for managing uploaded lead lists
and tracking marketing touches (direct mail, etc.) per lead.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from rei.database import Base


# ── Lead List ─────────────────────────────────────────────


class LeadList(Base):
    """Represents an uploaded lead list (CSV/XLSX)."""
    __tablename__ = "lead_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    list_name: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # e.g. "PropStream", "BatchLeads", "ListSource", "Manual"
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_filename: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    column_mapping_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON: { "csv_col_name": "our_field_name", ... }
    lead_count: Mapped[int] = mapped_column(Integer, default=0)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    leads: Mapped[list["Lead"]] = relationship("Lead", back_populates="lead_list", lazy="selectin")


# ── Lead ──────────────────────────────────────────────────


class Lead(Base):
    """Individual lead in the pipeline. NOT a CRM contact.
    Can be promoted to CRM Contact + Deal when the lead responds.
    """
    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    list_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("lead_lists.id"), nullable=True, index=True
    )

    # Contact info
    first_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Property / address info
    address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    zip_code: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    property_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Pipeline management
    status: Mapped[str] = mapped_column(String, default="new")
    # Statuses: new, contacted, mailed, responded, converted, dead
    tags_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # CRM promotion link (filled when promoted to deal)
    crm_contact_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    crm_deal_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Stats (denormalized for quick display)
    total_mailers_sent: Mapped[int] = mapped_column(Integer, default=0)
    last_mailed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    lead_list: Mapped[Optional["LeadList"]] = relationship("LeadList", back_populates="leads", lazy="selectin")
    marketing_touches: Mapped[list["MarketingTouch"]] = relationship(
        "MarketingTouch", back_populates="lead", lazy="selectin"
    )


# ── Marketing Touch ───────────────────────────────────────


class MarketingTouch(Base):
    """Tracks each piece of marketing sent to a lead (postcard, letter, etc.)."""
    __tablename__ = "marketing_touches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    lead_id: Mapped[str] = mapped_column(String, ForeignKey("leads.id"), nullable=False, index=True)
    campaign_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("direct_mail_campaigns.id"), nullable=True
    )

    touch_type: Mapped[str] = mapped_column(String, nullable=False)
    # Types: postcard, letter
    delivery_status: Mapped[str] = mapped_column(String, default="pending")
    # Statuses: pending, sent, in_transit, delivered, returned, failed
    cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    provider_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Thanks.io order ID for tracking

    sent_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    lead: Mapped["Lead"] = relationship("Lead", back_populates="marketing_touches", lazy="selectin")
