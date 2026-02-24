"""Tenant-specific configuration helpers for multi-tenant loan servicing."""

from __future__ import annotations

from rei.config import Settings
from rei.models.user import User


def get_loan_company_name(user: User) -> str:
    """Return company name for payment portal.

    Falls back to user's company name or full name if not set.
    """
    return (
        user.loan_company_name
        or user.company_name
        or user.full_name
        or "Loan Servicing Portal"
    )


def get_loan_portal_color(user: User) -> str:
    """Return portal primary color hex for branding."""
    return user.loan_portal_primary_color or "#1B3A6B"


def get_loan_stripe_account(user: User, settings: Settings) -> str:
    """Return the Stripe Connect account ID for this user's loan payments.

    Falls back to platform default (TPHS) if user hasn't connected their own.
    """
    if user.loan_stripe_connect_account_id:
        return user.loan_stripe_connect_account_id
    # Fallback to platform default
    return settings.stripe_connect_account_id


def get_loan_stripe_enabled(user: User, settings: Settings) -> bool:
    """Check whether Stripe Connect is enabled for this user's loans."""
    if user.loan_stripe_connect_account_id:
        return user.loan_stripe_connect_enabled
    return settings.stripe_connect_account_id != ""


def get_investor_default_pct(user: User) -> float:
    """Return the default investor distribution percentage for this user."""
    return user.loan_default_investor_pct or 4.0


def get_servicing_fee_pct(user: User) -> float:
    """Return the REI Hub servicing fee percentage for this user."""
    return user.loan_servicing_fee_pct or 0.0


def calculate_servicing_fee(amount: float, user: User) -> float:
    """Calculate REI Hub platform fee. Returns fee amount in dollars."""
    pct = get_servicing_fee_pct(user)
    if pct <= 0:
        return 0.0
    return round(amount * (pct / 100), 2)


def get_distribution_statement_header(user: User) -> dict:
    """Return branding info for distribution statement PDF header."""
    return {
        "company_name": get_loan_company_name(user),
        "logo_url": user.loan_company_logo_url,
        "primary_color": get_loan_portal_color(user),
    }
