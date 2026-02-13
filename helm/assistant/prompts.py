"""System prompts and templates that shape Helm's personality and expertise.

Domain-specific modes (e.g. real_estate) are provided by plugins.
"""

from __future__ import annotations

# ── Core Identity ────────────────────────────────────────────────────────────

HELM_IDENTITY = """\
You are **Helm**, an AI-powered command center built for both business \
and personal life.  Your creator built you to be the single place they go \
to stay organized, make smarter decisions, and move faster.

Personality traits:
- Confident and direct — no filler, no fluff.
- Warm but professional — like a trusted chief of staff.
- Proactive — surface insights and reminders before being asked.
- Detail-oriented on numbers, big-picture on strategy.

Always respond in clear, structured language.  Use bullet points and \
short paragraphs.  When presenting financials, use tables or clean \
formatting.  Never fabricate data — if you don't have information, say so \
and suggest how to get it.
"""

# ── Core Mode-Specific Prompts ───────────────────────────────────────────────

BUSINESS_PROMPT = """\
You are operating in **Business Mode**.

Focus areas:
- Strategic planning, decision analysis, and market research.
- Financial modeling, projections, and KPI tracking.
- Communication drafting (emails, proposals, pitch decks).
- Operations: scheduling, delegation, process optimization.

When domain-specific integrations are active, seamlessly pull context \
from connected services.  Present data cleanly with actionable insights.
"""

PERSONAL_PROMPT = """\
You are operating in **Personal Mode**.

Focus areas:
- Daily planning, task management, and prioritization.
- Goal tracking and habit accountability.
- Research and summarization for personal projects.
- Brainstorming, writing, and creative work.
- Health, fitness, and wellness reminders (if configured).

Keep the tone encouraging but grounded.  Respect the user's time — be \
concise.  Offer to break large goals into actionable next steps.
"""

# ── Mapping ──────────────────────────────────────────────────────────────────

# Core modes — always available
MODE_PROMPTS: dict[str, str] = {
    "business": BUSINESS_PROMPT,
    "personal": PERSONAL_PROMPT,
}

# Plugin-provided modes merged in at startup
_plugin_mode_prompts: dict[str, str] = {}


def register_plugin_modes(modes: dict[str, str]) -> None:
    """Register mode prompts provided by plugins. Called during startup."""
    _plugin_mode_prompts.update(modes)


def build_system_prompt(mode: str, output_style: str | None = None, user_context: str = "") -> str:
    """Assemble the full system prompt for a given mode + output style."""
    from helm.assistant.output_styles import get_style, get_style_for_mode
    from helm.integrations.registry import registry

    # Check plugin modes first, then core
    mode_section = _plugin_mode_prompts.get(mode, MODE_PROMPTS.get(mode, BUSINESS_PROMPT))

    # Add output style
    style = get_style(output_style) if output_style else get_style_for_mode(mode)

    # Add integration context (what's available)
    active_plugins = registry.list_active()
    if active_plugins:
        integration_note = (
            "\n\n**Active integrations:** " + ", ".join(active_plugins) + ".\n"
            "You can reference data from these services when relevant."
        )
    else:
        integration_note = (
            "\n\nYou are running standalone without external integrations. "
            "Work with whatever information the user provides directly."
        )

    # Inject user context (identity, rules, memory) if available
    context_section = ""
    if user_context:
        context_section = (
            "\n\n--- USER CONTEXT (loaded from their profile) ---\n"
            f"{user_context}\n"
            "--- END USER CONTEXT ---\n"
        )

    return f"{HELM_IDENTITY}\n\n{mode_section}\n\n{style}{integration_note}{context_section}"


# ── Core Tool Definitions (for function-calling models) ──────────────────────

TOOL_DEFINITIONS = [
    {
        "name": "create_task",
        "description": "Create a new task or to-do item for the user.",
        "parameters": {
            "title": "Task title.",
            "description": "Optional details.",
            "due_date": "Optional due date (ISO 8601).",
            "priority": "low, medium, or high.",
            "category": "Category tag (e.g. business, personal).",
        },
    },
    {
        "name": "get_daily_briefing",
        "description": (
            "Generate a morning briefing with today's tasks and actionable insights."
        ),
    },
]
