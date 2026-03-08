# Lessons Learned

## 2026-03-07: Always add new User model columns to _COLUMN_MIGRATIONS

**Mistake:** Added 6 new fields to the User SQLAlchemy model (`telegram_enabled`, etc.) but forgot to add them to `_COLUMN_MIGRATIONS` in `server/rei/migrations/create_tables.py`. This caused the deployed app to crash on every query that loads a User (including login), because SQLAlchemy tried to SELECT columns that didn't exist in the existing database.

**Rule:** Every time you add a new column to ANY existing model (especially `User`), you MUST also add a corresponding entry to `_COLUMN_MIGRATIONS` in `create_tables.py`. The format is `("table_name", "column_name", "SQL_TYPE DEFAULT value")`. Without this, existing deployed databases won't have the column and all queries against that table will fail.

## 2026-03-07: CORSMiddleware MUST be the absolute outermost middleware

**Mistake:** CORS was added via `add_middleware(CORSMiddleware)` before `@app.middleware("http")` decorators. Since `@app.middleware("http")` internally calls `add_middleware(BaseHTTPMiddleware)`, those decorators were added AFTER CORS in Starlette's middleware list. Starlette's LIFO order means last-added = outermost, so the BaseHTTPMiddleware wrappers (rate_limit, security_headers) ended up OUTSIDE of CORSMiddleware. Responses from those outer middlewares had no CORS headers, causing "Failed to fetch" in the browser.

**Rule:** In `main.py`, the `app.add_middleware(CORSMiddleware, ...)` call MUST be the very last middleware registration — after ALL `add_middleware()` calls AND after ALL `@app.middleware("http")` decorators. The order in code should be: CSRF → @app.middleware decorators → CORS (last). This ensures CORS wraps everything and every response gets `Access-Control-Allow-Origin` headers.
