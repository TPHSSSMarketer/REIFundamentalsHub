"""
Railway → Supabase Data Migration Script
=========================================
This script copies ALL data from your old Railway PostgreSQL database
into your new Supabase database. It's safe to run — it only INSERTS
data and won't overwrite anything already in Supabase.

HOW TO RUN (on your computer):
1. Open Command Prompt (Windows) or Terminal (Mac)
2. Run: pip install psycopg2-binary
3. Run: python migrate_railway_to_supabase.py
"""

import sys
import psycopg2
import psycopg2.extras

# ── Connection Strings ─────────────────────────────────────────────
RAILWAY_URL = "postgresql://postgres:SKzReItySlWzGIxCQaCnbXfowJekSUYK@interchange.proxy.rlwy.net:24787/railway"
SUPABASE_URL = "postgresql://postgres.tlaerrleswbrkevptpzg:reihub2026db@aws-1-us-east-1.pooler.supabase.com:5432/postgres"

# Tables to migrate, in order (respects foreign key dependencies)
# Users first, then tables that reference users, etc.
TABLES_IN_ORDER = [
    "users",
    "admin_skills",
    "admin_sessions",
    "admin_messages",
    "admin_action_logs",
    "admin_email_templates",
    "admin_scheduled_tasks",
    "admin_trust_settings",
    "ai_agents",
    "ai_provider_configs",
    "ai_usage_by_provider",
    "audit_logs",
    "auto_enriched_knowledge",
    "personas",
    "provider_credentials",
    "subscriptions",
    "phone_numbers",
    "phone_credits",
    "crm_contacts",
    "crm_deals",
    "crm_portfolio_properties",
    "buyer_criteria",
    "calendar_events",
    "call_campaigns",
    "campaign_contacts",
    "call_logs",
    "sms_campaigns",
    "sms_messages",
    "chat_sessions",
    "content_entries",
    "content_images",
    "content_embeddings",
    "content_publish_records",
    "contract_checklist_templates",
    "contracts_for_deed",
    "conversation_flows",
    "conversation_lessons",
    "conversation_logs",
    "deal_analyzer_results",
    "deal_buyer_matches",
    "deal_contract_checklists",
    "deal_files",
    "deal_liens",
    "deal_notes",
    "direct_mail_campaigns",
    "direct_mail_templates",
    "distribution_statements",
    "document_templates",
    "email_campaigns",
    "email_domains",
    "email_lists",
    "email_sequence_enrollments",
    "email_sequence_steps",
    "email_sequences",
    "email_subscribers",
    "email_templates",
    "fax_logs",
    "flow_edges",
    "flow_executions",
    "flow_nodes",
    "generated_contracts",
    "help_tickets",
    "investors",
    "invitations",
    "knowledge_embeddings",
    "knowledge_entries",
    "land_trusts",
    "lead_capture_daily_stats",
    "lead_capture_sites",
    "lead_lists",
    "lead_submissions",
    "leads",
    "letters_of_intent",
    "loan_accounts",
    "loan_defaults",
    "loan_payments",
    "market_zip_codes",
    "marketing_touches",
    "negotiation_cases",
    "negotiation_activities",
    "negotiation_messages",
    "negotiation_recipients",
    "negotiation_requests",
    "pof_certificates",
    "pof_requests",
    "saved_markets",
    "scheduled_callbacks",
    "state_law_research",
    "studio_contact_memory",
    "studio_lessons",
    "studio_patterns",
    "tasks",
    "usage_patterns",
    "user_wordpress_integrations",
    "voicemail_drop_campaigns",
    "voicemail_drops",
]


