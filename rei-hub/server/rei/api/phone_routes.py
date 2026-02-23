"""Phone system routes — numbers, dialer, SMS, voicemail drops, fax, credits."""

from __future__ import annotations

import json
import logging
import math
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import (
    AI_VOICEMAIL_PLANS,
    CREDIT_BUNDLES,
    PHONE_PLAN_LIMITS,
    PHONE_PRICING,
    get_settings,
)
from rei.models.user import (
    CallLog,
    FaxLog,
    PhoneCredit,
    PhoneNumber,
    SmsCampaign,
    SmsMessage,
    User,
    VoicemailDrop,
    VoicemailDropCampaign,
)
from rei.services import elevenlabs_service, twilio_service

logger = logging.getLogger(__name__)

phone_router = APIRouter(prefix="/phone", tags=["phone"])

settings = get_settings()

# In-memory dialer sessions (production would use Redis)
_dialer_sessions: dict[str, dict] = {}


# ── Schemas ────────────────────────────────────────────────────────────


class PurchaseNumberRequest(BaseModel):
    phone_number: str
    friendly_name: str
    number_type: str = "local"


class UpdateNumberRequest(BaseModel):
    friendly_name: Optional[str] = None
    forward_to: Optional[str] = None
    use_softphone: Optional[bool] = None


class DialRequest(BaseModel):
    to_number: str
    phone_number_id: str
    contact_id: Optional[str] = None


class DialerCampaignRequest(BaseModel):
    contact_ids: list[str]
    phone_number_id: str
    auto_connect: bool = False


class DispositionRequest(BaseModel):
    disposition: str
    notes: Optional[str] = None
    call_log_id: str


class UpdateCallRequest(BaseModel):
    disposition: Optional[str] = None
    notes: Optional[str] = None


class SendSmsRequest(BaseModel):
    to_number: str
    body: str
    phone_number_id: str
    contact_id: Optional[str] = None


class CreateSmsCampaignRequest(BaseModel):
    name: str
    message_template: str
    phone_number_id: str
    list_id: Optional[str] = None
    scheduled_at: Optional[str] = None


class CreateVoicemailDropRequest(BaseModel):
    name: str
    drop_type: str  # "recorded", "uploaded", "ai_personalized"
    script_template: Optional[str] = None
    elevenlabs_voice_id: Optional[str] = None
    audio_url: Optional[str] = None


class PreviewDropRequest(BaseModel):
    contact_id: Optional[str] = None


class VoicemailCampaignRequest(BaseModel):
    name: str
    voicemail_drop_id: str
    phone_number_id: str
    contact_ids: list[str]


class SendFaxRequest(BaseModel):
    to_number: str
    from_number_id: str
    media_url: str
    contact_id: Optional[str] = None


class PurchaseCreditsRequest(BaseModel):
    bundle: str  # "starter", "growth", "power"


# ── Helpers ────────────────────────────────────────────────────────────


def _get_plan_limits(user: User) -> dict[str, int]:
    plan = getattr(user, "plan", "starter") or "starter"
    return PHONE_PLAN_LIMITS.get(plan, PHONE_PLAN_LIMITS["starter"])


def _check_minutes(user: User, minutes_needed: int = 1) -> bool:
    """Check if user has available minutes (allotment or credits)."""
    limits = _get_plan_limits(user)
    if user.phone_minutes_used < limits["minutes"]:
        return True
    cost_cents = int(minutes_needed * PHONE_PRICING["outbound_per_min"] * 100)
    return user.phone_credits_cents >= cost_cents


def _deduct_minutes(user: User, minutes: int) -> float:
    """Deduct minutes from allotment first, then credits. Returns cost in dollars."""
    limits = _get_plan_limits(user)
    remaining_allotment = max(0, limits["minutes"] - user.phone_minutes_used)
    if minutes <= remaining_allotment:
        user.phone_minutes_used += minutes
        return 0.00
    # Use remaining allotment + credits for overflow
    from_allotment = remaining_allotment
    from_credits = minutes - from_allotment
    user.phone_minutes_used += from_allotment
    cost_cents = int(from_credits * PHONE_PRICING["outbound_per_min"] * 100)
    user.phone_credits_cents = max(0, user.phone_credits_cents - cost_cents)
    return cost_cents / 100


