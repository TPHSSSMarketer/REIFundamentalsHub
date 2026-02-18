# HelmEcosystem — Architecture Overview

## The Two Products

### Helm Hub (`helm-hub/`)
- **Language:** Python 3.11+
- **Framework:** FastAPI + Uvicorn (async)
- **Database:** SQLite (dev) → Supabase PostgreSQL (prod target)
- **ORM:** SQLAlchemy 2.0 async (aiosqlite driver)
- **Frontend:** Vanilla HTML/CSS/JS (3 files, ~17KB) — no build step
- **AI Engine:** Anthropic SDK (primary) → OpenRouter (fallback) → Claude CLI (last resort)
- **Process Manager:** PM2 (5 processes — see helm-hub/ecosystem.config.js)
- **Containerization:** Docker + Docker Compose
- **Entry point:** `helm-hub/helm/main.py`

**PM2 Process Map:**
| Process | File | Purpose |
|---------|------|---------|
| api | helm/main.py | FastAPI server (port 8000) |
| checkins | helm/checkins/ | Smart proactive notifications (every 30 min) |
| context-sync | helm/orchestrator/ | Syncs external data → workspace files |
| health-monitor | helm/reliability/ | Circuit breakers, health checks |
| retry-processor | helm/reliability/ | Retry queue for failed operations |

**Key internal paths:**
```
helm-hub/helm/
├── main.py              # FastAPI entry point, router registration
├── config.py            # 150+ env vars via pydantic-settings
├── assistant/           # AI engine, memory, prompts, output styles
├── agents/              # 8 sub-agent definitions
├── api/                 # REST routes, auth, middleware, billing
├── integrations/        # 22 plugin files (GHL, Telegram, WhatsApp, etc.)
├── orchestrator/        # Multi-AI routing, agent spawning, context-sync
├── checkins/            # Smart check-in system with gating rules
├── reliability/         # Circuit breakers, retry queue, health checks
├── models/              # SQLAlchemy ORM + Pydantic schemas
└── plugins/
    └── rei/             # REI plugin (partially built — extend this)
```

**Database tables (SQLite, auto-created on startup):**
| Table | Purpose |
|-------|---------|
| tenants | Multi-tenant base — every other table has tenant_id FK |
| conversations | Chat session containers |
| messages | Individual messages per conversation |
| memories | Long-term memory entries per tenant |
| goals | Tenant goals tracked by the agent |
| checkin_state | Tracks last check-in time, cooldowns, gating state |
| agent_logs | Audit trail for all agent tool calls |

---

### REIFundamentals Hub (`rei-hub/`)
- **Language:** TypeScript
- **Framework:** React 18 (Vite 5 SPA — no server-side rendering)
- **Package manager:** npm
- **Styling:** Tailwind CSS 3.4 (navy/red brand theme)
- **State:** Zustand + TanStack React Query
- **Routing:** React Router v6 (client-side only)
- **Backend:** None — browser calls Supabase and external APIs directly
- **Auth:** Supabase Auth
- **Build output:** `rei-hub/dist/` (static files, served by Nginx in Docker)
- **Entry point:** `rei-hub/src/main.tsx`

**Key internal paths:**
```
rei-hub/src/
├── App.tsx              # Router + AppLayout
├── main.tsx             # Entry point (AuthProvider wrapper)
├── components/
│   ├── AssistantHub/    # AI Chat, Voice, SMS, Email tabs
│   ├── Auth/            # Login, Signup, ForgotPassword, ProtectedRoute
│   ├── Common/          # Layout, Sidebar, ConnectionTest
│   ├── Contacts/        # CRM contacts with search and tags
│   ├── Dashboard/       # Stats cards and overview
│   ├── DealAnalyzer/    # 3 exit strategies, MAO calculator, ROI
│   ├── KnowledgeBase/   # Add/search/delete, URL scraping
│   ├── MarketMap/       # Leaflet map with geocoding
│   ├── Pipeline/        # Kanban board with drag-and-drop (dnd-kit)
│   ├── RepairEstimator/ # Room-by-room with contingency
│   ├── Scheduler/       # Calendar with Google Calendar OAuth
│   └── Settings/        # API config, Google Calendar, account
├── contexts/            # AuthContext.tsx
├── hooks/               # useApi, useDemoMode, useStore
├── lib/                 # supabase.ts client
├── services/            # api.ts (GHL CRM), ai-chat.ts (AI engine)
└── types/               # TypeScript types, database.ts
```

**Supabase tables (from 001_initial_schema.sql):**
| Table | Purpose |
|-------|---------|
| organizations | Tenant/org record — plan, trial_ends_at, API keys |
| profiles | User profiles linked to organizations |

