"""FastAPI dependency injectors for repository classes."""
from __future__ import annotations

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from helm.models.database import get_db
from helm.models.repositories import MemoryRepository, TenantRepository
from helm.models.supabase_client import get_supabase


async def get_tenant_repo(
    db: AsyncSession = Depends(get_db),
    supabase=Depends(get_supabase),
) -> TenantRepository:
    return TenantRepository(db_session=db, supabase=supabase)


async def get_memory_repo(
    db: AsyncSession = Depends(get_db),
    supabase=Depends(get_supabase),
) -> MemoryRepository:
    return MemoryRepository(db_session=db, supabase=supabase)
