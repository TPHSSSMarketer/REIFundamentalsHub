"""Create all database tables from SQLAlchemy models."""

from __future__ import annotations

from rei.database import Base, engine

# Import models so Base.metadata knows about them
import rei.models  # noqa: F401


async def create_tables() -> None:
    """Run Base.metadata.create_all against the async engine."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
