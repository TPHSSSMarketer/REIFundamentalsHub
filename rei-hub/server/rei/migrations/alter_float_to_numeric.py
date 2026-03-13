"""Migration: Convert Float columns to Numeric for financial precision.

This migration alters all DOUBLE PRECISION / Float columns to NUMERIC(14,2)
or NUMERIC(8,4) across multiple tables for improved financial accuracy.
"""

async def alter_float_to_numeric(engine):
    """ALTER existing Float columns to Numeric(14,2) or Numeric(8,4).

    Each ALTER runs in its own transaction so a single failure (e.g.
    column already correct type or missing) doesn't abort the rest.
    Uses engine.begin() directly — no extra session/pool overhead.
    """
    from sqlalchemy import text

    # List of (table_name, column_name, new_type) tuples
    statements = [
            # ── loan_accounts ──
            ("loan_accounts", "original_balance", "NUMERIC(14,2)"),
            ("loan_accounts", "current_balance", "NUMERIC(14,2)"),
            ("loan_accounts", "monthly_payment", "NUMERIC(14,2)"),
            ("loan_accounts", "interest_rate", "NUMERIC(8,4)"),
            ("loan_accounts", "late_fee_amount", "NUMERIC(14,2)"),

            # ── buyer_criteria ──
            ("buyer_criteria", "min_budget", "NUMERIC(14,2)"),
            ("buyer_criteria", "max_budget", "NUMERIC(14,2)"),

            # ── crm_deals ──
            ("crm_deals", "list_price", "NUMERIC(14,2)"),
            ("crm_deals", "offer_price", "NUMERIC(14,2)"),
            ("crm_deals", "purchase_price", "NUMERIC(14,2)"),
            ("crm_deals", "arv", "NUMERIC(14,2)"),
            ("crm_deals", "earnest_money", "NUMERIC(14,2)"),
            ("crm_deals", "down_payment", "NUMERIC(14,2)"),
            ("crm_deals", "closing_costs_buyer", "NUMERIC(14,2)"),
            ("crm_deals", "loan_origination_fee", "NUMERIC(14,2)"),
            ("crm_deals", "appraisal_fee", "NUMERIC(14,2)"),
            ("crm_deals", "inspection_fee", "NUMERIC(14,2)"),
            ("crm_deals", "title_insurance", "NUMERIC(14,2)"),
            ("crm_deals", "attorney_fee", "NUMERIC(14,2)"),
            ("crm_deals", "survey_fee", "NUMERIC(14,2)"),
            ("crm_deals", "other_acquisition_costs", "NUMERIC(14,2)"),
            ("crm_deals", "rehab_estimate", "NUMERIC(14,2)"),
            ("crm_deals", "rehab_actual", "NUMERIC(14,2)"),
            ("crm_deals", "permit_fees", "NUMERIC(14,2)"),
            ("crm_deals", "architect_fees", "NUMERIC(14,2)"),
            ("crm_deals", "holding_costs_during_rehab", "NUMERIC(14,2)"),
            ("crm_deals", "loan_amount", "NUMERIC(14,2)"),
            ("crm_deals", "interest_rate", "NUMERIC(8,4)"),
            ("crm_deals", "monthly_mortgage_pi", "NUMERIC(14,2)"),
            ("crm_deals", "pmi_monthly", "NUMERIC(14,2)"),
            ("crm_deals", "property_tax_annual", "NUMERIC(14,2)"),
            ("crm_deals", "insurance_annual", "NUMERIC(14,2)"),
            ("crm_deals", "property_mgmt_percent", "NUMERIC(8,4)"),
            ("crm_deals", "property_mgmt_flat", "NUMERIC(14,2)"),
            ("crm_deals", "vacancy_percent", "NUMERIC(8,4)"),
            ("crm_deals", "maintenance_percent", "NUMERIC(8,4)"),
            ("crm_deals", "hoa_monthly", "NUMERIC(14,2)"),
            ("crm_deals", "utilities_monthly", "NUMERIC(14,2)"),
            ("crm_deals", "other_expenses_monthly", "NUMERIC(14,2)"),
            ("crm_deals", "monthly_rent", "NUMERIC(14,2)"),
            ("crm_deals", "other_monthly_income", "NUMERIC(14,2)"),
            ("crm_deals", "all_in_cost", "NUMERIC(14,2)"),
            ("crm_deals", "total_monthly_expenses", "NUMERIC(14,2)"),
            ("crm_deals", "monthly_cash_flow", "NUMERIC(14,2)"),
            ("crm_deals", "annual_cash_flow", "NUMERIC(14,2)"),
            ("crm_deals", "cash_on_cash", "NUMERIC(8,4)"),
            ("crm_deals", "cap_rate", "NUMERIC(8,4)"),
            ("crm_deals", "roi_percent", "NUMERIC(8,4)"),
            ("crm_deals", "debt_service_coverage_ratio", "NUMERIC(8,4)"),
            ("crm_deals", "appraised_total_value", "NUMERIC(14,2)"),
            ("crm_deals", "appraised_land_value", "NUMERIC(14,2)"),
            ("crm_deals", "appraised_improvement_value", "NUMERIC(14,2)"),
            ("crm_deals", "calc_total_value", "NUMERIC(14,2)"),
            ("crm_deals", "calc_land_value", "NUMERIC(14,2)"),
            ("crm_deals", "calc_improvement_value", "NUMERIC(14,2)"),
            ("crm_deals", "tax_per_sqft", "NUMERIC(14,2)"),
            ("crm_deals", "market_value", "NUMERIC(14,2)"),
            ("crm_deals", "market_land_value", "NUMERIC(14,2)"),
            ("crm_deals", "market_improvement_value", "NUMERIC(14,2)"),
            ("crm_deals", "assessed_value", "NUMERIC(14,2)"),
            ("crm_deals", "assessed_land_value", "NUMERIC(14,2)"),
            ("crm_deals", "assessed_improvement_value", "NUMERIC(14,2)"),
            ("crm_deals", "last_sale_price", "NUMERIC(14,2)"),
            ("crm_deals", "asking_price", "NUMERIC(14,2)"),
            ("crm_deals", "best_cash_offer", "NUMERIC(14,2)"),
            ("crm_deals", "previous_offer_amount", "NUMERIC(14,2)"),
            ("crm_deals", "back_taxes", "NUMERIC(14,2)"),
            ("crm_deals", "reinstatement_amount", "NUMERIC(14,2)"),
            ("crm_deals", "as_is_value", "NUMERIC(14,2)"),
            ("crm_deals", "estimated_total_repairs", "NUMERIC(14,2)"),
            ("crm_deals", "buyer_down_payment", "NUMERIC(14,2)"),

            # ── crm_portfolio_properties ──
            ("crm_portfolio_properties", "purchase_price", "NUMERIC(14,2)"),
            ("crm_portfolio_properties", "rehab_cost", "NUMERIC(14,2)"),
            ("crm_portfolio_properties", "current_value", "NUMERIC(14,2)"),
            ("crm_portfolio_properties", "loan_balance", "NUMERIC(14,2)"),
            ("crm_portfolio_properties", "monthly_mortgage", "NUMERIC(14,2)"),
            ("crm_portfolio_properties", "monthly_rent", "NUMERIC(14,2)"),

            # ── direct_mail_campaigns ──
            ("direct_mail_campaigns", "total_cost", "NUMERIC(14,2)"),

            # ── marketing_touches ──
            ("marketing_touches", "cost", "NUMERIC(14,2)"),

            # ── deal_liens ──
            ("deal_liens", "balance", "NUMERIC(14,2)"),
            ("deal_liens", "monthly_payment", "NUMERIC(14,2)"),
            ("deal_liens", "interest_rate", "NUMERIC(8,4)"),
            ("deal_liens", "amount_behind", "NUMERIC(14,2)"),

            # ── generated_contracts ──
            ("generated_contracts", "purchase_price", "NUMERIC(14,2)"),
            ("generated_contracts", "emd_amount", "NUMERIC(14,2)"),

            # ── phone_numbers ──
            ("phone_numbers", "monthly_cost", "NUMERIC(14,2)"),

            # ── call_logs ──
            ("call_logs", "cost", "NUMERIC(14,2)"),

            # ── sms_messages ──
            ("sms_messages", "cost", "NUMERIC(14,2)"),

            # ── phone_credits ──
            ("phone_credits", "purchase_price", "NUMERIC(14,2)"),
            ("phone_credits", "as_is_value", "NUMERIC(14,2)"),
            ("phone_credits", "existing_mortgage_balance", "NUMERIC(14,2)"),
            ("phone_credits", "monthly_payment", "NUMERIC(14,2)"),
            ("phone_credits", "interest_rate", "NUMERIC(8,4)"),
            ("phone_credits", "owner_finance_down", "NUMERIC(14,2)"),
            ("phone_credits", "lease_monthly_payment", "NUMERIC(14,2)"),
            ("phone_credits", "option_purchase_price", "NUMERIC(14,2)"),

            # ── saved_markets ──
            ("saved_markets", "median_home_price", "NUMERIC(14,2)"),
            ("saved_markets", "median_rent", "NUMERIC(14,2)"),
            ("saved_markets", "price_change_pct", "NUMERIC(8,4)"),
        ]

    for table, col, new_type in statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(
                    text(
                        f"ALTER TABLE {table} ALTER COLUMN {col} "
                        f"TYPE {new_type} USING {col}::{new_type}"
                    )
                )
        except Exception:
            # Column already correct type, doesn't exist, or table missing — skip
            pass
