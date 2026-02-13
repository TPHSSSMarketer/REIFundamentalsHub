"""Multi-model AI router — sends tasks to the right model for cost and quality.

Two-layer classification:

  **Layer 1 (instant, free):** Keyword matching + explicit commands.
  Catches obvious cases like "/opus" or "analyze this deal".

  **Layer 2 (smart, ~0.1¢ per call):** AI-based intent classification.
  When keywords don't match, a fast Sonnet call classifies the user's
  *intent* from natural conversational language.  This handles:
    - "hey can you take a look at this property I found"  → Opus
    - "what's the market like over in Decatur"            → Perplexity
    - "remind me to call the inspector tomorrow"          → Sonnet

Model tiers:
  - **Opus** — Deal evaluation, negotiation strategy, creative financing,
    portfolio-level analysis, complex reasoning.
  - **Sonnet** — Daily check-ins, email summaries, file updates, routine tasks,
    template generation, simple Q&A.
  - **Perplexity Sonar Pro** — Web research, comp lookups, market data, news.
  - **Perplexity Deep Research** — Weekly market reports, neighborhood deep dives.
"""

from __future__ import annotations

import logging

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
    "portfolio analysis", "portfolio health", "portfolio review",
    "portfolio performance", "review my portfolio",
    "brrrr", "cash-on-cash",
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
    "cap rate in", "what are rents", "average rent", "median price",
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
    "/deep": ModelTier.PERPLEXITY_DEEP,
    "/deepresearch": ModelTier.PERPLEXITY_DEEP,
}


# ── AI Intent Classification Prompt ──────────────────────────────────────────

CLASSIFIER_PROMPT = """\
You are a message classifier for a real estate AI assistant. Classify the \
user's message into exactly ONE category. Respond with ONLY the category \
name, nothing else.

Categories:
- OPUS: Complex analysis, deal evaluation, financial modeling, negotiation \
strategy, portfolio decisions, comparing deals, creative financing, risk \
assessment. The user is asking you to THINK DEEPLY about something.
- RESEARCH: The user wants current real-time information from the web — \
property data, comps, market conditions, listings, neighborhood info, \
rent estimates, news, interest rates, trends.
- DEEP_RESEARCH: The user wants a comprehensive, multi-source research \
report — weekly market analysis, full neighborhood deep dive, macro \
trend report.
- SONNET: Everything else — casual conversation, simple questions, \
reminders, summaries, drafting messages, updating files, scheduling, \
greetings, task management.

Examples:
"hey check out this property at 123 Oak, what do you think?" → OPUS
"is this a good deal for BRRRR?" → OPUS
"take a look at the numbers on this one" → OPUS
"what should I offer on this house" → OPUS
"can you pull some comps near there" → RESEARCH
"what's the market like in East Atlanta" → RESEARCH
"what are rents going for in 30316" → RESEARCH
"give me a full breakdown of the Decatur submarket" → DEEP_RESEARCH
"what's on my calendar today" → SONNET
"remind me to call Jim" → SONNET
"draft a text to the seller" → SONNET
"good morning" → SONNET
"update the pipeline" → SONNET
"what was that property address again" → SONNET
"""


def classify_task(message: str, mode: str = "business") -> str:
    """Determine which model tier should handle this message (sync, keyword-only).

    This is the fast path — no API calls. Use ``classify_task_smart`` for
    AI-powered classification when keywords don't match.

    Priority:
      1. Explicit command prefix (/opus, /sonnet, /research, /deepresearch)
      2. Keyword matching against signal lists
      3. Mode-based default

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

    # 5. Default: Sonnet
    return ModelTier.SONNET


async def classify_task_smart(message: str, mode: str = "business") -> str:
    """AI-powered intent classification for natural conversational input.

    First tries fast keyword matching. If no confident keyword match is found,
    falls back to a cheap Sonnet API call that understands natural language,
    slang, voice transcriptions, and conversational phrasing.

    This is the function the chat engine should call for user-facing messages.
    """
    msg_lower = message.lower().strip()

    # 1. Explicit commands — always respect these
    for cmd, tier in COMMAND_MAP.items():
        if msg_lower.startswith(cmd):
            return tier

    # 2. Try keyword match first (free, instant)
    keyword_result = _keyword_classify(msg_lower)
    if keyword_result is not None:
        return keyword_result

    # 3. AI classification (costs ~0.1¢, takes ~0.5s)
    try:
        import anthropic
        from helm.config import get_settings

        settings = get_settings()
        if not settings.anthropic_api_key:
            return ModelTier.SONNET

        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model=settings.anthropic_model,  # Sonnet — fast and cheap
            max_tokens=20,
            system=CLASSIFIER_PROMPT,
            messages=[{"role": "user", "content": message}],
        )

        label = response.content[0].text.strip().upper()

        tier_map = {
            "OPUS": ModelTier.OPUS,
            "RESEARCH": ModelTier.PERPLEXITY_SEARCH,
            "DEEP_RESEARCH": ModelTier.PERPLEXITY_DEEP,
            "SONNET": ModelTier.SONNET,
        }

        result = tier_map.get(label, ModelTier.SONNET)
        logger.info("Smart classifier: '%s' → %s (AI said: %s)", message[:60], result, label)
        return result

    except Exception as exc:
        logger.warning("Smart classification failed, defaulting to Sonnet: %s", exc)
        return ModelTier.SONNET


def _keyword_classify(msg_lower: str) -> str | None:
    """Try keyword matching. Returns tier if confident, None if unsure."""
    # Deep research (check first — more specific)
    for signal in DEEP_RESEARCH_SIGNALS:
        if signal in msg_lower:
            return ModelTier.PERPLEXITY_DEEP

    # Web research
    for signal in RESEARCH_SIGNALS:
        if signal in msg_lower:
            return ModelTier.PERPLEXITY_SEARCH

    # Opus (complex analysis)
    for signal in OPUS_SIGNALS:
        if signal in msg_lower:
            return ModelTier.OPUS

    # No confident match — return None to trigger AI classification
    return None


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
