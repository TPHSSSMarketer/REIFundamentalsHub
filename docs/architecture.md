# REIFundamentalsHub — Architecture Overview

## Single Product

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

## Database & Authentication

REI Hub maintains a dedicated Supabase instance for all data persistence.

- **Frontend** (`rei-hub/src/`) uses the **anon key** with Row Level Security (RLS) —
  browser clients can only read/write their own organization's data.
- **Backend** (`rei-hub/server/`) uses the **service role key** for admin operations,
  JWT token validation, and billing integrations.

```
REI Hub (browser)          REI Hub Backend (server)
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

---

## Local Development

### Run REI Hub Frontend
```bash
cd rei-hub
npm install
npm run dev   # Vite dev server at http://localhost:5173
```

### Run REI Hub Backend (in separate terminal)
```bash
cd rei-hub/server
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Run with Docker
```bash
# From workspace root
docker-compose up --build

# REI Hub:    http://localhost:3000
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
   └── /api/      → rei-hub/server (port 8001)     — FastAPI backend
        │
        ├── Supabase (managed PostgreSQL)
        └── Stripe/PayPal (billing)
```

---

## What NOT to Do

- Do not add a Node.js/Express server to rei-hub — it is intentionally
  a pure SPA. Server-side logic belongs in `rei-hub/server/`.
- Do not add React/TypeScript to `rei-hub/server/` — it is Python/FastAPI only.
- Do not put Stripe, Anthropic, or other sensitive API keys in VITE_ prefixed
  variables — they will be exposed in the browser bundle.
- Sensitive operations must be proxied through the FastAPI backend.