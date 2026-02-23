## Workflow Orchestration

### 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

# HelmEcosystem — Workspace Root

## Two Products, One Workspace

### helm-hub/ — Helm Hub (Python/FastAPI)
General-purpose AI assistant SaaS. FastAPI backend, SQLite (dev) / own Supabase project (prod),
PM2 process manager, integrations, smart check-ins, sub-agents, multi-tenant.
Tech stack: Python 3.11+, FastAPI, SQLAlchemy, SQLite/Supabase, Docker

### rei-hub/ — REIFundamentals Hub (React/Vite + FastAPI backend)
Real estate investing CRM and deal management tools. React SPA frontend with a
lightweight FastAPI backend (`rei-hub/server/`) that handles JWT auth, Stripe/PayPal
billing, and admin endpoints. The frontend calls its own dedicated Supabase project
directly from the browser for CRM data; the backend manages auth and billing only.
Tech stack: React 18, TypeScript, Vite 5, Tailwind CSS, Zustand, @supabase/supabase-js,
Python 3.11+ (server), FastAPI (server), SQLite (server)

## How They Connect

Completely independent databases. REI Hub has its own Supabase project. Helm Hub has its own
separate Supabase project. Neither has direct access to the other's database.

When a user purchases the REI Plugin for Helm Hub, data sharing works like this:
- REI Hub pushes selected deal/contact data to Helm Hub via a plugin data bridge API endpoint
- Helm Hub stores this as agent memory files — it never queries REI Hub's Supabase directly
- The REI plugin in Helm Hub checks subscription status via an API call to REI Hub's validation
  endpoint (not via direct DB access)
- REI skills in Helm Hub ONLY load after a successful subscription validation response from REI Hub

## Running Locally

Helm Hub (Python backend):
  cd helm-hub
  pip install -e ".[dev]"
  uvicorn helm.main:app --reload --port 8000

REIFundamentals Hub (React SPA + server):
  cd rei-hub
  npm install
  npm run dev
  # In a separate terminal for the backend:
  cd rei-hub/server
  pip install -r requirements.txt
  uvicorn app.main:app --reload --port 8001

Docker (both together):
  docker-compose up

## Key Rules for Claude Code
1. Helm Hub is Python only. Do not suggest TypeScript/Node solutions for it.
2. REI Hub frontend is a Vite SPA. Its FastAPI backend (`rei-hub/server/`) handles only auth and billing.
3. Two separate Supabase projects. Never write code that gives Helm Hub direct DB access to REI Hub's Supabase or vice versa.
4. Plugin data flows one way via API. REI Hub pushes to Helm Hub. Helm Hub never pulls from REI Hub's DB.
5. REI skills in Helm load ONLY after REI Hub's validation endpoint confirms active subscription.
6. API keys in REI Hub are VITE_ prefixed (browser-exposed). Sensitive operations that need key protection must be proxied through Helm Hub's FastAPI backend.
7. Never commit .env or .env.local files.
8. helm-hub/helm.db is gitignored — runtime data, not source.
9. Do not auto-build features from architecture docs. Only implement what is explicitly requested in the current prompt.