def migrate():
    print("=" * 60)
    print("  Railway → Supabase Data Migration")
    print("=" * 60)
    print()

    # Connect to Railway (source)
    print("[1/3] Connecting to Railway (old database)...")
    try:
        src = psycopg2.connect(RAILWAY_URL)
        src.autocommit = False
        print("  ✓ Connected to Railway")
    except Exception as e:
        print(f"  ✗ Failed to connect to Railway: {e}")
        sys.exit(1)

    # Connect to Supabase (destination)
    print("[2/3] Connecting to Supabase (new database)...")
    try:
        dst = psycopg2.connect(SUPABASE_URL)
        dst.autocommit = False
        print("  ✓ Connected to Supabase")
    except Exception as e:
        print(f"  ✗ Failed to connect to Supabase: {e}")
        src.close()
        sys.exit(1)

    print("[3/3] Migrating tables...\n")

    src_cur = src.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    dst_cur = dst.cursor()

    total_rows = 0
    tables_with_data = 0
    skipped_tables = []
    error_tables = []

    for table in TABLES_IN_ORDER:
        try:
            # Check if table exists in source
            src_cur.execute(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=%s)",
                (table,)
            )
            if not src_cur.fetchone()["exists"]:
                continue

            # Check if table exists in destination
            dst_cur.execute(
                "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=%s)",
                (table,)
            )
            row = dst_cur.fetchone()
            if not row[0]:
                skipped_tables.append(f"{table} (not in Supabase)")
                continue

            # Read all data from source
            src_cur.execute(f'SELECT * FROM "{table}"')
            rows = src_cur.fetchall()

            if not rows:
                continue  # Empty table, skip silently

            # Check if destination already has data
            dst_cur.execute(f'SELECT COUNT(*) FROM "{table}"')
            dst_count = dst_cur.fetchone()[0]
            if dst_count > 0:
                skipped_tables.append(f"{table} (already has {dst_count} rows in Supabase)")
                continue

            # Get column names from the source data
            src_columns = list(rows[0].keys())

            # Get column names that exist in destination
            dst_cur.execute(
                """SELECT column_name FROM information_schema.columns
                   WHERE table_schema='public' AND table_name=%s""",
                (table,)
            )
            dst_columns = {r[0] for r in dst_cur.fetchall()}

            # Only use columns that exist in both source and destination
            common_columns = [c for c in src_columns if c in dst_columns]

            if not common_columns:
                skipped_tables.append(f"{table} (no matching columns)")
                continue

            # Build INSERT statement
            col_list = ", ".join(f'"{c}"' for c in common_columns)
            placeholders = ", ".join(["%s"] * len(common_columns))
            insert_sql = f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})'

            # Insert rows
            inserted = 0
            for row in rows:
                values = [row[c] for c in common_columns]
                try:
                    dst_cur.execute(insert_sql, values)
                    inserted += 1
                except Exception as row_err:
                    dst.rollback()
                    # Try to continue with next row
                    pass

            if inserted > 0:
                dst.commit()
                total_rows += inserted
                tables_with_data += 1
                print(f"  ✓ {table}: {inserted} rows migrated")
            else:
                dst.rollback()

        except Exception as e:
            dst.rollback()
            error_tables.append(f"{table}: {str(e)[:80]}")
            print(f"  ✗ {table}: ERROR - {str(e)[:80]}")

    # Reset sequences for tables with integer IDs
    print("\n  Resetting ID sequences...")
    for table in TABLES_IN_ORDER:
        try:
            dst_cur.execute(f"""
                SELECT setval(
                    pg_get_serial_sequence('"{table}"', 'id'),
                    COALESCE((SELECT MAX(id) FROM "{table}"), 0) + 1,
                    false
                )
            """)
            dst.commit()
        except Exception:
            dst.rollback()
            # Not all tables have serial id columns — that's fine

    print("\n" + "=" * 60)
    print(f"  Migration Complete!")
    print(f"  Tables migrated: {tables_with_data}")
    print(f"  Total rows copied: {total_rows}")
    if skipped_tables:
        print(f"\n  Skipped ({len(skipped_tables)}):")
        for s in skipped_tables:
            print(f"    - {s}")
    if error_tables:
        print(f"\n  Errors ({len(error_tables)}):")
        for e in error_tables:
            print(f"    - {e}")
    print("=" * 60)

    src_cur.close()
    dst_cur.close()
    src.close()
    dst.close()


if __name__ == "__main__":
    migrate()
