"""Callback Scheduler — AI-booked appointment callbacks.

When the AI agent says "I'll have someone call you back Thursday at 2 PM",
it creates a ScheduledCallback. This service manages executing those callbacks:

1. Checks every minute for callbacks that are due
2. Initiates outbound calls via Twilio
3. Connects the call to the AI agent (or notifies the human investor)
4. Tracks attempts and retries on no-answer
5. Updates the callback status when complete

HOW IT WORKS (in plain English):
- AI finishes a call and books a callback → creates a ScheduledCallback record
- Our background task checks every minute: "Are any callbacks due right now?"
- When one is due: makes an outbound Twilio call to the contact's phone
- Connects that call to the AI agent via ConversationRelay (same as inbound)
- If no answer after 3 attempts, marks it failed and notifies the investor
- The investor can also see all upcoming/past callbacks in the dashboard
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings
from rei.models.conversation_flow import Persona
from rei.models.user import (
    CallLog,
    ConversationLog,
    PhoneNumber,
    ScheduledCallback,
)
from rei.services import elevenlabs_service, twilio_service
from rei.services.quiet_hours import is_within_contact_hours, resolve_contact_timezone

logger = logging.getLogger(__name__)


# ── Check for due callbacks ──────────────────────────────────────────

async def get_due_callbacks(
    db: AsyncSession,
    now: Optional[datetime] = None,
) -> list[ScheduledCallback]:
    """
    Find all callbacks that are due to be executed right now.

    A callback is "due" when:
    - Its scheduled_at time has passed (or is within the next minute)
    - Its status is "scheduled" (not already in progress, completed, etc.)
    - It hasn't exceeded max_attempts
    """
    if now is None:
        now = datetime.utcnow()

    # Look for callbacks due in the next minute window
    window_end = now + timedelta(minutes=1)

    result = await db.execute(
        select(ScheduledCallback).where(
            and_(
                ScheduledCallback.status == "scheduled",
                ScheduledCallback.scheduled_at <= window_end,
                ScheduledCallback.attempt_count < ScheduledCallback.max_attempts,
            )
        )
    )
    return list(result.scalars().all())


# ── Execute a single callback ────────────────────────────────────────

async def execute_callback(
    callback: ScheduledCallback,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """
    Execute a scheduled callback — make the outbound call.

    Steps:
    1. Look up the AI agent and phone number to call from
    2. Initiate an outbound Twilio call
    3. Connect it to the AI agent via ConversationRelay
    4. Update the callback status

    Returns a dict with status info.
    """
    # Respect quiet hours — resolve timezone from callback setting or phone area code
    cb_tz = resolve_contact_timezone(
        tz_name=getattr(callback, "timezone", None),
        phone_number=getattr(callback, "to_number", None),
    )
    if not is_within_contact_hours(cb_tz):
        logger.info("Callback %s skipped — quiet hours (%s)", callback.id, cb_tz)
        return {"status": "skipped", "reason": "quiet_hours"}

    callback.status = "in_progress"
    callback.attempt_count += 1
    callback.last_attempt_at = datetime.utcnow()
    await db.commit()

    try:
        # Look up the persona (unified agent/persona)
        agent = None
        persona_id = callback.persona_id or callback.agent_id  # fallback to legacy
        if persona_id:
            result = await db.execute(
                select(Persona).where(Persona.id == persona_id)
            )
            agent = result.scalar_one_or_none()

        # Look up the phone number to call from
        phone = None
        if callback.phone_number_id:
            result = await db.execute(
                select(PhoneNumber).where(
                    PhoneNumber.id == callback.phone_number_id
                )
            )
            phone = result.scalar_one_or_none()

        # If we don't have a phone number, find the user's first one
        if not phone:
            result = await db.execute(
                select(PhoneNumber).where(
                    PhoneNumber.user_id == callback.user_id
                ).limit(1)
            )
            phone = result.scalar_one_or_none()

        if not phone:
            callback.status = "failed"
            callback.notes = (callback.notes or "") + "\n[FAILED: No phone number available to call from]"
            await db.commit()
            return {"status": "failed", "reason": "no_phone_number"}

        # Create a call log for this outbound call
        call_log = CallLog(
            user_id=callback.user_id,
            phone_number_id=phone.id,
            direction="outbound",
            from_number=phone.number,
            to_number=callback.contact_phone,
            status="initiating",
            started_at=datetime.utcnow(),
        )
        db.add(call_log)
        await db.commit()

        if callback.callback_type == "ai" and agent and agent.elevenlabs_agent_id:
            # AI callback — connect via ConversationRelay
            signed_url = await elevenlabs_service.get_signed_url(
                agent.elevenlabs_agent_id,
                settings,
            )

            if not signed_url:
                callback.status = "scheduled"  # Retry later
                call_log.status = "failed"
                await db.commit()
                return {"status": "retry", "reason": "elevenlabs_url_failed"}

            # Build the callback context for the AI
            context_prompt = _build_callback_context(callback)

            # Initiate outbound call via Twilio
            twiml = twilio_service.generate_conversation_relay_twiml(signed_url)
            call_sid = await twilio_service.make_outbound_call(
                to=callback.contact_phone,
                from_=phone.number,
                twiml=twiml,
                settings=settings,
            )

            if call_sid:
                call_log.twilio_call_sid = call_sid
                call_log.status = "ringing"

                # Create conversation log
                conv_log = ConversationLog(
                    user_id=callback.user_id,
                    call_log_id=call_log.id,
                    agent_id=agent.id,  # legacy compat
                    persona_id=agent.id,
                    status="in_progress",
                    started_at=datetime.utcnow(),
                )
                db.add(conv_log)
                await db.commit()

                callback.result_conversation_id = conv_log.id
                await db.commit()

                return {"status": "calling", "call_sid": call_sid}
            else:
                call_log.status = "failed"
                # If we haven't exhausted attempts, reschedule
                if callback.attempt_count < callback.max_attempts:
                    callback.status = "scheduled"
                    callback.scheduled_at = datetime.utcnow() + timedelta(minutes=15)
                else:
                    callback.status = "failed"
                await db.commit()
                return {"status": "failed", "reason": "twilio_call_failed"}

        else:
            # Human callback — just flag it for the investor's attention
            callback.status = "completed"
            callback.notes = (
                (callback.notes or "")
                + "\n[HUMAN CALLBACK: Investor should call this contact manually]"
            )
            await db.commit()
            return {"status": "human_notified"}

    except Exception as e:
        logger.error(f"Callback execution failed for {callback.id}: {e}")
        if callback.attempt_count < callback.max_attempts:
            callback.status = "scheduled"
            callback.scheduled_at = datetime.utcnow() + timedelta(minutes=15)
        else:
            callback.status = "failed"
        await db.commit()
        return {"status": "error", "detail": str(e)}


def _build_callback_context(callback: ScheduledCallback) -> str:
    """
    Build context for the AI agent making a callback.

    This gets injected into the AI's prompt so it knows:
    - Who it's calling and why
    - What was discussed in the original conversation
    - What to focus on in this callback
    """
    parts = [
        "CALLBACK CONTEXT — This is a scheduled callback, not a cold call.",
        f"You are calling {callback.contact_name or 'the contact'} back "
        f"because they requested a callback during a previous conversation.",
    ]

    if callback.property_address:
        parts.append(f"Property being discussed: {callback.property_address}")

    if callback.notes:
        parts.append(f"Notes from previous conversation: {callback.notes}")

    parts.append(
        "\nOPENING: Greet them warmly, remind them of the previous conversation, "
        "and pick up where you left off. Example: \"Hi [name], this is [your name] "
        "from [company]. We spoke the other day about your property at [address] "
        "and I'm calling back as promised.\""
    )

    return "\n".join(parts)


# ── Create a callback from an AI conversation ────────────────────────

async def create_callback_from_conversation(
    user_id: int,
    contact_phone: str,
    scheduled_at: datetime,
    db: AsyncSession,
    contact_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    property_address: Optional[str] = None,
    notes: Optional[str] = None,
    agent_id: Optional[str] = None,
    phone_number_id: Optional[int] = None,
    conversation_id: Optional[str] = None,
    callback_type: str = "ai",
    timezone: str = "America/New_York",
) -> ScheduledCallback:
    """
    Create a new scheduled callback.

    Called when:
    - The AI agent detects the caller wants a callback
    - The investor manually schedules a callback from the dashboard
    - A campaign contact needs a follow-up call
    """
    callback = ScheduledCallback(
        user_id=user_id,
        contact_name=contact_name,
        contact_phone=contact_phone,
        contact_email=contact_email,
        property_address=property_address,
        scheduled_at=scheduled_at,
        timezone=timezone,
        callback_type=callback_type,
        agent_id=agent_id,
        phone_number_id=phone_number_id,
        notes=notes,
        original_conversation_id=conversation_id,
        status="scheduled",
    )
    db.add(callback)
    await db.commit()
    await db.refresh(callback)

    logger.info(
        f"Callback scheduled: {callback.id} for {contact_phone} "
        f"at {scheduled_at} ({callback_type})"
    )
    return callback


# ── Process all due callbacks (called by background task) ────────────

async def process_due_callbacks(
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """
    Check for and execute all due callbacks.

    This should be called by a background task every ~60 seconds.
    Returns a summary of what happened.
    """
    due = await get_due_callbacks(db)

    if not due:
        return {"processed": 0}

    results = []
    for callback in due:
        result = await execute_callback(callback, db, settings)
        results.append({"callback_id": callback.id, **result})

    logger.info(f"Processed {len(results)} due callbacks")
    return {"processed": len(results), "results": results}
