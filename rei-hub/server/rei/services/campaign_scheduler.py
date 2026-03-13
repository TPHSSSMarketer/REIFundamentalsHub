"""Campaign Scheduler — Bulk AI outbound calling campaigns.

An investor uploads a list of contacts (or selects from CRM), picks an AI agent,
sets a calling window, and schedules the campaign. This service manages:

1. Starting campaigns at their scheduled time
2. Processing contacts one by one within the calling window
3. Spacing calls (e.g., 30 seconds apart) to avoid overwhelming
4. Respecting calling hours (don't call at 3 AM)
5. Tracking per-contact outcomes and campaign-level stats
6. Pausing/resuming campaigns
7. Retrying no-answer contacts

HOW IT WORKS (in plain English):
- Investor creates a campaign with contacts + AI agent + schedule
- Background task picks up "running" campaigns every ~30 seconds
- For each campaign: checks if we're in the calling window
- If yes: grabs the next "pending" contact and makes an AI outbound call
- After the call completes, updates stats and moves to the next contact
- When all contacts are done (or manually stopped), campaign is "completed"
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, time as dt_time, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings
from rei.models.conversation_flow import Persona
from rei.models.user import (
    CallCampaign,
    CallLog,
    CampaignContact,
    ConversationLog,
    PhoneNumber,
)
from rei.services import elevenlabs_service, twilio_service
from rei.services.quiet_hours import is_within_contact_hours, resolve_contact_timezone

logger = logging.getLogger(__name__)


# ── Check if campaign is within its calling window ───────────────────

def is_in_calling_window(campaign: CallCampaign) -> bool:
    """
    Check if the current time falls within the campaign's calling window.

    Respects:
    - System-wide quiet hours (8:30 PM – 9:15 AM) — hard limit
    - calling_window_start / calling_window_end (e.g., 9 AM to 5 PM)
    - calling_days (e.g., Mon-Fri only)
    - timezone (converts UTC to campaign's local timezone)
    """
    # Hard limit: system-wide quiet hours override any campaign settings
    tz_name = getattr(campaign, "timezone", None) or "America/New_York"
    if not is_within_contact_hours(tz_name):
        return False

    try:
        start_str = campaign.calling_window_start or "09:00"
        end_str = campaign.calling_window_end or "17:00"
        days = json.loads(campaign.calling_days or "[1,2,3,4,5]")

        start_hour, start_min = map(int, start_str.split(":"))
        end_hour, end_min = map(int, end_str.split(":"))

        # Convert UTC now to the campaign's local timezone
        try:
            local_tz = ZoneInfo(tz_name)
        except (KeyError, Exception):
            local_tz = ZoneInfo("America/New_York")
        now = datetime.now(timezone.utc).astimezone(local_tz)
        current_day = now.isoweekday()
        current_time = dt_time(now.hour, now.minute)
        start_time = dt_time(start_hour, start_min)
        end_time = dt_time(end_hour, end_min)

        if current_day not in days:
            return False

        return start_time <= current_time <= end_time

    except Exception as e:
        logger.warning(f"Error checking calling window for campaign {campaign.id}: {e}")
        return False


# ── Get the next contact to call ─────────────────────────────────────

async def get_next_contact(
    campaign_id: str,
    db: AsyncSession,
) -> Optional[CampaignContact]:
    """
    Get the next pending contact in a campaign to call.

    Prioritizes:
    1. Contacts that have never been attempted
    2. Contacts that need a retry (no_answer, under max_attempts)

    Returns None if all contacts are done.
    """
    # First: try contacts that haven't been called yet
    result = await db.execute(
        select(CampaignContact).where(
            and_(
                CampaignContact.campaign_id == campaign_id,
                CampaignContact.status == "pending",
            )
        ).limit(1)
    )
    contact = result.scalar_one_or_none()
    if contact:
        return contact

    # Second: try contacts that got no answer and haven't exceeded attempts
    result = await db.execute(
        select(CampaignContact).where(
            and_(
                CampaignContact.campaign_id == campaign_id,
                CampaignContact.status == "no_answer",
                CampaignContact.attempt_count < CampaignContact.max_attempts,
            )
        ).limit(1)
    )
    return result.scalar_one_or_none()


# ── Execute a single campaign call ───────────────────────────────────

async def execute_campaign_call(
    campaign: CallCampaign,
    contact: CampaignContact,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """
    Make a single outbound AI call for a campaign contact.

    Steps:
    1. Look up the AI agent
    2. Get a signed URL from ElevenLabs
    3. Initiate the Twilio outbound call
    4. Connect it to the AI agent via ConversationRelay
    """
    contact.status = "calling"
    contact.attempt_count += 1
    contact.called_at = datetime.utcnow()
    await db.commit()

    try:
        # Look up the persona (unified agent/persona)
        persona_id = campaign.persona_id or campaign.agent_id  # fallback to legacy agent_id
        result = await db.execute(
            select(Persona).where(Persona.id == persona_id)
        )
        agent = result.scalar_one_or_none()

        if not agent or not agent.elevenlabs_agent_id:
            contact.status = "failed"
            await db.commit()
            return {"status": "failed", "reason": "no_agent"}

        # Look up the phone number to call from
        result = await db.execute(
            select(PhoneNumber).where(
                PhoneNumber.id == campaign.phone_number_id
            )
        )
        phone = result.scalar_one_or_none()

        if not phone:
            contact.status = "failed"
            await db.commit()
            return {"status": "failed", "reason": "no_phone"}

        # Get signed WebSocket URL from ElevenLabs
        signed_url = await elevenlabs_service.get_signed_url(
            agent.elevenlabs_agent_id,
            settings,
        )

        if not signed_url:
            contact.status = "pending"  # Retry later
            await db.commit()
            return {"status": "retry", "reason": "elevenlabs_failed"}

        # Create call log
        call_log = CallLog(
            user_id=campaign.user_id,
            phone_number_id=phone.id,
            direction="outbound",
            from_number=phone.number,
            to_number=contact.contact_phone,
            status="initiating",
            started_at=datetime.utcnow(),
        )
        db.add(call_log)
        await db.commit()

        # Make the outbound call
        twiml = twilio_service.generate_conversation_relay_twiml(signed_url)
        call_sid = await twilio_service.make_outbound_call(
            to=contact.contact_phone,
            from_=phone.number,
            twiml=twiml,
            settings=settings,
        )

        if call_sid:
            call_log.twilio_call_sid = call_sid
            call_log.status = "ringing"

            # Create conversation log
            conv_log = ConversationLog(
                user_id=campaign.user_id,
                call_log_id=call_log.id,
                agent_id=agent.id,  # legacy compat
                persona_id=agent.id,
                status="in_progress",
                started_at=datetime.utcnow(),
            )
            db.add(conv_log)
            await db.commit()

            contact.conversation_id = conv_log.id
            await db.commit()

            # Update campaign stats
            campaign.calls_made += 1
            await db.commit()

            return {"status": "calling", "call_sid": call_sid}
        else:
            call_log.status = "failed"
            contact.status = "failed"
            campaign.calls_failed += 1
            await db.commit()
            return {"status": "failed", "reason": "twilio_failed"}

    except Exception as e:
        logger.error(
            f"Campaign call failed: campaign={campaign.id}, "
            f"contact={contact.id}, error={e}"
        )
        contact.status = "failed"
        campaign.calls_failed += 1
        await db.commit()
        return {"status": "error", "detail": str(e)}


# ── Process a running campaign ───────────────────────────────────────

async def process_campaign(
    campaign: CallCampaign,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """
    Process one tick of a running campaign.

    Called by the background task. Checks if we're in the calling window
    and if so, makes the next call.
    """
    if campaign.status != "running":
        return {"status": "not_running"}

    # Check calling window
    if not is_in_calling_window(campaign):
        return {"status": "outside_window"}

    # Get the next contact to call
    contact = await get_next_contact(campaign.id, db)

    if not contact:
        # All contacts processed — campaign is done!
        campaign.status = "completed"
        campaign.completed_at = datetime.utcnow()
        await db.commit()
        logger.info(f"Campaign {campaign.id} completed — all contacts processed")
        return {"status": "completed"}

    # Make the call
    result = await execute_campaign_call(campaign, contact, db, settings)
    return result


# ── Get all active campaigns ─────────────────────────────────────────

async def get_active_campaigns(
    db: AsyncSession,
) -> list[CallCampaign]:
    """Get all campaigns that are currently running."""
    result = await db.execute(
        select(CallCampaign).where(CallCampaign.status == "running")
    )
    return list(result.scalars().all())


# ── Start a campaign ─────────────────────────────────────────────────

async def start_campaign(
    campaign_id: str,
    db: AsyncSession,
) -> CallCampaign:
    """
    Start a campaign (move from draft/scheduled to running).

    Validates that the campaign has contacts and an agent configured.
    """
    result = await db.execute(
        select(CallCampaign).where(CallCampaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        raise ValueError(f"Campaign {campaign_id} not found")

    if campaign.status not in ("draft", "scheduled", "paused"):
        raise ValueError(
            f"Campaign {campaign_id} cannot be started — current status: {campaign.status}"
        )

    # Count contacts
    count_result = await db.execute(
        select(func.count(CampaignContact.id)).where(
            CampaignContact.campaign_id == campaign_id
        )
    )
    contact_count = count_result.scalar() or 0

    if contact_count == 0:
        raise ValueError(f"Campaign {campaign_id} has no contacts")

    campaign.total_contacts = contact_count
    campaign.status = "running"
    campaign.updated_at = datetime.utcnow()
    await db.commit()

    logger.info(f"Campaign {campaign.id} started with {contact_count} contacts")
    return campaign


# ── Pause a campaign ─────────────────────────────────────────────────

async def pause_campaign(
    campaign_id: str,
    db: AsyncSession,
) -> CallCampaign:
    """Pause a running campaign. Can be resumed later."""
    result = await db.execute(
        select(CallCampaign).where(CallCampaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        raise ValueError(f"Campaign {campaign_id} not found")

    campaign.status = "paused"
    campaign.updated_at = datetime.utcnow()
    await db.commit()

    logger.info(f"Campaign {campaign.id} paused")
    return campaign


# ── Campaign stats ───────────────────────────────────────────────────

async def get_campaign_stats(
    campaign_id: str,
    db: AsyncSession,
) -> dict:
    """Get detailed stats for a campaign."""
    result = await db.execute(
        select(CallCampaign).where(CallCampaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()

    if not campaign:
        return {}

    # Count contact statuses
    for status_name in ["pending", "calling", "completed", "no_answer", "failed", "skipped"]:
        count_result = await db.execute(
            select(func.count(CampaignContact.id)).where(
                and_(
                    CampaignContact.campaign_id == campaign_id,
                    CampaignContact.status == status_name,
                )
            )
        )
        count = count_result.scalar() or 0
        # Update running totals on the campaign
        if status_name == "completed":
            campaign.calls_answered = count
        elif status_name == "no_answer":
            campaign.calls_no_answer = count

    await db.commit()

    return {
        "campaign_id": campaign.id,
        "name": campaign.name,
        "status": campaign.status,
        "total_contacts": campaign.total_contacts,
        "calls_made": campaign.calls_made,
        "calls_answered": campaign.calls_answered,
        "calls_no_answer": campaign.calls_no_answer,
        "calls_failed": campaign.calls_failed,
        "leads_qualified": campaign.leads_qualified,
        "appointments_set": campaign.appointments_set,
        "progress_pct": round(
            (campaign.calls_made / max(campaign.total_contacts, 1)) * 100, 1
        ),
    }


# ── Background task: process all active campaigns ────────────────────

async def process_all_campaigns(
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """
    Process all active campaigns.

    Called by background task every ~30 seconds.
    Processes one contact per campaign per tick.
    """
    campaigns = await get_active_campaigns(db)

    if not campaigns:
        return {"processed": 0}

    results = []
    for campaign in campaigns:
        result = await process_campaign(campaign, db, settings)
        results.append({"campaign_id": campaign.id, **result})

        # Respect spacing between calls
        if result.get("status") == "calling":
            await asyncio.sleep(campaign.seconds_between_calls)

    return {"processed": len(results), "results": results}
