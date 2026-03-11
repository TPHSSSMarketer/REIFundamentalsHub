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
    ("deal_files", "admin_only", "BOOLEAN DEFAULT FALSE"),
    ("crm_deals", "property_condition_grade", "VARCHAR"),
    ("crm_deals", "estimated_total_repairs", "REAL"),
    # ── Direct Mail — postcard front image storage ──
    ("direct_mail_templates", "front_image_b64", "TEXT"),
    ("direct_mail_campaigns", "front_image_b64", "TEXT"),
    # ── User: Company / Documents ──
    ("users", "company_name", "VARCHAR"),
    ("users", "company_address", "VARCHAR"),
    ("users", "company_city", "VARCHAR"),
    ("users", "company_state", "VARCHAR"),
    ("users", "company_zip", "VARCHAR"),
    ("users", "company_phone", "VARCHAR"),
    ("users", "company_website", "VARCHAR"),
    # ── User: Investing Profile ──
    ("users", "investing_experience", "VARCHAR"),
    ("users", "deal_types", "VARCHAR"),
    ("users", "primary_market", "VARCHAR"),
    ("users", "storage_provider", "VARCHAR"),
    # ── User: Content Profile ──
    ("users", "investing_strategy", "TEXT"),
    ("users", "mission_statement", "TEXT"),
    ("users", "content_tone", "VARCHAR"),
    ("users", "company_logo_b64", "TEXT"),
    # ── User: Plaid ──
    ("users", "plaid_access_token", "VARCHAR"),
    ("users", "plaid_linked_at", "TIMESTAMP"),
    # ── User: Email credits ──
    ("users", "email_credits_used", "INTEGER DEFAULT 0"),
    ("users", "email_credits_reset_at", "TIMESTAMP"),
    # ── User: Phone System ──
    ("users", "phone_minutes_used", "INTEGER DEFAULT 0"),
    ("users", "phone_sms_used", "INTEGER DEFAULT 0"),
    ("users", "phone_credits_cents", "INTEGER DEFAULT 0"),
    ("users", "phone_usage_reset_at", "TIMESTAMP"),
    ("users", "twilio_subaccount_sid", "VARCHAR"),
    ("users", "twilio_subaccount_auth_token", "VARCHAR"),
    # ── User: Deal Analyzer Preferences ──
    ("users", "analyzer_arv_multiplier", "FLOAT DEFAULT 0.70"),
    ("users", "analyzer_default_closing_costs_pct", "FLOAT DEFAULT 0.03"),
    ("users", "analyzer_default_agent_commission_pct", "FLOAT DEFAULT 0.06"),
    ("users", "analyzer_default_holding_months", "INTEGER DEFAULT 6"),
    ("users", "analyzer_default_monthly_holding_cost", "FLOAT DEFAULT 1000.00"),
    ("users", "analyzer_min_profit", "FLOAT DEFAULT 20000.00"),
    ("users", "analyzer_min_roi_pct", "FLOAT DEFAULT 0.15"),
    ("users", "analyzer_sub2_default_interest_rate", "FLOAT DEFAULT 0.04"),
    ("users", "analyzer_sub2_default_rental_income", "FLOAT DEFAULT 1500.00"),
    ("users", "analyzer_sub2_default_vacancy_pct", "FLOAT DEFAULT 0.08"),
    ("users", "analyzer_sub2_default_mgmt_pct", "FLOAT DEFAULT 0.10"),
    ("users", "analyzer_of_default_interest_rate", "FLOAT DEFAULT 0.06"),
    ("users", "analyzer_of_default_term_years", "INTEGER DEFAULT 30"),
    ("users", "analyzer_of_default_down_pct", "FLOAT DEFAULT 0.10"),
    ("users", "analyzer_lo_default_option_term_years", "INTEGER DEFAULT 3"),
    ("users", "analyzer_lo_default_monthly_credit_pct", "FLOAT DEFAULT 0.20"),
    ("users", "analyzer_blend_cash_pct", "FLOAT DEFAULT 0.50"),
    # ── User: Calendar integrations ──
    ("users", "google_calendar_token", "TEXT"),
    ("users", "google_calendar_id", "VARCHAR"),
    ("users", "google_calendar_sync", "BOOLEAN DEFAULT FALSE"),
    ("users", "outlook_calendar_token", "TEXT"),
    ("users", "outlook_calendar_id", "VARCHAR"),
    ("users", "outlook_calendar_sync", "BOOLEAN DEFAULT FALSE"),
    ("users", "caldav_username", "VARCHAR"),
    ("users", "caldav_password_encrypted", "VARCHAR"),
    ("users", "caldav_calendar_url", "VARCHAR"),
    ("users", "caldav_sync", "BOOLEAN DEFAULT FALSE"),
    ("users", "ical_feed_token", "VARCHAR"),
    # ── User: Reminder preferences ──
    ("users", "task_reminder_email", "BOOLEAN DEFAULT TRUE"),
    ("users", "task_reminder_sms", "BOOLEAN DEFAULT FALSE"),
    # ── User: AI Provider override ──
    ("users", "ai_provider_override", "VARCHAR"),
    ("users", "ai_model_override", "VARCHAR"),
    ("users", "ai_override_enabled", "BOOLEAN DEFAULT FALSE"),
    # ── User: Loan Servicing ──
    ("users", "loan_servicing_enabled", "BOOLEAN DEFAULT FALSE"),
    ("users", "loan_servicing_onboarding_complete", "BOOLEAN DEFAULT FALSE"),
    ("users", "stripe_connect_account_id", "VARCHAR"),
    ("users", "stripe_connect_enabled", "BOOLEAN DEFAULT FALSE"),
    ("users", "is_superadmin", "BOOLEAN DEFAULT FALSE"),
    ("users", "bank_negotiation_enabled", "BOOLEAN DEFAULT FALSE"),
    # ── User: Social Media OAuth ──
    ("users", "facebook_page_token", "TEXT"),
    ("users", "facebook_connected", "BOOLEAN DEFAULT FALSE"),
    ("users", "linkedin_token", "TEXT"),
    ("users", "linkedin_connected", "BOOLEAN DEFAULT FALSE"),
    ("users", "x_twitter_token", "TEXT"),
    ("users", "x_twitter_connected", "BOOLEAN DEFAULT FALSE"),
    ("users", "instagram_token", "TEXT"),
    ("users", "instagram_connected", "BOOLEAN DEFAULT FALSE"),
    # ── User: Loan Servicing Tenant Config ──
    ("users", "loan_stripe_connect_account_id", "VARCHAR"),
    ("users", "loan_stripe_connect_enabled", "BOOLEAN DEFAULT FALSE"),
    ("users", "loan_stripe_publishable_key", "VARCHAR"),
    ("users", "loan_company_name", "VARCHAR"),
    ("users", "company_logo_url", "VARCHAR"),
    ("users", "loan_portal_primary_color", "VARCHAR DEFAULT '#1B3A6B'"),
    ("users", "loan_default_investor_pct", "FLOAT DEFAULT 4.0"),
    ("users", "loan_servicing_fee_pct", "FLOAT DEFAULT 0.0"),
    ("users", "loan_servicing_fee_stripe_account", "VARCHAR"),
    # ── User: Subscription / Onboarding ──
    ("users", "plan", "VARCHAR DEFAULT 'starter'"),
    ("users", "billing_interval", "VARCHAR DEFAULT 'monthly'"),
    ("users", "subscription_status", "VARCHAR DEFAULT 'trialing'"),
    ("users", "trial_ends_at", "TIMESTAMP"),
    ("users", "subscription_ends_at", "TIMESTAMP"),
    ("users", "stripe_customer_id", "VARCHAR"),
    ("users", "stripe_subscription_id", "VARCHAR"),
    ("users", "paypal_subscription_id", "VARCHAR"),
    ("users", "helm_addon_active", "BOOLEAN DEFAULT FALSE"),
    ("users", "helm_addon_billing_interval", "VARCHAR"),
    ("users", "trial_reminder_sent", "BOOLEAN DEFAULT FALSE"),
    ("users", "onboarding_completed", "BOOLEAN DEFAULT FALSE"),
    ("users", "onboarding_step", "INTEGER DEFAULT 0"),
    # ── User: Notification channel preferences ──
    ("users", "telegram_enabled", "BOOLEAN DEFAULT FALSE"),
    ("users", "telegram_chat_id", "VARCHAR"),
    ("users", "whatsapp_enabled", "BOOLEAN DEFAULT FALSE"),
    ("users", "whatsapp_phone_number", "VARCHAR"),
    ("users", "slack_enabled", "BOOLEAN DEFAULT FALSE"),
    ("users", "slack_webhook_url", "VARCHAR"),
    # ── User: AI Assistant channel preference ──
    ("users", "assistant_channel", "VARCHAR DEFAULT 'web'"),
    ("users", "voice_enabled", "BOOLEAN DEFAULT FALSE"),
    # ── CRM Deals: Campaign / marketing tracking ──
    ("crm_deals", "campaign_id", "VARCHAR"),
    ("crm_deals", "campaign_type", "VARCHAR"),
    ("crm_deals", "campaign_name", "VARCHAR"),
    # ── User: Preferred TTS voice ──
    ("users", "preferred_voice", "VARCHAR DEFAULT 'nova'"),
    # ── ATTOM Property Data (auto-populated from property lookup) ──
    ("crm_deals", "attom_id", "VARCHAR"),
    ("crm_deals", "apn", "VARCHAR"),
    ("crm_deals", "fips", "VARCHAR"),
    ("crm_deals", "county", "VARCHAR"),
    ("crm_deals", "subdivision", "VARCHAR"),
    ("crm_deals", "school_district", "VARCHAR"),
    ("crm_deals", "legal_description", "TEXT"),
    ("crm_deals", "zoning", "VARCHAR"),
    ("crm_deals", "lot_size_acres", "REAL"),
    ("crm_deals", "stories", "INTEGER"),
    ("crm_deals", "bathrooms_half", "INTEGER"),
    ("crm_deals", "total_rooms", "INTEGER"),
    ("crm_deals", "basement_type", "VARCHAR"),
    ("crm_deals", "basement_sqft", "INTEGER"),
    ("crm_deals", "construction_type", "VARCHAR"),
    ("crm_deals", "exterior_walls", "VARCHAR"),
    ("crm_deals", "roof_type", "VARCHAR"),
    ("crm_deals", "foundation_type", "VARCHAR"),
    ("crm_deals", "heating", "VARCHAR"),
    ("crm_deals", "cooling", "VARCHAR"),
    ("crm_deals", "water_type", "VARCHAR"),
    ("crm_deals", "sewer_type", "VARCHAR"),
    ("crm_deals", "pool", "VARCHAR"),
    ("crm_deals", "fireplace_count", "INTEGER"),
    ("crm_deals", "parking_spaces", "INTEGER"),
    ("crm_deals", "absentee_owner", "VARCHAR"),
    # ── ATTOM Tax / Valuation ──
    ("crm_deals", "market_value", "REAL"),
    ("crm_deals", "market_land_value", "REAL"),
    ("crm_deals", "market_improvement_value", "REAL"),
    ("crm_deals", "assessed_value", "REAL"),
    ("crm_deals", "assessed_land_value", "REAL"),
    ("crm_deals", "assessed_improvement_value", "REAL"),
    ("crm_deals", "tax_year", "INTEGER"),
    # ── ATTOM Sale History (most recent) ──
    ("crm_deals", "last_sale_date", "VARCHAR"),
    ("crm_deals", "last_sale_price", "REAL"),
    ("crm_deals", "last_sale_buyer", "VARCHAR"),
    ("crm_deals", "last_sale_seller", "VARCHAR"),
    # ── Raw ATTOM JSON dump ──
    ("crm_deals", "attom_raw_data", "TEXT"),
    # ── ATTOM Owner / Mailing ──
    ("crm_deals", "owner_name", "VARCHAR"),
    ("crm_deals", "owner_name2", "VARCHAR"),
    ("crm_deals", "owner_type", "VARCHAR"),
    ("crm_deals", "mailing_address", "VARCHAR"),
    ("crm_deals", "mailing_city", "VARCHAR"),
    ("crm_deals", "mailing_state", "VARCHAR"),
    ("crm_deals", "mailing_zip", "VARCHAR"),
    # ── ATTOM Additional Property Fields ──
    ("crm_deals", "census_tract", "VARCHAR"),
    ("crm_deals", "municipality", "VARCHAR"),
    ("crm_deals", "county_use_code", "VARCHAR"),
    ("crm_deals", "tax_code_area", "VARCHAR"),
    ("crm_deals", "lot_number", "VARCHAR"),
    ("crm_deals", "parking_type", "VARCHAR"),
    ("crm_deals", "geo_accuracy", "VARCHAR"),
    # ── ATTOM Appraised Values ──
    ("crm_deals", "appraised_total_value", "REAL DEFAULT NULL"),
    ("crm_deals", "appraised_land_value", "REAL DEFAULT NULL"),
    ("crm_deals", "appraised_improvement_value", "REAL DEFAULT NULL"),
    # ── ATTOM Calculated Values ──
    ("crm_deals", "calc_total_value", "REAL DEFAULT NULL"),
    ("crm_deals", "calc_land_value", "REAL DEFAULT NULL"),
    ("crm_deals", "calc_improvement_value", "REAL DEFAULT NULL"),
    # ── ATTOM Tax Per Sqft ──
    ("crm_deals", "tax_per_sqft", "REAL DEFAULT NULL"),
    # ── ATTOM Lot Detail ──
    ("crm_deals", "lot_depth", "VARCHAR DEFAULT NULL"),
    ("crm_deals", "lot_frontage", "VARCHAR DEFAULT NULL"),
    # ── ATTOM Building Sizes ──
    ("crm_deals", "building_size", "INTEGER DEFAULT NULL"),
    ("crm_deals", "gross_size", "INTEGER DEFAULT NULL"),
    # ── ATTOM Sale History JSON ──
    ("crm_deals", "sale_history_json", "TEXT DEFAULT NULL"),
    # ── ATTOM Lien/Mortgage Records JSON ──
    ("crm_deals", "lien_records_json", "TEXT DEFAULT NULL"),
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

    # ── Schema fixes: drop & recreate tables whose columns changed ──
    # negotiation_recipients was originally created with different column names
    # (negotiation_id, ai_researched, ai_confidence, etc.). The model now uses
    # case_id, confidence, sources_json. Since no real data exists yet (all
    # research attempts failed), drop and let create_all rebuild it correctly.
    #
    # IMPORTANT: PostgreSQL aborts the entire transaction after a query error,
    # so we must use SEPARATE transactions for the check vs the drop.
    _TABLES_TO_REBUILD = {"negotiation_recipients": "case_id"}
    for tbl, required_col in _TABLES_TO_REBUILD.items():
        needs_rebuild = False
        # Step 1: Check if column exists (separate transaction)
        try:
            async with engine.begin() as check_conn:
                await check_conn.execute(text(f"SELECT {required_col} FROM {tbl} LIMIT 0"))
            logger.info("Table %s already has column %s — skipping rebuild", tbl, required_col)
        except Exception:
            needs_rebuild = True
            logger.info("Table %s missing column %s — will drop and recreate", tbl, required_col)

        # Step 2: Drop old table (separate transaction)
        if needs_rebuild:
            try:
                async with engine.begin() as drop_conn:
                    await drop_conn.execute(text(f"DROP TABLE IF EXISTS {tbl} CASCADE"))
                logger.info("Dropped table %s for schema rebuild", tbl)
            except Exception as drop_err:
                logger.warning("Could not drop %s: %s", tbl, drop_err)

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


