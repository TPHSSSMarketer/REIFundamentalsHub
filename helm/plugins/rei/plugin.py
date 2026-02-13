"""REI Plugin — the main plugin class that wires everything together."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from helm.plugins.base import HelmPlugin

if TYPE_CHECKING:
    from fastapi import APIRouter, FastAPI

    from helm.agents.definitions import AgentDefinition
    from helm.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


class REIPlugin(HelmPlugin):
    """Real estate investing plugin for Helm.

    Adds REIFundamentals Hub integration, GoHighLevel CRM, RE-specific
    agents, deal analysis routes, and investor context templates.
    """

    @property
    def name(self) -> str:
        return "rei"

    @property
    def version(self) -> str:
        return "0.1.0"

    @property
    def description(self) -> str:
        return "Real estate investing — deal analysis, portfolio, CRM, market research"

    # ── Routes ────────────────────────────────────────────────────────────

    def register_routes(self, router: APIRouter) -> None:
        from helm.plugins.rei.routes import router as rei_router

        # Include all routes from the REI routes module
        for route in rei_router.routes:
            router.routes.append(route)

    # ── Agents ────────────────────────────────────────────────────────────

    def register_agents(self) -> dict[str, AgentDefinition]:
        from helm.plugins.rei.agents import REI_AGENTS

        return REI_AGENTS

    # ── Output Styles ─────────────────────────────────────────────────────

    def register_output_styles(self) -> dict[str, str]:
        from helm.plugins.rei.output_styles import REI_STYLES

        return REI_STYLES

    # ── Mode Prompts ──────────────────────────────────────────────────────

    def register_mode_prompts(self) -> dict[str, str]:
        from helm.plugins.rei.prompts import REI_MODE_PROMPTS

        return REI_MODE_PROMPTS

    # ── Integrations ──────────────────────────────────────────────────────

    def register_integrations(self, registry: IntegrationRegistry) -> None:
        # REIFundamentals Hub
        try:
            from helm.integrations.reifundamentals import reifundamentals_client

            registry.register(
                "reifundamentals",
                reifundamentals_client,
                description="REIFundamentals Hub — real estate portfolio and deal management",
                category="crm",
            )
        except Exception as exc:
            logger.debug("REIFundamentals integration not available: %s", exc)

        # GoHighLevel
        try:
            from helm.integrations.ghl import ghl_client

            registry.register(
                "ghl",
                ghl_client,
                description="GoHighLevel — CRM, pipelines, tasks, calendar, conversations",
                category="crm",
            )
        except Exception as exc:
            logger.debug("GHL integration not available: %s", exc)

    # ── Router Signals ────────────────────────────────────────────────────

    def register_router_signals(self) -> dict[str, list[str]]:
        return {
            "opus": [
                "analyze this deal", "evaluate this property", "deal analysis",
                "negotiation strategy", "creative financing", "seller financing",
                "portfolio analysis", "portfolio health", "portfolio review",
                "portfolio performance", "review my portfolio",
                "brrrr", "cash-on-cash",
                "should i buy", "should i sell", "refinance strategy",
                "partnership structure", "exit strategy",
                "compare these", "which deal is better", "risk assessment",
            ],
            "research": [
                "find comps", "comparable sales",
                "market data", "what's happening in", "neighborhood", "crime stats",
                "school ratings", "flood zone", "zoning", "permits", "listings",
                "rent estimate", "property tax", "insurance cost",
                "cap rate in", "what are rents", "average rent", "median price",
            ],
            "deep_research": [
                "full neighborhood analysis", "market report",
            ],
        }

    # ── Context Templates ─────────────────────────────────────────────────

    def register_context_templates(self) -> dict[str, str]:
        from helm.plugins.rei.context_templates import REI_TEMPLATES

        return REI_TEMPLATES

    # ── Tool Definitions ──────────────────────────────────────────────────

    def register_tool_definitions(self) -> list[dict[str, Any]]:
        from helm.plugins.rei.tools import REI_TOOL_DEFINITIONS

        return REI_TOOL_DEFINITIONS

    # ── Lifecycle ─────────────────────────────────────────────────────────

    async def on_startup(self, app: FastAPI) -> None:
        logger.info("REI plugin initialized — real estate features active.")

    async def on_shutdown(self, app: FastAPI) -> None:
        logger.info("REI plugin shutting down.")
