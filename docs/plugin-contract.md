# Plugin Contract: Helm Hub ↔ REIFundamentals Hub

## Overview

The REIFundamentals Hub plugin extends Helm Hub with real estate investing
capabilities. It is the first plugin in what will become a general plugin
ecosystem for Helm Hub.

A user gets REI features inside Helm Hub only when both conditions are true:
1. They have an **active REIFundamentals Hub subscription** (plan = pro or team,
   trial_ends_at in the future) stored in the shared Supabase instance.
2. They have **linked their REI account** in Helm Hub settings (their
   `tenant.rei_organization_id` is populated).

---

## Plugin Identifier
```
slug:     rei-fundamentals
version:  1.0.0
provider: REIFundamentals Hub
```

---

## What the Plugin Contributes to Helm Hub

### Skills (loaded into agent context when REI plugin is active)

| Skill Slug | Trigger Phrases | Min REI Tier | Description |
|------------|----------------|--------------|-------------|
| `rei-deal-analysis` | "analyze this deal", "run the numbers", "evaluate this property", "what's the MAO" | starter | Full deal evaluation: ARV, cash-on-cash, cap rate, DSCR, 1% rule, red flag detection |
| `rei-market-research` | "research this market", "what's the market like in", "pull comps for", "neighborhood analysis" | starter | Perplexity-powered market research, comp lookup, trend analysis |
| `rei-offer-generator` | "generate an offer", "write an offer", "draft offer letter" | starter | Produces offer letter using deal and contact data from DEALS_PIPELINE.md |
| `rei-comps-lookup` | "find comps", "recent sales near", "what's ARV for" | starter | Structured comparable sales search within 0.5 miles |
| `rei-pipeline-digest` | "pipeline update", "what deals do I have", "deal status" | starter | Reads DEALS_PIPELINE.md and summarizes active deals with urgent flags |
| `rei-portfolio-analyst` | "portfolio performance", "how are my properties doing", "cash flow summary" | pro | Monthly health check: cash-on-cash vs target, lease expirations, refi opportunities |
| `rei-contact-manager` | "add a contact", "update contact", "who is my agent in" | starter | Reads/writes CONTACTS.md, cross-references with active deals |

### Heartbeat Tasks (added to Helm's 30-minute check-in cycle)

| Task Slug | Schedule | Min Tier | What It Does |
|-----------|---------|---------|-------------|
| `rei-deadline-monitor` | Every check-in | starter | Scans DEALS_PIPELINE.md for deadlines within 72 hours, triggers escalation |
| `rei-market-scan` | Daily 6:30am | starter | Perplexity Pro search for new listings matching user's criteria in RULES.md |
| `rei-pipeline-digest` | Daily 6:00pm | starter | Evening summary of all pipeline changes that day |
| `rei-weekly-report` | Sundays 9:00am | pro | Deep research compilation of target markets, sent via Telegram |
| `rei-portfolio-check` | 1st of month | pro | Portfolio health report: actuals vs targets, lease calendar, refi flags |

### Memory Files (initialized when REI plugin is first activated)

| File Slug | Filename | Source | Description |
|-----------|---------|--------|-------------|
| `rei-user-md` | `rei/USER.md` | organizations table | Investor profile, goals, preferences |
| `rei-rules-md` | `rei/RULES.md` | rei_rules table | Investment criteria, hard/soft rules, formulas |
| `rei-deals-md` | `rei/DEALS_PIPELINE.md` | rei_deals table | Live deal pipeline with stages and deadlines |
| `rei-contacts-md` | `rei/CONTACTS.md` | rei_contacts table | Agents, lenders, contractors, sellers |
| `rei-market-md` | `rei/MARKET_CONTEXT.md` | rei_market_data table | Target markets, comps, trends |
| `rei-portfolio-md` | `rei/PORTFOLIO.md` | rei_portfolio table | Current holdings and performance |
| `rei-memory-md` | `rei/MEMORY.md` | agent learning | Accumulated learnings, decision patterns |

All files live at: `helm-hub/workspaces/{tenant_id}/rei/`

---

## Entitlement Check Implementation

### Where it lives
`helm-hub/helm/plugins/rei/entitlement.py` (create if not exists)