def _check_sms(user: User) -> bool:
    """Check if user has available SMS (allotment or credits)."""
    limits = _get_plan_limits(user)
    if user.phone_sms_used < limits["sms"]:
        return True
    cost_cents = int(PHONE_PRICING["outbound_sms"] * 100)
    return user.phone_credits_cents >= cost_cents


def _deduct_sms(user: User) -> float:
    """Deduct one SMS from allotment first, then credits. Returns cost in dollars."""
    limits = _get_plan_limits(user)
    if user.phone_sms_used < limits["sms"]:
        user.phone_sms_used += 1
        return 0.00
    cost_cents = int(PHONE_PRICING["outbound_sms"] * 100)
    user.phone_credits_cents = max(0, user.phone_credits_cents - cost_cents)
    return cost_cents / 100


def _deduct_credits_cents(user: User, cents: int) -> float:
    """Deduct arbitrary credits amount. Returns cost in dollars."""
    user.phone_credits_cents = max(0, user.phone_credits_cents - cents)
    return cents / 100


def _webhook_base_url() -> str:
    """Return the base URL for webhooks."""
    return settings.hub_url


# ── NUMBER MANAGEMENT ──────────────────────────────────────────────────


@phone_router.get("/numbers")
async def get_numbers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PhoneNumber)
        .where(PhoneNumber.user_id == user.id)
        .order_by(PhoneNumber.created_at)
    )
    numbers = result.scalars().all()
    return {
        "numbers": [
            {
                "id": n.id,
                "number": n.number,
                "friendly_name": n.friendly_name,
                "number_type": n.number_type,
                "capabilities": json.loads(n.capabilities) if n.capabilities else [],
                "is_primary": n.is_primary,
                "forward_to": n.forward_to,
                "use_softphone": n.use_softphone,
                "monthly_cost": n.monthly_cost,
                "status": n.status,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in numbers
        ]
    }


@phone_router.get("/numbers/search")
async def search_numbers(
    area_code: str,
    user: User = Depends(get_current_user),
):
    numbers = await twilio_service.search_available_numbers(area_code, settings)
    return {
        "numbers": [
            {
                "phone_number": n.get("phone_number"),
                "friendly_name": n.get("friendly_name"),
                "locality": n.get("locality"),
                "region": n.get("region"),
                "capabilities": {
                    "voice": n.get("capabilities", {}).get("voice", False),
                    "sms": n.get("capabilities", {}).get("SMS", False),
                    "fax": n.get("capabilities", {}).get("fax", False),
                },
            }
            for n in numbers
        ]
    }


@phone_router.post("/numbers/purchase")
async def purchase_number(
    body: PurchaseNumberRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check if user has a subaccount; create one if not
    if not user.twilio_subaccount_sid:
        sub = await twilio_service.create_subaccount(
            f"REIHub-{user.id}-{user.email}", settings
        )
        user.twilio_subaccount_sid = sub["sid"]
        user.twilio_subaccount_auth_token = sub["auth_token"]
        await db.flush()

    # Check if this is first number (free) or additional ($2/mo)
    existing = await db.execute(
        select(func.count()).select_from(PhoneNumber).where(
            PhoneNumber.user_id == user.id
        )
    )
    count = existing.scalar() or 0
    is_primary = count == 0
    monthly_cost = 0.00 if is_primary else PHONE_PRICING["additional_number_per_month"]

    base = _webhook_base_url()
    voice_url = f"{base}/api/phone/webhook/voice"
    sms_url = f"{base}/api/phone/webhook/sms"
    fax_url = f"{base}/api/phone/webhook/fax"

    result = await twilio_service.purchase_number(
        body.phone_number,
        body.friendly_name,
        voice_url,
        sms_url,
        fax_url,
        user.twilio_subaccount_sid,
        settings,
    )

    capabilities = ["voice", "sms"]
    phone = PhoneNumber(
        user_id=user.id,
        number=body.phone_number,
        friendly_name=body.friendly_name,
        twilio_sid=result["sid"],
        number_type=body.number_type,
        capabilities=json.dumps(capabilities),
        is_primary=is_primary,
        monthly_cost=monthly_cost,
    )
    db.add(phone)

    # Initialize usage reset if first number
    if is_primary and not user.phone_usage_reset_at:
        user.phone_usage_reset_at = datetime.utcnow() + timedelta(days=30)

    await db.commit()
    return {"number": body.phone_number, "monthly_cost": monthly_cost, "id": phone.id}


@phone_router.delete("/numbers/{number_id}")
async def release_number(
    number_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.id == number_id, PhoneNumber.user_id == user.id
        )
    )
    phone = result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Number not found")

    # Cannot delete primary if only one exists
    if phone.is_primary:
        count_result = await db.execute(
            select(func.count()).select_from(PhoneNumber).where(
                PhoneNumber.user_id == user.id
            )
        )
        if (count_result.scalar() or 0) <= 1:
            raise HTTPException(
                status_code=400, detail="Cannot release your only phone number"
            )

    await twilio_service.release_number(
        phone.twilio_sid, user.twilio_subaccount_sid or settings.twilio_account_sid, settings
    )
    await db.delete(phone)
    await db.commit()
    return {"ok": True}


@phone_router.patch("/numbers/{number_id}")
async def update_number(
    number_id: str,
    body: UpdateNumberRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.id == number_id, PhoneNumber.user_id == user.id
        )
    )
    phone = result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Number not found")

    if body.friendly_name is not None:
        phone.friendly_name = body.friendly_name
    if body.forward_to is not None:
        phone.forward_to = body.forward_to
        phone.use_softphone = False
    if body.use_softphone is not None:
        phone.use_softphone = body.use_softphone
        if body.use_softphone:
            phone.forward_to = None

    await db.commit()
    return {"ok": True}


