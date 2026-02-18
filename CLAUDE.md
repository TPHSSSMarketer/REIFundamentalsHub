# HelmEcosystem - Workspace Root

## Two Products, One Workspace

### helm-hub/ - Helm Hub (Python/FastAPI)
General-purpose AI assistant SaaS. 73 Python files, FastAPI backend,
SQLite (dev) to Supabase (prod), PM2 process manager, 22 integrations,
smart check-ins, sub-agents, multi-tenant. The AI brain.
Tech stack: Python 3.11+, FastAPI, SQLAlchemy, SQLite/Supabase, Docker

### rei-hub/ - REIFundamentals Hub (React/Vite)
Real estate investing CRM and tools. Pure React SPA, no backend,
calls Supabase directly from the browser.
Tech stack: React 18, TypeScript, Vite 5, Tailwind CSS, Zustand, Supabase

## How They Connect
Shared Supabase instance. Helm Hub reads REI subscription status and
deal/contact data from Supabase to power REI-specific AI skills.
The REI plugin lives at helm-hub/helm/plugins/rei/
REI skills only load when the user has an active REIFundamentals Hub
subscription AND has linked their account in Helm Hub settings.

## Running Locally

Helm Hub (Python backend):
  cd helm-hub
  pip install -e ".[dev]"
  uvicorn helm.main:app --reload --port 8000

REIFundamentals Hub (React SPA):
  cd rei-hub
  npm install
  npm run dev

Docker (both together):
  docker-compose up

## Branches
Helm Hub source:  github.com/TPHSSSMarketer/Helm (claude/create-helm-ai-assistant-0I0zH)
REI Hub source:   github.com/TPHSSSMarketer/REIFundamentalsHub (claude/ghl-crm-wrapper-RZgUR)

## Key Rules for Claude Code
- Helm Hub is Python. Do not suggest TypeScript/Node solutions for it.
- REI Hub is a Vite SPA. It has no backend. Do not add server-side code to it.
- REI skills in Helm ONLY load after checking Supabase for active REI subscription.
- API keys in REI Hub are VITE_ prefixed (browser-exposed). Sensitive operations
  that need key protection must be proxied through Helm Hub's FastAPI backend.
- Never commit .env or .env.local files.
- The helm-hub/helm.db SQLite file is gitignored - it is runtime data, not source.