### Logic
```python
import asyncio
from datetime import datetime
from functools import lru_cache
from helm.config import settings
from supabase import create_client

# Cache results for 5 minutes to avoid hammering Supabase
_entitlement_cache: dict[str, tuple[bool, float]] = {}
CACHE_TTL_SECONDS = 300

async def check_rei_entitlement(tenant_id: str, rei_org_id: str) -> bool:
    """
    Returns True if the tenant has an active REIFundamentals Hub subscription.
    Fails CLOSED — if Supabase is unreachable, returns False.
    """
    import time

    # Check cache first
    cache_key = f"{tenant_id}:{rei_org_id}"
    if cache_key in _entitlement_cache:
        authorized, cached_at = _entitlement_cache[cache_key]
        if time.time() - cached_at < CACHE_TTL_SECONDS:
            return authorized

    try:
        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        response = client.table("organizations") \\
            .select("plan, trial_ends_at") \\
            .eq("id", rei_org_id) \\
            .single() \\
            .execute()

        if not response.data:
            authorized = False
        else:
            plan = response.data.get("plan", "")
            trial_ends_at = response.data.get("trial_ends_at")

            plan_ok = plan in ("pro", "team", "enterprise")
            trial_ok = True
            if trial_ends_at:
                trial_ok = datetime.fromisoformat(trial_ends_at) > datetime.utcnow()

            authorized = plan_ok and trial_ok

    except Exception as e:
        # Fail CLOSED — deny access if we can't verify
        print(f"[REI Plugin] Entitlement check failed for {tenant_id}: {e}")
        authorized = False

    # Cache the result
    _entitlement_cache[cache_key] = (authorized, time.time())
    return authorized


def clear_entitlement_cache(tenant_id: str = None):
    """Call this when a subscription status changes."""
    global _entitlement_cache
    if tenant_id:
        _entitlement_cache = {k: v for k, v in _entitlement_cache.items()
                               if not k.startswith(tenant_id)}
    else:
        _entitlement_cache = {}
```

### Where to call it
In `helm-hub/helm/plugins/rei/__init__.py` or wherever skills are loaded,
wrap every REI skill load with:
```python
if not await check_rei_entitlement(tenant_id, tenant.rei_organization_id):
    return "REI features require an active REIFundamentals Hub subscription. " \\
           "Visit reifundamentalshub.com to subscribe, then link your account " \\
           "in Helm Hub Settings → Plugins."
```

---

## Context Sync Implementation

### Where it lives
Extend `helm-hub/helm/orchestrator/context_sync.py` (or equivalent file)
with REI-specific sync functions.

### Sync Functions to Add
```python
async def sync_rei_deals(tenant_id: str, rei_org_id: str) -> None:
    """Fetch deals from Supabase, write to DEALS_PIPELINE.md"""
    # 1. Query: SELECT * FROM rei_deals WHERE user_id = rei_org_id ORDER BY updated_at DESC
    # 2. Group by stage
    # 3. Render using the DEALS_PIPELINE.md template
    # 4. Write to workspaces/{tenant_id}/rei/DEALS_PIPELINE.md

async def sync_rei_contacts(tenant_id: str, rei_org_id: str) -> None:
    """Fetch contacts from Supabase, write to CONTACTS.md"""
    # 1. Query: SELECT * FROM rei_contacts WHERE user_id = rei_org_id ORDER BY role, name
    # 2. Group by role
    # 3. Render using the CONTACTS.md template
    # 4. Write to workspaces/{tenant_id}/rei/CONTACTS.md

async def sync_rei_user_profile(tenant_id: str, rei_org_id: str) -> None:
    """Fetch org + rules, write to USER.md and RULES.md"""
    # 1. Query organizations WHERE id = rei_org_id
    # 2. Query rei_rules WHERE user_id = rei_org_id
    # 3. Render USER.md and RULES.md templates
    # 4. Write both files

async def sync_rei_market_data(tenant_id: str, rei_org_id: str) -> None:
    """Fetch market data, write to MARKET_CONTEXT.md"""
    # 1. Query rei_market_data WHERE user_id = rei_org_id
    # 2. Render MARKET_CONTEXT.md template
    # 3. Write to workspaces/{tenant_id}/rei/MARKET_CONTEXT.md

async def sync_rei_portfolio(tenant_id: str, rei_org_id: str) -> None:
    """Fetch portfolio, write to PORTFOLIO.md"""
    # 1. Query rei_portfolio WHERE user_id = rei_org_id
    # 2. Render PORTFOLIO.md template
    # 3. Write to workspaces/{tenant_id}/rei/PORTFOLIO.md

async def sync_all_rei_data(tenant_id: str, rei_org_id: str) -> None:
    """Run all REI syncs in parallel."""
    await asyncio.gather(
        sync_rei_deals(tenant_id, rei_org_id),
        sync_rei_contacts(tenant_id, rei_org_id),
        sync_rei_user_profile(tenant_id, rei_org_id),
        sync_rei_market_data(tenant_id, rei_org_id),
        sync_rei_portfolio(tenant_id, rei_org_id),
    )
```

