"""Database engine, session factory, and base model."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from helm.config import get_settings

settings = get_settings()

# Pre-import aiosqlite so SQLAlchemy's dialect loader resolves correctly on
# Python 3.13+ where internal sqlite3 module changes can cause silent fallback
# to the synchronous pysqlite driver.
if "aiosqlite" in settings.database_url:
    try:
        import aiosqlite  # noqa: F401
    except ImportError as exc:
        raise ImportError(
            "aiosqlite is required for async SQLite. Install with: pip install aiosqlite"
        ) from exc

engine = create_async_engine(settings.database_url, echo=settings.app_debug)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create all tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Yield a database session for dependency injection."""
    async with async_session() as session:
        yield session