**Tables to be added (migration 002 — see plugin-contract.md):**
| Table | Purpose |
|-------|---------|
| rei_deals | Deal pipeline (written by REI Hub, read by Helm) |
| rei_contacts | Contacts CRM (written by REI Hub, read by Helm) |
| rei_rules | Investment rules/criteria (written by REI Hub UI, read by Helm) |
| rei_market_data | Market research per zip code (read/written by both) |
| rei_portfolio | Current holdings and performance data |

---

## How They Connect

### Shared Supabase Instance
Both products use the **same Supabase project**. This is the data bridge.

- **REI Hub** uses the **anon key** with Row Level Security (RLS) — users can
  only read/write their own data.
- **Helm Hub** uses the **service role key** — bypasses RLS to read any
  tenant's data for the context-sync and plugin entitlement checks.
```
REI Hub (browser)          Helm Hub (server)
     │                           │
     │  writes via anon key      │  reads via service role key
     ▼                           ▼
┌─────────────────────────────────────────┐
│           Supabase PostgreSQL           │
│  organizations, profiles,               │
│  rei_deals, rei_contacts,               │
│  rei_rules, rei_market_data,            │
│  rei_portfolio                          │
└─────────────────────────────────────────┘
```

### Plugin Entitlement Flow
Every time the Helm agent tries to load an REI skill:
```
1. Agent receives user message
2. PluginManager checks: is REI plugin enabled for this tenant?
3. Query Supabase organizations table:
   SELECT plan, trial_ends_at
   FROM organizations
   WHERE id = tenant.rei_organization_id
4. If plan IN ('pro', 'team') AND trial_ends_at > NOW():
   → Load REI skill context, allow REI tool calls
5. If not authorized:
   → Respond: "REI features require an active REIFundamentals Hub subscription"
6. Cache result for 5 minutes (keyed by tenant_id)
```

### Context Sync Flow
The Helm context-sync PM2 process runs on a schedule and populates
per-tenant workspace files from Supabase. This is what gives the Helm
agent live REI data to reason about.
```
Supabase Table          →  Helm Workspace File
─────────────────────────────────────────────────────────
rei_deals               →  workspaces/{tenant_id}/rei/DEALS_PIPELINE.md
rei_contacts            →  workspaces/{tenant_id}/rei/CONTACTS.md
organizations (1 row)   →  workspaces/{tenant_id}/rei/USER.md
rei_rules               →  workspaces/{tenant_id}/rei/RULES.md
rei_market_data         →  workspaces/{tenant_id}/rei/MARKET_CONTEXT.md
rei_portfolio           →  workspaces/{tenant_id}/rei/PORTFOLIO.md
```

Sync frequency: every 15 minutes for active tenants, hourly for inactive.
Triggered immediately on: new deal added, offer submitted, status change.

### API Communication
REI Hub's browser client can call Helm Hub's FastAPI backend directly
for AI-powered features that need server-side key protection:
```
REI Hub browser  →  POST http://localhost:8000/api/rei/analyze-deal
                     (Helm Hub uses ANTHROPIC_API_KEY server-side)
                 ←  Deal analysis response
```

This keeps sensitive API keys (Anthropic, OpenRouter) off the client
and prevents the VITE_ prefix exposure problem.

---

## Local Development

### Run Helm Hub only
```bash
cd helm-hub
pip install -e ".[dev]"
uvicorn helm.main:app --reload --port 8000
```

### Run REI Hub only
```bash
cd rei-hub
npm install
npm run dev   # Vite dev server at http://localhost:5173
```

### Run both with Docker
```bash
# From workspace root
docker-compose up --build

# Helm Hub:   http://localhost:8000
# REI Hub:    http://localhost:3000
# Helm API:   http://localhost:8000/docs  (Swagger UI)
```

### Environment setup
```bash
# Copy the combined template
cp .env.example .env.local
# Fill in your real values in .env.local
# Never commit .env.local
```

---

## Deployment Architecture (Target)
```
Internet
   │
   ▼
Nginx (reverse proxy)
   ├── /          → rei-hub container (port 3000)  — React SPA
   ├── /api/      → helm-hub container (port 8000) — FastAPI
   └── /helm/     → helm-hub container (port 8000) — Helm dashboard
        │
        ├── Supabase (managed PostgreSQL — shared by both)
        ├── Telegram Bot (webhook)
        └── WhatsApp Business API (webhook)
```

---

## What NOT to Do

- Do not add a Node.js/Express server to rei-hub — it is intentionally
  a pure SPA. Server-side logic belongs in helm-hub.
- Do not add Python to rei-hub.
- Do not add React/Next.js to helm-hub — its frontend is intentionally
  vanilla HTML for simplicity and low overhead.
- Do not put Anthropic, OpenRouter, or Stripe keys in VITE_ prefixed
  variables — they will be exposed in the browser bundle.
- Do not bypass the plugin entitlement check when loading REI skills.
- Do not write to another tenant's workspace files from context-sync.