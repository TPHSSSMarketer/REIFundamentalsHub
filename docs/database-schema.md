# Database Schema Reference

## Overview

REI Hub uses a dedicated Supabase PostgreSQL project.

| Product | Access Method | Key | Can Write |
|---------|-------------|-----|-----------|
| REIFundamentals Hub (browser) | Supabase client (anon key + RLS) | VITE_SUPABASE_ANON_KEY | Own rows only |
| REI Hub Backend (server) | Supabase client (service role key) | SUPABASE_SERVICE_ROLE_KEY | Any row |

---

## Migration History

| File | Applied | Description |
|------|---------|-------------|
| `001_initial_schema.sql` | ✅ Applied | organizations, profiles, RLS policies, auto-create profile trigger |
| `002_rei_plugin_tables.sql` | ⏳ Pending | rei_deals, rei_contacts, rei_rules, rei_market_data, rei_portfolio |

Run migrations via Supabase Dashboard → SQL Editor, or with the Supabase CLI:
```bash
supabase db push
```

---

## Table Reference

### `organizations` (from 001)
The primary tenant record for REIFundamentals Hub.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Referenced by rei_* tables |
| name | TEXT | Organization/company name |
| owner_id | UUID FK → profiles | The account owner |
| plan | TEXT | 'free', 'starter', 'pro', 'team' |
| trial_ends_at | TIMESTAMPTZ | Used for trial gating |
| ghl_* | TEXT | GoHighLevel API keys (legacy — may be removed) |
| google_* | TEXT | Google OAuth tokens |
| created_at | TIMESTAMPTZ | |

### `profiles` (from 001)
User profiles — one per Supabase auth user.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Matches auth.uid() |
| email | TEXT | Used for tenant linking flow |
| full_name | TEXT | |
| company_name | TEXT | |
| organization_id | UUID FK → organizations | |
| role | TEXT | 'owner', 'member', 'admin' |

### `rei_deals` (from 002)
The deal pipeline. Written by REI Hub's Pipeline Kanban.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → profiles | RLS: auth.uid() = user_id |
| address | TEXT NOT NULL | Full street address |
| city, state, zip | TEXT | |
| stage | TEXT | lead → analysis → offer → under_contract → due_diligence → closing → closed_won/lost |
| list_price | INTEGER | Cents |
| purchase_price | INTEGER | Cents |
| arv | INTEGER | After Repair Value, cents |
| rehab_estimate | INTEGER | Cents |
| all_in_cost | INTEGER | purchase + rehab + closing + holding, cents |
| monthly_rent | INTEGER | Cents |
| cash_on_cash | INTEGER | Basis points (1000 = 10.00%) |
| cap_rate | INTEGER | Basis points |
| offer_expires_at | TIMESTAMPTZ | Triggers URGENT alert when within 48h |
| inspection_deadline | TIMESTAMPTZ | Triggers URGENT alert when within 48h |
| option_period_end | TIMESTAMPTZ | Triggers CALL when today |
| closing_date | TIMESTAMPTZ | Triggers CALL on the day |
| source | TEXT | 'mls', 'wholesaler', 'direct_mail', 'driving' |
| is_urgent | BOOLEAN | Manual override for urgent flag |
| passed_reason | TEXT | Why deal was rejected |

### `rei_contacts` (from 002)
CRM contacts for REI. Written by REI Hub Contacts.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → profiles | RLS enforced |
| name | TEXT NOT NULL | |
| role | TEXT | agent, broker, lender, contractor, wholesaler, property_manager, attorney, cpa, seller, buyer, partner |
| company | TEXT | |
| phone, email | TEXT | |
| preferred_channel | TEXT | email, telegram, whatsapp, phone |
| markets | TEXT[] | Array of zip codes or metro names |
| rating | INTEGER | 1-5 stars |
| last_contacted_at | TIMESTAMPTZ | Used for follow-up reminders |
| interaction_count | INTEGER | Incremented after each contact |

### `rei_rules` (from 002)
Investment criteria. Written via REI Hub Settings UI, used for deal evaluation.
One row per user (UNIQUE on user_id).

| Column | Type | Notes |
|--------|------|-------|
| max_purchase_price | INTEGER | Cents — hard rule ceiling |
| min_cash_on_cash | INTEGER | Basis points — hard rule floor |
| max_offer_pct_of_arv | INTEGER | Basis points — e.g., 7500 = 75% |
| max_rehab_budget | INTEGER | Cents — walk away threshold |
| hard_rules | JSONB | Flexible hard rules as key-value |
| soft_rules | JSONB | Flexible soft rules as key-value |
| investment_strategies | TEXT[] | buy_hold, brrrr, flip, wholesale |
| preferred_property_types | TEXT[] | sfr, duplex, triplex, quad, multi |
| target_markets | TEXT[] | Zip codes or metro names |

### `rei_market_data` (from 002)
Market research per zip code.
UNIQUE on (user_id, zip).

| Column | Type | Notes |
|--------|------|-------|
| zip | TEXT | Target zip code |
| metro | TEXT | Metro area name |
| median_home_price | INTEGER | Cents |
| median_rent_sfr | INTEGER | Cents/month |
| rent_to_price_ratio | INTEGER | Basis points |
| avg_days_on_market | INTEGER | Days |
| vacancy_rate | INTEGER | Basis points |
| population_growth_rate | INTEGER |