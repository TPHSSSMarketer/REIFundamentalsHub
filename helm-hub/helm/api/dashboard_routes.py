"""Systems Dashboard — live operational overview of the Helm Hub instance.

Exposes GET /api/dashboard/summary with agent stack, plugin health,
integration status, conversation pipeline, and REI Hub connection info.
No authentication required (internal status page).
"""

from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter

dashboard_router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _derive_tier(model: str) -> str:
    m = model.lower()
    if "claude" in m or "gpt" in m:
        return "Paid"
    if "gemini-flash" in m or "deepseek" in m:
        return "Free"
    return "Unknown"


# Model alias map — first matching substring wins
_ALIAS_MAP = [
    ("opus", "opus"),
    ("sonnet", "sonnet"),
    ("haiku", "haiku"),
    ("gpt", "gpt"),
    ("gemini", "gemini"),
    ("deepseek", "deepseek"),
]


def _derive_alias(model: str) -> str:
    m = model.lower()
    for substring, alias in _ALIAS_MAP:
        if substring in m:
            return alias
    return model[:12]


@dashboard_router.get("/summary")
async def dashboard_summary() -> dict:
    """Return a full systems overview snapshot."""

    health_reasons: list[str] = []

    # ── Settings ────────────────────────────────────────────────────────
    try:
        from helm.config import get_settings
        settings = get_settings()
    except Exception:
        settings = None

    # ── Agents ──────────────────────────────────────────────────────────
    agents_list: list[dict] = []
    try:
        from helm.agents.definitions import ALL_AGENTS

        seen_primary = False
        for agent in ALL_AGENTS.values():
            is_primary = not seen_primary
            seen_primary = True
            agents_list.append({
                "name": agent.name.replace("-", " ").title(),
                "alias": _derive_alias(agent.model),
                "role": agent.description,
                "model": agent.model,
                "is_primary": is_primary,
                "tier": _derive_tier(agent.model),
            })
    except Exception:
        health_reasons.append("Agent registry unavailable")

    # ── Plugins ─────────────────────────────────────────────────────────
    plugins_list: list[dict] = []
    try:
        from helm.plugins import plugin_manager

        for name in plugin_manager.loaded_plugins:
            plugins_list.append({"name": name, "status": "Loaded"})
    except Exception:
        health_reasons.append("Plugin manager unavailable")

    # ── Integrations ────────────────────────────────────────────────────
    integrations_list: list[dict] = []
    _checks = [
        ("Telegram", ["telegram_bot_token", "telegram_token"]),
        ("Discord", ["discord_bot_token", "discord_token"]),
        ("Slack", ["slack_bot_token"]),
        ("WhatsApp", ["whatsapp_access_token"]),
        ("WordPress", ["wordpress_url"]),
        ("Google Drive", ["google_drive_client_id", "google_client_id"]),
        ("Dropbox", ["dropbox_access_token", "dropbox_token"]),
        ("ElevenLabs", ["elevenlabs_api_key"]),
        ("Supabase", ["supabase_url"]),
        ("GoHighLevel", ["ghl_client_id"]),
        ("OpenRouter", ["openrouter_api_key"]),
    ]
    if settings:
        for display_name, field_names in _checks:
            configured = False
            for field_name in field_names:
                if hasattr(settings, field_name) and getattr(settings, field_name, ""):
                    configured = True
                    break
            integrations_list.append({
                "name": display_name,
                "status": "Configured" if configured else "Not Configured",
            })

    configured_count = sum(1 for i in integrations_list if i["status"] == "Configured")

    # ── Pipeline ────────────────────────────────────────────────────────
    plugin_status = "ok" if plugins_list else "warn"
    agent_status = "ok" if agents_list else "warn"

    pipeline = [
        {"label": "Client", "status": "ok"},
        {"label": "Helm API", "status": "ok"},
        {"label": "Plugin Layer", "status": plugin_status},
        {"label": "AI Agent", "status": agent_status},
        {"label": "Anthropic", "status": "unknown"},
        {"label": "Response", "status": "ok"},
    ]

    # ── REI Hub ─────────────────────────────────────────────────────────
    rei_connected = False
    rei_display = ""
    if settings and hasattr(settings, "rei_hub_url") and settings.rei_hub_url:
        rei_connected = True
        try:
            parsed = urlparse(settings.rei_hub_url)
            rei_display = parsed.netloc or settings.rei_hub_url
        except Exception:
            rei_display = settings.rei_hub_url

    # ── Health ──────────────────────────────────────────────────────────
    if not plugins_list:
        health_reasons.append("No plugins loaded")
    if configured_count == 0:
        health_reasons.append("No integrations configured")

    if not agents_list and "Agent registry unavailable" in health_reasons:
        health_state = "down"
    elif health_reasons:
        health_state = "warn"
    else:
        health_state = "ok"

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "helm_version": "0.3.0",
        "server": {"status": "ok"},
        "agents": agents_list,
        "plugins": plugins_list,
        "integrations": integrations_list,
        "pipeline": pipeline,
        "rei_hub": {
            "connected": rei_connected,
            "url_display": rei_display,
        },
        "health": {
            "state": health_state,
            "reasons": health_reasons,
        },
    }
