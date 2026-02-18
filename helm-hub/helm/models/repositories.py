"""Dual-write repository layer — SQLite primary, Supabase mirror."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from helm.models.database import Memory, Tenant, _uuid, _utcnow

logger = logging.getLogger(__name__)


class TenantRepository:
    def __init__(self, db_session: AsyncSession, supabase=None):
        self.db = db_session
        self.supabase = supabase

    async def get(self, tenant_id: str) -> Tenant | None:
        result = await self.db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        return result.scalar_one_or_none()

    async def get_by_ghl_location(self, ghl_location_id: str) -> Tenant | None:
        result = await self.db.execute(
            select(Tenant).where(Tenant.ghl_location_id == ghl_location_id)
        )
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> Tenant:
        if "id" not in kwargs:
            kwargs["id"] = _uuid()
        if "created_at" not in kwargs:
            kwargs["created_at"] = _utcnow()
        tenant = Tenant(**kwargs)
        self.db.add(tenant)
        await self.db.commit()
        await self.db.refresh(tenant)
        if self.supabase:
            asyncio.create_task(self.upsert_to_supabase(tenant))
        return tenant

    async def update(self, tenant_id: str, **kwargs) -> Tenant | None:
        tenant = await self.get(tenant_id)
        if not tenant:
            return None
        for key, value in kwargs.items():
            if hasattr(tenant, key):
                setattr(tenant, key, value)
        await self.db.commit()
        await self.db.refresh(tenant)
        if self.supabase:
            asyncio.create_task(self.upsert_to_supabase(tenant))
        return tenant

    async def upsert_to_supabase(self, tenant: Tenant) -> None:
        try:
            data: dict[str, Any] = {
                "id": tenant.id,
                "name": tenant.name,
                "ghl_location_id": tenant.ghl_location_id,
                "telegram_chat_id": tenant.telegram_chat_id,
                "whatsapp_phone": tenant.whatsapp_phone,
                "system_prompt": tenant.system_prompt,
                "gating_config": tenant.gating_config or {},
                "agent_config": tenant.agent_config or {},
                "is_active": tenant.is_active,
                "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
            }
            await self.supabase.table("tenants").upsert(data).execute()
        except Exception as exc:
            logger.warning("Supabase tenant upsert failed: %s", exc)


class MemoryRepository:
    def __init__(self, db_session: AsyncSession, supabase=None):
        self.db = db_session
        self.supabase = supabase

    async def list(
        self,
        tenant_id: str,
        category: str | None = None,
        limit: int = 50,
    ) -> list[Memory]:
        query = select(Memory).where(Memory.tenant_id == tenant_id)
        if category:
            query = query.where(Memory.category == category)
        query = query.order_by(Memory.created_at.desc()).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(
        self,
        tenant_id: str,
        content: str,
        summary: str | None = None,
        category: str = "general",
        metadata: dict | None = None,
    ) -> Memory:
        memory = Memory(
            id=_uuid(),
            tenant_id=tenant_id,
            content=content,
            summary=summary,
            category=category,
            metadata_json=metadata or {},
            created_at=_utcnow(),
        )
        self.db.add(memory)
        await self.db.commit()
        await self.db.refresh(memory)
        if self.supabase:
            asyncio.create_task(self.upsert_to_supabase(memory))
        return memory

    async def upsert_to_supabase(self, memory: Memory) -> None:
        try:
            data: dict[str, Any] = {
                "id": memory.id,
                "tenant_id": memory.tenant_id,
                "content": memory.content,
                "summary": memory.summary,
                "category": memory.category,
                "metadata_json": memory.metadata_json or {},
                "created_at": memory.created_at.isoformat() if memory.created_at else None,
            }
            await self.supabase.table("memories").upsert(data).execute()
        except Exception as exc:
            logger.warning("Supabase memory upsert failed: %s", exc)