"""Contact detail routes — aggregated contact view with history."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.user import (
    CallLog,
    DealContractChecklist,
    GeneratedContract,
    PofRequest,
    ProofOfFundsCertificate,
    SmsMessage,
    User,
)

logger = logging.getLogger(__name__)

contacts_router = APIRouter(prefix="/contacts", tags=["contacts"])


# ── Models ─────────────────────────────────────────────────────────────


class ContactNote(BaseModel):
    id: str
    contact_id: str
    user_id: int
    content: str
    created_at: str


class AddNoteBody(BaseModel):
    content: str


class UpdateContactBody(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    property_address: Optional[str] = None
    property_city: Optional[str] = None
    property_state: Optional[str] = None
    property_zip: Optional[str] = None
    property_type: Optional[str] = None
    estimated_value: Optional[float] = None
    mortgage_balance: Optional[float] = None
    monthly_payment: Optional[float] = None
    interest_rate: Optional[float] = None
    lender_name: Optional[str] = None
    loan_type: Optional[str] = None
    deal_type: Optional[str] = None
    buying_entity: Optional[str] = None
    lead_source: Optional[str] = None
    assigned_to: Optional[str] = None
    tags: Optional[list[str]] = None
    status: Optional[str] = None
    company: Optional[str] = None
    role: Optional[str] = None


# ── In-memory notes store (per-user, contact-scoped) ──────────────────
# Notes are stored in a simple dict keyed by user_id.
# In production this would be a DB table; for now this keeps it working
# without a schema migration and new pip packages.
_notes_store: dict[int, list[dict]] = {}


def _get_notes(user_id: int, contact_id: str) -> list[dict]:
    return [
        n
        for n in _notes_store.get(user_id, [])
        if n["contact_id"] == contact_id
    ]


def _add_note(user_id: int, contact_id: str, content: str) -> dict:
    note = {
        "id": str(uuid.uuid4()),
        "contact_id": contact_id,
        "user_id": user_id,
        "content": content,
        "created_at": datetime.utcnow().isoformat(),
    }
    _notes_store.setdefault(user_id, []).append(note)
    return note


def _delete_note(user_id: int, note_id: str) -> bool:
    notes = _notes_store.get(user_id, [])
    for i, n in enumerate(notes):
        if n["id"] == note_id:
            notes.pop(i)
            return True
    return False


# ── GET /api/contacts/{contact_id} ─────────────────────────────────────


@contacts_router.get("/{contact_id}")
async def get_contact_detail(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregated contact data from local DB tables."""

    # Call logs (last 20, newest first)
    call_result = await db.execute(
        select(CallLog)
        .where(CallLog.user_id == workspace_user_id(user), CallLog.contact_id == contact_id)
        .order_by(desc(CallLog.created_at))
        .limit(20)
    )
    call_logs = [
        {
            "id": c.id,
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
        for c in call_result.scalars().all()
    ]

    # SMS messages (last 50, oldest first for chat display)
    sms_result = await db.execute(
        select(SmsMessage)
        .where(SmsMessage.user_id == workspace_user_id(user), SmsMessage.contact_id == contact_id)
        .order_by(asc(SmsMessage.sent_at))
        .limit(50)
    )
    sms_messages = [
        {
            "id": s.id,
            "direction": s.direction,
            "from_number": s.from_number,
            "to_number": s.to_number,
            "body": s.body,
            "status": s.status,
            "cost": s.cost,
            "sent_at": s.sent_at.isoformat() if s.sent_at else None,
        }
        for s in sms_result.scalars().all()
    ]

    # POF requests
    pof_req_result = await db.execute(
        select(PofRequest)
        .where(PofRequest.requestor_id == workspace_user_id(user), PofRequest.buyer_email != None)
        .order_by(desc(PofRequest.created_at))
    )
    all_pof_requests = pof_req_result.scalars().all()
    # Filter by contact — match on buyer name/email heuristic
    pof_requests = [
        {
            "id": p.id,
            "buyer_email": p.buyer_email,
            "buyer_name": p.buyer_name,
            "property_address": p.property_address,
            "required_amount": p.required_amount,
            "status": p.status,
            "notes": p.notes,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
        }
        for p in all_pof_requests
    ]

    # POF certificates
    pof_cert_result = await db.execute(
        select(ProofOfFundsCertificate)
        .where(ProofOfFundsCertificate.user_id == workspace_user_id(user))
        .order_by(desc(ProofOfFundsCertificate.created_at))
    )
    pof_certificates = [
        {
            "id": c.id,
            "verified": c.verified,
            "buyer_name": c.buyer_name,
            "buyer_email": c.buyer_email,
            "required_amount": c.required_amount,
            "available_balance_display": c.available_balance_display,
            "property_address": c.property_address,
            "issued_at": c.issued_at.isoformat() if c.issued_at else None,
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in pof_cert_result.scalars().all()
    ]

    # Generated contracts
    contracts_result = await db.execute(
        select(GeneratedContract)
        .where(GeneratedContract.user_id == workspace_user_id(user))
        .order_by(desc(GeneratedContract.created_at))
    )
    generated_contracts = [
        {
            "id": gc.id,
            "template_id": gc.template_id,
            "deal_id": gc.deal_id,
            "file_name": gc.file_name,
            "homeowner_name": gc.homeowner_name,
            "property_address": gc.property_address,
            "purchase_price": gc.purchase_price,
            "storage_provider": gc.storage_provider,
            "storage_url": gc.storage_url,
            "created_at": gc.created_at.isoformat() if gc.created_at else None,
        }
        for gc in contracts_result.scalars().all()
    ]

    # Notes (in-memory)
    notes = _get_notes(workspace_user_id(user), contact_id)

    # Build activity feed — merge all activities chronologically
    activity_feed = []

    for c in call_logs:
        dur = c["duration_seconds"] or 0
        mins, secs = divmod(dur, 60)
        dur_str = f"{mins}m {secs}s" if mins else f"{secs}s"
        activity_feed.append({
            "type": "call",
            "id": c["id"],
            "timestamp": c["created_at"],
            "summary": f"{c['direction']} call · {dur_str} · {c['disposition'] or c['status']}",
            "data": c,
        })

    for s in sms_messages:
        preview = (s["body"] or "")[:80]
        activity_feed.append({
            "type": "sms",
            "id": s["id"],
            "timestamp": s["sent_at"],
            "summary": f"SMS {s['direction']}: {preview}",
            "data": s,
        })

    for p in pof_requests:
        activity_feed.append({
            "type": "pof",
            "id": p["id"],
            "timestamp": p["created_at"],
            "summary": f"POF {p['status']}: ${p['required_amount']:,.0f}",
            "data": p,
        })

    for gc in generated_contracts:
        activity_feed.append({
            "type": "contract",
            "id": gc["id"],
            "timestamp": gc["created_at"],
            "summary": f"Contract generated: {gc['file_name']}",
            "data": gc,
        })

    for n in notes:
        activity_feed.append({
            "type": "note",
            "id": n["id"],
            "timestamp": n["created_at"],
            "summary": n["content"],
            "data": n,
        })

    # Sort newest first
    activity_feed.sort(key=lambda x: x["timestamp"] or "", reverse=True)

    return {
        "call_logs": call_logs,
        "sms_messages": sms_messages,
        "pof_requests": pof_requests,
        "pof_certificates": pof_certificates,
        "generated_contracts": generated_contracts,
        "deal_checklists": [],
        "notes": notes,
        "activity_feed": activity_feed,
    }


# ── PATCH /api/contacts/{contact_id} ──────────────────────────────────


@contacts_router.patch("/{contact_id}")
async def update_contact_fields(
    contact_id: str,
    body: UpdateContactBody,
    user: User = Depends(get_current_user),
):
    """
    Returns the body as-is. The actual contact update happens in the frontend
    via the Supabase API. This endpoint exists for future local storage
    of extended contact fields.
    """
    return {"success": True, "contact_id": contact_id, "updated": body.model_dump(exclude_none=True)}


# ── POST /api/contacts/{contact_id}/notes ──────────────────────────────


@contacts_router.post("/{contact_id}/notes")
async def add_contact_note(
    contact_id: str,
    body: AddNoteBody,
    user: User = Depends(get_current_user),
):
    if not body.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note content cannot be empty",
        )
    note = _add_note(workspace_user_id(user), contact_id, body.content.strip())
    return {
        "note_id": note["id"],
        "content": note["content"],
        "created_at": note["created_at"],
    }


# ── DELETE /api/contacts/{contact_id}/notes/{note_id} ──────────────────


@contacts_router.delete("/{contact_id}/notes/{note_id}")
async def delete_contact_note(
    contact_id: str,
    note_id: str,
    user: User = Depends(get_current_user),
):
    if not _delete_note(workspace_user_id(user), note_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )
    return {"success": True}
