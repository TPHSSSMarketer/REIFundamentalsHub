"""Loan account model for TPHS Payment Portal."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, Float, Integer, Numeric, String
from sqlalchemy.sql import func

from rei.database import Base


class LoanAccount(Base):
    """Tracks a seller-financed loan account for the TPHS portal."""

    __tablename__ = "loan_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_number = Column(String, unique=True, nullable=False, index=True)
    buyer_name = Column(String, nullable=False)
    buyer_email = Column(String, default="")
    property_address = Column(String, nullable=False)
    original_balance = Column(Numeric(14, 2), nullable=False, default=0.0)
    current_balance = Column(Numeric(14, 2), nullable=False, default=0.0)
    monthly_payment = Column(Numeric(14, 2), nullable=False, default=0.0)
    interest_rate = Column(Numeric(8, 4), nullable=False, default=0.0)
    next_due_date = Column(DateTime, nullable=True)
    late_fee_amount = Column(Numeric(14, 2), nullable=False, default=50.0)
    grace_period_days = Column(Integer, nullable=False, default=15)
    status = Column(String, nullable=False, default="active")  # active, paid_off, defaulted
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
