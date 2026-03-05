"""SQLAlchemy async engine and session factory."""

from __future__ import annotations

import os

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from rei.config import get_settings

settings = get_settings()

# Railway auto-creates DATABASE_URL for linked Postgres services.
# Our config uses the REI_ prefix, so fall back to DATABASE_URL if
# the resolved value is still the default SQLite placeholder.
db_url = settings.database_url
if db_url.startswith("sqlite") and os.environ.get("DATABASE_URL"):
    db_url = os.environ["DATABASE_URL"]

# Convert sync PostgreSQL URL to async (asyncpg driver)
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
elif db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)

engine = create_async_engine(db_url, echo=False)

async_session_factory = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass
