-- Run this in the Supabase SQL Editor before starting Helm Hub in production.
-- All tables mirror the SQLAlchemy models in database.py.

-- ── Tenants ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  ghl_location_id       TEXT UNIQUE,
  ghl_access_token      TEXT,
  ghl_refresh_token     TEXT,
  telegram_chat_id      TEXT,
  whatsapp_phone        TEXT,
  system_prompt         TEXT,
  gating_config         JSONB DEFAULT '{}',
  agent_config          JSONB DEFAULT '{}',
  is_active             BOOLEAN DEFAULT TRUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  -- REIFundamentals Hub plugin fields
  rei_organization_id   TEXT,
  rei_subscription_plan TEXT,
  rei_trial_ends_at     TIMESTAMPTZ,
  -- Helm Hub link status (mirrored from profiles table)
  helm_hub_linked       BOOLEAN DEFAULT FALSE,
  helm_hub_linked_at    TIMESTAMPTZ
);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- ── Conversations ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  title       TEXT DEFAULT 'New conversation',
  channel     TEXT DEFAULT 'web',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- ── Messages ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role              TEXT NOT NULL,
  content           TEXT NOT NULL,
  metadata_json     JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ── Memories ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memories (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  summary         TEXT,
  category        TEXT DEFAULT 'general',
  embedding_json  TEXT,
  metadata_json   JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- ── Goals ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  goal            TEXT NOT NULL,
  status          TEXT DEFAULT 'active',
  target_date     TEXT,
  progress_notes  JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

-- ── Check-in State ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checkin_state (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  last_checkin_at       TIMESTAMPTZ,
  last_checkin_type     TEXT,
  last_checkin_summary  TEXT,
  pending_items         JSONB DEFAULT '[]',
  suppressed_items      JSONB DEFAULT '[]',
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE checkin_state ENABLE ROW LEVEL SECURITY;

-- ── Agent Logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_logs (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT,
  agent_name      TEXT NOT NULL,
  task            TEXT NOT NULL,
  status          TEXT NOT NULL,
  input_summary   TEXT,
  output_summary  TEXT,
  duration_ms     INTEGER,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
```

---

## File 3 — EDIT: `helm-hub/pyproject.toml`

Open `C:\\Users\\ssmar\\Documents\\GitHub\\HelmEcosystem\\helm-hub\\pyproject.toml` in Notepad.

Find the `[project]` dependencies section and add these two lines alongside the existing dependencies:
```
"supabase>=2.3.0",
"asyncpg>=0.29.0",