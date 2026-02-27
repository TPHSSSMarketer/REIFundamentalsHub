"""Create all database tables from SQLAlchemy models."""

from __future__ import annotations

import logging
from sqlalchemy import text
from rei.database import Base, engine

# Import models so Base.metadata knows about them
import rei.models  # noqa: F401

logger = logging.getLogger(__name__)

# Inline migrations — add new columns to existing tables.
# Each entry: (table, column, sql_type)
_COLUMN_MIGRATIONS = [
    ("lead_capture_sites", "company_slug", "VARCHAR(100)"),
]


async def create_tables() -> None:
    """Run Base.metadata.create_all, then apply column migrations."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Apply column migrations for columns added after initial deployment
    async with engine.begin() as conn:
        for table, column, sql_type in _COLUMN_MIGRATIONS:
            try:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")
                )
                logger.info("Migration: added %s.%s", table, column)
            except Exception:
                # Column already exists — nothing to do
                pass