# ── SOFTPHONE TOKEN ───────────────────────────────────────────────────


@phone_router.get("/token")
async def get_softphone_token(
    user: User = Depends(get_current_user),
):
    identity = f"user-{user.id}"
    token = twilio_service.generate_access_token(identity, settings)
    return {"token": token, "identity": identity}


# ── POWER DIALER ──────────────────────────────────────────────────────


@phone_router.post("/dial")
async def dial(
    body: DialRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not _check_minutes(user):
        raise HTTPException(status_code=402, detail="No minutes available. Purchase credits.")

    # Get the phone number
    pn_result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.id == body.phone_number_id, PhoneNumber.user_id == user.id
        )
    )
    phone = pn_result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone number not found")

    base = _webhook_base_url()
    twiml_url = f"{base}/api/phone/webhook/voice"
    result = await twilio_service.make_call(
        phone.number,
        body.to_number,
        twiml_url,
        user.twilio_subaccount_sid or settings.twilio_account_sid,
        settings,
    )

    call_log = CallLog(
        user_id=user.id,
        contact_id=body.contact_id,
        phone_number_id=phone.id,
        twilio_call_sid=result["call_sid"],
        direction="outbound",
        from_number=phone.number,
        to_number=body.to_number,
        status="initiated",
        started_at=datetime.utcnow(),
    )
    db.add(call_log)
    await db.commit()
    return {"call_sid": result["call_sid"], "call_log_id": call_log.id}


@phone_router.post("/dialer/campaign")
async def start_dialer_campaign(
    body: DialerCampaignRequest,
    user: User = Depends(get_current_user),
):
    session_id = str(uuid.uuid4())
    _dialer_sessions[session_id] = {
        "user_id": user.id,
        "contact_ids": body.contact_ids,
        "phone_number_id": body.phone_number_id,
        "auto_connect": body.auto_connect,
        "current_index": 0,
        "status": "active",
    }
    return {"session_id": session_id, "total_contacts": len(body.contact_ids)}


@phone_router.post("/dialer/{session_id}/next")
async def dialer_next(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = _dialer_sessions.get(session_id)
    if not session or session["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Dialer session not found")

    if session["current_index"] >= len(session["contact_ids"]):
        return {"done": True, "message": "All contacts dialed"}

    contact_id = session["contact_ids"][session["current_index"]]
    session["current_index"] += 1

    # Dial the contact
    pn_result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.id == session["phone_number_id"],
            PhoneNumber.user_id == user.id,
        )
    )
    phone = pn_result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone number not found")

    return {
        "done": False,
        "contact_id": contact_id,
        "index": session["current_index"],
        "total": len(session["contact_ids"]),
    }


