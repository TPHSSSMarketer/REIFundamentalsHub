"""Negotiation models — Two-sided service workflow.

Admin (Chris) negotiates bank/county tax/lien matters on behalf of subscribers.
Users submit deals from their CRM pipeline; admin manages cases with full
activity journal. Users see sanitized progress updates and chat thread.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from rei.database import Base


# ── Deal Lien (replaces hardcoded mortgage columns) ───────


class DealLien(Base):
    """Dynamic lien record attached to a CRM deal.

    Replaces the 27 hardcoded mortgage columns on CrmDeal.
    Users can add as many liens as needed via 'Add Lien'.
    """
    __tablename__ = "deal_liens"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    deal_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # Lien classification
    lien_type: Mapped[str] = mapped_column(String, nullable=False)
    # "1st Mortgage", "2nd Mortgage", "3rd Mortgage",
    # "County Tax", "HOA Lien", "Mechanics Lien",
    # "Judgment Lien", "Other"

    lien_holder: Mapped[str] = mapped_column(String, nullable=False, default="")
    account_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    balance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    monthly_payment: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    interest_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    loan_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # ISO date string
    maturity_date: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Payment status
    status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # current, delinquent, default, foreclosure
    payments_current: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # yes/no
    months_behind: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    amount_behind: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Loan details
    loan_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # conventional, fha, va, usda, heloc, other
    prepayment_penalty: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # yes/no
    taxes_insurance_included: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # yes/no

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ── Negotiation Request ───────────────────────────────────


class NegotiationRequest(Base):
    """User submits selected liens from a deal for negotiation.

    Admin sees these in the incoming queue and can accept,
    request more info, or decline.
    """
    __tablename__ = "negotiation_requests"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    deal_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    # JSON list of DealLien UUIDs the user selected
    lien_ids_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    # JSON list of service types: ["bank", "county_tax", "other_lien"]
    service_types_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    # User's initial message/note
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Request status
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    # pending, accepted, info_requested, declined

    # Property snapshot (denormalized for admin queue display)
    property_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    property_city: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    property_state: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ── Negotiation Case ─────────────────────────────────────


class NegotiationCase(Base):
    """One case per service type per request.

    If a user sends 3 liens for bank + county_tax negotiation,
    that creates 2 cases (one per service type).
    """
    __tablename__ = "negotiation_cases"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    request_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    deal_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    service_type: Mapped[str] = mapped_column(String, nullable=False)
    # "bank", "county_tax", "other_lien"

    status: Mapped[str] = mapped_column(String, nullable=False, default="intake")
    # intake, researching, in_progress, awaiting_response, resolved, closed

    priority: Mapped[str] = mapped_column(String, nullable=False, default="normal")
    # low, normal, high, urgent

    # Property snapshot
    property_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ── Negotiation Activity (Two-note journal) ──────────────


class NegotiationActivity(Base):
    """Admin activity journal entry — the core of the negotiation workflow.

    Two-note system:
    - admin_note: Full detail with attachments (admin eyes only)
    - user_summary: AI-generated sanitized version (shown to user)

    MiniMax auto-generates user_summary from admin_note.
    """
    __tablename__ = "negotiation_activities"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    case_id: Mapped[str] = mapped_column(String, nullable=False, index=True)

    activity_type: Mapped[str] = mapped_column(String, nullable=False)
    # note, correspondence_sent, correspondence_received,
    # tracking_update, status_change, document_added,
    # phone_call, email

    # ── Two-note system ──
    admin_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    user_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # AI-generated via MiniMax — sanitized for user

    # ── Correspondence tracking ──
    send_method: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # certified_mail, regular_mail, fax, email, phone

    usps_tracking_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    usps_signature_tracking_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    usps_delivered_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    usps_signed_by: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tracking_status: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # in_transit, delivered, attempted, returned, unknown
    usps_last_checked: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    usps_raw_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Attachments ──
    # JSON list of {file_name, file_type, deal_file_id} references
    attachments_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_by: Mapped[str] = mapped_column(String, nullable=False, default="admin")
    # admin, system, ai

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ── Negotiation Message (Chat thread) ────────────────────


class NegotiationMessage(Base):
    """Persistent chat thread between admin and user per case.

    Available throughout the entire case lifecycle.
    Triggers notification to the other party on new message.
    """
    __tablename__ = "negotiation_messages"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    case_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    sender_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    sender_role: Mapped[str] = mapped_column(String, nullable=False)
    # "admin" or "user"

    content: Mapped[str] = mapped_column(Text, nullable=False)

    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
