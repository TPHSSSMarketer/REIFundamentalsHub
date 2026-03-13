"""SQLAlchemy async engine and session factory."""

from __future__ import annotations

import logging
import urllib.parse

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from rei.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

_db_url = settings.database_url
_is_postgres = "postgresql" in _db_url


def _prepare_postgres_url(raw: str) -> str:
    """Convert a plain Supabase/PG connection string to an async-safe URL.

    Handles two common issues:
    1. Swaps the driver to asyncpg (required for async SQLAlchemy).
    2. URL-encodes the password so special characters like @, #, !, [, ]
       don't break URL parsing.
    """
    # Split off the scheme (everything before ://)
    scheme_end = raw.index("://") + 3
    scheme = raw[:scheme_end]
    rest = raw[scheme_end:]

    # The last @ separates credentials from host — passwords may contain @
    last_at = rest.rindex("@")
    credentials = rest[:last_at]
    host_part = rest[last_at + 1:]

    # Split user:password
    colon = credentials.index(":")
    user = credentials[:colon]
    password = credentials[colon + 1:]

    # URL-encode the password (safe="" encodes everything)
    encoded_password = urllib.parse.quote(password, safe="")

    # Force the asyncpg driver
    scheme = scheme.replace("postgresql+psycopg2://", "postgresql+asyncpg://")
    scheme = scheme.replace("postgresql://", "postgresql+asyncpg://")

    return f"{scheme}{user}:{encoded_password}@{host_part}"


if _is_postgres:
    _db_url = _prepare_postgres_url(_db_url)
    # Supabase free tier pooler allows ~15 connections total.
    # With 2 Uvicorn workers, each gets pool_size + max_overflow max.
    # 3 + 2 = 5 per worker × 2 workers = 10 max (safe under 15 limit).
    engine = create_async_engine(
        _db_url,
        echo=False,
        pool_size=3,
        max_overflow=2,
        pool_pre_ping=True,
    )
else:
    # SQLite for local development
    engine = create_async_engine(
        _db_url,
        echo=False,
        connect_args={"check_same_thread": False},
    )

async_session_factory = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass
