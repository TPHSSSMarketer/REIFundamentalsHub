-- ── rei_deals ─────────────────────────────────────────────────────────────────
-- Written by REI Hub frontend
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