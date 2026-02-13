"""Output styles — different personalities for different contexts.

Helm adapts its communication style based on who it's talking to and
what mode it's in.  These style instructions get appended to the system
prompt to shape tone, formatting, and focus.

Domain-specific styles (e.g. re-investor) are provided by plugins.
"""

from __future__ import annotations


# Core styles — always available
STYLES: dict[str, str] = {
    "client-facing": """\
**Output Style: Client-Facing Professional**
- Professional and warm.  Approachable but not casual.
- Avoid jargon unless the client uses it first.
- Always include clear next-step action items.
- Use the client's name when available.
- Structure responses with clear headings and bullet points.
- End with a question or call-to-action to keep the conversation moving.
""",

    "personal": """\
**Output Style: Personal Assistant**
- Casual, brief, and friendly.  Like texting a trusted friend who's also
  incredibly organized.
- Focus on what's actionable right now.
- Skip preamble — get to the point.
- Use short sentences and fragments when appropriate.
- Celebrate wins, however small.
- Be honest and direct, not sycophantic.
""",

    "briefing": """\
**Output Style: Executive Briefing**
- Structured executive summary format.
- Lead with the single most urgent item.
- Use bullet format with clear priority indicators.
- Group information: Urgent → Important → FYI.
- Include specific numbers, dates, and names.
- End with recommended actions ranked by priority.
- Keep total length under 500 words unless the user asks for detail.
""",

    "default": """\
**Output Style: Standard**
- Clear, structured, professional.
- Use bullet points and short paragraphs.
- Lead with the answer, then provide context.
- Be direct without being curt.
""",
}

# Plugin-provided styles merged in at startup
_plugin_styles: dict[str, str] = {}

# Plugin mode → style mappings
_plugin_mode_style_map: dict[str, str] = {}


def register_plugin_styles(styles: dict[str, str]) -> None:
    """Register output styles provided by plugins. Called during startup."""
    _plugin_styles.update(styles)


def register_plugin_mode_style(mode: str, style_name: str) -> None:
    """Register a mode → style mapping from a plugin."""
    _plugin_mode_style_map[mode] = style_name


def get_style(name: str) -> str:
    """Get a style instruction block by name."""
    if name in _plugin_styles:
        return _plugin_styles[name]
    return STYLES.get(name, STYLES["default"])


def get_style_for_mode(mode: str) -> str:
    """Map assistant modes to appropriate output styles."""
    mode_style_map = {
        "business": "briefing",
        "personal": "personal",
    }
    # Merge plugin mappings
    mode_style_map.update(_plugin_mode_style_map)

    style_name = mode_style_map.get(mode, "default")
    return get_style(style_name)


def list_styles() -> list[str]:
    return list(set(list(STYLES.keys()) + list(_plugin_styles.keys())))
