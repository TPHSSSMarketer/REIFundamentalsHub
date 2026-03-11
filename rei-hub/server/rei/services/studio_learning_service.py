"""AI Studio Self-Learning Service — Learns from seller/buyer interactions.

Works across all conversation channels (web chat, SMS, voice calls) to make
the AI smarter at handling real estate conversations over time.

Uses its OWN dedicated tables (studio_lessons, studio_patterns,
studio_contact_memory) — completely separate from the admin assistant's
learning system, because the data, users, and purposes are different.

Four capabilities:

1. REAL-TIME DATA EXTRACTION — Parses name, phone, email, address, etc.
   from EVERY message as the conversation happens. The AI can reference
   this extracted data immediately without waiting for nodes to complete.

2. CONVERSATION INSIGHTS — After each conversation, extract patterns:
   objection handling, what approaches converted, seller motivations.

3. FLOW EFFECTIVENESS — Track node success/fail, conversion rates,
   channel performance.

4. CONTACT MEMORY — Remember contacts across sessions. If someone calls
   back next week, the AI already knows their name, property, and situation.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.conversation_flow import (
    FlowExecution,
    FlowNode,
    StudioContactMemory,
    StudioLesson,
    StudioPattern,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# 1. REAL-TIME DATA EXTRACTION — Runs on every single message
# ═══════════════════════════════════════════════════════════════════════════

# Fields we try to extract from every user message
EXTRACTION_PATTERNS = {
    "contact_name": [
        # "My name is John Smith" / "I'm Sarah" / "This is Mike"
        r"(?:my name is|i'?m|this is|i am)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
        # "It's John" / "Call me Sarah"
        r"(?:it'?s|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)",
    ],
    "contact_email": [
        r"([\w.+-]+@[\w-]+\.[\w.-]+)",
    ],
    "contact_phone": [
        # (555) 123-4567, 555-123-4567, 5551234567, +1 555 123 4567
        r"(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})",
    ],
    "property_address": [
        # "123 Main Street" / "456 Oak Ave" / "789 Elm Rd"
        r"(\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|way|place|pl|boulevard|blvd|circle|cir)\.?(?:\s*,?\s*(?:apt|unit|suite|#)\s*\w+)?)",
    ],
    "asking_price": [
        # "$200,000" / "$200K" / "200 thousand" / "two hundred thousand"
        r"\$\s*([\d,]+(?:\.\d{2})?)\s*[kK]?",
        r"([\d,]+)\s*(?:thousand|k)\b",
        r"\$\s*([\d]+)\s*[kK]",
    ],
    "zip_code": [
        r"\b(\d{5})(?:-\d{4})?\b",
    ],
    "timeline": [
        # "ASAP" / "next month" / "in 2 weeks" / "by June"
        r"\b(asap|immediately|right away|as soon as possible)\b",
        r"\b(next\s+(?:week|month|year))\b",
        r"\b(in\s+\d+\s+(?:days?|weeks?|months?))\b",
        r"\b(by\s+(?:january|february|march|april|may|june|july|august|september|october|november|december))\b",
        r"\b(within\s+\d+\s+(?:days?|weeks?|months?))\b",
    ],
}


def extract_data_from_message(message: str, existing_vars: dict) -> dict:
    """Extract structured data from a single user message.

    Returns only NEWLY found data (doesn't overwrite what we already have).
    This runs on every message in real-time, so the AI always has the
    latest info without waiting for node objectives to complete.
    """
    extracted = {}
    msg_text = message.strip()

    for field, patterns in EXTRACTION_PATTERNS.items():
        # Skip if we already have this data
        if existing_vars.get(field):
            continue

        for pattern in patterns:
            match = re.search(pattern, msg_text, re.IGNORECASE)
            if match:
                value = match.group(1).strip()

                # Validate and clean the value
                if field == "contact_email" and "@" not in value:
                    continue
                if field == "contact_phone":
                    digits = re.sub(r"[^\d]", "", value)
                    if len(digits) < 10:
                        continue
                    value = digits[-10:]  # Normalize to 10 digits
                if field == "zip_code" and len(value) != 5:
                    continue
                if field == "asking_price":
                    # Normalize: "200" with "K" context → "200000"
                    cleaned = value.replace(",", "")
                    if "k" in msg_text.lower() and len(cleaned) <= 4:
                        try:
                            value = str(int(float(cleaned) * 1000))
                        except ValueError:
                            pass
                if field == "property_address" and len(value) < 5:
                    continue
                if field == "contact_name" and len(value) < 2:
                    continue

                extracted[field] = value
                break  # Found a match for this field, move to next

    # Also check for motivation keywords (not regex, just keyword detection)
    if not existing_vars.get("motivation_hint"):
        motivation = _detect_motivation(msg_text)
        if motivation:
            extracted["motivation_hint"] = motivation

    return extracted


def _detect_motivation(text: str) -> str:
    """Detect seller motivation from message text."""
    text_lower = text.lower()
    motivations = {
        "divorce": ["divorce", "separated", "splitting up"],
        "inherited": ["inherit", "passed away", "deceased", "estate", "probate"],
        "relocation": ["relocat", "moving", "job transfer", "new city", "transferred"],
        "financial_distress": ["behind on", "foreclosure", "can't afford", "payments"],
        "downsizing": ["downsize", "too big", "empty nest", "retire"],
        "tired_landlord": ["tired of", "landlord", "tenant issues", "bad tenants"],
        "deferred_maintenance": ["needs work", "too much repair", "can't fix"],
    }
    for motivation, keywords in motivations.items():
        if any(kw in text_lower for kw in keywords):
            return motivation
    return ""


async def update_live_extraction(
    execution: FlowExecution,
    contact_message: str,
    db: AsyncSession,
) -> dict:
    """Run real-time extraction on a message and update the execution variables.

    Called BEFORE the AI generates its response, so the AI prompt always
    has the latest extracted data available.

    Returns the newly extracted fields (empty dict if nothing new found).
    """
    variables = json.loads(execution.variables or "{}")
    new_data = extract_data_from_message(contact_message, variables)

    if new_data:
        variables.update(new_data)
        execution.variables = json.dumps(variables)

        # Also update the execution's denormalized contact fields
        if new_data.get("contact_name") and not execution.contact_name:
            execution.contact_name = new_data["contact_name"]
        if new_data.get("contact_phone") and not execution.contact_phone:
            execution.contact_phone = new_data["contact_phone"]
        if new_data.get("contact_email") and not execution.contact_email:
            execution.contact_email = new_data["contact_email"]

        # Update contact memory in real-time
        try:
            await _update_contact_memory_live(execution, variables, db)
        except Exception as e:
            logger.warning("Contact memory update failed (non-fatal): %s", e)

        logger.info(
            "Real-time extraction for execution %s: found %s",
            execution.id, list(new_data.keys()),
        )

    return new_data


async def _update_contact_memory_live(
    execution: FlowExecution,
    variables: dict,
    db: AsyncSession,
) -> None:
    """Update contact memory as we learn new facts during the conversation."""
    phone = execution.contact_phone or variables.get("contact_phone")
    email = execution.contact_email or variables.get("contact_email")

    if not phone and not email:
        return  # Can't identify contact yet

    contact_key = (
        f"phone:{_normalize_phone(phone)}" if phone
        else f"email:{email.lower().strip()}"
    )

    # Look for existing memory
    result = await db.execute(
        select(StudioContactMemory).where(
            and_(
                StudioContactMemory.contact_key == contact_key,
                StudioContactMemory.user_id == execution.user_id,
            )
        )
    )
    memory = result.scalar_one_or_none()

    name = execution.contact_name or variables.get("contact_name")
    address = variables.get("property_address")

    # Build summary
    summary_parts = []
    if name:
        summary_parts.append(f"Name: {name}")
    if address:
        summary_parts.append(f"Property: {address}")
    if variables.get("asking_price"):
        summary_parts.append(f"Asking: ${variables['asking_price']}")
    if variables.get("motivation_hint"):
        summary_parts.append(f"Motivation: {variables['motivation_hint']}")
    if variables.get("timeline"):
        summary_parts.append(f"Timeline: {variables['timeline']}")
    if variables.get("buy_or_sell"):
        summary_parts.append(f"Intent: {variables['buy_or_sell']}")

    summary = " | ".join(summary_parts) if summary_parts else ""

    # Build extracted_data JSON (only non-system variables)
    data_fields = {
        k: v for k, v in variables.items()
        if v and k not in ("_system", "_internal")
    }

    if memory:
        # Update existing
        if name:
            memory.contact_name = name
        if phone:
            memory.contact_phone = phone
        if email:
            memory.contact_email = email
        if address:
            memory.property_address = address
        memory.extracted_data = json.dumps(data_fields, default=str)
        memory.last_channel = execution.channel
        if summary:
            memory.summary = summary
        memory.source_execution_id = execution.id
        memory.updated_at = datetime.utcnow()
    else:
        # Create new
        memory = StudioContactMemory(
            user_id=execution.user_id,
            contact_key=contact_key,
            contact_name=name,
            contact_phone=phone,
            contact_email=email,
            property_address=address,
            extracted_data=json.dumps(data_fields, default=str),
            last_channel=execution.channel,
            interaction_count=1,
            summary=summary,
            source_execution_id=execution.id,
        )
        db.add(memory)

    # Don't commit here — let the flow engine commit at the end of the turn


# ═══════════════════════════════════════════════════════════════════════════
# 2. CONVERSATION INSIGHT EXTRACTION (post-conversation)
# ═══════════════════════════════════════════════════════════════════════════


async def extract_insights_from_flow(
    execution_id: str,
    db: AsyncSession,
    settings: Any,
) -> list[dict]:
    """Analyze a completed flow execution and extract reusable insights.

    Called after a flow completes, transfers, or is abandoned.
    """
    result = await db.execute(
        select(FlowExecution).where(FlowExecution.id == execution_id)
    )
    execution = result.scalar_one_or_none()
    if not execution:
        return []

    messages = json.loads(execution.messages or "[]")
    variables = json.loads(execution.variables or "{}")

    if len(messages) < 4:
        return []

    insights_created = []
    outcome = execution.outcome or execution.status

    # ── Objection detection ──
    objection_patterns = {
        "price": ["too low", "not enough", "worth more", "higher offer", "lowball"],
        "timing": ["not ready", "not yet", "maybe later", "thinking about it", "need time"],
        "trust": ["scam", "legit", "how do i know", "too good", "catch", "suspicious"],
        "competition": ["other offer", "realtor", "agent", "already listed", "another buyer"],
        "personal": ["emotional", "family home", "grew up", "memories", "not sure"],
        "repairs": ["as-is", "condition", "needs work", "renovation", "problems"],
    }

    for msg in messages:
        if msg.get("role") != "user":
            continue

        msg_lower = msg.get("content", "").lower()

        for objection_type, keywords in objection_patterns.items():
            if any(kw in msg_lower for kw in keywords):
                msg_idx = messages.index(msg)
                ai_response = None
                for j in range(msg_idx + 1, min(msg_idx + 3, len(messages))):
                    if messages[j].get("role") == "assistant":
                        ai_response = messages[j].get("content", "")
                        break

                if ai_response:
                    was_successful = outcome in (
                        "completed", "qualified", "appointment_set", "transferred"
                    )

                    existing = await db.execute(
                        select(StudioLesson).where(
                            and_(
                                StudioLesson.topic == f"objection:{objection_type}",
                                StudioLesson.is_active == True,
                            )
                        ).limit(1)
                    )
                    existing_lesson = existing.scalar_one_or_none()

                    if existing_lesson:
                        if was_successful:
                            existing_lesson.confidence = min(
                                existing_lesson.confidence + 0.05, 1.0
                            )
                        existing_lesson.times_used += 1
                    else:
                        lesson = StudioLesson(
                            user_id=None,
                            topic=f"objection:{objection_type}",
                            question_pattern=f"Seller/buyer raises {objection_type} objection",
                            lesson_text=(
                                f"When a contact raises a '{objection_type}' objection "
                                f"(e.g., '{msg.get('content', '')[:80]}...'), "
                                f"{'this response approach worked well' if was_successful else 'consider a different approach'}. "
                                f"Example response: '{ai_response[:120]}...'"
                            ),
                            example_exchange=json.dumps({
                                "objection": msg.get("content", "")[:200],
                                "response": ai_response[:200],
                                "outcome": outcome,
                            }),
                            source_type="auto",
                            confidence=0.7 if was_successful else 0.4,
                            source_execution_id=execution_id,
                        )
                        db.add(lesson)
                        insights_created.append({
                            "type": "objection",
                            "objection_type": objection_type,
                        })
                break

    # ── Successful conversion patterns ──
    if outcome in ("completed", "qualified", "appointment_set"):
        collected_vars = [k for k, v in variables.items() if v]
        if len(collected_vars) >= 3:
            sequence_key = " → ".join(collected_vars[:8])

            existing = await db.execute(
                select(StudioLesson).where(
                    and_(
                        StudioLesson.topic == "conversion_pattern",
                        StudioLesson.question_pattern == sequence_key,
                    )
                ).limit(1)
            )
            if not existing.scalar_one_or_none():
                lesson = StudioLesson(
                    user_id=None,
                    topic="conversion_pattern",
                    question_pattern=sequence_key,
                    lesson_text=(
                        f"Successful conversation that collected: {sequence_key}. "
                        f"Outcome: {outcome}. "
                        f"This variable collection order led to a positive result."
                    ),
                    example_exchange=json.dumps({
                        "variables_collected": variables,
                        "outcome": outcome,
                        "message_count": len(messages),
                    }),
                    source_type="auto",
                    confidence=0.65,
                    source_execution_id=execution_id,
                )
                db.add(lesson)
                insights_created.append({
                    "type": "conversion_pattern",
                    "variables": collected_vars,
                })

    # ── Motivation tracking ──
    motivation = (
        variables.get("motivation") or variables.get("sell_reason")
        or variables.get("motivation_hint") or ""
    )
    if motivation and len(motivation) > 3:
        await _record_pattern(
            db,
            pattern_type="seller_motivation",
            pattern_key=motivation,
            success=(outcome in ("completed", "qualified", "appointment_set")),
        )

    if insights_created:
        await db.commit()
        logger.info(
            "Extracted %d insights from flow execution %s (outcome: %s)",
            len(insights_created), execution_id, outcome,
        )

    return insights_created


# ═══════════════════════════════════════════════════════════════════════════
# 3. FLOW EFFECTIVENESS TRACKING
# ═══════════════════════════════════════════════════════════════════════════


async def record_node_outcome(
    node: FlowNode,
    achieved: bool,
    attempts: int,
    execution_id: str,
    user_id: int,
    db: AsyncSession,
) -> None:
    """Record how a flow node performed."""
    node_key = f"node:{node.node_type}:{node.short_description[:40] if node.short_description else node.id}"
    await _record_pattern(
        db,
        pattern_type="node_effectiveness",
        pattern_key=node_key,
        success=achieved,
        user_id=user_id,
        metadata={"attempts": attempts, "node_type": node.node_type},
    )


async def record_flow_outcome(
    execution: FlowExecution,
    db: AsyncSession,
) -> None:
    """Record the overall outcome of a flow execution."""
    messages = json.loads(execution.messages or "[]")
    outcome = execution.outcome or execution.status
    was_successful = outcome in ("completed", "qualified", "appointment_set", "transferred")

    await _record_pattern(
        db,
        pattern_type="flow_outcome",
        pattern_key=f"flow:{execution.flow_id}",
        success=was_successful,
        user_id=execution.user_id,
        metadata={
            "outcome": outcome,
            "message_count": len(messages),
            "channel": execution.channel,
        },
    )

    await _record_pattern(
        db,
        pattern_type="channel_effectiveness",
        pattern_key=f"channel:{execution.channel}",
        success=was_successful,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 4. CONTACT MEMORY — Remember contacts across sessions
# ═══════════════════════════════════════════════════════════════════════════


async def finalize_contact_memory(
    execution: FlowExecution,
    db: AsyncSession,
) -> None:
    """Finalize contact memory after a conversation ends.

    Updates the outcome, mood, and interaction count.
    The core data was already stored during real-time extraction.
    """
    variables = json.loads(execution.variables or "{}")
    phone = execution.contact_phone or variables.get("contact_phone")
    email = execution.contact_email or variables.get("contact_email")

    if not phone and not email:
        return

    contact_key = (
        f"phone:{_normalize_phone(phone)}" if phone
        else f"email:{email.lower().strip()}"
    )

    result = await db.execute(
        select(StudioContactMemory).where(
            and_(
                StudioContactMemory.contact_key == contact_key,
                StudioContactMemory.user_id == execution.user_id,
            )
        )
    )
    memory = result.scalar_one_or_none()

    if memory:
        memory.last_outcome = execution.outcome or execution.status
        memory.interaction_count += 1
        memory.updated_at = datetime.utcnow()


async def enrich_from_voice_call(
    extracted_data: dict,
    outcome: str,
    summary: str,
    caller_mood: str,
    deal_eagerness: int,
    user_id: int,
    conversation_id: str,
    db: AsyncSession,
) -> list[dict]:
    """Cache facts from a completed voice call into contact memory."""
    enrichments = []

    phone = extracted_data.get("phone")
    name = extracted_data.get("caller_name")
    address = extracted_data.get("property_address")

    contact_key = None
    if phone:
        contact_key = f"phone:{_normalize_phone(phone)}"
    elif name:
        contact_key = f"name:{re.sub(r'[^a-z0-9]+', '_', name.lower().strip()).strip('_')}"

    if contact_key:
        result = await db.execute(
            select(StudioContactMemory).where(
                and_(
                    StudioContactMemory.contact_key == contact_key,
                    StudioContactMemory.user_id == user_id,
                )
            )
        )
        memory = result.scalar_one_or_none()

        # Build summary
        summary_parts = []
        if name:
            summary_parts.append(f"Name: {name}")
        if address:
            summary_parts.append(f"Property: {address}")
        if extracted_data.get("motivation"):
            summary_parts.append(f"Motivation: {extracted_data['motivation']}")
        if extracted_data.get("asking_price"):
            summary_parts.append(f"Asking: {extracted_data['asking_price']}")
        summary_parts.append(f"Mood: {caller_mood}, Eagerness: {deal_eagerness}/10")
        summary_parts.append(f"Outcome: {outcome}")
        contact_summary = " | ".join(summary_parts)

        if memory:
            if name:
                memory.contact_name = name
            if phone:
                memory.contact_phone = phone
            if address:
                memory.property_address = address
            memory.extracted_data = json.dumps(extracted_data, default=str)
            memory.last_outcome = outcome
            memory.last_mood = caller_mood
            memory.last_channel = "voice"
            memory.interaction_count += 1
            memory.summary = contact_summary
            memory.source_execution_id = conversation_id
            memory.updated_at = datetime.utcnow()
        else:
            memory = StudioContactMemory(
                user_id=user_id,
                contact_key=contact_key,
                contact_name=name,
                contact_phone=phone,
                contact_email=extracted_data.get("email"),
                property_address=address,
                extracted_data=json.dumps(extracted_data, default=str),
                last_outcome=outcome,
                last_mood=caller_mood,
                last_channel="voice",
                interaction_count=1,
                summary=contact_summary,
                source_execution_id=conversation_id,
            )
            db.add(memory)

        enrichments.append({"type": "contact", "key": contact_key})

    # Record call outcome patterns
    await _record_pattern(
        db,
        pattern_type="voice_call_outcome",
        pattern_key=f"mood:{caller_mood}",
        success=(outcome in ("qualified", "appointment_set")),
        metadata={"eagerness": deal_eagerness},
    )

    if enrichments:
        await db.commit()

    return enrichments


# ═══════════════════════════════════════════════════════════════════════════
# PROMPT INJECTION — Add learned context to flow engine prompts
# ═══════════════════════════════════════════════════════════════════════════


async def build_studio_learning_context(
    contact_message: str,
    user_id: int,
    execution: FlowExecution,
    db: AsyncSession,
) -> str:
    """Build a learning context block to inject into flow node prompts.

    Adds:
    - Known contact history (if we've talked to this person before)
    - Real-time extracted data (what we've learned this conversation)
    - Relevant objection handling lessons
    """
    parts = []

    # ── Check if we know this contact from a prior conversation ──
    contact_info = await _lookup_contact_history(execution, db)
    if contact_info:
        parts.append("RETURNING CONTACT (from previous conversations):")
        parts.append(f"  {contact_info['summary']}")
        if contact_info.get("age_days", 0) > 0:
            parts.append(f"  (Last interaction: {contact_info['age_days']} days ago)")
        parts.append("")

    # ── Show real-time extracted data ──
    variables = json.loads(execution.variables or "{}")
    live_data = {
        k: v for k, v in variables.items()
        if v and k in (
            "contact_name", "contact_phone", "contact_email",
            "property_address", "asking_price", "zip_code",
            "timeline", "motivation_hint", "buy_or_sell",
        )
    }
    if live_data:
        parts.append("DATA EXTRACTED SO FAR (from this conversation):")
        for key, value in live_data.items():
            readable = key.replace("_", " ").title()
            parts.append(f"  - {readable}: {value}")
        parts.append("  (Use this data naturally — don't re-ask for information you already have)")
        parts.append("")

    # ── Relevant objection handling lessons ──
    msg_lower = contact_message.lower()
    objection_topics = []
    objection_map = {
        "price": ["too low", "not enough", "worth more", "higher", "lowball"],
        "timing": ["not ready", "later", "thinking", "need time"],
        "trust": ["scam", "legit", "how do i know", "catch"],
        "competition": ["other offer", "realtor", "agent", "listed"],
    }
    for obj_type, keywords in objection_map.items():
        if any(kw in msg_lower for kw in keywords):
            objection_topics.append(f"objection:{obj_type}")

    if objection_topics:
        lessons = await db.execute(
            select(StudioLesson)
            .where(
                and_(
                    StudioLesson.topic.in_(objection_topics),
                    StudioLesson.is_active == True,
                    StudioLesson.confidence >= 0.5,
                )
            )
            .order_by(desc(StudioLesson.confidence))
            .limit(2)
        )
        objection_lessons = lessons.scalars().all()

        if objection_lessons:
            parts.append("OBJECTION HANDLING (learned from successful conversations):")
            for lesson in objection_lessons:
                parts.append(f"  • {lesson.lesson_text[:200]}")
                lesson.times_used += 1
            parts.append("")

    if parts:
        await db.commit()

    if not parts:
        return ""

    return (
        "\n── PLATFORM INTELLIGENCE (learned from previous conversations) ──\n"
        + "\n".join(parts)
        + "\n── END INTELLIGENCE ──\n"
    )


async def _lookup_contact_history(
    execution: FlowExecution,
    db: AsyncSession,
) -> Optional[dict]:
    """Check if we have prior knowledge about this contact."""
    phone = execution.contact_phone
    email = execution.contact_email
    variables = json.loads(execution.variables or "{}")

    # Also check variables in case real-time extraction found them
    phone = phone or variables.get("contact_phone")
    email = email or variables.get("contact_email")

    entity_keys = []
    if phone:
        entity_keys.append(f"phone:{_normalize_phone(phone)}")
    if email:
        entity_keys.append(f"email:{email.lower().strip()}")

    if not entity_keys:
        return None

    for key in entity_keys:
        result = await db.execute(
            select(StudioContactMemory).where(
                and_(
                    StudioContactMemory.contact_key == key,
                    StudioContactMemory.user_id == execution.user_id,
                )
            )
        )
        memory = result.scalar_one_or_none()
        if memory:
            memory.times_referenced = (memory.interaction_count or 0)
            age_days = (
                (datetime.utcnow() - memory.updated_at).days
                if memory.updated_at else 0
            )
            return {
                "summary": memory.summary,
                "age_days": age_days,
                "last_outcome": memory.last_outcome,
                "interaction_count": memory.interaction_count,
            }

    return None


# ═══════════════════════════════════════════════════════════════════════════
# POST-CONVERSATION LEARNING — Main entry point
# ═══════════════════════════════════════════════════════════════════════════


async def run_post_flow_learning(
    execution_id: str,
    db: AsyncSession,
    settings: Any,
) -> dict:
    """Run all learning engines after a flow conversation ends."""
    results = {
        "insights": 0,
        "flow_tracked": False,
        "memory_finalized": False,
    }

    exec_result = await db.execute(
        select(FlowExecution).where(FlowExecution.id == execution_id)
    )
    execution = exec_result.scalar_one_or_none()
    if not execution:
        return results

    try:
        insights = await extract_insights_from_flow(execution_id, db, settings)
        results["insights"] = len(insights)
    except Exception as e:
        logger.error("Insight extraction failed for execution %s: %s", execution_id, e)

    try:
        await record_flow_outcome(execution, db)
        results["flow_tracked"] = True
    except Exception as e:
        logger.error("Flow outcome tracking failed for execution %s: %s", execution_id, e)

    try:
        await finalize_contact_memory(execution, db)
        results["memory_finalized"] = True
    except Exception as e:
        logger.error("Contact memory finalization failed for execution %s: %s", execution_id, e)

    await db.commit()

    logger.info(
        "Post-flow learning complete for execution %s: %s",
        execution_id, results,
    )
    return results


# ═══════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════


def _normalize_phone(phone: str) -> str:
    """Normalize a phone number to last 10 digits."""
    return re.sub(r"[^\d]", "", phone)[-10:]


async def _record_pattern(
    db: AsyncSession,
    pattern_type: str,
    pattern_key: str,
    success: bool,
    user_id: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> None:
    """Record or update a usage pattern in studio_patterns."""
    now = datetime.utcnow()

    for uid in ([None, user_id] if user_id else [None]):
        result = await db.execute(
            select(StudioPattern).where(
                and_(
                    StudioPattern.pattern_type == pattern_type,
                    StudioPattern.pattern_key == pattern_key,
                    StudioPattern.user_id == uid if uid else StudioPattern.user_id == None,
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
            if metadata:
                try:
                    existing_meta = json.loads(pattern.metadata_json or "{}")
                    existing_meta.update(metadata)
                    pattern.metadata_json = json.dumps(existing_meta)
                except (json.JSONDecodeError, TypeError):
                    pattern.metadata_json = json.dumps(metadata)
        else:
            pattern = StudioPattern(
                user_id=uid,
                pattern_type=pattern_type,
                pattern_key=pattern_key,
                occurrence_count=1,
                success_count=1 if success else 0,
                failure_count=0 if success else 1,
                metadata_json=json.dumps(metadata) if metadata else None,
                first_seen=now,
                last_seen=now,
            )
            db.add(pattern)

    await db.commit()