@phone_router.post("/dialer/{session_id}/disposition")
async def save_disposition(
    session_id: str,
    body: DispositionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = _dialer_sessions.get(session_id)
    if not session or session["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Dialer session not found")

    result = await db.execute(
        select(CallLog).where(
            CallLog.id == body.call_log_id, CallLog.user_id == user.id
        )
    )
    call_log = result.scalar_one_or_none()
    if call_log:
        call_log.disposition = body.disposition
        call_log.notes = body.notes

        # Auto-create callback task if disposition is "callback"
        if body.disposition == "callback":
            from rei.api.calendar_routes import auto_callback_task

            callback_time = datetime.utcnow() + timedelta(days=1)
            await auto_callback_task(
                db=db,
                user_id=user.id,
                contact_id=call_log.contact_id or "",
                call_log_id=call_log.id,
                scheduled_datetime=callback_time,
                notes=body.notes,
            )

        await db.commit()

    # Return next contact preview
    next_idx = session["current_index"]
    next_contact_id = None
    if next_idx < len(session["contact_ids"]):
        next_contact_id = session["contact_ids"][next_idx]

    return {"ok": True, "next_contact_id": next_contact_id}


# ── CALL LOGS ──────────────────────────────────────────────────────────


@phone_router.get("/calls")
async def get_calls(
    contact_id: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(CallLog).where(CallLog.user_id == user.id)
    if contact_id:
        stmt = stmt.where(CallLog.contact_id == contact_id)
    stmt = stmt.order_by(CallLog.created_at.desc())

    result = await db.execute(stmt)
    calls = result.scalars().all()
    return {
        "calls": [
            {
                "id": c.id,
                "contact_id": c.contact_id,
                "direction": c.direction,
                "from_number": c.from_number,
                "to_number": c.to_number,
                "status": c.status,
                "duration_seconds": c.duration_seconds,
                "recording_url": c.recording_url,
                "transcription": c.transcription,
                "disposition": c.disposition,
                "notes": c.notes,
                "cost": c.cost,
                "started_at": c.started_at.isoformat() if c.started_at else None,
                "ended_at": c.ended_at.isoformat() if c.ended_at else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in calls
        ]
    }


@phone_router.patch("/calls/{call_id}")
async def update_call(
    call_id: str,
    body: UpdateCallRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(CallLog).where(CallLog.id == call_id, CallLog.user_id == user.id)
    )
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")

    if body.disposition is not None:
        call.disposition = body.disposition
    if body.notes is not None:
        call.notes = body.notes
    await db.commit()
    return {"ok": True}


# ── SMS ────────────────────────────────────────────────────────────────


@phone_router.get("/sms/conversations")
async def get_sms_conversations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return unique contacts with SMS history, last message preview, unread count."""
    # Get the most recent message per contact-number pair
    result = await db.execute(
        select(SmsMessage)
        .where(SmsMessage.user_id == user.id)
        .order_by(SmsMessage.sent_at.desc())
    )
    messages = result.scalars().all()

    # Group by contact number (the other party)
    conversations: dict[str, dict] = {}
    for m in messages:
        other_number = m.to_number if m.direction == "outbound" else m.from_number
        if other_number not in conversations:
            conversations[other_number] = {
                "contact_id": m.contact_id,
                "contact_number": other_number,
                "last_message": m.body[:100] if m.body else "",
                "last_message_at": m.sent_at.isoformat() if m.sent_at else None,
                "direction": m.direction,
                "unread_count": 0,
            }

    return {"conversations": list(conversations.values())}


@phone_router.get("/sms/conversations/{contact_id}")
async def get_sms_thread(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SmsMessage)
        .where(SmsMessage.user_id == user.id, SmsMessage.contact_id == contact_id)
        .order_by(SmsMessage.sent_at.asc())
    )
    messages = result.scalars().all()
    return {
        "messages": [
            {
                "id": m.id,
                "direction": m.direction,
                "from_number": m.from_number,
                "to_number": m.to_number,
                "body": m.body,
                "status": m.status,
                "sent_at": m.sent_at.isoformat() if m.sent_at else None,
            }
            for m in messages
        ]
    }


@phone_router.post("/sms/send")
async def send_sms(
    body: SendSmsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not _check_sms(user):
        raise HTTPException(status_code=402, detail="No SMS available. Purchase credits.")

    pn_result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.id == body.phone_number_id, PhoneNumber.user_id == user.id
        )
    )
    phone = pn_result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone number not found")

    result = await twilio_service.send_sms(
        phone.number,
        body.to_number,
        body.body,
        user.twilio_subaccount_sid or settings.twilio_account_sid,
        settings,
    )

    cost = _deduct_sms(user)

    sms = SmsMessage(
        user_id=user.id,
        contact_id=body.contact_id,
        phone_number_id=phone.id,
        twilio_message_sid=result["message_sid"],
        direction="outbound",
        from_number=phone.number,
        to_number=body.to_number,
        body=body.body,
        status="sent",
        cost=cost,
    )
    db.add(sms)
    await db.commit()
    return {"message_sid": result["message_sid"]}


@phone_router.get("/sms/campaigns")
async def get_sms_campaigns(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SmsCampaign)
        .where(SmsCampaign.user_id == user.id)
        .order_by(SmsCampaign.created_at.desc())
    )
    campaigns = result.scalars().all()
    return {
        "campaigns": [
            {
                "id": c.id,
                "name": c.name,
                "status": c.status,
                "total_sent": c.total_sent,
                "total_delivered": c.total_delivered,
                "total_replied": c.total_replied,
                "total_opted_out": c.total_opted_out,
                "cost": c.cost,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in campaigns
        ]
    }


@phone_router.post("/sms/campaigns")
async def create_sms_campaign(
    body: CreateSmsCampaignRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = SmsCampaign(
        user_id=user.id,
        name=body.name,
        message_template=body.message_template,
        phone_number_id=body.phone_number_id,
        list_id=body.list_id,
    )
    if body.scheduled_at:
        campaign.scheduled_at = datetime.fromisoformat(body.scheduled_at)
    db.add(campaign)
    await db.commit()
    return {"id": campaign.id, "status": campaign.status}


@phone_router.post("/sms/campaigns/{campaign_id}/send")
async def send_sms_campaign(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SmsCampaign).where(
            SmsCampaign.id == campaign_id, SmsCampaign.user_id == user.id
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    campaign.status = "sending"
    campaign.sent_at = datetime.utcnow()
    await db.commit()

    # Actual sending would be handled by a background task
    return {"queued": 0, "estimated_cost": 0.00, "campaign_id": campaign.id}


# ── VOICEMAIL DROPS ───────────────────────────────────────────────────


@phone_router.get("/voicemail-drops")
async def get_voicemail_drops(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VoicemailDrop)
        .where(VoicemailDrop.user_id == user.id)
        .order_by(VoicemailDrop.created_at.desc())
    )
    drops = result.scalars().all()
    return {
        "drops": [
            {
                "id": d.id,
                "name": d.name,
                "drop_type": d.drop_type,
                "audio_url": d.audio_url,
                "script_template": d.script_template,
                "elevenlabs_voice_id": d.elevenlabs_voice_id,
                "is_ai_personalized": d.is_ai_personalized,
                "created_at": d.created_at.isoformat() if d.created_at else None,
            }
            for d in drops
        ]
    }


@phone_router.post("/voicemail-drops")
async def create_voicemail_drop(
    body: CreateVoicemailDropRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.drop_type == "ai_personalized":
        plan = getattr(user, "plan", "starter") or "starter"
        if plan not in AI_VOICEMAIL_PLANS:
            raise HTTPException(
                status_code=403,
                detail="AI Voicemail Drops require Pro or Team plan to unlock access. Drops are billed at $0.25/drop from credits.",
            )

    drop = VoicemailDrop(
        user_id=user.id,
        name=body.name,
        drop_type=body.drop_type,
        audio_url=body.audio_url,
        script_template=body.script_template,
        elevenlabs_voice_id=body.elevenlabs_voice_id,
        is_ai_personalized=body.drop_type == "ai_personalized",
    )
    db.add(drop)
    await db.commit()
    return {"id": drop.id, "name": drop.name, "drop_type": drop.drop_type}


@phone_router.delete("/voicemail-drops/{drop_id}")
async def delete_voicemail_drop(
    drop_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VoicemailDrop).where(
            VoicemailDrop.id == drop_id, VoicemailDrop.user_id == user.id
        )
    )
    drop = result.scalar_one_or_none()
    if not drop:
        raise HTTPException(status_code=404, detail="Voicemail drop not found")
    await db.delete(drop)
    await db.commit()
    return {"ok": True}


@phone_router.get("/voices")
async def get_voices(
    user: User = Depends(get_current_user),
):
    voices = await elevenlabs_service.get_voices(settings)
    return {"voices": voices}


@phone_router.post("/voicemail-drops/{drop_id}/preview")
async def preview_drop(
    drop_id: str,
    body: PreviewDropRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VoicemailDrop).where(
            VoicemailDrop.id == drop_id, VoicemailDrop.user_id == user.id
        )
    )
    drop = result.scalar_one_or_none()
    if not drop:
        raise HTTPException(status_code=404, detail="Voicemail drop not found")

    if drop.audio_url:
        return {"audio_url": drop.audio_url}

    if drop.is_ai_personalized and drop.script_template:
        contact_data = {
            "first_name": "John",
            "city": "Austin",
            "property_address": "123 Main St",
            "_subaccount_sid": user.twilio_subaccount_sid or settings.twilio_account_sid,
        }
        result = await elevenlabs_service.generate_personalized_voicemail(
            drop.script_template,
            contact_data,
            drop.elevenlabs_voice_id or "",
            settings,
        )
        return {"audio_url": result.get("audio_url"), "is_ai": result.get("is_ai", False)}

    return {"audio_url": None}


@phone_router.post("/voicemail-drops/campaign")
async def send_voicemail_campaign(
    body: VoicemailCampaignRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Fetch the drop
    drop_result = await db.execute(
        select(VoicemailDrop).where(
            VoicemailDrop.id == body.voicemail_drop_id, VoicemailDrop.user_id == user.id
        )
    )
    drop = drop_result.scalar_one_or_none()
    if not drop:
        raise HTTPException(status_code=404, detail="Voicemail drop not found")

    # AI voicemail plan check
    if drop.is_ai_personalized:
        plan = getattr(user, "plan", "starter") or "starter"
        if plan not in AI_VOICEMAIL_PLANS:
            raise HTTPException(
                status_code=403,
                detail="AI Voicemail Drops require Pro or Team plan to unlock access. Drops are billed at $0.25/drop from credits.",
            )

    pn_result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.id == body.phone_number_id, PhoneNumber.user_id == user.id
        )
    )
    phone = pn_result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone number not found")

    total_drops = len(body.contact_ids)
    ai_used = drop.is_ai_personalized
    if ai_used:
        cost_per_drop = PHONE_PRICING["ai_voicemail_drop"]
    else:
        cost_per_drop = PHONE_PRICING["voicemail_drop"]
    estimated_cost = total_drops * cost_per_drop
    total_cost_cents = int(estimated_cost * 100)

    if user.phone_credits_cents < total_cost_cents:
        raise HTTPException(status_code=402, detail="Insufficient credits for campaign")

    # Deduct credits
    _deduct_credits_cents(user, total_cost_cents)

    # Create campaign record
    campaign = VoicemailDropCampaign(
        user_id=user.id,
        name=body.name,
        voicemail_drop_id=drop.id,
        phone_number_id=phone.id,
        status="sending",
        total_sent=total_drops,
        cost=estimated_cost,
        sent_at=datetime.utcnow(),
    )
    db.add(campaign)
    await db.commit()

    # Actual drops would be processed in background
    return {
        "campaign_id": campaign.id,
        "total_drops": total_drops,
        "estimated_cost": estimated_cost,
        "ai_used": ai_used,
    }


# ── FAX ────────────────────────────────────────────────────────────────


@phone_router.get("/fax")
async def get_fax_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FaxLog)
        .where(FaxLog.user_id == user.id)
        .order_by(FaxLog.created_at.desc())
    )
    faxes = result.scalars().all()
    return {
        "faxes": [
            {
                "id": f.id,
                "direction": f.direction,
                "from_number": f.from_number,
                "to_number": f.to_number,
                "status": f.status,
                "pages": f.pages,
                "media_url": f.media_url,
                "contact_id": f.contact_id,
                "cost": f.cost,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in faxes
        ]
    }


@phone_router.post("/fax/send")
async def send_fax(
    body: SendFaxRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pn_result = await db.execute(
        select(PhoneNumber).where(
            PhoneNumber.id == body.from_number_id, PhoneNumber.user_id == user.id
        )
    )
    phone = pn_result.scalar_one_or_none()
    if not phone:
        raise HTTPException(status_code=404, detail="Phone number not found")

    # Charge minimum 1 page
    cost_per_page = PHONE_PRICING["fax_sent_per_page"]
    cost_cents = int(cost_per_page * 100)  # minimum 1 page
    if user.phone_credits_cents < cost_cents:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    result = await twilio_service.send_fax(
        phone.number,
        body.to_number,
        body.media_url,
        user.twilio_subaccount_sid or settings.twilio_account_sid,
        settings,
    )

    _deduct_credits_cents(user, cost_cents)

    fax = FaxLog(
        user_id=user.id,
        twilio_fax_sid=result["fax_sid"],
        direction="outbound",
        from_number=phone.number,
        to_number=body.to_number,
        status="queued",
        pages=1,
        media_url=body.media_url,
        contact_id=body.contact_id,
        cost=cost_per_page,
    )
    db.add(fax)
    await db.commit()
    return {"fax_sid": result["fax_sid"]}


# ── CREDITS ────────────────────────────────────────────────────────────


@phone_router.get("/credits")
async def get_credits(
    user: User = Depends(get_current_user),
):
    limits = _get_plan_limits(user)
    return {
        "credits_cents": user.phone_credits_cents,
        "credits_dollars": user.phone_credits_cents / 100,
        "credits_never_expire": True,
        "minutes_used": user.phone_minutes_used,
        "minutes_limit": limits["minutes"],
        "sms_used": user.phone_sms_used,
        "sms_limit": limits["sms"],
        "resets_at": user.phone_usage_reset_at.isoformat()
        if user.phone_usage_reset_at
        else None,
    }


@phone_router.post("/credits/purchase")
async def purchase_credits(
    body: PurchaseCreditsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    bundle = CREDIT_BUNDLES.get(body.bundle)
    if not bundle:
        raise HTTPException(status_code=400, detail="Invalid bundle name")

    # In production, create Stripe checkout session and handle via webhook
    # For now, simulate immediate purchase
    import stripe

    stripe.api_key = settings.stripe_secret_key

    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer. Complete billing setup first.")

    checkout_session = stripe.checkout.Session.create(
        customer=user.stripe_customer_id,
        payment_method_types=["card"],
        line_items=[
            {
                "price_data": {
                    "currency": "usd",
                    "unit_amount": bundle["price_cents"],
                    "product_data": {
                        "name": f"Phone Credits - {body.bundle.title()} Pack",
                    },
                },
                "quantity": 1,
            }
        ],
        mode="payment",
        success_url=f"{settings.hub_url}/phone?tab=credits&success=true",
        cancel_url=f"{settings.hub_url}/phone?tab=credits&cancelled=true",
        metadata={
            "type": "phone_credits",
            "bundle": body.bundle,
            "user_id": str(user.id),
            "credits_cents": str(bundle["credits_cents"]),
        },
    )

    return {"checkout_url": checkout_session.url}


# ── WEBHOOKS (no auth required) ───────────────────────────────────────


@phone_router.post("/webhook/voice")
async def webhook_voice(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle inbound voice calls from Twilio."""
    form = await request.form()
    called = form.get("Called", "")
    caller = form.get("Caller", "")
    call_sid = form.get("CallSid", "")

    # Look up phone number
    result = await db.execute(
        select(PhoneNumber).where(PhoneNumber.number == called)
    )
    phone = result.scalar_one_or_none()

    if not phone:
        twiml = twilio_service.generate_voicemail_twiml()
        return Response(content=twiml, media_type="application/xml")

    # Create inbound call log
    call_log = CallLog(
        user_id=phone.user_id,
        phone_number_id=phone.id,
        twilio_call_sid=call_sid,
        direction="inbound",
        from_number=caller,
        to_number=called,
        status="ringing",
        started_at=datetime.utcnow(),
    )
    db.add(call_log)
    await db.commit()

    if phone.use_softphone:
        identity = f"user-{phone.user_id}"
        twiml = twilio_service.generate_softphone_twiml(identity)
    elif phone.forward_to:
        twiml = twilio_service.generate_forward_twiml(phone.forward_to)
    else:
        twiml = twilio_service.generate_voicemail_twiml()

    return Response(content=twiml, media_type="application/xml")


@phone_router.post("/webhook/call-status")
async def webhook_call_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle call status updates from Twilio."""
    form = await request.form()
    call_sid = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    duration = form.get("CallDuration", "0")

    result = await db.execute(
        select(CallLog).where(CallLog.twilio_call_sid == call_sid)
    )
    call_log = result.scalar_one_or_none()
    if not call_log:
        return {"ok": True}

    call_log.status = call_status
    call_log.duration_seconds = int(duration)

    if call_status == "completed":
        call_log.ended_at = datetime.utcnow()
        # Calculate cost
        minutes = math.ceil(int(duration) / 60)
        # Fetch user to deduct
        user_result = await db.execute(
            select(User).where(User.id == call_log.user_id)
        )
        user = user_result.scalar_one_or_none()
        if user and minutes > 0:
            cost = _deduct_minutes(user, minutes)
            call_log.cost = cost

    await db.commit()
    return {"ok": True}


@phone_router.post("/webhook/sms")
async def webhook_sms(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle inbound SMS from Twilio."""
    form = await request.form()
    message_sid = form.get("MessageSid", "")
    from_number = form.get("From", "")
    to_number = form.get("To", "")
    body_text = form.get("Body", "")

    # Look up phone number
    result = await db.execute(
        select(PhoneNumber).where(PhoneNumber.number == to_number)
    )
    phone = result.scalar_one_or_none()
    if not phone:
        return Response(content="<Response/>", media_type="application/xml")

    sms = SmsMessage(
        user_id=phone.user_id,
        phone_number_id=phone.id,
        twilio_message_sid=message_sid,
        direction="inbound",
        from_number=from_number,
        to_number=to_number,
        body=body_text,
        status="received",
        cost=0.00,  # inbound is free
    )
    db.add(sms)
    await db.commit()

    return Response(content="<Response/>", media_type="application/xml")


@phone_router.post("/webhook/fax")
async def webhook_fax(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle inbound fax notification from Twilio."""
    form = await request.form()
    fax_sid = form.get("FaxSid", "")
    from_number = form.get("From", "")
    to_number = form.get("To", "")
    pages = int(form.get("NumPages", "0"))
    media_url = form.get("MediaUrl", "")
    fax_status = form.get("FaxStatus", "received")

    # Look up phone number
    result = await db.execute(
        select(PhoneNumber).where(PhoneNumber.number == to_number)
    )
    phone = result.scalar_one_or_none()
    if not phone:
        return {"ok": True}

    cost_per_page = PHONE_PRICING["fax_received_per_page"]
    total_cost = pages * cost_per_page
    cost_cents = int(total_cost * 100)

    # Deduct credits
    user_result = await db.execute(
        select(User).where(User.id == phone.user_id)
    )
    user = user_result.scalar_one_or_none()
    if user:
        _deduct_credits_cents(user, cost_cents)

    fax = FaxLog(
        user_id=phone.user_id,
        twilio_fax_sid=fax_sid,
        direction="inbound",
        from_number=from_number,
        to_number=to_number,
        status=fax_status,
        pages=pages,
        media_url=media_url,
        cost=total_cost,
    )
    db.add(fax)
    await db.commit()
    return {"ok": True}


@phone_router.post("/webhook/recording")
async def webhook_recording(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle recording URL after call ends."""
    form = await request.form()
    call_sid = form.get("CallSid", "")
    recording_url = form.get("RecordingUrl", "")
    recording_sid = form.get("RecordingSid", "")

    result = await db.execute(
        select(CallLog).where(CallLog.twilio_call_sid == call_sid)
    )
    call_log = result.scalar_one_or_none()
    if call_log:
        call_log.recording_url = recording_url
        call_log.recording_sid = recording_sid
        await db.commit()

    return {"ok": True}


@phone_router.post("/webhook/transcription")
async def webhook_transcription(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle voicemail transcription from Twilio."""
    form = await request.form()
    call_sid = form.get("CallSid", "")
    transcription_text = form.get("TranscriptionText", "")

    result = await db.execute(
        select(CallLog).where(CallLog.twilio_call_sid == call_sid)
    )
    call_log = result.scalar_one_or_none()
    if call_log:
        call_log.transcription = transcription_text
        await db.commit()

    return {"ok": True}
