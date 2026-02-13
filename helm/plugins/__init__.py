"""Helm Plugin System — extend Helm with domain-specific capabilities.

Plugins add routes, agents, prompts, output styles, integrations, and
router signals without modifying core Helm code.  Each plugin is a
self-contained package under ``helm/plugins/``.

Usage:
    from helm.plugins import plugin_manager

    # During startup:
    plugin_manager.discover_plugins()
    plugin_manager.startup_all(app)

    # At runtime:
    plugin_manager.get_all_agents()
    plugin_manager.get_all_output_styles()
    plugin_manager.get_all_mode_prompts()
"""

from helm.plugins.base import HelmPlugin
from helm.plugins.manager import PluginManager

plugin_manager = PluginManager()

__all__ = ["HelmPlugin", "PluginManager", "plugin_manager"]
