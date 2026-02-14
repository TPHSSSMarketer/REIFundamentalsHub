"""GHL SaaS Mode webhook handler and onboarding flow.

Handles the lifecycle of SaaS clients that install the CommandCenter
app into their GoHighLevel sub-accounts via GHL SaaS Mode (Agency Pro).

Webhook events:
  - ``app.installed``   -- Client installs the app, triggers tenant provisioning.
  - ``app.uninstalled`` -- Client removes the app, triggers soft-delete.

Onboarding:
  - Structured questionnaire for new clients.
  - Processes answers into tenant configuration (system prompt, agents,
    gating rules, goals, and GHL pipelines).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from helm.config import get_settings
from helm.integrations.tenant_manager import tenant_manager

logger = logging.getLogger(__name__)
settings = get_settings()


# ── Business-type to agent mapping ───────────────────────────────────────────

_BUSINESS_AGENT_MAP: dict[str, dict] = {
    "real_estate": {
        "enabled_agents": [
            "deal-analyzer",
            "market-researcher",
            "contract-reviewer",
            "outreach-drafter",
            "task-manager",
            "schedule-optimizer",
            "research-assistant",
        ],
        "output_style": "re-investor",
    },
    "general": {
        "enabled_agents": [
            "outreach-drafter",
            "task-manager",
            "schedule-optimizer",
            "research-assistant",
        ],
        "output_style": "default",
    },
    "e-commerce": {
        "enabled_agents": [
            "outreach-drafter",
            "task-manager",
            "schedule-optimizer",
            "research-assistant",
        ],
        "output_style": "default",
    },
    "agency": {
        "enabled_agents": [
            "outreach-drafter",
            "task-manager",
            "schedule-optimizer",
            "research-assistant",
        ],
        "output_style": "client-facing",
    },
    "consulting": {
        "enabled_agents": [
            "outreach-drafter",
            "task-manager",
            "schedule-optimizer",
            "research-assistant",
        ],
        "output_style": "briefing",
    },
}

# ── Checkin frequency mapping ────────────────────────────────────────────────

_CHECKIN_FREQUENCY_MAP: dict[str, int] = {
    "15min": 15,
    "30min": 30,
    "1hr": 60,
    "2hr": 120,
}


class GHLSaaSWebhookHandler:
    """Handles GHL SaaS Mode webhooks and onboarding flows."""

    # ── Webhook Dispatch ─────────────────────────────────────────────────

    async def handle_webhook(self, event_type: str, payload: dict) -> dict:
        """Main dispatcher for GHL SaaS webhooks.

        Args:
            event_type: The webhook event type (e.g. ``"app.installed"``).
            payload: The raw webhook payload from GHL.

        Returns:
            A dict with the result of handling the event.
        """
        handlers = {
            "app.installed": self.handle_app_installed,
            "app.uninstalled": self.handle_app_uninstalled,
        }

        handler = handlers.get(event_type)
        if handler is None:
            logger.warning("Unhandled GHL SaaS webhook event: %s", event_type)
            return {"status": "ignored", "event_type": event_type}

        return await handler(payload)

    # ── App Installed ────────────────────────────────────────────────────

    async def handle_app_installed(self, payload: dict) -> dict:
        """Handle a new client installing the app in their GHL sub-account.

        This triggers the full tenant provisioning flow:
          1. Extract OAuth credentials from the payload.
          2. Create a new tenant record via tenant_manager.
          3. Store GHL tokens on the tenant.
          4. Set up default GHL pipelines.
          5. Send a welcome notification to the admin channel.

        Args:
            payload: The OAuth/install webhook payload containing
                ``locationId``, ``access_token``, ``refresh_token``, etc.

        Returns:
            A dict with the created tenant info or an error.
        """
        location_id = payload.get("locationId") or payload.get("location_id", "")
        access_token = payload.get("access_token", "")
        refresh_token = payload.get("refresh_token", "")
        company_name = payload.get("companyName") or payload.get("company_name", "New Client")

        if not location_id:
            logger.error("app.installed webhook missing locationId: %s", payload)
            return {"error": "Missing locationId in install payload"}

        if not access_token:
            logger.error("app.installed webhook missing access_token: %s", payload)
            return {"error": "Missing access_token in install payload"}

        logger.info(
            "GHL app installed — location=%s company=%s",
            location_id,
            company_name,
        )

        # Check if tenant already exists for this location (re-install case)
        existing = await tenant_manager.get_tenant_by_ghl_location(location_id)
        if existing:
            logger.info(
                "Tenant already exists for location %s (id=%s) — reactivating.",
                location_id,
                existing["id"],
            )
            await tenant_manager.update_tenant(existing["id"], {
                "is_active": True,
                "ghl_access_token": access_token,
                "ghl_refresh_token": refresh_token,
            })
            return {
                "status": "reactivated",
                "tenant_id": existing["id"],
                "location_id": location_id,
            }

        # Create new tenant
        result = await tenant_manager.create_tenant(
            name=company_name,
            ghl_location_id=location_id,
        )

        if "error" in result:
            logger.error("Failed to create tenant for location %s: %s", location_id, result["error"])
            return result

        tenant_id = result["id"]

        # Store GHL OAuth tokens
        await tenant_manager.update_tenant(tenant_id, {
            "ghl_access_token": access_token,
            "ghl_refresh_token": refresh_token,
        })

        # Set up default GHL pipelines
        try:
            pipeline_result = await tenant_manager.setup_ghl_pipelines(tenant_id)
            logger.info("GHL pipelines created for tenant %s: %s", tenant_id, pipeline_result)
        except Exception as exc:
            logger.error("Failed to set up GHL pipelines for tenant %s: %s", tenant_id, exc)

        # Send welcome notification to admin channel
        await self._send_admin_notification(
            f"New SaaS client installed: {company_name} "
            f"(location={location_id}, tenant={tenant_id})"
        )

        return {
            "status": "created",
            "tenant_id": tenant_id,
            "location_id": location_id,
            "company_name": company_name,
        }

    # ── App Uninstalled ──────────────────────────────────────────────────

    async def handle_app_uninstalled(self, payload: dict) -> dict:
        """Handle a client removing the app from their GHL sub-account.

        Performs a soft-delete (deactivation) of the tenant — data is
        preserved for potential re-installation.

        Args:
            payload: The uninstall webhook payload.

        Returns:
            A dict confirming the deactivation or an error.
        """
        location_id = payload.get("locationId") or payload.get("location_id", "")

        if not location_id:
            logger.error("app.uninstalled webhook missing locationId: %s", payload)
            return {"error": "Missing locationId in uninstall payload"}

        logger.info("GHL app uninstalled — location=%s", location_id)

        # Look up tenant by GHL location
        tenant = await tenant_manager.get_tenant_by_ghl_location(location_id)
        if not tenant:
            logger.warning(
                "No tenant found for uninstalled location %s — ignoring.",
                location_id,
            )
            return {"status": "ignored", "reason": "no_tenant_found", "location_id": location_id}

        # Soft-delete the tenant
        success = await tenant_manager.deactivate_tenant(tenant["id"])

        if success:
            logger.info("Tenant %s deactivated (location=%s).", tenant["id"], location_id)
            await self._send_admin_notification(
                f"SaaS client uninstalled: {tenant['name']} "
                f"(location={location_id}, tenant={tenant['id']})"
            )
            return {
                "status": "deactivated",
                "tenant_id": tenant["id"],
                "location_id": location_id,
            }

        return {"error": "Failed to deactivate tenant", "tenant_id": tenant["id"]}

    # ── Onboarding Questionnaire ─────────────────────────────────────────

    def get_onboarding_questions(self) -> list[dict]:
        """Return the structured onboarding questionnaire.

        Returns a list of question definitions that the frontend can
        render as a form.  Each question has an ``id``, ``label``,
        ``type`` (text / dropdown / multi_select / time), and optional
        ``options`` for dropdown/multi_select types.
        """
        return [
            {
                "id": "business_name",
                "label": "Business Name",
                "type": "text",
                "required": True,
            },
            {
                "id": "business_type",
                "label": "Business Type",
                "type": "dropdown",
                "required": True,
                "options": [
                    {"value": "real_estate", "label": "Real Estate"},
                    {"value": "general", "label": "General"},
                    {"value": "e-commerce", "label": "E-Commerce"},
                    {"value": "agency", "label": "Agency"},
                    {"value": "consulting", "label": "Consulting"},
                ],
            },
            {
                "id": "goals",
                "label": "Top 3 Goals",
                "type": "text_list",
                "required": True,
                "min_items": 1,
                "max_items": 3,
                "placeholder": "e.g. Close 5 deals this quarter",
            },
            {
                "id": "checkin_frequency",
                "label": "Preferred Check-in Frequency",
                "type": "dropdown",
                "required": True,
                "options": [
                    {"value": "15min", "label": "Every 15 minutes"},
                    {"value": "30min", "label": "Every 30 minutes"},
                    {"value": "1hr", "label": "Every hour"},
                    {"value": "2hr", "label": "Every 2 hours"},
                ],
            },
            {
                "id": "quiet_hours_start",
                "label": "Quiet Hours Start",
                "type": "time",
                "required": False,
                "default": "22:00",
                "description": "No check-ins will be sent after this time.",
            },
            {
                "id": "quiet_hours_end",
                "label": "Quiet Hours End",
                "type": "time",
                "required": False,
                "default": "07:00",
                "description": "Check-ins resume after this time.",
            },
            {
                "id": "preferred_channels",
                "label": "Preferred Communication Channels",
                "type": "multi_select",
                "required": True,
                "options": [
                    {"value": "telegram", "label": "Telegram"},
                    {"value": "whatsapp", "label": "WhatsApp"},
                    {"value": "slack", "label": "Slack"},
                    {"value": "teams", "label": "Microsoft Teams"},
                ],
            },
        ]

    async def process_onboarding_answers(self, tenant_id: str, answers: dict) -> dict:
        """Process completed onboarding questionnaire answers.

        Updates the tenant's configuration based on their responses:
          - System prompt tailored to business type.
          - Agent config with business-appropriate agents.
          - Gating config with quiet hours and check-in frequency.
          - Initial goals stored in the database.
          - GHL pipelines set up if GHL is connected.

        Args:
            tenant_id: The tenant to configure.
            answers: Dict of questionnaire answers keyed by question ``id``.

        Returns:
            A dict summarising what was configured.
        """
        tenant = await tenant_manager.get_tenant(tenant_id)
        if not tenant:
            return {"error": "Tenant not found", "tenant_id": tenant_id}

        business_name = answers.get("business_name", tenant["name"])
        business_type = answers.get("business_type", "general")
        goals = answers.get("goals", [])
        checkin_frequency = answers.get("checkin_frequency", "30min")
        quiet_hours_start = answers.get("quiet_hours_start", "22:00")
        quiet_hours_end = answers.get("quiet_hours_end", "07:00")
        preferred_channels = answers.get("preferred_channels", ["telegram"])

        # Ensure goals is a list
        if isinstance(goals, str):
            goals = [goals]

        # ── Build system prompt ──────────────────────────────────────────
        system_prompt = self._build_system_prompt(business_name, business_type, goals)

        # ── Build agent config ───────────────────────────────────────────
        btype_key = business_type.lower().replace(" ", "_")
        agent_mapping = _BUSINESS_AGENT_MAP.get(btype_key, _BUSINESS_AGENT_MAP["general"])
        agent_config = {
            "enabled_agents": agent_mapping["enabled_agents"],
            "custom_agents": [],
            "output_style": agent_mapping["output_style"],
            "voice_enabled": True,
            "proactive_checkins": True,
            "checkin_interval_minutes": _CHECKIN_FREQUENCY_MAP.get(checkin_frequency, 30),
            "gating_overrides": {},
        }

        # ── Build gating config ──────────────────────────────────────────
        quiet_start_hour = self._parse_hour(quiet_hours_start, default=22)
        quiet_end_hour = self._parse_hour(quiet_hours_end, default=7)

        gating_config = {
            "min_hours_between_checkins": max(1, agent_config["checkin_interval_minutes"] // 60),
            "quiet_hours_start": quiet_start_hour,
            "quiet_hours_end": quiet_end_hour,
            "sacred_blocks": [],
            "preferred_channels": preferred_channels,
            "urgency_overrides": {
                "deal_deadline_within_24h": True,
                "missed_closing_date": True,
                "client_emergency": True,
            },
        }

        # ── Apply updates to tenant ──────────────────────────────────────
        updates = {
            "name": business_name,
            "system_prompt": system_prompt,
            "agent_config": agent_config,
            "gating_config": gating_config,
        }
        await tenant_manager.update_tenant(tenant_id, updates)

        # ── Create initial goals ─────────────────────────────────────────
        goals_created = 0
        if goals:
            try:
                from helm.models.database import Goal, async_session

                async with async_session() as session:
                    for goal_text in goals[:3]:
                        if goal_text and goal_text.strip():
                            goal = Goal(tenant_id=tenant_id, goal=goal_text.strip())
                            session.add(goal)
                            goals_created += 1
                    await session.commit()
            except Exception as exc:
                logger.error("Failed to create goals for tenant %s: %s", tenant_id, exc)

        # ── Set up GHL pipelines if connected ────────────────────────────
        pipelines_created: list[str] = []
        if tenant.get("ghl_location_id"):
            try:
                pipeline_result = await tenant_manager.setup_ghl_pipelines(
                    tenant_id, business_type=business_type
                )
                pipelines_created = pipeline_result.get("pipelines_created", [])
            except Exception as exc:
                logger.error("Failed to set up GHL pipelines for tenant %s: %s", tenant_id, exc)

        logger.info(
            "Onboarding completed for tenant %s: business_type=%s, agents=%d, goals=%d",
            tenant_id,
            business_type,
            len(agent_config["enabled_agents"]),
            goals_created,
        )

        return {
            "status": "onboarded",
            "tenant_id": tenant_id,
            "business_name": business_name,
            "business_type": business_type,
            "agents_enabled": agent_config["enabled_agents"],
            "output_style": agent_config["output_style"],
            "checkin_interval_minutes": agent_config["checkin_interval_minutes"],
            "quiet_hours": {"start": quiet_start_hour, "end": quiet_end_hour},
            "preferred_channels": preferred_channels,
            "goals_created": goals_created,
            "pipelines_created": pipelines_created,
        }

    # ── Helpers ───────────────────────────────────────────────────────────

    def _build_system_prompt(
        self, business_name: str, business_type: str, goals: list[str]
    ) -> str:
        """Generate a personalised system prompt from onboarding data."""
        prompt = f"You are Grace, a dedicated AI assistant for {business_name}. "

        type_descriptions = {
            "real_estate": (
                "They are a real estate investing business. "
                "Speak in RE investing terminology. Lead with numbers and metrics. "
                "Always frame decisions in terms of ROI and risk. "
            ),
            "e-commerce": (
                "They run an e-commerce business. "
                "Focus on inventory, orders, customer satisfaction, and revenue metrics. "
            ),
            "agency": (
                "They run a marketing/creative agency. "
                "Focus on client deliverables, campaign performance, and team coordination. "
                "Use a professional, client-facing tone. "
            ),
            "consulting": (
                "They are a consulting firm. "
                "Focus on client engagements, deliverables, and billable utilisation. "
                "Present information in executive-summary format. "
            ),
            "general": (
                "They run a business operation. "
                "Focus on productivity, task management, and operational efficiency. "
            ),
        }

        btype_key = business_type.lower().replace(" ", "_")
        prompt += type_descriptions.get(btype_key, type_descriptions["general"])

        if goals:
            goals_str = "; ".join(g.strip() for g in goals[:3] if g.strip())
            if goals_str:
                prompt += f"Their current top goals are: {goals_str}. "

        prompt += (
            "Be proactive about surfacing important items. "
            "Keep responses concise and action-oriented. "
            "When you don't know something, say so and suggest how to find out. "
            "Always confirm before taking actions that modify data."
        )
        return prompt

    def _parse_hour(self, time_str: str, default: int = 0) -> int:
        """Parse an hour from a time string like ``'22:00'`` or ``'22'``."""
        try:
            if ":" in str(time_str):
                return int(str(time_str).split(":")[0])
            return int(time_str)
        except (ValueError, TypeError):
            return default

    async def _send_admin_notification(self, message: str) -> None:
        """Send a notification to the admin Telegram channel (best-effort)."""
        try:
            from helm.integrations.telegram import telegram_bot

            if telegram_bot.is_configured and settings.telegram_admin_user_id:
                await telegram_bot.send_message(
                    chat_id=settings.telegram_admin_user_id,
                    text=f"[SaaS] {message}",
                )
        except Exception as exc:
            # Admin notification is best-effort; never fail the main flow
            logger.warning("Failed to send admin notification: %s", exc)


# Singleton
ghl_saas = GHLSaaSWebhookHandler()
