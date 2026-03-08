# Lessons Learned

## 2026-03-07: Always add new User model columns to _COLUMN_MIGRATIONS

**Mistake:** Added 6 new fields to the User SQLAlchemy model (`telegram_enabled`, etc.) but forgot to add them to `_COLUMN_MIGRATIONS` in `server/rei/migrations/create_tables.py`. This caused the deployed app to crash on every query that loads a User (including login), because SQLAlchemy tried to SELECT columns that didn't exist in the existing database.

**Rule:** Every time you add a new column to ANY existing model (especially `User`), you MUST also add a corresponding entry to `_COLUMN_MIGRATIONS` in `create_tables.py`. The format is `("table_name", "column_name", "SQL_TYPE DEFAULT value")`. Without this, existing deployed databases won't have the column and all queries against that table will fail.

## 2026-03-07: CORSMiddleware MUST be the absolute outermost middleware

**Mistake:** CORS was added via `add_middleware(CORSMiddleware)` before `@app.middleware("http")` decorators. Since `@app.middleware("http")` internally calls `add_middleware(BaseHTTPMiddleware)`, those decorators were added AFTER CORS in Starlette's middleware list. Starlette's LIFO order means last-added = outermost, so the BaseHTTPMiddleware wrappers (rate_limit, security_headers) ended up OUTSIDE of CORSMiddleware. Responses from those outer middlewares had no CORS headers, causing "Failed to fetch" in the browser.

**Rule:** In `main.py`, the `app.add_middleware(CORSMiddleware, ...)` call MUST be the very last middleware registration — after ALL `add_middleware()` calls AND after ALL `@app.middleware("http")` decorators. The order in code should be: CSRF → @app.middleware decorators → CORS (last). This ensures CORS wraps everything and every response gets `Access-Control-Allow-Origin` headers.

## 2026-03-07: Starlette CORSMiddleware has edge cases — use pure ASGI for reliability

**Mistake:** Even with correct ordering (CORS added last = outermost), Starlette's `CORSMiddleware` still failed to add CORS headers on some responses. This is because `CORSMiddleware` wraps the `send` callable in its `__call__`, but `BaseHTTPMiddleware`-based inner middleware and `@app.middleware("http")` decorators can construct new `Response` objects that bypass the outer middleware's send wrapper.

**Rule:** For CORS in a FastAPI app with `@app.middleware("http")` decorators, use a pure-ASGI CORS middleware (`rei/middleware/cors.py`) instead of Starlette's `CORSMiddleware`. The pure-ASGI version wraps `send` at the raw ASGI level, ensuring every `http.response.start` message gets CORS headers injected — no matter how the response was produced. Also use this approach for any middleware that MUST add headers to every response (like CSRF rejections).

## 2026-03-07: Python str.replace() replaces ALL occurrences, not just the first

**Mistake:** Used `"https://hub.reifundamentalshub.com".replace("hub.", "")` expecting it to only remove the subdomain prefix, but Python's `str.replace()` replaces ALL occurrences. The result was `"https://reifundamentalscom"` (both "hub." instances removed).

**Rule:** When you need to replace only the first occurrence of a substring, use `str.replace(old, new, 1)` with the count parameter, or use string slicing/`re.sub()` for positional replacements.
