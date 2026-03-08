# Lessons Learned

## 2026-03-07: Always add new User model columns to _COLUMN_MIGRATIONS

**Mistake:** Added 6 new fields to the User SQLAlchemy model (`telegram_enabled`, etc.) but forgot to add them to `_COLUMN_MIGRATIONS` in `server/rei/migrations/create_tables.py`. This caused the deployed app to crash on every query that loads a User (including login), because SQLAlchemy tried to SELECT columns that didn't exist in the existing database.

**Rule:** Every time you add a new column to ANY existing model (especially `User`), you MUST also add a corresponding entry to `_COLUMN_MIGRATIONS` in `create_tables.py`. The format is `("table_name", "column_name", "SQL_TYPE DEFAULT value")`. Without this, existing deployed databases won't have the column and all queries against that table will fail.
