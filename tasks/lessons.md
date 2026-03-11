# Lessons Learned

## 2026-03-07: Always add new User model columns to _COLUMN_MIGRATIONS

**Mistake:** Added 6 new fields to the User SQLAlchemy model (`telegram_enabled`, etc.) but forgot to add them to `_COLUMN_MIGRATIONS` in `server/rei/migrations/create_tables.py`. This caused the deployed app to crash on every query that loads a User (including login), because SQLAlchemy tried to SELECT columns that didn't exist in the existing database.

**Rule:** Every time you add a new column to ANY existing model (especially `User`), you MUST also add a corresponding entry to `_COLUMN_MIGRATIONS` in `create_tables.py`. The format is `("table_name", "column_name", "SQL_TYPE DEFAULT value")`. Without this, existing deployed databases won't have the column and all queries against that table will fail.

## 2026-03-07: Starlette add_middleware ordering is REVERSED — do NOT rely on it for CORS

**Mistake:** Assumed "last `add_middleware()` call = outermost middleware" (LIFO). This is WRONG. Starlette's `build_middleware_stack()` uses `reversed()` on the middleware list, so the FIRST `add_middleware()` call becomes the OUTERMOST middleware, and the LAST call becomes INNERMOST. CORS was added last, making it innermost — CSRF rejected requests with 403 before they ever reached CORS, so no CORS headers were added and the browser showed "Failed to fetch."

**Rule:** NEVER use `add_middleware()` for CORS. Instead, manually wrap the app at module level AFTER all routes and middleware are registered: `app = PureASGICORS(app, ...)`. This guarantees CORS is the absolute outermost layer regardless of Starlette version or internal ordering quirks. The wrapped app is what uvicorn references via `main:app`.

## 2026-03-07: Python str.replace() replaces ALL occurrences, not just the first

**Mistake:** Used `"https://hub.reifundamentalshub.com".replace("hub.", "")` expecting it to only remove the subdomain prefix, but Python's `str.replace()` replaces ALL occurrences. The result was `"https://reifundamentalscom"` (both "hub." instances removed).

**Rule:** When you need to replace only the first occurrence of a substring, use `str.replace(old, new, 1)` with the count parameter, or use string slicing/`re.sub()` for positional replacements.

## 2026-03-10: Telegram has a DUAL role — user-facing AND admin notifications

**Mistake:** Incorrectly documented Telegram as "admin-only, NOT public-facing." In reality, Telegram (along with Slack and WhatsApp) is a user-facing channel for communicating with the AI Assistant. Telegram ALSO delivers admin notifications (Help tickets, Negotiation updates) to Chris.

**Rule:** Telegram, Slack, and WhatsApp are all user-facing channels for the AI Assistant. Telegram additionally serves as the admin notification channel for Help and Negotiation alerts. Never treat Telegram as admin-only — it has both roles.

## 2026-03-10: When user states an architectural fact, document it — don't build something

**Mistake:** User said "Telegram is just a system chat, not an outward facing chat to the public" — a clarification about architecture. In the next session, this was misinterpreted and lost context.

**Rule:** When the user provides an architectural clarification or correction, the correct response is to (1) acknowledge it, (2) document it in CLAUDE.md and lessons.md, and (3) move on. Don't start building unless explicitly asked.
