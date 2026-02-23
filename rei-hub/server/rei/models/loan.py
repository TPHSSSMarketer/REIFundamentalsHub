"""Loan account and payment models for TPHS Payment Portal."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

from rei.database import Base


def _gen_uuid() -> str:
    return str(uuid.uuid4())


class LoanAccount(Base):
    """Tracks a seller-financed loan account for the TPHS portal."""

    __tablename__ = "loan_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_number = Column(String, unique=True, nullable=False, index=True)
    buyer_name = Column(String, nullable=False)
    buyer_email = Column(String, default="")
    property_address = Column(String, nullable=False)
    original_balance = Column(Float, nullable=False, default=0.0)
    current_balance = Column(Float, nullable=False, default=0.0)
    monthly_payment = Column(Float, nullable=False, default=0.0)
    interest_rate = Column(Float, nullable=False, default=0.0)
    next_due_date = Column(DateTime, nullable=True)
    late_fee_amount = Column(Float, nullable=False, default=50.0)
    grace_period_days = Column(Integer, nullable=False, default=15)
    status = Column(String, nullable=False, default="active")  # active, paid_off, defaulted
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LoanPayment(Base):
    """Individual payment record against a loan account."""

    __tablename__ = "loan_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    confirmation_number = Column(String, unique=True, nullable=False, index=True, default=_gen_uuid)
    account_number = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    payment_method = Column(String, nullable=False)  # stripe, check, wire
    status = Column(String, nullable=False, default="completed")  # completed, pending, failed
    stripe_payment_intent_id = Column(String, default="")
    stripe_receipt_url = Column(String, default="")
    reference_number = Column(String, default="")
    notes = Column(Text, default="")
    card_last_four = Column(String, default="")
    balance_after = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, server_default=func.now())
