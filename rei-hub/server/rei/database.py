"""SQLAlchemy async engine and session factory."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from rei.config import get_settings

settings = get_settings()

_db_url = settings.database_url
_is_postgres = "postgresql" in _db_url

# Auto-convert plain postgresql:// to postgresql+asyncpg:// so users
# can paste a standard Supabase/PG connection string without worrying
# about the async driver prefix.
if _is_postgres and "+asyncpg" not in _db_url:
    _db_url = _db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

if _is_postgres:
    engine = create_async_engine(
        _db_url,
        echo=False,
        pool_size=20,
        max_overflow=10,
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
