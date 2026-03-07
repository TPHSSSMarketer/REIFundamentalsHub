"""Create all database tables from SQLAlchemy models."""

from __future__ import annotations

import logging
from sqlalchemy import text
from sqlalchemy.exc import CircularDependencyError
from sqlalchemy.sql.ddl import sort_tables_and_constraints
from rei.database import Base, engine

# Import models so Base.metadata knows about them
import rei.models  # noqa: F401

logger = logging.getLogger(__name__)


def _fix_circular_fk_deps() -> None:
    """Detect circular FK dependencies and mark cycle-causing FKs as use_alter.

    SQLAlchemy's create_all() fails with CircularDependencyError when tables
    have circular foreign key references (e.g. A→B→C→A). This function uses
    sort_tables_and_constraints() to identify the specific FK constraints that
    cause cycles and marks them with use_alter=True, so create_all() will
    defer those constraints to ALTER TABLE statements after all tables exist.
    """
    try:
        # This will raise CircularDependencyError if cycles exist
        list(Base.metadata.sorted_tables)
        logger.info("No circular FK dependencies detected")
    except CircularDependencyError:
        logger.info("Circular FK dependencies detected — auto-fixing with use_alter")
        for table_or_none, fkcs in sort_tables_and_constraints(
            Base.metadata.tables.values()
        ):
            if table_or_none is None:
                # These FK constraints caused cycles — defer them
                for fkc in fkcs:
                    fkc.use_alter = True
                    logger.info(
                        "  Deferred FK: %s.%s → %s",
                        fkc.parent.name if fkc.parent is not None else "?",
                        [c.name for c in fkc.columns],
                        fkc.referred_table.name if fkc.referred_table is not None else "?",
                    )

# Inline migrations — add new columns to existing tables.
# Each entry: (table, column, sql_type)
_COLUMN_MIGRATIONS = [
    ("lead_capture_sites", "company_slug", "VARCHAR(100)"),
    ("lead_capture_sites", "total_views", "INTEGER DEFAULT 0"),
    ("users", "lead_email_notifications", "BOOLEAN DEFAULT TRUE"),
        # Google OAuth columns for Sign-in with Google
        ("users", "google_id", "VARCHAR UNIQUE"),
        ("users", "google_avatar_url", "VARCHAR"),
        ("users", "google_drive_token", "TEXT"),
        ("users", "google_drive_connected", "BOOLEAN DEFAULT FALSE"),
        ("users", "dropbox_token", "TEXT"),
        ("users", "dropbox_connected", "BOOLEAN DEFAULT FALSE"),
    # —— Property Details ——
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
    # —— Seller Motivation ——
    ("crm_deals", "reason_for_selling", "TEXT"),
    ("crm_deals", "motivation_level", "VARCHAR"),
    ("crm_deals", "timeline_to_sell", "VARCHAR"),
    ("crm_deals", "asking_price", "FLOAT"),
    ("crm_deals", "price_flexible", "VARCHAR"),
    ("crm_deals", "how_established_price", "VARCHAR"),
    ("crm_deals", "best_cash_offer", "FLOAT"),
    ("crm_deals", "what_if_doesnt_sell", "TEXT"),
    ("crm_deals", "open_to_terms", "VARCHAR"),
    # —— Listing Information ——
    ("crm_deals", "is_listed", "VARCHAR"),
    ("crm_deals", "realtor_name", "VARCHAR"),
    ("crm_deals", "realtor_phone", "VARCHAR"),
    ("crm_deals", "listing_expires", "VARCHAR"),
    ("crm_deals", "how_long_listed", "VARCHAR"),
    ("crm_deals", "any_offers", "VARCHAR"),
    ("crm_deals", "previous_offer_amount", "FLOAT"),
    # —— Homeowner Financials ——
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
    # —— Foreclosure Details ——
    ("crm_deals", "foreclosure_status", "VARCHAR"),
    ("crm_deals", "auction_date", "TIMESTAMP"),
    ("crm_deals", "reinstatement_amount", "FLOAT"),
    ("crm_deals", "attorney_involved", "VARCHAR"),
    ("crm_deals", "attorney_name", "VARCHAR"),
    ("crm_deals", "attorney_phone", "VARCHAR"),
    # —— Additional ——
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
    # —— Contact: buying entity ——
    ("crm_contacts", "buying_entity", "VARCHAR"),
    # —— Per-user AI usage tracking ——
    ("users", "ai_total_requests", "INTEGER DEFAULT 0"),
    ("users", "ai_total_tokens", "INTEGER DEFAULT 0"),
    ("users", "ai_last_request_at", "TIMESTAMP"),
    # ── AI dollar-cost tracking ──
    ("users", "ai_cost_cents", "INTEGER DEFAULT 0"),
    ("users", "ai_cost_reset_at", "TIMESTAMP"),
    # ── AI usage reminder flags ──
    ("users", "ai_reminder_75_sent", "BOOLEAN DEFAULT FALSE"),
    ("users", "ai_reminder_90_sent", "BOOLEAN DEFAULT FALSE"),
    ("users", "ai_reminder_95_sent", "BOOLEAN DEFAULT FALSE"),
    # ── Agent→Persona Unification ──
    ("personas", "elevenlabs_agent_id", "VARCHAR"),
    ("personas", "role", "VARCHAR"),
    ("phone_numbers", "persona_id", "VARCHAR"),
    ("conversation_logs", "persona_id", "VARCHAR"),
    ("scheduled_callbacks", "persona_id", "VARCHAR"),
    ("call_campaigns", "persona_id", "VARCHAR"),
    # Complimentary (free) account flag
    ("users", "is_complimentary", "BOOLEAN DEFAULT FALSE"),
    # Team / seat management
    ("users", "seats_used", "INTEGER DEFAULT 1"),
    ("users", "owner_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL"),
    # AI Underwriting
    ("crm_deals", "underwriting_data", "TEXT"),
    # ── User-owned API keys ──
    ("users", "ai_own_anthropic_key", "VARCHAR"),
    ("users", "ai_own_nvidia_key", "VARCHAR"),
    ("users", "ai_own_openai_key", "VARCHAR"),
    # ── AI Document Intelligence & Photo Analysis ──
    ("deal_files", "analysis_json", "TEXT"),
    ("deal_files", "analysis_status", "VARCHAR"),
    ("deal_files", "photo_analysis_json", "TEXT"),
    ("crm_deals", "property_condition_grade", "VARCHAR"),
    ("crm_deals", "estimated_total_repairs", "REAL"),
]


async def create_tables() -> None:
    """Run Base.metadata.create_all, then apply column migrations.

    Wrapped in try/except because Railway may run multiple Uvicorn workers
    that race on table creation. SQLite throws 'table already exists' when
    two workers call CREATE TABLE simultaneously.
    """
    # Pre-process: detect and auto-fix any circular FK dependencies
    # so that create_all() can sort tables without errors.
    _fix_circular_fk_deps()

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:
        # Tolerate 'table already exists' from concurrent workers (SQLite)
        # and 'relation ... already exists' (Postgres)
        msg = str(exc).lower()
        if "already exists" in msg:
            logger.info("Tables already exist (concurrent worker) — skipping create_all")
        else:
            raise

    # Apply column migrations for columns added after initial deployment
    async with engine.begin() as conn:
        for table, column, sql_type in _COLUMN_MIGRATIONS:
            try:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {sql_type}")
                )
                logger.info("Migration: added %s.%s", table, column)
            except Exception:
                # Column already exists — nothing to do
                pass


