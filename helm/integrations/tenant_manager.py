"""Tenant management — multi-tenancy provisioning and isolation for SaaS.

Handles:
  - Tenant CRUD operations
  - Per-tenant configuration (agents, gating rules, system prompts)
  - GHL sub-account mapping
  - Tenant isolation enforcement
  - Onboarding flow for new SaaS clients

Each tenant gets:
  - Isolated database rows (scoped by tenant_id)
  - Their own GHL OAuth tokens
  - Custom system prompt and agent configuration
  - Own check-in schedule and gating rules
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Default agent config for new tenants
DEFAULT_AGENT_CONFIG = {
    "enabled_agents": ["outreach-drafter", "task-manager", "schedule-optimizer", "research-assistant"],
    "custom_agents": [],
    "output_style": "default",
    "voice_enabled": True,
    "proactive_checkins": True,
    "checkin_interval_minutes": 30,
    "gating_overrides": {},
}

DEFAULT_GATING_CONFIG = {
    "min_hours_between_checkins": 2,
    "quiet_hours_start": 22,
    "quiet_hours_end": 7,
    "sacred_blocks": [],
    "urgency_overrides": {
        "deal_deadline_within_24h": True,
        "missed_closing_date": True,
        "client_emergency": True,
    },
}


class TenantManager:
    """Manages tenant lifecycle and configuration."""

    async def create_tenant(
        self,
        name: str,
        ghl_location_id: str | None = None,
        telegram_chat_id: str | None = None,
        whatsapp_phone: str | None = None,
        system_prompt: str | None = None,
    ) -> dict:
        """Provision a new tenant."""
        try:
            from helm.models.database import Tenant, CheckinState, async_session

            async with async_session() as session:
                tenant = Tenant(
                    name=name,
                    ghl_location_id=ghl_location_id,
                    telegram_chat_id=telegram_chat_id,
                    whatsapp_phone=whatsapp_phone,
                    system_prompt=system_prompt or self._generate_default_prompt(name),
                    agent_config=DEFAULT_AGENT_CONFIG,
                    gating_config=DEFAULT_GATING_CONFIG,
                )
                session.add(tenant)

                # Create initial check-in state
                checkin = CheckinState(tenant_id=tenant.id)
                session.add(checkin)

                await session.commit()
                await session.refresh(tenant)

                logger.info("Tenant created: %s (id=%s)", name, tenant.id)
                return {
                    "id": tenant.id,
                    "name": tenant.name,
                    "created_at": tenant.created_at.isoformat(),
                }
        except Exception as exc:
            logger.error("Failed to create tenant: %s", exc)
            return {"error": str(exc)}

    async def get_tenant(self, tenant_id: str) -> dict | None:
        """Fetch a tenant by ID."""
        try:
            from helm.models.database import Tenant, async_session
            from sqlalchemy import select

            async with async_session() as session:
                result = await session.execute(
                    select(Tenant).where(Tenant.id == tenant_id)
                )
                tenant = result.scalar_one_or_none()
                if not tenant:
                    return None
                return self._serialize_tenant(tenant)
        except Exception as exc:
            logger.error("Failed to get tenant: %s", exc)
            return None

    async def get_tenant_by_ghl_location(self, location_id: str) -> dict | None:
        """Find a tenant by their GHL location ID."""
        try:
            from helm.models.database import Tenant, async_session
            from sqlalchemy import select

            async with async_session() as session:
                result = await session.execute(
                    select(Tenant).where(Tenant.ghl_location_id == location_id)
                )
                tenant = result.scalar_one_or_none()
                if not tenant:
                    return None
                return self._serialize_tenant(tenant)
        except Exception as exc:
            logger.error("Failed to get tenant by GHL location: %s", exc)
            return None

    async def get_tenant_by_phone(self, phone: str) -> dict | None:
        """Find a tenant by WhatsApp phone number."""
        try:
            from helm.models.database import Tenant, async_session
            from sqlalchemy import select

            async with async_session() as session:
                result = await session.execute(
                    select(Tenant).where(Tenant.whatsapp_phone == phone)
                )
                tenant = result.scalar_one_or_none()
                if not tenant:
                    return None
                return self._serialize_tenant(tenant)
        except Exception as exc:
            logger.error("Failed to get tenant by phone: %s", exc)
            return None

    async def get_tenant_by_telegram(self, chat_id: str) -> dict | None:
        """Find a tenant by Telegram chat ID."""
        try:
            from helm.models.database import Tenant, async_session
            from sqlalchemy import select

            async with async_session() as session:
                result = await session.execute(
                    select(Tenant).where(Tenant.telegram_chat_id == chat_id)
                )
                tenant = result.scalar_one_or_none()
                if not tenant:
                    return None
                return self._serialize_tenant(tenant)
        except Exception as exc:
            logger.error("Failed to get tenant by Telegram: %s", exc)
            return None

    async def list_tenants(self, active_only: bool = True) -> list[dict]:
        """List all tenants."""
        try:
            from helm.models.database import Tenant, async_session
            from sqlalchemy import select

            async with async_session() as session:
                query = select(Tenant).order_by(Tenant.created_at.desc())
                if active_only:
                    query = query.where(Tenant.is_active == True)  # noqa: E712
                result = await session.execute(query)
                tenants = result.scalars().all()
                return [self._serialize_tenant(t) for t in tenants]
        except Exception as exc:
            logger.error("Failed to list tenants: %s", exc)
            return []

    async def update_tenant(self, tenant_id: str, updates: dict) -> dict | None:
        """Update a tenant's configuration."""
        try:
            from helm.models.database import Tenant, async_session
            from sqlalchemy import select

            allowed_fields = {
                "name", "system_prompt", "agent_config", "gating_config",
                "telegram_chat_id", "whatsapp_phone", "is_active",
                "ghl_access_token", "ghl_refresh_token", "ghl_location_id",
            }

            async with async_session() as session:
                result = await session.execute(
                    select(Tenant).where(Tenant.id == tenant_id)
                )
                tenant = result.scalar_one_or_none()
                if not tenant:
                    return None

                for key, value in updates.items():
                    if key in allowed_fields:
                        setattr(tenant, key, value)

                await session.commit()
                await session.refresh(tenant)
                logger.info("Tenant updated: %s", tenant_id)
                return self._serialize_tenant(tenant)
        except Exception as exc:
            logger.error("Failed to update tenant: %s", exc)
            return None

    async def deactivate_tenant(self, tenant_id: str) -> bool:
        """Soft-delete a tenant (set is_active=False)."""
        result = await self.update_tenant(tenant_id, {"is_active": False})
        return result is not None

    async def provision_from_onboarding(
        self,
        name: str,
        business_type: str = "",
        goals: list[str] | None = None,
        schedule_prefs: dict | None = None,
    ) -> dict:
        """Full onboarding flow: create tenant + configure agents + system prompt."""
        # Generate personalized system prompt
        system_prompt = self._generate_onboarding_prompt(name, business_type, goals or [])

        # Determine agents based on business type
        agent_config = dict(DEFAULT_AGENT_CONFIG)
        if business_type.lower() in ("real_estate", "real estate", "rei"):
            agent_config["enabled_agents"].extend(["deal-analyzer", "market-researcher"])
            agent_config["output_style"] = "re-investor"

        # Create the tenant
        result = await self.create_tenant(
            name=name,
            system_prompt=system_prompt,
        )

        if "error" in result:
            return result

        # Update with custom agent config
        await self.update_tenant(result["id"], {"agent_config": agent_config})

        # Create initial goals
        if goals:
            from helm.models.database import Goal, async_session

            async with async_session() as session:
                for goal_text in goals:
                    goal = Goal(tenant_id=result["id"], goal=goal_text)
                    session.add(goal)
                await session.commit()

        return {**result, "agent_config": agent_config}

    # ── Helpers ───────────────────────────────────────────────────────────

    def _generate_default_prompt(self, name: str) -> str:
        return (
            f"You are Grace, an AI assistant for {name}. "
            "You help manage business operations, personal tasks, and daily workflow. "
            "Be proactive, concise, and action-oriented. "
            "When presenting information, lead with what's most important. "
            "Always confirm before taking actions that modify data."
        )

    def _generate_onboarding_prompt(
        self, name: str, business_type: str, goals: list[str]
    ) -> str:
        prompt = (
            f"You are Grace, a dedicated AI assistant for {name}. "
        )
        if business_type:
            prompt += f"They operate in the {business_type} industry. "
        if goals:
            goals_str = ", ".join(goals[:5])
            prompt += f"Their current goals include: {goals_str}. "
        prompt += (
            "Be proactive about surfacing important items. "
            "Keep responses concise and action-oriented. "
            "When you don't know something, say so and suggest how to find out. "
            "Always confirm before taking actions that modify data."
        )
        return prompt

    def _serialize_tenant(self, tenant) -> dict:
        return {
            "id": tenant.id,
            "name": tenant.name,
            "ghl_location_id": tenant.ghl_location_id,
            "telegram_chat_id": tenant.telegram_chat_id,
            "whatsapp_phone": tenant.whatsapp_phone,
            "agent_config": tenant.agent_config or DEFAULT_AGENT_CONFIG,
            "gating_config": tenant.gating_config or DEFAULT_GATING_CONFIG,
            "is_active": tenant.is_active,
            "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
        }


# Singleton
tenant_manager = TenantManager()
