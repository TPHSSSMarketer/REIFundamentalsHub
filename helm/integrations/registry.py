"""Integration Plugin Registry — makes every integration optional and discoverable.

Helm works standalone.  GHL, REIFundamentals Hub, ElevenLabs, Supabase, etc.
are all optional plugins that register themselves when configured.  If an API
key is missing, the plugin simply doesn't activate — no errors, no crashes.

Usage:
    from helm.integrations.registry import registry

    # Check what's available
    registry.list_active()          # → ["telegram", "voice"]
    registry.is_active("ghl")       # → False

    # Get a plugin instance
    ghl = registry.get("ghl")       # → GHLClient or None
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class PluginInfo:
    """Metadata about a registered integration plugin."""

    name: str
    description: str
    instance: Any
    is_active: bool
    category: str = "integration"  # integration, messaging, voice, crm, memory


class IntegrationRegistry:
    """Central registry for all optional integration plugins."""

    def __init__(self) -> None:
        self._plugins: dict[str, PluginInfo] = {}

    def register(
        self,
        name: str,
        instance: Any,
        description: str = "",
        category: str = "integration",
    ) -> None:
        """Register a plugin. Checks `is_configured` property to determine if active."""
        is_active = getattr(instance, "is_configured", False)
        self._plugins[name] = PluginInfo(
            name=name,
            description=description,
            instance=instance,
            is_active=is_active,
            category=category,
        )
        status = "active" if is_active else "inactive (not configured)"
        logger.info("Plugin registered: %s [%s] — %s", name, category, status)

    def get(self, name: str) -> Any | None:
        """Get a plugin instance by name. Returns None if not registered or inactive."""
        info = self._plugins.get(name)
        if info and info.is_active:
            return info.instance
        return None

    def is_active(self, name: str) -> bool:
        """Check if a plugin is registered and configured."""
        info = self._plugins.get(name)
        return info.is_active if info else False

    def list_active(self) -> list[str]:
        """List names of all active (configured) plugins."""
        return [name for name, info in self._plugins.items() if info.is_active]

    def list_all(self) -> list[PluginInfo]:
        """List all registered plugins with their status."""
        return list(self._plugins.values())

    def list_by_category(self, category: str) -> list[PluginInfo]:
        """List plugins filtered by category."""
        return [info for info in self._plugins.values() if info.category == category]

    def get_status_report(self) -> dict[str, Any]:
        """Generate a status report for all plugins — used by health checks."""
        return {
            "total_registered": len(self._plugins),
            "total_active": len(self.list_active()),
            "plugins": {
                name: {
                    "active": info.is_active,
                    "category": info.category,
                    "description": info.description,
                }
                for name, info in self._plugins.items()
            },
        }


# Singleton registry
registry = IntegrationRegistry()


def register_all_plugins() -> None:
    """Discover and register all available integration plugins.

    Called once at application startup.  Each integration checks its own
    configuration — if API keys are missing, it registers as inactive.
    """
    from helm.integrations.reifundamentals import reifundamentals_client
    from helm.integrations.telegram import telegram_bot
    from helm.integrations.voice import voice_processor
    from helm.integrations.whatsapp import whatsapp_client

    registry.register(
        "reifundamentals",
        reifundamentals_client,
        description="REIFundamentals Hub — real estate portfolio and deal management",
        category="crm",
    )

    registry.register(
        "telegram",
        telegram_bot,
        description="Telegram Bot — personal messaging channel",
        category="messaging",
    )

    registry.register(
        "whatsapp",
        whatsapp_client,
        description="WhatsApp Business Cloud API — business messaging channel",
        category="messaging",
    )

    registry.register(
        "voice",
        voice_processor,
        description="Voice processing — Whisper STT + TTS",
        category="voice",
    )

    # Google Drive
    from helm.integrations.google_drive import google_drive_client

    registry.register(
        "google_drive",
        google_drive_client,
        description="Google Drive — cloud file management for SaaS tenants",
        category="storage",
    )

    # Virtual Workspace
    from helm.integrations.workspace import default_workspace

    registry.register(
        "workspace",
        default_workspace,
        description="Virtual Workspace — sandboxed file system + code execution",
        category="storage",
    )

    # Wire active storage backends into the file manager
    from helm.integrations.file_manager import file_manager

    if google_drive_client.is_configured and google_drive_client.is_connected:
        file_manager.register_backend(google_drive_client, default=True)
    if default_workspace.is_configured:
        file_manager.register_backend(default_workspace, default=not google_drive_client.is_connected)

    # GHL (imported lazily to avoid errors if not installed)
    try:
        from helm.integrations.ghl import ghl_client

        registry.register(
            "ghl",
            ghl_client,
            description="GoHighLevel — CRM, pipelines, tasks, calendar, conversations",
            category="crm",
        )
    except ImportError:
        logger.debug("GHL integration not available.")

    # Supabase memory (imported lazily)
    try:
        from helm.integrations.supabase_memory import supabase_memory

        registry.register(
            "supabase",
            supabase_memory,
            description="Supabase — semantic memory with pgvector embeddings",
            category="memory",
        )
    except ImportError:
        logger.debug("Supabase memory integration not available.")

    active = registry.list_active()
    logger.info(
        "Plugin registration complete: %d active out of %d registered — %s",
        len(active),
        len(registry.list_all()),
        active if active else "(none — Helm running standalone)",
    )