### Sync Schedule
- Full sync: every 15 minutes for tenants active in last 24 hours
- Hourly: tenants not active in last 24 hours
- Immediate trigger: when Supabase webhook fires for rei_deals INSERT/UPDATE

---

## Supabase Migration 002 — New Tables

File: `rei-hub/supabase/migrations/002_rei_plugin_tables.sql`
```sql
-- ── rei_deals ─────────────────────────────────────────────────────────────────
-- Written by REI Hub frontend, read by Helm Hub context-sync
CREATE TABLE IF NOT EXISTS rei_deals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    address         TEXT NOT NULL,
    city            TEXT,
    state           TEXT,
    zip             TEXT,
    stage           TEXT NOT NULL DEFAULT 'lead'
                    CHECK (stage IN ('lead','analysis','offer','under_contract',
                                     'due_diligence','closing','closed_won',
                                     'closed_lost','archived')),
    -- Financials (stored in cents to avoid float precision issues)
    list_price              INTEGER,
    purchase_price          INTEGER,
    arv                     INTEGER,
    rehab_estimate          INTEGER,
    all_in_cost             INTEGER,
    monthly_rent            INTEGER,
    -- Returns (stored in basis points: 1000 = 10.00%)
    cash_on_cash            INTEGER,
    cap_rate                INTEGER,
    -- Key dates
    offer_expires_at        TIMESTAMPTZ,
    inspection_deadline     TIMESTAMPTZ,
    option_period_end       TIMESTAMPTZ,
    closing_date            TIMESTAMPTZ,
    -- Metadata
    source                  TEXT,
    notes                   TEXT,
    is_urgent               BOOLEAN DEFAULT FALSE,
    passed_reason           TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── rei_contacts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rei_contacts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    role            TEXT NOT NULL
                    CHECK (role IN ('agent','broker','lender','contractor',
                                    'wholesaler','property_manager','attorney',
                                    'cpa','seller','buyer','partner')),
    company         TEXT,
    phone           TEXT,
    email           TEXT,
    preferred_channel TEXT DEFAULT 'email',
    markets         TEXT[],             -- Array of zip codes or metro names
    notes           TEXT,
    rating          INTEGER CHECK (rating BETWEEN 1 AND 5),
    last_contacted_at   TIMESTAMPTZ,
    interaction_count   INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── rei_rules ─────────────────────────────────────────────────────────────────
-- Investment criteria and decision rules, written via REI Hub settings UI
CREATE TABLE IF NOT EXISTS rei_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
    -- Hard rules (never break)
    max_purchase_price      INTEGER,                    -- cents
    min_cash_on_cash        INTEGER,                    -- basis points (1000 = 10%)
    max_offer_pct_of_arv    INTEGER,                    -- basis points (7500 = 75%)
    max_rehab_budget        INTEGER,                    -- cents
    -- Flexible rules stored as JSON for extensibility
    hard_rules              JSONB DEFAULT '{}',
    soft_rules              JSONB DEFAULT '{}',
    investment_strategies   TEXT[] DEFAULT '{}',        -- ['buy_hold','brrrr','flip']
    preferred_property_types TEXT[] DEFAULT '{}',       -- ['sfr','duplex','triplex']
    target_markets          TEXT[] DEFAULT '{}',        -- zip codes or metro names
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── rei_market_data ───────────────────────────────────────────────────────────
-- Market research per zip code, populated by Helm's market scan heartbeat task
CREATE TABLE IF NOT EXISTS rei_market_data (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    zip             TEXT NOT NULL,
    metro           TEXT,
    state           TEXT,
    -- Metrics (prices in cents, rates in basis points)
    median_home_price       INTEGER,
    median_rent_sfr         INTEGER,
    rent_to_price_ratio     INTEGER,                    -- basis points
    avg_days_on_market      INTEGER,
    vacancy_rate            INTEGER,                    -- basis points
    population_growth_rate  INTEGER,                    -- basis points
    job_growth_rate         INTEGER,                    -- basis points
    research_notes          TEXT,
    last_researched_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, zip)
);

-- ── rei_portfolio ─────────────────────────────────────────────────────────────
-- Current holdings, written by REI Hub, read by Helm portfolio analyst
CREATE TABLE IF NOT EXISTS rei_portfolio (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    address         TEXT NOT NULL,
    property_type   TEXT,
    units           INTEGER DEFAULT 1,
    purchase_date   TIMESTAMPTZ,
    purchase_price  INTEGER,                            -- cents
    rehab_cost      INTEGER,                            -- cents
    current_value   INTEGER,                            -- cents
    loan_balance    INTEGER,                            -- cents
    monthly_mortgage INTEGER,                           -- cents
    monthly_rent    INTEGER,                            -- cents
    property_manager_id UUID REFERENCES rei_contacts(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rei_deals_user_id    ON rei_deals(user_id);
CREATE INDEX IF NOT EXISTS idx_rei_deals_stage      ON rei_deals(stage);
CREATE INDEX IF NOT EXISTS idx_rei_deals_updated_at ON rei_deals(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_rei_contacts_user_id ON rei_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_rei_contacts_role    ON rei_contacts(role);
CREATE INDEX IF NOT EXISTS idx_rei_market_user_zip  ON rei_market_data(user_id, zip);
CREATE INDEX IF NOT EXISTS idx_rei_portfolio_user   ON rei_portfolio(user_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE rei_deals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rei_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rei_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rei_market_data  ENABLE ROW LEVEL SECURITY;
ALTER TABLE rei_portfolio    ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data (anon key / browser access)
CREATE POLICY "Users see own deals"
    ON rei_deals FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own contacts"
    ON rei_contacts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own rules"
    ON rei_rules FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own market data"
    ON rei_market_data FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users see own portfolio"
    ON rei_portfolio FOR ALL USING (auth.uid() = user_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_rei_deals
    BEFORE UPDATE ON rei_deals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_rei_contacts
    BEFORE UPDATE ON rei_contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_rei_rules
    BEFORE UPDATE ON rei_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_rei_market_data
    BEFORE UPDATE ON rei_market_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_rei_portfolio
    BEFORE UPDATE ON rei_portfolio
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Tenant Linking Flow

When a user wants to connect their REI Hub account to Helm Hub:
```
1. User goes to Helm Hub → Settings → Plugins → REIFundamentals Hub
2. User enters their REI Hub email (the one they signed up with)
3. Helm Hub queries Supabase: SELECT id FROM organizations
   WHERE owner_id IN (SELECT id FROM profiles WHERE email = :email)
