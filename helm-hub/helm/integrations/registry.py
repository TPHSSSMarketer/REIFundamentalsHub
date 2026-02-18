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
    """Discover and register all available core integration plugins.

    Called once at application startup.  Each integration checks its own
    configuration — if API keys are missing, it registers as inactive.

    Domain-specific integrations (e.g. REIFundamentals, GHL) are
    registered by their respective plugins — see ``helm.plugins``.
    """
    from helm.integrations.telegram import telegram_bot
    from helm.integrations.voice import voice_processor
    from helm.integrations.whatsapp import whatsapp_client

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

    # Slack
    from helm.integrations.slack import slack_client

    registry.register(
        "slack",
        slack_client,
        description="Slack Bot — team messaging channel",
        category="messaging",
    )

    # Microsoft Teams
    from helm.integrations.teams import teams_client

    registry.register(
        "teams",
        teams_client,
        description="Microsoft Teams Bot — enterprise messaging channel",
        category="messaging",
    )

    # Google Chat
    from helm.integrations.google_chat import google_chat_client

    registry.register(
        "google_chat",
        google_chat_client,
        description="Google Chat Bot — Google Workspace messaging",
        category="messaging",
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

    # OpenRouter (multi-model gateway + Perplexity research)
    from helm.integrations.openrouter import openrouter_client

    registry.register(
        "openrouter",
        openrouter_client,
        description="OpenRouter — multi-model gateway + Perplexity web research",
        category="ai",
    )

    # Claude CLI (Max subscription backend)
    from helm.integrations.claude_cli import claude_cli_client

    registry.register(
        "claude_cli",
        claude_cli_client,
        description="Claude CLI — headless Claude Code using Max subscription",
        category="ai",
    )

    # GoHighLevel CRM
    from helm.integrations.ghl import ghl_client

    registry.register(
        "ghl",
        ghl_client,
        description="GoHighLevel — CRM, pipelines, tasks, calendar, messaging",
        category="crm",
    )

    # ElevenLabs premium voice
    from helm.integrations.elevenlabs import elevenlabs_client

    registry.register(
        "elevenlabs",
        elevenlabs_client,
        description="ElevenLabs — premium TTS and conversational AI agent",
        category="voice",
    )

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

    # Stripe billing
    from helm.integrations.stripe_client import stripe_client

    registry.register(
        "stripe",
        stripe_client,
        description="Stripe — subscription billing and payment processing",
        category="billing",
    )

    # PayPal billing
    from helm.integrations.paypal_client import paypal_client

    registry.register(
        "paypal",
        paypal_client,
        description="PayPal — subscription billing and payment processing",
        category="billing",
    )

    # Let Helm plugins register their domain-specific integrations
    from helm.plugins import plugin_manager

    plugin_manager.register_all_integrations(registry)

    active = registry.list_active()
    logger.info(
        "Integration registration complete: %d active out of %d registered — %s",
        len(active),
        len(registry.list_all()),
        active if active else "(none — Helm running standalone)",
    )
