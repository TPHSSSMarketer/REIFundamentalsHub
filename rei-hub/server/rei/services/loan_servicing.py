"""Loan servicing helper functions — amortization, payment splits, late fees, distributions."""

from __future__ import annotations

import json
import math
from datetime import datetime, timedelta

from dateutil.relativedelta import relativedelta

from rei.models.user import ContractForDeed


def generate_account_number(state: str, db) -> str:
    """Generate a unique CFD account number.

    Format: CFD-{STATE}-{YEAR}-{SEQUENCE}
    STATE  = 2-letter uppercase state abbreviation
    YEAR   = current 4-digit year
    SEQUENCE = zero-padded to 5 digits, based on existing count + 1
    """
    state_upper = state.upper()[:2]
    year = datetime.utcnow().year
    prefix = f"CFD-{state_upper}-{year}-"

    # Count existing CFDs for this state + year
    existing_count = (
        db.query(ContractForDeed)
        .filter(ContractForDeed.account_number.like(f"{prefix}%"))
        .count()
    )

    sequence = existing_count + 1
    account_number = f"{prefix}{sequence:05d}"

    # Verify uniqueness; increment on collision
    while (
        db.query(ContractForDeed)
        .filter(ContractForDeed.account_number == account_number)
        .first()
        is not None
    ):
        sequence += 1
        account_number = f"{prefix}{sequence:05d}"

    return account_number


def calculate_amortization(
    loan_amount: float,
    annual_interest_rate: float,
    term_months: int,
    start_date: datetime,
) -> list[dict]:
    """Build a full amortization schedule.

    Returns a list of dicts, one per month, with payment breakdown and running balance.
    """
    monthly_rate = annual_interest_rate / 12

    if monthly_rate == 0:
        payment = loan_amount / term_months
    else:
        payment = loan_amount * (
            monthly_rate * (1 + monthly_rate) ** term_months
        ) / (
            (1 + monthly_rate) ** term_months - 1
        )

    balance = loan_amount
    schedule: list[dict] = []

    for month in range(1, term_months + 1):
        interest = balance * monthly_rate
        principal = payment - interest
        balance -= principal
        if balance < 0:
            balance = 0.0

        due_date = start_date + relativedelta(months=month)
        schedule.append({
            "payment_number": month,
            "due_date": due_date.isoformat(),
            "payment_amount": round(payment, 2),
            "principal": round(principal, 2),
            "interest": round(interest, 2),
            "balance": round(max(balance, 0), 2),
        })

    return schedule


def calculate_payment_split(
    payment_amount: float,
    current_balance: float,
    annual_interest_rate: float,
    monthly_payment: float,
) -> dict:
    """Split an incoming payment into principal, interest, and extra portions."""
    monthly_rate = annual_interest_rate / 12
    interest = current_balance * monthly_rate
    principal = payment_amount - interest
    extra = max(0, principal - (monthly_payment - interest))

    return {
        "principal": round(max(principal, 0), 2),
        "interest": round(interest, 2),
        "extra": round(extra, 2),
    }


def calculate_late_fee(
    cfd: ContractForDeed,
    payment_date: datetime,
    due_date: datetime,
) -> float:
    """Return the late fee amount if the payment exceeds the grace period."""
    days_late = (payment_date - due_date).days
    if days_late > cfd.late_fee_days:
        return cfd.late_fee_amount
    return 0.0


def calculate_quarterly_distributions(
    payments: list,
    investors: list,
) -> dict:
    """Calculate quarterly investor distributions from collected payments.

    ``payments`` — list of LoanPayment objects for the quarter.
    ``investors`` — list of Investor objects.
    """
    total_collected = sum(p.amount for p in payments)
    total_late_fees = sum(p.late_fee_portion for p in payments)

    investor_breakdown: list[dict] = []
    investor_total = 0.0

    for investor in investors:
        if not investor.is_active:
            continue
        amount = total_collected * (investor.distribution_percentage / 100)
        investor_total += amount
        investor_breakdown.append({
            "investor_id": investor.id,
            "name": investor.name,
            "entity": investor.entity_name,
            "percentage": investor.distribution_percentage,
            "amount": round(amount, 2),
        })

    entity_amount = total_collected - investor_total

    return {
        "total_collected": round(total_collected, 2),
        "total_late_fees": round(total_late_fees, 2),
        "investor_total": round(investor_total, 2),
        "entity_amount": round(entity_amount, 2),
        "investor_breakdown": investor_breakdown,
    }


def get_default_notice_timeline(eviction_timeline_json: str) -> dict:
    """Parse an eviction-timeline JSON string into a structured dict.

    Falls back to New York defaults on parse failure.
    """
    ny_defaults = {
        "notice_1_days": 5,
        "notice_1_type": "5-Day Notice to Cure",
        "notice_2_days": 14,
        "notice_2_type": "14-Day Notice to Quit",
        "cure_period_days": 30,
        "filing_requirements": "File in local court",
    }

    try:
        data = json.loads(eviction_timeline_json)
        return {
            "notice_1_days": data.get("notice_1_days", ny_defaults["notice_1_days"]),
            "notice_1_type": data.get("notice_1_type", ny_defaults["notice_1_type"]),
            "notice_2_days": data.get("notice_2_days", ny_defaults["notice_2_days"]),
            "notice_2_type": data.get("notice_2_type", ny_defaults["notice_2_type"]),
            "cure_period_days": data.get("cure_period_days", ny_defaults["cure_period_days"]),
            "filing_requirements": data.get("filing_requirements", ny_defaults["filing_requirements"]),
        }
    except (json.JSONDecodeError, TypeError):
        return ny_defaults
