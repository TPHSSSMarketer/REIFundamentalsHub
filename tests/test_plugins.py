"""Tests for the Helm plugin system."""

from __future__ import annotations

import pytest

from helm.agents.definitions import AgentDefinition
from helm.plugins.base import HelmPlugin
from helm.plugins.manager import PluginManager


# ── Fixtures ─────────────────────────────────────────────────────────────────


class DummyPlugin(HelmPlugin):
    """A minimal test plugin."""

    @property
    def name(self) -> str:
        return "dummy"

    @property
    def version(self) -> str:
        return "0.0.1"

    @property
    def description(self) -> str:
        return "Test plugin"

    def register_agents(self) -> dict[str, AgentDefinition]:
        return {
            "test-agent": AgentDefinition(
                name="test-agent",
                description="A test agent",
                system_prompt="You are a test agent.",
                scope="project",
            )
        }

    def register_output_styles(self) -> dict[str, str]:
        return {"test-style": "Use a test-friendly tone."}

    def register_mode_prompts(self) -> dict[str, str]:
        return {"test_mode": "You are in test mode."}

    def register_router_signals(self) -> dict[str, list[str]]:
        return {"opus": ["test signal"], "research": [], "deep_research": []}


# ── Plugin Manager Tests ─────────────────────────────────────────────────────


def test_plugin_register():
    """Register a plugin and verify it's listed."""
    pm = PluginManager()
    plugin = DummyPlugin()
    pm.register(plugin)

    assert "dummy" in pm.loaded_plugins
    assert pm.get_plugin("dummy") is plugin


def test_plugin_list_metadata():
    """list_plugins returns correct metadata."""
    pm = PluginManager()
    pm.register(DummyPlugin())

    plugins = pm.list_plugins()
    assert len(plugins) == 1
    assert plugins[0]["name"] == "dummy"
    assert plugins[0]["version"] == "0.0.1"


def test_duplicate_plugin_skipped():
    """Registering the same plugin twice doesn't duplicate."""
    pm = PluginManager()
    pm.register(DummyPlugin())
    pm.register(DummyPlugin())

    assert len(pm.loaded_plugins) == 1


def test_get_all_agents():
    """Agents from all plugins are collected."""
    pm = PluginManager()
    pm.register(DummyPlugin())

    agents = pm.get_all_agents()
    assert "test-agent" in agents
    assert agents["test-agent"].description == "A test agent"


def test_get_all_output_styles():
    """Output styles from all plugins are collected."""
    pm = PluginManager()
    pm.register(DummyPlugin())

    styles = pm.get_all_output_styles()
    assert "test-style" in styles


def test_get_all_mode_prompts():
    """Mode prompts from all plugins are collected."""
    pm = PluginManager()
    pm.register(DummyPlugin())

    prompts = pm.get_all_mode_prompts()
    assert "test_mode" in prompts


def test_get_all_router_signals():
    """Router signals from all plugins are collected."""
    pm = PluginManager()
    pm.register(DummyPlugin())

    signals = pm.get_all_router_signals()
    assert "test signal" in signals["opus"]


def test_empty_manager():
    """Manager with no plugins returns empty results."""
    pm = PluginManager()

    assert pm.loaded_plugins == []
    assert pm.get_all_agents() == {}
    assert pm.get_all_output_styles() == {}
    assert pm.list_plugins() == []


# ── REI Plugin Tests ─────────────────────────────────────────────────────────


def test_rei_plugin_loads():
    """The REI plugin can be instantiated and registered."""
    from helm.plugins.rei import get_plugin

    plugin = get_plugin()
    assert plugin.name == "rei"
    assert plugin.version == "0.1.0"


def test_rei_plugin_agents():
    """REI plugin provides deal-analyzer, market-researcher, contract-reviewer."""
    from helm.plugins.rei import get_plugin

    plugin = get_plugin()
    agents = plugin.register_agents()

    assert "deal-analyzer" in agents
    assert "market-researcher" in agents
    assert "contract-reviewer" in agents
    assert len(agents) == 3


def test_rei_plugin_output_styles():
    """REI plugin provides the re-investor output style."""
    from helm.plugins.rei import get_plugin

    plugin = get_plugin()
    styles = plugin.register_output_styles()

    assert "re-investor" in styles
    assert "cap rate" in styles["re-investor"].lower()


def test_rei_plugin_mode_prompts():
    """REI plugin provides the real_estate mode."""
    from helm.plugins.rei import get_plugin

    plugin = get_plugin()
    modes = plugin.register_mode_prompts()

    assert "real_estate" in modes
    assert "REIFundamentals" in modes["real_estate"]


def test_rei_plugin_router_signals():
    """REI plugin provides RE-specific router signals."""
    from helm.plugins.rei import get_plugin

    plugin = get_plugin()
    signals = plugin.register_router_signals()

    assert "analyze this deal" in signals["opus"]
    assert "find comps" in signals["research"]


def test_rei_plugin_context_templates():
    """REI plugin provides context templates."""
    from helm.plugins.rei import get_plugin

    plugin = get_plugin()
    templates = plugin.register_context_templates()

    assert "USER.md" in templates
    assert "RULES.md" in templates
    assert "DEALS_PIPELINE.md" in templates
    assert "PORTFOLIO.md" in templates


def test_rei_plugin_tool_definitions():
    """REI plugin provides tool definitions."""
    from helm.plugins.rei import get_plugin

    plugin = get_plugin()
    tools = plugin.register_tool_definitions()

    tool_names = [t["name"] for t in tools]
    assert "analyze_deal" in tool_names
    assert "get_portfolio_overview" in tool_names


def test_rei_plugin_full_lifecycle():
    """REI plugin can be discovered and registered via PluginManager."""
    pm = PluginManager()

    from helm.plugins.rei import get_plugin

    pm.register(get_plugin())

    assert "rei" in pm.loaded_plugins

    # All aggregators should include REI data
    agents = pm.get_all_agents()
    assert "deal-analyzer" in agents

    styles = pm.get_all_output_styles()
    assert "re-investor" in styles

    modes = pm.get_all_mode_prompts()
    assert "real_estate" in modes


# ── Core Agent Tests (no RE agents in core) ──────────────────────────────────


def test_core_agents_no_re():
    """Core agents should not include RE-specific agents by default."""
    from helm.agents.definitions import _CORE_AGENTS

    core_names = list(_CORE_AGENTS.keys())
    assert "deal-analyzer" not in core_names
    assert "market-researcher" not in core_names
    assert "contract-reviewer" not in core_names

    # General agents should still be there
    assert "outreach-drafter" in core_names
    assert "task-manager" in core_names
    assert "schedule-optimizer" in core_names
    assert "health-coach" in core_names
    assert "research-assistant" in core_names


# ── Backward Compatibility ───────────────────────────────────────────────────


def test_schemas_backward_compat():
    """RE schemas can still be imported from helm.models.schemas."""
    from helm.models.schemas import (
        DealAnalysisRequest,
        DealAnalysisResponse,
        PortfolioOverview,
        PropertySummary,
    )

    # Just check they're importable and are the same classes
    from helm.plugins.rei.schemas import PropertySummary as REIPropertySummary

    assert PropertySummary is REIPropertySummary
