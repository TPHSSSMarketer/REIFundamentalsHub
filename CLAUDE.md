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

# REIFundamentalsHub — Workspace Root

## Single Product Workspace

### rei-hub/ — REIFundamentals Hub (React/Vite + FastAPI backend)
Real estate investing CRM and deal management tools. React SPA frontend with a
lightweight FastAPI backend (`rei-hub/server/`) that handles JWT auth, Stripe/PayPal
billing, and admin endpoints. The frontend calls its own dedicated Supabase project
directly from the browser for CRM data; the backend manages auth and billing only.
Tech stack: React 18, TypeScript, Vite 5, Tailwind CSS, Zustand, @supabase/supabase-js,
Python 3.11+ (server), FastAPI (server), SQLite (server)

## Database & Architecture

REI Hub maintains its own Supabase project for all CRM data, user profiles, and account
management. The frontend communicates directly with Supabase for CRM operations, while
the FastAPI backend (`rei-hub/server/`) handles authentication, billing integrations,
and admin endpoints.

## Running Locally

REIFundamentals Hub (React SPA + FastAPI server):
  cd rei-hub
  npm install
  npm run dev
  # In a separate terminal for the backend:
  cd rei-hub/server
  pip install -r requirements.txt
  uvicorn app.main:app --reload --port 8001

Docker:
  docker-compose up

## Key Rules for Claude Code
1. REI Hub frontend is a Vite SPA. Its FastAPI backend (`rei-hub/server/`) handles only auth and billing.
2. Do not add a Node.js/Express backend to rei-hub — it is intentionally a pure SPA.
3. Server-side logic belongs exclusively in the Python FastAPI backend (`rei-hub/server/`).
4. API keys in REI Hub are VITE_ prefixed (browser-exposed). Sensitive operations must be proxied through the FastAPI backend.
5. Never commit .env or .env.local files.
6. rei-hub/server/app.db is gitignored — runtime data, not source.
7. Do not auto-build features from architecture docs. Only implement what is explicitly requested in the current prompt.
