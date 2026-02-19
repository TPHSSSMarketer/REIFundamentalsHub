# HelmEcosystem — Workspace Root

## Two Products, One Workspace

### helm-hub/ — Helm Hub (Python/FastAPI)
General-purpose AI assistant SaaS. FastAPI backend, SQLite (dev) / own Supabase project (prod),
PM2 process manager, integrations, smart check-ins, sub-agents, multi-tenant.
Tech stack: Python 3.11+, FastAPI, SQLAlchemy, SQLite/Supabase, Docker

### rei-hub/ — REIFundamentals Hub (React/Vite)
Real estate investing CRM and deal management tools. Pure React SPA, no backend.
Calls its own dedicated Supabase project directly from the browser.
Tech stack: React 18, TypeScript, Vite 5, Tailwind CSS, Zustand, @supabase/supabase-js

## How They Connect

Completely independent databases. REI Hub has its own Supabase project. Helm Hub has its own
separate Supabase project. Neither has direct access to the other's database.

When a user purchases the REI Plugin for Helm Hub, data sharing works like this:
- REI Hub pushes selected deal/contact data to Helm Hub via a plugin data bridge API endpoint
- - Helm Hub stores this as agent memory files — it never queries REI Hub's Supabase directly
  - - The REI plugin in Helm Hub checks subscription status via an API call to REI Hub's validation
    -   endpoint (not via direct DB access)
    -   - REI skills in Helm Hub ONLY load after a successful subscription validation response from REI Hub
     
        - ## Running Locally
     
        - Helm Hub (Python backend):
        -   cd helm-hub
        -     pip install -e ".[dev]"
        -   uvicorn helm.main:app --reload --port 8000
     
        -   REIFundamentals Hub (React SPA):
        -     cd rei-hub
        -   npm install
        -     npm run dev
     
        - Docker (both together):
        -   docker-compose up
     
        -   ## Key Rules for Claude Code
        -   1. Helm Hub is Python only. Do not suggest TypeScript/Node solutions for it.
            2. 2. REI Hub is a Vite SPA with no backend. Do not add server-side code to it.
               3. 3. Two separate Supabase projects. Never write code that gives Helm Hub direct DB access to REI Hub's Supabase or vice versa.
                  4. 4. Plugin data flows one way via API. REI Hub pushes to Helm Hub. Helm Hub never pulls from REI Hub's DB.
                     5. 5. REI skills in Helm load ONLY after REI Hub's validation endpoint confirms active subscription.
                        6. 6. API keys in REI Hub are VITE_ prefixed (browser-exposed). Sensitive operations that need key protection must be proxied through Helm Hub's FastAPI backend.
                           7. 7. Never commit .env or .env.local files.
                              8. 8. helm-hub/helm.db is gitignored — runtime data, not source.
                                 9. 9. Do not auto-build features from architecture docs. Only implement what is explicitly requested in the current prompt.
