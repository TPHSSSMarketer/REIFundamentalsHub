"""AI Admin Assistant — Context Window Manager.

Implements sliding window + lazy summarization to keep token usage efficient.
Instead of loading full 20-message history every request, keeps the last 6
messages verbatim and summarizes older ones using a cheap model (Haiku).
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.admin_assistant import AdminMessage, AdminSession
from rei.services.ai_service import ai_complete
from rei.config import Settings

logger = logging.getLogger(__name__)

MAX_RECENT_MESSAGES = 6
SUMMARY_MAX_TOKENS = 100


async def get_session_context(
    session_id: str,
    db: AsyncSession,
    settings: Settings,
) -> tuple[list[dict], Optional[str]]:
    """Get optimized session context with smart summarization.

    For short conversations (≤6 messages), returns all messages as-is.
    For longer conversations, summarizes older messages and keeps last 6 verbatim.

    Returns:
        (messages: list of role/content dicts, summary: Optional string if summarized)
    """
    result = await db.execute(
        select(AdminMessage)
        .where(AdminMessage.session_id == session_id)
        .order_by(AdminMessage.created_at.asc())
    )
    all_messages = result.scalars().all()

    if len(all_messages) <= MAX_RECENT_MESSAGES:
        return [
            {"role": msg.role, "content": msg.content}
            for msg in all_messages
        ], None

    # Split: older messages to summarize, recent to keep
    older = all_messages[:-MAX_RECENT_MESSAGES]
    recent = all_messages[-MAX_RECENT_MESSAGES:]

    # Check if session already has a cached summary
    session = await db.get(AdminSession, session_id)
    cached_summary = session.context_summary if session else None

    # If we have a cached summary and the older messages haven't changed much,
    # reuse it (avoid re-summarizing every request)
    if cached_summary and len(older) > 0:
        summary_text = cached_summary
    else:
        summary_text = await _summarize_messages(older, settings)
        # Cache the summary on the session
        if session and summary_text:
            session.context_summary = summary_text
            await db.commit()

    # Build context
    context = []
    if summary_text:
        context.append({
            "role": "system",
            "content": f"[Earlier conversation summary: {summary_text}]",
        })

    context.extend([
        {"role": msg.role, "content": msg.content}
        for msg in recent
    ])

    return context, summary_text


async def _summarize_messages(
    messages: list[AdminMessage],
    settings: Settings,
) -> str:
    """Summarize older conversation messages using a cheap AI model.

    Uses Haiku for cost efficiency (~$0.80/1M tokens).
    """
    if not messages:
        return ""

    # Build conversation text (truncate long messages to save tokens)
    conversation = "\n".join(
        f"{msg.role.upper()}: {msg.content[:300]}"
        for msg in messages
    )

    prompt_messages = [
        {
            "role": "user",
            "content": (
                "Summarize this conversation in 2-3 sentences. "
                "Focus on key topics, decisions made, and any pending items:\n\n"
                f"{conversation}\n\nSummary:"
            ),
        }
    ]

    try:
        result = await ai_complete(
            messages=prompt_messages,
            user_id=0,  # System-level summarization
            db=None,
            settings=settings,
            task_type="admin_summarization",
            max_tokens=SUMMARY_MAX_TOKENS,
            temperature=0.2,
        )
        return result.get("content", "").strip()
    except Exception as e:
        logger.error(f"Context summarization failed: {e}")
        # Fallback: manual summary of message count
        return f"[{len(messages)} earlier messages about various topics]"


async def invalidate_summary(session_id: str, db: AsyncSession) -> None:
    """Clear cached summary when conversation context changes significantly."""
    session = await db.get(AdminSession, session_id)
    if session:
        session.context_summary = None
        await db.commit()


# ══════════════════════════════════════════════════════════════════
# NEW-SESSION BRIEFING — recent activity context for fresh chats
# ══════════════════════════════════════════════════════════════════


async def build_new_session_briefing(user_id: int, db: AsyncSession) -> str:
    """Build a short activity briefing injected into the system prompt
    when a user starts a brand-new chat session.

    Pulls recent deals, last session topics, and pending callbacks so the
    assistant is never "blank" even in a fresh conversation.
    """
    from rei.models.crm import CrmDeal
    from rei.models.user import ScheduledCallback

    parts: list[str] = []

    # ── Recent deals (last 7 days) ──
    try:
        cutoff = datetime.utcnow() - timedelta(days=7)
        deal_result = await db.execute(
            select(CrmDeal)
            .where(CrmDeal.user_id == user_id, CrmDeal.created_at >= cutoff)
            .order_by(CrmDeal.created_at.desc())
            .limit(5)
        )
        recent_deals = deal_result.scalars().all()
        if recent_deals:
            lines = []
            for d in recent_deals:
                addr = d.title or d.address or "Untitled"
                stage = d.stage or "lead"
                lines.append(f"  - {addr} (stage: {stage})")
            parts.append("Recent deals (last 7 days):\n" + "\n".join(lines))
    except Exception as e:
        logger.debug("Failed to load recent deals for briefing: %s", e)

    # ── Pending callbacks ──
    try:
        now = datetime.utcnow()
        cb_result = await db.execute(
            select(ScheduledCallback)
            .where(
                ScheduledCallback.user_id == user_id,
                ScheduledCallback.status == "scheduled",
                ScheduledCallback.scheduled_at >= now,
            )
            .order_by(ScheduledCallback.scheduled_at.asc())
            .limit(5)
        )
        callbacks = cb_result.scalars().all()
        if callbacks:
            lines = []
            for cb in callbacks:
                dt_str = cb.scheduled_at.strftime("%b %d at %I:%M %p") if cb.scheduled_at else "TBD"
                lines.append(f"  - {cb.contact_name}: {dt_str}")
            parts.append("Upcoming callbacks:\n" + "\n".join(lines))
    except Exception as e:
        logger.debug("Failed to load callbacks for briefing: %s", e)

    # ── Last session topic (so we can reference what was discussed before) ──
    try:
        prev_session = await db.execute(
            select(AdminSession)
            .where(AdminSession.user_id == user_id)
            .order_by(AdminSession.created_at.desc())
            .limit(1)
        )
        last = prev_session.scalar_one_or_none()
        if last:
            topic = last.title or "General"
            parts.append(f"Last conversation topic: {topic}")
            if last.context_summary:
                parts.append(f"Last conversation summary: {last.context_summary}")
    except Exception as e:
        logger.debug("Failed to load last session for briefing: %s", e)

    if not parts:
        return ""

    return (
        "\n\n── RECENT ACTIVITY BRIEFING ──\n"
        "The user just started a new chat. Here's what's been happening recently "
        "so you have context if they reference it:\n\n"
        + "\n\n".join(parts)
        + "\n── END BRIEFING ──"
    )
