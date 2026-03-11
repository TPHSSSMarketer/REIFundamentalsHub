"""AI Self-Learning Service — Platform intelligence that improves over time.

Three learning engines that run automatically after conversations:

1. CONVERSATION LESSONS — Extracts reusable lessons from successful
   interactions (good tool sequences, user corrections, complex resolutions).
   Injected into future system prompts when similar questions arise.

2. USAGE PATTERNS — Tracks which tools, topics, and workflows are popular.
   Helps the assistant pre-load relevant tools, suggest common next steps,
   and adapt to how users actually work.

3. AUTO-ENRICHMENT — Caches key findings from tool results (property data,
   market stats, zip resolutions) so the same research doesn't repeat.
   The assistant checks this cache before making expensive API calls.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import and_, desc, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.admin_assistant import (
    AdminActionLog,
    AdminMessage,
    AutoEnrichedKnowledge,
    ConversationLesson,
    UsagePattern,
)
from rei.models.user import User

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# 1. CONVERSATION LESSON EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════


async def extract_lessons_from_session(
    session_id: str,
    user: User,
    db: AsyncSession,
    settings: Any,
) -> list[dict]:
    """Analyze a completed conversation and extract reusable lessons.

    Called after every conversation (async, non-blocking). Looks for:
    - Successful multi-step tool sequences (the assistant figured out a workflow)
    - User corrections (the assistant learned something new)
    - Complex question resolutions (the assistant handled an edge case)

    Returns list of lessons created.
    """
    # Load the conversation
    result = await db.execute(
        select(AdminMessage)
        .where(AdminMessage.session_id == session_id)
        .order_by(AdminMessage.created_at.asc())
    )
    messages = result.scalars().all()

    if len(messages) < 4:  # Need at least 2 exchanges to learn from
        return []

    # Load tool actions for this session
    action_result = await db.execute(
        select(AdminActionLog)
        .where(
            and_(
                AdminActionLog.session_id == session_id,
                AdminActionLog.execution_status.in_(["success", "executing"]),
            )
        )
        .order_by(AdminActionLog.created_at.asc())
    )
    actions = action_result.scalars().all()

    lessons_created = []

    # ── Pattern 1: Successful multi-tool workflows ──
    if len(actions) >= 2:
        tool_sequence = [a.action_type for a in actions]
        sequence_key = " → ".join(tool_sequence)

        # Check if we already have a lesson for this sequence
        existing = await db.execute(
            select(ConversationLesson).where(
                and_(
                    ConversationLesson.topic == "workflow",
                    ConversationLesson.question_pattern == sequence_key,
                    ConversationLesson.is_active == True,
                )
            )
        )
        if not existing.scalar_one_or_none():
            # Extract the user's original question
            user_msgs = [m for m in messages if m.role == "user"]
            original_question = user_msgs[0].content if user_msgs else ""

            lesson = ConversationLesson(
                user_id=None,  # Platform-wide
                topic="workflow",
                question_pattern=sequence_key,
                lesson_text=(
                    f"When a user asks something like '{original_question[:100]}', "
                    f"this tool sequence worked well: {sequence_key}. "
                    f"Consider using this same approach for similar requests."
                ),
                example_exchange=json.dumps({
                    "user": original_question[:200],
                    "tools_used": tool_sequence,
                }),
                source_type="auto",
                confidence=0.6,  # Starts moderate, increases with reuse
                source_session_id=session_id,
            )
            db.add(lesson)
            lessons_created.append({"type": "workflow", "sequence": sequence_key})

    # ── Pattern 2: User corrections (user says "no", "wrong", "actually") ──
    correction_indicators = [
        "no,", "no ", "wrong", "actually", "that's not", "thats not",
        "i meant", "not what i", "incorrect", "i said", "should be",
    ]

    for i, msg in enumerate(messages):
        if msg.role != "user" or i < 2:
            continue

        msg_lower = msg.content.lower().strip()
        is_correction = any(msg_lower.startswith(ind) or f" {ind}" in msg_lower
                          for ind in correction_indicators)

        if is_correction:
            # Get the assistant message that was corrected
            prev_assistant = None
            for j in range(i - 1, -1, -1):
                if messages[j].role == "assistant":
                    prev_assistant = messages[j]
                    break

            if prev_assistant:
                # Build a lesson from the correction
                topic = _classify_topic(msg.content)
                lesson = ConversationLesson(
                    user_id=None,  # Platform-wide
                    topic=topic,
                    question_pattern=f"correction:{topic}",
                    lesson_text=(
                        f"User correction: When the assistant said "
                        f"'{prev_assistant.content[:100]}...', the user corrected: "
                        f"'{msg.content[:150]}'. "
                        f"Remember this for future similar interactions."
                    ),
                    example_exchange=json.dumps({
                        "wrong_response": prev_assistant.content[:200],
                        "user_correction": msg.content[:200],
                    }),
                    source_type="correction",
                    confidence=0.8,  # Corrections are high-confidence
                    source_session_id=session_id,
                )
                db.add(lesson)
                lessons_created.append({"type": "correction", "topic": topic})

    if lessons_created:
        await db.commit()
        logger.info(
            "Extracted %d lessons from session %s",
            len(lessons_created), session_id,
        )

    return lessons_created


def _classify_topic(text: str) -> str:
    """Simple keyword-based topic classifier for lessons."""
    text_lower = text.lower()
    if any(w in text_lower for w in ["deal", "pipeline", "stage", "offer"]):
        return "deals"
    if any(w in text_lower for w in ["property", "address", "house", "home", "lookup"]):
        return "property"
    if any(w in text_lower for w in ["contact", "seller", "buyer", "lead"]):
        return "crm"
    if any(w in text_lower for w in ["sms", "text", "message", "call", "phone"]):
        return "communication"
    if any(w in text_lower for w in ["market", "comp", "arv", "price"]):
        return "market_analysis"
    if any(w in text_lower for w in ["task", "follow", "remind", "schedule"]):
        return "tasks"
    return "general"


async def get_relevant_lessons(
    user_message: str,
    user_id: int,
    db: AsyncSession,
    limit: int = 5,
) -> list[dict]:
    """Retrieve lessons relevant to the current user message.

    Checks both platform-wide lessons (user_id=NULL) and user-specific ones.
    Returns lessons sorted by confidence, most relevant first.
    """
    topic = _classify_topic(user_message)
    msg_lower = user_message.lower()

    # Fetch lessons matching the topic or general lessons with high confidence
    result = await db.execute(
        select(ConversationLesson)
        .where(
            and_(
                ConversationLesson.is_active == True,
                ConversationLesson.confidence >= 0.5,
                # Platform-wide OR this user's lessons
                (ConversationLesson.user_id == None) | (ConversationLesson.user_id == user_id),
            )
        )
        .order_by(desc(ConversationLesson.confidence))
        .limit(50)  # Get a pool to filter from
    )
    all_lessons = result.scalars().all()

    # Score each lesson by relevance to current message
    scored = []
    for lesson in all_lessons:
        score = lesson.confidence

        # Topic match bonus
        if lesson.topic == topic:
            score += 0.3
        elif lesson.topic == "general":
            score += 0.05

        # Keyword overlap bonus
        lesson_words = set(lesson.lesson_text.lower().split())
        msg_words = set(msg_lower.split())
        overlap = len(lesson_words & msg_words)
        if overlap > 2:
            score += min(overlap * 0.05, 0.2)

        # Correction lessons get a boost (high-value learning)
        if lesson.source_type == "correction":
            score += 0.15

        # Frequently-used lessons are more reliable
        if lesson.times_used > 5:
            score += 0.1

        scored.append((score, lesson))

    # Sort by score, return top N
    scored.sort(key=lambda x: x[0], reverse=True)
    top_lessons = scored[:limit]

    # Increment times_used for returned lessons
    for _, lesson in top_lessons:
        lesson.times_used += 1

    if top_lessons:
        await db.commit()

    return [
        {
            "id": lesson.id,
            "topic": lesson.topic,
            "lesson": lesson.lesson_text,
            "source": lesson.source_type,
            "confidence": round(score, 2),
        }
        for score, lesson in top_lessons
    ]


# ═══════════════════════════════════════════════════════════════════════════
# 2. USAGE PATTERN TRACKING
# ═══════════════════════════════════════════════════════════════════════════


async def record_tool_usage(
    tool_name: str,
    success: bool,
    user_id: int,
    db: AsyncSession,
    extra_metadata: Optional[dict] = None,
) -> None:
    """Record that a tool was used. Updates both platform-wide and per-user patterns.

    Called after every tool execution in the orchestrator.
    """
    now = datetime.utcnow()

    for uid in [None, user_id]:  # Platform-wide + per-user
        result = await db.execute(
            select(UsagePattern).where(
                and_(
                    UsagePattern.pattern_type == "tool_usage",
                    UsagePattern.pattern_key == tool_name,
                    UsagePattern.user_id == uid if uid else UsagePattern.user_id == None,
                )
            )
        )
        pattern = result.scalar_one_or_none()

        if pattern:
            pattern.occurrence_count += 1
            if success:
                pattern.success_count += 1
            else:
                pattern.failure_count += 1
            pattern.last_seen = now
        else:
            pattern = UsagePattern(
                user_id=uid,
                pattern_type="tool_usage",
                pattern_key=tool_name,
                occurrence_count=1,
                success_count=1 if success else 0,
                failure_count=0 if success else 1,
                first_seen=now,
                last_seen=now,
            )
            db.add(pattern)

    await db.commit()


async def record_topic_usage(
    user_message: str,
    user_id: int,
    db: AsyncSession,
) -> None:
    """Record topic frequency from user messages.

    Called at the start of every conversation turn.
    """
    topic = _classify_topic(user_message)
    now = datetime.utcnow()

    for uid in [None, user_id]:
        result = await db.execute(
            select(UsagePattern).where(
                and_(
                    UsagePattern.pattern_type == "topic_frequency",
                    UsagePattern.pattern_key == topic,
                    UsagePattern.user_id == uid if uid else UsagePattern.user_id == None,
                )
            )
        )
        pattern = result.scalar_one_or_none()

        if pattern:
            pattern.occurrence_count += 1
            pattern.last_seen = now
        else:
            pattern = UsagePattern(
                user_id=uid,
                pattern_type="topic_frequency",
                pattern_key=topic,
                occurrence_count=1,
                success_count=0,
                failure_count=0,
                first_seen=now,
                last_seen=now,
            )
            db.add(pattern)

    await db.commit()


async def get_user_top_patterns(
    user_id: int,
    db: AsyncSession,
    pattern_type: str = "tool_usage",
    limit: int = 10,
) -> list[dict]:
    """Get the most-used patterns for a user (or platform-wide if no user patterns).

    Used to pre-load likely tools and suggest next steps.
    """
    # Try user-specific first
    result = await db.execute(
        select(UsagePattern)
        .where(
            and_(
                UsagePattern.user_id == user_id,
                UsagePattern.pattern_type == pattern_type,
            )
        )
        .order_by(desc(UsagePattern.occurrence_count))
        .limit(limit)
    )
    patterns = result.scalars().all()

    # Fall back to platform-wide if user has few patterns
    if len(patterns) < 3:
        platform_result = await db.execute(
            select(UsagePattern)
            .where(
                and_(
                    UsagePattern.user_id == None,
                    UsagePattern.pattern_type == pattern_type,
                )
            )
            .order_by(desc(UsagePattern.occurrence_count))
            .limit(limit)
        )
        platform_patterns = platform_result.scalars().all()

        # Merge: user patterns first, then platform patterns not already covered
        seen_keys = {p.pattern_key for p in patterns}
        for pp in platform_patterns:
            if pp.pattern_key not in seen_keys:
                patterns.append(pp)
                seen_keys.add(pp.pattern_key)

    return [
        {
            "key": p.pattern_key,
            "count": p.occurrence_count,
            "success_rate": (
                round(p.success_count / max(p.occurrence_count, 1), 2)
                if p.success_count else 0
            ),
            "last_used": p.last_seen.isoformat() if p.last_seen else None,
            "scope": "user" if p.user_id else "platform",
        }
        for p in patterns[:limit]
    ]


# ═══════════════════════════════════════════════════════════════════════════
# 3. AUTO-ENRICHMENT — Cache findings from tool results
# ═══════════════════════════════════════════════════════════════════════════

# How long different data types stay fresh (days)
ENRICHMENT_EXPIRY = {
    "property": 30,       # Property data can change (sales, assessments)
    "market": 7,          # Market data changes frequently
    "zip_resolution": 365, # Zip→City rarely changes
    "contact": 14,        # Contact info can change
    "deal_outcome": 90,   # Deal outcomes are semi-permanent
}


async def enrich_from_tool_result(
    tool_name: str,
    params: dict,
    result: dict,
    user_id: int,
    session_id: Optional[str],
    db: AsyncSession,
) -> Optional[dict]:
    """Extract and cache key findings from a tool result.

    Called after every successful tool execution. Only stores
    results that are worth caching (property data, market stats, etc.).
    """
    if not result or result.get("error"):
        return None

    data = result.get("data") or result
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except (json.JSONDecodeError, TypeError):
            return None

    enrichment = None

    # ── Property Lookups ──
    if tool_name == "lookup_property" and isinstance(data, dict):
        address = params.get("address", "")
        zip_code = params.get("zip_code", "") or params.get("zip", "")
        if address:
            entity_key = _make_entity_key("prop", address, zip_code)
            summary = _summarize_property(data, address)
            if summary:
                enrichment = {
                    "category": "property",
                    "entity_key": entity_key,
                    "summary": summary,
                    "raw_data": json.dumps(data, default=str)[:5000],
                    "source_tool": tool_name,
                }

    # ── Market Data ──
    elif tool_name == "get_market_data" and isinstance(data, dict):
        city = params.get("city", "")
        state = params.get("state", "")
        if city and state:
            entity_key = _make_entity_key("market", city, state)
            summary = _summarize_market(data, city, state)
            if summary:
                enrichment = {
                    "category": "market",
                    "entity_key": entity_key,
                    "summary": summary,
                    "raw_data": json.dumps(data, default=str)[:5000],
                    "source_tool": tool_name,
                }

    # ── Deal Creation / Updates ──
    elif tool_name in ("create_deal", "update_deal_stage") and isinstance(data, dict):
        address = data.get("address", "") or params.get("address", "")
        if address:
            entity_key = _make_entity_key("deal", address, data.get("zip", ""))
            stage = data.get("stage", "unknown")
            title = data.get("title", address)
            enrichment = {
                "category": "deal_outcome",
                "entity_key": entity_key,
                "summary": f"Deal '{title}' is at stage '{stage}'.",
                "raw_data": json.dumps(data, default=str)[:3000],
                "source_tool": tool_name,
            }

    if not enrichment:
        return None

    # Upsert: update if entity_key already exists, otherwise create
    existing = await db.execute(
        select(AutoEnrichedKnowledge).where(
            AutoEnrichedKnowledge.entity_key == enrichment["entity_key"]
        )
    )
    record = existing.scalar_one_or_none()

    if record:
        record.summary = enrichment["summary"]
        record.raw_data = enrichment["raw_data"]
        record.source_tool = enrichment["source_tool"]
        record.is_stale = False
        record.updated_at = datetime.utcnow()
    else:
        record = AutoEnrichedKnowledge(
            user_id=None,  # Platform-wide cache
            category=enrichment["category"],
            entity_key=enrichment["entity_key"],
            summary=enrichment["summary"],
            raw_data=enrichment["raw_data"],
            source_tool=enrichment["source_tool"],
            source_session_id=session_id,
        )
        db.add(record)

    await db.commit()
    logger.info("Auto-enriched: %s → %s", enrichment["entity_key"], enrichment["summary"][:60])
    return enrichment


async def lookup_enriched_knowledge(
    user_message: str,
    db: AsyncSession,
    limit: int = 3,
) -> list[dict]:
    """Search the auto-enriched knowledge cache for relevant info.

    Called before the AI generates a response. If we already know
    something about what the user is asking, we inject it into context
    so the AI doesn't have to make another API call.
    """
    # Extract potential addresses, zip codes, city names from user message
    keywords = _extract_search_terms(user_message)

    if not keywords:
        return []

    # Search by entity_key matching
    results = []
    for keyword in keywords[:5]:  # Cap at 5 search terms
        query = select(AutoEnrichedKnowledge).where(
            and_(
                AutoEnrichedKnowledge.is_stale == False,
                AutoEnrichedKnowledge.entity_key.contains(keyword.lower()),
            )
        ).limit(3)

        result = await db.execute(query)
        for record in result.scalars().all():
            # Check freshness
            expiry_days = ENRICHMENT_EXPIRY.get(record.category, 30)
            if record.updated_at and (
                datetime.utcnow() - record.updated_at
            ) > timedelta(days=expiry_days):
                record.is_stale = True
                continue

            record.times_referenced += 1
            results.append({
                "category": record.category,
                "key": record.entity_key,
                "summary": record.summary,
                "source": record.source_tool,
                "age_days": (datetime.utcnow() - record.updated_at).days if record.updated_at else 0,
            })

    if results:
        await db.commit()

    # Deduplicate by entity_key
    seen = set()
    unique = []
    for r in results:
        if r["key"] not in seen:
            seen.add(r["key"])
            unique.append(r)

    return unique[:limit]


# ═══════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════


def _make_entity_key(prefix: str, *parts: str) -> str:
    """Create a normalized entity key for deduplication."""
    cleaned = []
    for p in parts:
        if p:
            # Normalize: lowercase, strip, replace spaces with underscores
            cleaned.append(
                re.sub(r"[^a-z0-9]+", "_", p.lower().strip()).strip("_")
            )
    return f"{prefix}:{'_'.join(cleaned)}" if cleaned else f"{prefix}:unknown"


def _summarize_property(data: dict, address: str) -> str:
    """Build a human-readable summary from property lookup data."""
    parts = [f"Property at {address}:"]

    if data.get("bedrooms") or data.get("bathrooms"):
        beds = data.get("bedrooms", "?")
        baths = data.get("bathrooms", "?")
        parts.append(f"{beds}bd/{baths}ba")

    if data.get("square_footage") or data.get("living_size"):
        sqft = data.get("square_footage") or data.get("living_size")
        parts.append(f"{sqft:,} sqft" if isinstance(sqft, (int, float)) else f"{sqft} sqft")

    if data.get("year_built"):
        parts.append(f"built {data['year_built']}")

    if data.get("assessed_value") or data.get("market_value"):
        val = data.get("assessed_value") or data.get("market_value")
        if isinstance(val, (int, float)):
            parts.append(f"assessed ${val:,.0f}")

    if data.get("owner_name"):
        parts.append(f"owner: {data['owner_name']}")

    if data.get("last_sale_price"):
        price = data["last_sale_price"]
        if isinstance(price, (int, float)):
            parts.append(f"last sold ${price:,.0f}")

    return " | ".join(parts) if len(parts) > 1 else ""


def _summarize_market(data: dict, city: str, state: str) -> str:
    """Build a human-readable summary from market data."""
    parts = [f"Market data for {city}, {state}:"]

    if data.get("median_home_value"):
        val = data["median_home_value"]
        parts.append(f"median ${val:,.0f}" if isinstance(val, (int, float)) else f"median {val}")

    if data.get("median_rent"):
        rent = data["median_rent"]
        parts.append(f"median rent ${rent:,.0f}" if isinstance(rent, (int, float)) else f"rent {rent}")

    if data.get("appreciation_rate"):
        parts.append(f"appreciation {data['appreciation_rate']}%")

    if data.get("population"):
        pop = data["population"]
        parts.append(f"pop {pop:,}" if isinstance(pop, (int, float)) else f"pop {pop}")

    return " | ".join(parts) if len(parts) > 1 else ""


def _extract_search_terms(text: str) -> list[str]:
    """Extract searchable terms from user text (addresses, zips, city names)."""
    terms = []

    # Extract zip codes (5-digit patterns)
    zips = re.findall(r"\b\d{5}\b", text)
    terms.extend(zips)

    # Extract potential address fragments (number + street name)
    addresses = re.findall(r"\b\d+\s+[\w\s]+(?:road|rd|street|st|avenue|ave|lane|ln|drive|dr|court|ct|way|place|pl)\b", text, re.IGNORECASE)
    for addr in addresses:
        terms.append(re.sub(r"[^a-z0-9]+", "_", addr.lower().strip()).strip("_"))

    # Extract capitalized city-like words (2+ words starting with capitals)
    cities = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", text)
    for city in cities:
        if len(city) > 3 and city.lower() not in {"the", "this", "that", "what", "when", "where"}:
            terms.append(city.lower().replace(" ", "_"))

    return terms


# ═══════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT — Called by orchestrator after each conversation
# ═══════════════════════════════════════════════════════════════════════════


async def run_post_conversation_learning(
    session_id: str,
    user: User,
    db: AsyncSession,
    settings: Any,
) -> dict:
    """Run all learning engines after a conversation completes.

    This is called asynchronously after the orchestrator returns a response.
    It doesn't block the user — learning happens in the background.
    """
    results = {
        "lessons_extracted": 0,
        "patterns_updated": True,
        "enrichments_added": 0,
    }

    try:
        # 1. Extract conversation lessons
        lessons = await extract_lessons_from_session(session_id, user, db, settings)
        results["lessons_extracted"] = len(lessons)
    except Exception as e:
        logger.error("Lesson extraction failed for session %s: %s", session_id, e)

    try:
        # 2. Usage patterns are recorded inline (in orchestrator), not here
        # This is a placeholder for any batch pattern analysis
        pass
    except Exception as e:
        logger.error("Pattern analysis failed for session %s: %s", session_id, e)

    logger.info(
        "Post-conversation learning complete for session %s: %s",
        session_id, results,
    )
    return results


async def build_learning_context(
    user_message: str,
    user_id: int,
    db: AsyncSession,
) -> str:
    """Build a learning context block to inject into the system prompt.

    Combines relevant lessons and cached knowledge into a compact text
    block that helps the AI answer better.
    """
    parts = []

    # Get relevant lessons
    lessons = await get_relevant_lessons(user_message, user_id, db, limit=3)
    if lessons:
        parts.append("LEARNED LESSONS (from previous conversations):")
        for lesson in lessons:
            source_tag = "★" if lesson["source"] == "correction" else "•"
            parts.append(f"  {source_tag} {lesson['lesson']}")
        parts.append("")

    # Check auto-enriched knowledge cache
    cached = await lookup_enriched_knowledge(user_message, db, limit=3)
    if cached:
        parts.append("CACHED KNOWLEDGE (from previous research):")
        for item in cached:
            age = f" ({item['age_days']}d ago)" if item["age_days"] > 0 else " (today)"
            parts.append(f"  • {item['summary']}{age}")
        parts.append("")

    # Get user's top tools for smart suggestions
    top_tools = await get_user_top_patterns(user_id, db, "tool_usage", limit=5)
    if top_tools:
        tool_names = [t["key"] for t in top_tools[:5]]
        parts.append(f"USER'S FREQUENT TOOLS: {', '.join(tool_names)}")
        parts.append("")

    if not parts:
        return ""

    return (
        "\n" + "═" * 77 + "\n"
        + "PLATFORM INTELLIGENCE (auto-learned from previous interactions):\n"
        + "═" * 77 + "\n\n"
        + "\n".join(parts)
    )