4. Helm Hub stores the organization id in tenants.rei_organization_id
5. Helm Hub runs check_rei_entitlement() immediately
6. If authorized: triggers sync_all_rei_data() immediately
7. Helm confirms: "REI plugin activated. Your deal pipeline and contacts
   are now available to your Helm assistant."
```

---

## Failure Modes & Handling

| Failure | Behavior |
|---------|----------|
| Supabase unreachable at entitlement check | Deny access, log error, tell user to retry |
| Supabase unreachable at context-sync | Keep using last-synced files, log staleness warning |
| rei_organization_id not set on tenant | Prompt user to link their REI account |
| REI subscription expired | Disable REI skills, notify user via Telegram |
| Sync file write fails | Log error, continue with stale data, alert health-monitor |
| rei_deals table empty | Write empty pipeline file, agent responds "no active deals" |

---

## Adding Future Plugins

This pattern is designed to be reused. To add a new plugin (e.g., "HealthHub"):

1. Create `helm-hub/helm/plugins/healthhub/` with the same structure as `rei/`
2. Add entitlement check querying the new product's Supabase table
3. Define skills in `helm-hub/helm/plugins/healthhub/skills/`
4. Add heartbeat tasks to the context-sync schedule
5. Define memory file templates
6. Add a migration to the new product's Supabase project
7. Document in `docs/plugin-contract.md` under a new section

The plugin system is intentionally simple: it's just Python files and
markdown skill files, no plugin registry or dynamic loading needed at
this stage.