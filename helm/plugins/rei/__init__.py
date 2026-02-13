"""REIFundamentals Hub Plugin — real estate investing capabilities for Helm.

This plugin adds:
- Real estate deal analysis, portfolio, and pipeline routes
- RE-specific agents (deal-analyzer, market-researcher, contract-reviewer)
- REIFundamentals Hub + GoHighLevel CRM integrations
- RE-specific output styles and assistant mode
- RE context templates (investor profile, rules, pipeline, etc.)
- RE keyword signals for the smart router
"""

from helm.plugins.rei.plugin import REIPlugin


def get_plugin() -> REIPlugin:
    """Factory function called by the plugin manager during discovery."""
    return REIPlugin()
