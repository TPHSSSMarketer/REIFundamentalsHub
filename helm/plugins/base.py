"""Base class for all Helm plugins.

Every plugin must subclass ``HelmPlugin`` and implement the required
properties.  All hook methods have sensible defaults (return nothing)
so plugins only override what they need.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import APIRouter, FastAPI

    from helm.agents.definitions import AgentDefinition
    from helm.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


class HelmPlugin(ABC):
    """Abstract base class for Helm plugins."""

    # ── Required properties ───────────────────────────────────────────────

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique plugin identifier (e.g. 'rei')."""

    @property
    @abstractmethod
    def version(self) -> str:
        """Semantic version string (e.g. '0.1.0')."""

    @property
    @abstractmethod
    def description(self) -> str:
        """One-line description shown in /api/integrations."""

    # ── Optional hooks — override only what you need ──────────────────────

    def register_routes(self, router: APIRouter) -> None:
        """Add API routes under the plugin's namespace.

        Routes are mounted at ``/api/plugins/{plugin.name}/``.
        """

    def register_agents(self) -> dict[str, AgentDefinition]:
        """Return a dict of agent definitions this plugin provides."""
        return {}

    def register_output_styles(self) -> dict[str, str]:
        """Return a dict of output style name → instruction text."""
        return {}

    def register_mode_prompts(self) -> dict[str, str]:
        """Return a dict of assistant mode name → system prompt section."""
        return {}

    def register_integrations(self, registry: IntegrationRegistry) -> None:
        """Register integration instances with the central registry."""

    def register_router_signals(self) -> dict[str, list[str]]:
        """Return keyword signals to add to the multi-AI router.

        Keys: 'opus', 'research', 'deep_research'
        Values: lists of keyword strings
        """
        return {}

    def register_context_templates(self) -> dict[str, str]:
        """Return context file templates: filename → content."""
        return {}

    def register_tool_definitions(self) -> list[dict[str, Any]]:
        """Return tool definitions for function-calling models."""
        return []

    async def on_startup(self, app: FastAPI) -> None:
        """Called during app startup after core initialisation."""

    async def on_shutdown(self, app: FastAPI) -> None:
        """Called during app shutdown."""
