# HttpOnly Cookie Migration — Session Prompt

Paste this into a fresh Claude session to kick off the migration:

---

## Context

I'm building two products in the HelmEcosystem repo:

1. **Helm Hub** (`helm-hub/`) — Python/FastAPI AI assistant backend
2. **REI Hub** (`rei-hub/`) — React 18 + TypeScript + Vite frontend SPA with a lightweight FastAPI backend (`rei-hub/server/`)

We recently completed a full security audit (23 issues across 3 phases). All fixes are implemented and pushed EXCEPT one architectural item we deferred: **migrating JWT auth from localStorage to HttpOnly cookies**.

## Current Auth Architecture

**Helm Hub backend** (`helm-hub/helm/api/auth_routes.py`):
- `POST /api/auth/token` — accepts API key or username/password, returns `{"access_token": "...", "token_type": "bearer"}`
- `POST /api/auth/token/tenant` — returns tenant-scoped JWT
- JWT is HS256 signed, 4-hour TTL, configured in `helm-hub/helm/config.py`
- Auth middleware in `helm-hub/helm/api/middleware.py` checks `Authorization: Bearer <token>` header or `X-API-Key` header

**REI Hub frontend** (`rei-hub/src/services/auth.ts`):
- Stores JWT in `localStorage` under key `rei_token`
- `getAuthHeader()` returns `{ Authorization: "Bearer <token>" }`
- Has token expiry checking and proactive refresh logic
- `authApi.ts` is the canonical API service that `auth.ts` wraps

**REI Hub backend** (`rei-hub/server/`):
- Separate FastAPI server handling its own JWT auth
- Has its own login/register endpoints
- Also uses localStorage tokens on the frontend side

## What Needs to Change

**Goal:** Move JWT tokens out of localStorage (XSS-accessible) into HttpOnly, Secure, SameSite cookies that the browser manages automatically.

**Backend changes needed:**
1. Login endpoints should `Set-Cookie` with the JWT instead of (or in addition to) returning it in JSON
2. Cookie attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api`, reasonable `Max-Age`
3. Auth middleware needs to check cookies in addition to Bearer tokens (for backward compat during migration)
4. Add CSRF protection (since cookies are sent automatically) — either double-submit cookie pattern or `X-CSRF-Token` header
5. Logout endpoint should clear the cookie
6. Token refresh should set a new cookie

**Frontend changes needed:**
1. Login flow: stop reading token from JSON response, let the cookie be set automatically
2. API calls: add `credentials: 'include'` to fetch/axios config so cookies are sent
3. Remove `localStorage.setItem(TOKEN_KEY, ...)` and `localStorage.getItem(TOKEN_KEY)` for auth tokens
4. `isAuthenticated()` needs a new approach — either a `/api/auth/me` ping or a non-HttpOnly companion cookie with expiry info
5. CSRF token handling on mutating requests
6. Update CORS config to work with `credentials: true`

**Important constraints:**
- API key auth via `X-API-Key` header MUST continue working (for programmatic/bot access)
- WebSocket auth needs to keep working (currently uses query param or Sec-WebSocket-Protocol)
- Both Helm Hub and REI Hub need this change
- Must not break the existing deployed frontend during rollout (consider a migration period where both methods work)

## Files to Modify

- `helm-hub/helm/api/auth_routes.py` — Set-Cookie on login
- `helm-hub/helm/api/middleware.py` — Read JWT from cookie
- `helm-hub/helm/main.py` — CORS credentials config
- `rei-hub/src/services/auth.ts` — Remove localStorage JWT storage
- `rei-hub/src/services/authApi.ts` — Add credentials: 'include'
- `rei-hub/server/app/main.py` — Same cookie changes for REI backend
- Potentially new: CSRF middleware/utility

## Instructions

Please read CLAUDE.md at the repo root for project rules. Enter plan mode, explore the current code, and create a detailed implementation plan before making any changes. This is a security-critical change so get it right — plan first, implement second.
