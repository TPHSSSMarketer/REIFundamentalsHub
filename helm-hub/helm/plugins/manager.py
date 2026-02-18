"""Plugin Manager — discovers, loads, and orchestrates Helm plugins."""

from __future__ import annotations

import importlib
import logging
import pkgutil
from typing import TYPE_CHECKING, Any

from helm.plugins.base import HelmPlugin

if TYPE_CHECKING:
    from fastapi import APIRouter, FastAPI

    from helm.agents.definitions import AgentDefinition
    from helm.integrations.registry import IntegrationRegistry

logger = logging.getLogger(__name__)


class PluginManager:
    """Central manager for all Helm plugins."""

    def __init__(self) -> None:
        self._plugins: dict[str, HelmPlugin] = {}

    # ── Discovery & Registration ──────────────────────────────────────────

    def register(self, plugin: HelmPlugin) -> None:
        """Register a plugin instance."""
        if plugin.name in self._plugins:
            logger.warning("Plugin '%s' already registered — skipping.", plugin.name)
            return
        self._plugins[plugin.name] = plugin
        logger.info(
            "Plugin registered: %s v%s — %s",
            plugin.name,
            plugin.version,
            plugin.description,
        )

    def discover_plugins(self) -> None:
        """Auto-discover plugins in the ``helm.plugins`` package.

        Each sub-package must define a ``get_plugin() -> HelmPlugin`` function
        in its ``__init__.py``.
        """
        import helm.plugins as plugins_pkg

        for importer, modname, ispkg in pkgutil.iter_modules(
            plugins_pkg.__path__, prefix="helm.plugins."
        ):
            if not ispkg:
                continue  # Only look at sub-packages
            try:
                mod = importlib.import_module(modname)
                factory = getattr(mod, "get_plugin", None)
                if factory is None:
                    logger.debug("Plugin package %s has no get_plugin() — skipping.", modname)
                    continue
                plugin = factory()
                if isinstance(plugin, HelmPlugin):
                    self.register(plugin)
                else:
                    logger.warning(
                        "get_plugin() in %s returned %s, expected HelmPlugin — skipping.",
                        modname,
                        type(plugin).__name__,
                    )
            except Exception as exc:
                logger.warning("Failed to load plugin %s: %s", modname, exc)

    # ── Lifecycle ─────────────────────────────────────────────────────────

    async def startup_all(self, app: FastAPI) -> None:
        """Run on_startup for all registered plugins."""
        for plugin in self._plugins.values():
            try:
                await plugin.on_startup(app)
                logger.info("Plugin '%s' started.", plugin.name)
            except Exception as exc:
                logger.error("Plugin '%s' startup failed: %s", plugin.name, exc)

    async def shutdown_all(self, app: FastAPI) -> None:
        """Run on_shutdown for all registered plugins."""
        for plugin in self._plugins.values():
            try:
                await plugin.on_shutdown(app)
            except Exception as exc:
                logger.error("Plugin '%s' shutdown failed: %s", plugin.name, exc)

    # ── Route Registration ────────────────────────────────────────────────

    def mount_routes(self, parent_router: APIRouter) -> None:
        """Let each plugin register its routes under /api/plugins/{name}/."""
        from fastapi import APIRouter

        for plugin in self._plugins.values():
            sub_router = APIRouter()
            plugin.register_routes(sub_router)
            if sub_router.routes:
                parent_router.include_router(
                    sub_router,
                    prefix=f"/plugins/{plugin.name}",
                    tags=[f"plugin:{plugin.name}"],
                )
                logger.info(
                    "Plugin '%s' mounted %d routes at /api/plugins/%s/",
                    plugin.name,
                    len(sub_router.routes),
                    plugin.name,
                )

    # ── Integration Registration ──────────────────────────────────────────

    def register_all_integrations(self, registry: IntegrationRegistry) -> None:
        """Let each plugin register its integrations."""
        for plugin in self._plugins.values():
            try:
                plugin.register_integrations(registry)
            except Exception as exc:
                logger.error(
                    "Plugin '%s' integration registration failed: %s",
                    plugin.name,
                    exc,
                )

    # ── Aggregators — merge contributions from all plugins ────────────────

    def get_all_agents(self) -> dict[str, AgentDefinition]:
        """Collect agent definitions from all plugins."""
        agents: dict[str, AgentDefinition] = {}
        for plugin in self._plugins.values():
            agents.update(plugin.register_agents())
        return agents

    def get_all_output_styles(self) -> dict[str, str]:
        """Collect output styles from all plugins."""
        styles: dict[str, str] = {}
        for plugin in self._plugins.values():
            styles.update(plugin.register_output_styles())
        return styles

    def get_all_mode_prompts(self) -> dict[str, str]:
        """Collect assistant mode prompts from all plugins."""
        prompts: dict[str, str] = {}
        for plugin in self._plugins.values():
            prompts.update(plugin.register_mode_prompts())
        return prompts

    def get_all_router_signals(self) -> dict[str, list[str]]:
        """Collect router keyword signals from all plugins."""
        merged: dict[str, list[str]] = {"opus": [], "research": [], "deep_research": []}
        for plugin in self._plugins.values():
            signals = plugin.register_router_signals()
            for key in merged:
                merged[key].extend(signals.get(key, []))
        return merged

    def get_all_context_templates(self) -> dict[str, str]:
        """Collect context file templates from all plugins."""
        templates: dict[str, str] = {}
        for plugin in self._plugins.values():
            templates.update(plugin.register_context_templates())
        return templates

    def get_all_tool_definitions(self) -> list[dict[str, Any]]:
        """Collect tool definitions from all plugins."""
        tools: list[dict[str, Any]] = []
        for plugin in self._plugins.values():
            tools.extend(plugin.register_tool_definitions())
        return tools

    # ── Introspection ─────────────────────────────────────────────────────

    def list_plugins(self) -> list[dict[str, str]]:
        """Return metadata for all registered plugins."""
        return [
            {
                "name": p.name,
                "version": p.version,
                "description": p.description,
            }
            for p in self._plugins.values()
        ]

    def get_plugin(self, name: str) -> HelmPlugin | None:
        """Get a plugin by name."""
        return self._plugins.get(name)

    @property
    def loaded_plugins(self) -> list[str]:
        """Names of all loaded plugins."""
        return list(self._plugins.keys())
