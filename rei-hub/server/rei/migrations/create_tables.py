"""Create all database tables from SQLAlchemy models."""

from __future__ import annotations

import logging
from sqlalchemy import text
from rei.database import Base, engine

# Import models so Base.metadata knows about them
import rei.models  # noqa: F401

logger = logging.getLogger(__name__)

# Inline migrations — add new columns to existing tables.
# Each entry: (table, column, sql_type)
_COLUMN_MIGRATIONS = [
    ("lead_capture_sites", "company_slug", "VARCHAR(100)"),
    ("lead_capture_sites", "total_views", "INTEGER DEFAULT 0"),
    ("users", "lead_email_notifications", "BOOLEAN DEFAULT 1"),
        # Google OAuth columns for Sign-in with Google
        ("users", "google_id", "VARCHAR UNIQUE"),
        ("users", "google_avatar_url", "VARCHAR"),
        ("users", "google_drive_token", "TEXT"),
        ("users", "google_drive_connected", "BOOLEAN DEFAULT FALSE"),
        ("users", "dropbox_token", "TEXT"),
        ("users", "dropbox_connected", "BOOLEAN DEFAULT FALSE"),
    # ── Property Details ──
    ("crm_deals", "property_type", "VARCHAR"),
    ("crm_deals", "bedrooms", "INTEGER"),
    ("crm_deals", "bathrooms", "FLOAT"),
    ("crm_deals", "square_footage", "INTEGER"),
    ("crm_deals", "lot_size", "VARCHAR"),
    ("crm_deals", "year_built", "INTEGER"),
    ("crm_deals", "garage", "VARCHAR"),
    ("crm_deals", "property_condition", "VARCHAR"),
    ("crm_deals", "occupancy_status", "VARCHAR"),
    ("crm_deals", "repairs_needed", "TEXT"),
    ("crm_deals", "special_features", "TEXT"),
    # ── Seller Motivation ──
    ("crm_deals", "reason_for_selling", "TEXT"),
    ("crm_deals", "motivation_level", "VARCHAR"),
    ("crm_deals", "timeline_to_sell", "VARCHAR"),
    ("crm_deals", "asking_price", "FLOAT"),
    ("crm_deals", "price_flexible", "VARCHAR"),
    ("crm_deals", "how_established_price", "VARCHAR"),
    ("crm_deals", "best_cash_offer", "FLOAT"),
    ("crm_deals", "what_if_doesnt_sell", "TEXT"),
    ("crm_deals", "open_to_terms", "VARCHAR"),
    # ── Listing Information ──
    ("crm_deals", "is_listed", "VARCHAR"),
    ("crm_deals", "realtor_name", "VARCHAR"),
    ("crm_deals", "realtor_phone", "VARCHAR"),
    ("crm_deals", "listing_expires", "VARCHAR"),
    ("crm_deals", "how_long_listed", "VARCHAR"),
    ("crm_deals", "any_offers", "VARCHAR"),
    ("crm_deals", "previous_offer_amount", "FLOAT"),
    # ── Homeowner Financials ──
    ("crm_deals", "mortgage_balance", "FLOAT"),
    ("crm_deals", "mortgage_balance_2nd", "FLOAT"),
    ("crm_deals", "monthly_mortgage_payment", "FLOAT"),
    ("crm_deals", "taxes_insurance_included", "VARCHAR"),
    ("crm_deals", "monthly_tax_amount", "FLOAT"),
    ("crm_deals", "monthly_insurance_amount", "FLOAT"),
    ("crm_deals", "interest_rate_1st", "FLOAT"),
    ("crm_deals", "interest_rate_2nd", "FLOAT"),
    ("crm_deals", "loan_type", "VARCHAR"),
    ("crm_deals", "prepayment_penalty", "VARCHAR"),
    ("crm_deals", "mortgage_company_1st", "VARCHAR"),
    ("crm_deals", "mortgage_company_2nd", "VARCHAR"),
    ("crm_deals", "payments_current", "VARCHAR"),
    ("crm_deals", "months_behind", "INTEGER"),
    ("crm_deals", "amount_behind", "FLOAT"),
    ("crm_deals", "back_taxes", "FLOAT"),
    ("crm_deals", "other_liens", "VARCHAR"),
    ("crm_deals", "other_lien_amount", "FLOAT"),
    # ── Foreclosure Details ──
    ("crm_deals", "foreclosure_status", "VARCHAR"),
    ("crm_deals", "auction_date", "DATETIME"),
    ("crm_deals", "reinstatement_amount", "FLOAT"),
    ("crm_deals", "attorney_involved", "VARCHAR"),
    ("crm_deals", "attorney_name", "VARCHAR"),
    ("crm_deals", "attorney_phone", "VARCHAR"),
    # ── Additional ──
    ("crm_deals", "as_is_value", "FLOAT"),
    ("crm_deals", "exit_strategy", "VARCHAR"),
    ("crm_deals", "unit_details", "TEXT"),
    ("crm_deals", "pipeline_id", "VARCHAR"),
    ("crm_deals", "buyer_id", "TEXT DEFAULT NULL"),
    ("crm_deals", "buyer_name", "TEXT DEFAULT NULL"),
    ("crm_deals", "buyer_type", "TEXT DEFAULT NULL"),
    ("crm_deals", "subject_to_interest", "TEXT DEFAULT NULL"),
    ("crm_deals", "existing_loan_servicer", "TEXT DEFAULT NULL"),
    ("crm_deals", "due_on_sale_aware", "TEXT DEFAULT NULL"),
    ("crm_deals", "insurance_assignable", "TEXT DEFAULT NULL"),
    ("crm_deals", "buyer_down_payment", "REAL DEFAULT NULL"),
    ("crm_deals", "source_of_funds", "TEXT DEFAULT NULL"),
    ("crm_deals", "monthly_payment_2nd", "REAL DEFAULT NULL"),
    ("crm_deals", "loan_type_2nd", "TEXT DEFAULT NULL"),
    ("crm_deals", "prepayment_penalty_2nd", "TEXT DEFAULT NULL"),
    ("crm_deals", "payments_current_2nd", "TEXT DEFAULT NULL"),
    ("crm_deals", "months_behind_2nd", "INTEGER DEFAULT NULL"),
    ("crm_deals", "amount_behind_2nd", "REAL DEFAULT NULL"),
    ("crm_deals", "mortgage_balance_3rd", "REAL DEFAULT NULL"),
    ("crm_deals", "monthly_payment_3rd", "REAL DEFAULT NULL"),
    ("crm_deals", "interest_rate_3rd", "REAL DEFAULT NULL"),
    ("crm_deals", "loan_type_3rd", "TEXT DEFAULT NULL"),
    ("crm_deals", "prepayment_penalty_3rd", "TEXT DEFAULT NULL"),
    ("crm_deals", "mortgage_company_3rd", "TEXT DEFAULT NULL"),
    ("crm_deals", "payments_current_3rd", "TEXT DEFAULT NULL"),
    ("crm_deals", "months_behind_3rd", "INTEGER DEFAULT NULL"),
    ("crm_deals", "amount_behind_3rd", "REAL DEFAULT NULL"),
    # ── Contact: buying entity ──
    ("crm_contacts", "buying_entity", "VARCHAR"),
]


async def create_tables() -> None:
    """Run Base.metadata.create_all, then apply column migrations."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Apply column migrations for columns added after initial deployment
    async with engine.begin() as conn:
        for table, column, sql_type in _COLUMN_MIGRATIONS:
            try:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")
                )
                logger.info("Migration: added %s.%s", table, column)
            except Exception:
                # Column already exists — nothing to do
                pass
