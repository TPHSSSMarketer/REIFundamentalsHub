"""Multi-model AI router — sends tasks to the right model for cost and quality.

Not every task needs Opus.  The router classifies incoming requests and
picks the best model:

  - **Opus** — Deal evaluation, negotiation strategy, creative financing,
    portfolio-level analysis, complex reasoning.
  - **Sonnet** — Daily check-ins, email summaries, file updates, routine tasks,
    template generation, simple Q&A.
  - **Perplexity Sonar Pro** — Web research, comp lookups, market data, news.
  - **Perplexity Deep Research** — Weekly market reports, neighborhood deep dives.

The router respects explicit overrides (user says "/opus" or "/research")
and falls back to intelligent auto-routing based on task keywords and context.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)


class ModelTier:
    """Available model tiers and their identifiers."""

    OPUS = "opus"
    SONNET = "sonnet"
    PERPLEXITY_SEARCH = "perplexity_search"
    PERPLEXITY_DEEP = "perplexity_deep"


# ── Keywords that signal which model tier to use ─────────────────────────────

OPUS_SIGNALS = [
    "analyze this deal", "evaluate this property", "deal analysis",
    "negotiation strategy", "creative financing", "seller financing",
    "portfolio analysis", "portfolio health", "brrrr", "cash-on-cash",
    "should i buy", "should i sell", "refinance strategy",
    "partnership structure", "exit strategy", "complex",
    "compare these", "which deal is better", "risk assessment",
    "monthly review", "quarterly review", "self-improvement",
]

RESEARCH_SIGNALS = [
    "research", "look up", "search for", "find comps", "comparable sales",
    "market data", "what's happening in", "neighborhood", "crime stats",
    "school ratings", "flood zone", "zoning", "permits", "listings",
    "rent estimate", "property tax", "insurance cost", "news about",
    "interest rate", "market trend", "population growth",
]

DEEP_RESEARCH_SIGNALS = [
    "deep dive", "deep research", "comprehensive analysis",
    "weekly report", "market report", "trend analysis",
    "full neighborhood analysis", "macro trends",
]


# ── Explicit command overrides ───────────────────────────────────────────────

COMMAND_MAP = {
    "/opus": ModelTier.OPUS,
    "/sonnet": ModelTier.SONNET,
    "/research": ModelTier.PERPLEXITY_SEARCH,
    "/deepresearch": ModelTier.PERPLEXITY_DEEP,
}


def classify_task(message: str, mode: str = "business") -> str:
    """Determine which model tier should handle this message.

    Priority:
      1. Explicit command prefix (/opus, /sonnet, /research, /deepresearch)
      2. Keyword matching against signal lists
      3. Mode-based default (real_estate defaults higher than personal)

    Returns one of the ModelTier values.
    """
    msg_lower = message.lower().strip()

    # 1. Explicit command override
    for cmd, tier in COMMAND_MAP.items():
        if msg_lower.startswith(cmd):
            return tier

    # 2. Deep research signals (check before regular research)
    for signal in DEEP_RESEARCH_SIGNALS:
        if signal in msg_lower:
            return ModelTier.PERPLEXITY_DEEP

    # 3. Web research signals
    for signal in RESEARCH_SIGNALS:
        if signal in msg_lower:
            return ModelTier.PERPLEXITY_SEARCH

    # 4. Opus signals (complex analysis)
    for signal in OPUS_SIGNALS:
        if signal in msg_lower:
            return ModelTier.OPUS

    # 5. Mode-based defaults
    if mode == "real_estate":
        # RE mode defaults to Sonnet — most RE tasks are routine
        # Only bumps to Opus via keywords above
        return ModelTier.SONNET

    # 6. Default: Sonnet for everything else
    return ModelTier.SONNET


def strip_command(message: str) -> str:
    """Remove the /command prefix from a message if present."""
    for cmd in COMMAND_MAP:
        if message.lower().strip().startswith(cmd):
            return message[len(cmd):].strip()
    return message


def get_model_info(tier: str) -> dict:
    """Return display info about a model tier."""
    info = {
        ModelTier.OPUS: {
            "tier": "opus",
            "name": "Claude Opus",
            "use_case": "Complex analysis, strategy, deal evaluation",
            "cost": "high",
        },
        ModelTier.SONNET: {
            "tier": "sonnet",
            "name": "Claude Sonnet",
            "use_case": "Daily tasks, summaries, routine operations",
            "cost": "low",
        },
        ModelTier.PERPLEXITY_SEARCH: {
            "tier": "perplexity_search",
            "name": "Perplexity Sonar Pro",
            "use_case": "Web research, comps, market data, news",
            "cost": "low",
        },
        ModelTier.PERPLEXITY_DEEP: {
            "tier": "perplexity_deep",
            "name": "Perplexity Deep Research",
            "use_case": "Market reports, neighborhood analysis, trend research",
            "cost": "medium",
        },
    }
    return info.get(tier, info[ModelTier.SONNET])
