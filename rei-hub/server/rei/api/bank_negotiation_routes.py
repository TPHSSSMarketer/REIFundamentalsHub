"""Bank negotiation API routes — certified mail & fax tracking pipeline."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import get_settings, Settings
from rei.database import async_session_factory
from rei.models.user import (
    BankNegotiation,
    NegotiationCorrespondence,
    NegotiationDocument,
    NegotiationFollowUp,
    NegotiationRecipient,
    Task,
    User,
)
from rei.services.security import (
    sanitize_text,
    sanitize_email,
    sanitize_phone,
    sanitize_currency,
    sanitize_state_code,
    sanitize_url,
    check_rate_limit,
    rl_key,
    rl_ip_key,
    audit_log,
)
from rei.services.contact_research import (
    format_recipient_for_display,
    research_bank_contacts,
    research_single_recipient,
)
from rei.services.tenant_config import get_gdrive_negotiation_path
from rei.services.twilio_fax import send_fax_to_recipient, update_fax_status
from rei.services.usps_tracking import update_correspondence_tracking

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/negotiations", tags=["bank_negotiations"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class NegotiationCreate(BaseModel):
    property_address: str
    property_city: str
    property_state: str
    property_zip: str
    bank_name: str
    loan_number: Optional[str] = None
    loan_balance: Optional[float] = None
    negotiation_type: str = "short_sale"
    our_offer: Optional[float] = None
    target_outcome: Optional[str] = None
    land_trust_id: Optional[str] = None
    notes: Optional[str] = None


class NegotiationUpdate(BaseModel):
    property_address: Optional[str] = None
    property_city: Optional[str] = None
    property_state: Optional[str] = None
    property_zip: Optional[str] = None
    bank_name: Optional[str] = None
    loan_number: Optional[str] = None
    loan_balance: Optional[float] = None
    negotiation_type: Optional[str] = None
    our_offer: Optional[float] = None
    target_outcome: Optional[str] = None
    status: Optional[str] = None
    admin_notes: Optional[str] = None
    notes: Optional[str] = None


class RecipientUpdate(BaseModel):
    name: Optional[str] = None
    title: Optional[str] = None
    mailing_address: Optional[str] = None
    mailing_city: Optional[str] = None
    mailing_state: Optional[str] = None
    mailing_zip: Optional[str] = None
    phone: Optional[str] = None
    fax: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class DocumentCreate(BaseModel):
    document_type: str
    document_name: str
    gdrive_url: Optional[str] = None
    gdrive_file_id: Optional[str] = None
    notes: Optional[str] = None


class DocumentUpdate(BaseModel):
    document_type: Optional[str] = None
    document_name: Optional[str] = None
    gdrive_url: Optional[str] = None
    gdrive_file_id: Optional[str] = None
    notes: Optional[str] = None


class SendCorrespondence(BaseModel):
    document_id: str
    send_methods: list[str]  # ["certified_mail", "fax"]
    letter_number: int = 1  # 1, 2, or 3
    letter_type: str = "initial"  # initial, followup, final_demand
    usps_tracking_numbers: Optional[dict[str, str]] = None
    usps_signature_tracking_numbers: Optional[dict[str, str]] = None
    fax_media_url: Optional[str] = None


class FollowUpComplete(BaseModel):
    completed_notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Auth dependency — bank negotiation gatekeeper
# ---------------------------------------------------------------------------


async def get_current_user_with_banking(
    user: User = Depends(get_current_user),
) -> User:
    """Require bank_negotiation_enabled or is_superadmin."""
    if user.is_superadmin or user.bank_negotiation_enabled:
        return user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bank negotiation is not enabled for your account.",
    )


# ---------------------------------------------------------------------------
# Background task helpers
# ---------------------------------------------------------------------------


async def _bg_research_bank_contacts(
    bank_name: str,
    property_state: str,
    negotiation_id: str,
    user_id: int,
) -> None:
    """Run contact research in background with its own DB session."""
    settings = get_settings()
    async with async_session_factory() as db:
        try:
            results = await research_bank_contacts(
                bank_name=bank_name,
                state=property_state,
                negotiation_id=negotiation_id,
                user_id=user_id,
                db=db,
                settings=settings,
            )

            for res in results:
                recipient = NegotiationRecipient(
                    negotiation_id=negotiation_id,
                    user_id=user_id,
                    recipient_type=res.get("recipient_type", ""),
                    name=res.get("name"),
                    title=res.get("title"),
                    mailing_address=res.get("mailing_address"),
                    mailing_city=res.get("mailing_city"),
                    mailing_state=res.get("mailing_state"),
                    mailing_zip=res.get("mailing_zip"),
                    phone=res.get("phone"),
                    fax=res.get("fax"),
                    email=res.get("email"),
                    ai_researched=True,
                    ai_researched_at=datetime.utcnow(),
                    ai_research_provider="nvidia_aiq",
                    ai_confidence=res.get("confidence", "low"),
                    ai_sources=json.dumps(res.get("sources", [])),
                )
                db.add(recipient)

            await db.commit()
            logger.info(
                "Contact research complete for negotiation %s — %d recipients created",
                negotiation_id,
                len(results),
            )
        except Exception:
            logger.exception(
                "Background contact research failed for negotiation %s",
                negotiation_id,
            )


async def _bg_refresh_single_recipient(
    bank_name: str,
    property_state: str,
    recipient_id: str,
    recipient_type: str,
    user_id: int,
) -> None:
    """Refresh AI research for a single recipient."""
    settings = get_settings()
    async with async_session_factory() as db:
        try:
            result = await research_single_recipient(
                bank_name=bank_name,
                state=property_state,
                recipient_type=recipient_type,
                user_id=user_id,
                db=db,
                settings=settings,
            )

            rec_result = await db.execute(
                select(NegotiationRecipient).where(
                    NegotiationRecipient.id == recipient_id
                )
            )
            recipient = rec_result.scalar_one_or_none()
            if recipient:
                recipient.name = result.get("name")
                recipient.title = result.get("title")
                recipient.mailing_address = result.get("mailing_address")
                recipient.mailing_city = result.get("mailing_city")
                recipient.mailing_state = result.get("mailing_state")
                recipient.mailing_zip = result.get("mailing_zip")
                recipient.phone = result.get("phone")
                recipient.fax = result.get("fax")
                recipient.email = result.get("email")
                recipient.ai_researched = True
                recipient.ai_researched_at = datetime.utcnow()
                recipient.ai_confidence = result.get("confidence", "low")
                recipient.ai_sources = json.dumps(result.get("sources", []))
                recipient.updated_at = datetime.utcnow()
                await db.commit()

            logger.info("Recipient %s research refreshed", recipient_id)
        except Exception:
            logger.exception(
                "Background recipient refresh failed for %s", recipient_id
            )


# ---------------------------------------------------------------------------
# Helper: ownership check
# ---------------------------------------------------------------------------


async def _get_negotiation_or_404(
    neg_id: str,
    user: User,
    db: AsyncSession,
) -> BankNegotiation:
    """Fetch negotiation by ID with ownership check."""
    result = await db.execute(
        select(BankNegotiation).where(BankNegotiation.id == neg_id)
    )
    negotiation = result.scalar_one_or_none()
    if not negotiation:
        raise HTTPException(status_code=404, detail="Negotiation not found")
    if not user.is_superadmin and negotiation.user_id != workspace_user_id(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    return negotiation


# ---------------------------------------------------------------------------
# NEGOTIATION ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("")
async def list_negotiations(
    status_filter: Optional[str] = Query(None, alias="status"),
    negotiation_type: Optional[str] = Query(None),
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """List negotiations. Superadmins see all; regular users see their own."""
    stmt = select(BankNegotiation)

    if not user.is_superadmin:
        stmt = stmt.where(BankNegotiation.user_id == workspace_user_id(user))

    if status_filter:
        stmt = stmt.where(BankNegotiation.status == status_filter)
    if negotiation_type:
        stmt = stmt.where(BankNegotiation.negotiation_type == negotiation_type)

    stmt = stmt.order_by(BankNegotiation.created_at.desc())
    result = await db.execute(stmt)
    negotiations = result.scalars().all()

    items = []
    for n in negotiations:
        # Recipient count
        rec_result = await db.execute(
            select(func.count()).where(
                NegotiationRecipient.negotiation_id == n.id
            )
        )
        recipient_count = rec_result.scalar() or 0

        # Last correspondence date
        corr_result = await db.execute(
            select(NegotiationCorrespondence.sent_date)
            .where(NegotiationCorrespondence.negotiation_id == n.id)
            .order_by(NegotiationCorrespondence.sent_date.desc())
            .limit(1)
        )
        last_corr = corr_result.scalar_one_or_none()

        items.append({
            "id": n.id,
            "user_id": n.user_id,
            "property_address": n.property_address,
            "property_city": n.property_city,
            "property_state": n.property_state,
            "property_zip": n.property_zip,
            "bank_name": n.bank_name,
            "loan_number": n.loan_number,
            "loan_balance": n.loan_balance,
            "negotiation_type": n.negotiation_type,
            "our_offer": n.our_offer,
            "status": n.status,
            "next_followup_date": (
                n.next_followup_date.isoformat() if n.next_followup_date else None
            ),
            "recipient_count": recipient_count,
            "last_correspondence_date": (
                last_corr.isoformat() if last_corr else None
            ),
            "created_at": n.created_at.isoformat() if n.created_at else None,
        })

    return items


async def _build_lender_summary(
    negotiation: BankNegotiation,
    db: AsyncSession,
) -> dict:
    """Build a lender summary dict for a single negotiation.

    Used by both /by-property and /for-deal endpoints.
    """
    # Last correspondence (most recent sent_date)
    corr_result = await db.execute(
        select(NegotiationCorrespondence.sent_date)
        .where(NegotiationCorrespondence.negotiation_id == negotiation.id)
        .order_by(NegotiationCorrespondence.sent_date.desc())
        .limit(1)
    )
    last_sent = corr_result.scalar_one_or_none()

    # Recipients where ai_confidence is not null
    researched_result = await db.execute(
        select(func.count()).where(
            NegotiationRecipient.negotiation_id == negotiation.id,
            NegotiationRecipient.ai_confidence.isnot(None),
        )
    )
    recipients_researched = researched_result.scalar() or 0

    # Delivery summary — letters delivered vs sent
    sent_result = await db.execute(
        select(func.count()).where(
            NegotiationCorrespondence.negotiation_id == negotiation.id,
        )
    )
    letters_sent = sent_result.scalar() or 0

    delivered_result = await db.execute(
        select(func.count()).where(
            NegotiationCorrespondence.negotiation_id == negotiation.id,
            NegotiationCorrespondence.usps_status == "delivered",
        )
    )
    letters_delivered = delivered_result.scalar() or 0

    return {
        "id": negotiation.id,
        "bank_name": negotiation.bank_name,
        "loan_number": negotiation.loan_number,
        "loan_balance": negotiation.loan_balance,
        "negotiation_type": negotiation.negotiation_type,
        "status": negotiation.status,
        "created_at": (
            negotiation.created_at.isoformat()
            if negotiation.created_at else None
        ),
        "last_letter_sent_date": (
            last_sent.isoformat() if last_sent else None
        ),
        "next_followup_date": (
            negotiation.next_followup_date.isoformat()
            if negotiation.next_followup_date else None
        ),
        "recipients_researched": recipients_researched,
        "letters_delivered": letters_delivered,
        "letters_sent": letters_sent,
    }


@router.get("/by-property")
async def list_negotiations_by_property(
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Group all user's negotiations by property address."""
    stmt = (
        select(BankNegotiation)
        .where(BankNegotiation.user_id == workspace_user_id(user))
        .order_by(
            BankNegotiation.property_address.asc(),
            BankNegotiation.created_at.desc(),
        )
    )
    result = await db.execute(stmt)
    negotiations = result.scalars().all()

    # Group by property_address
    from collections import OrderedDict

    grouped: dict[str, list[BankNegotiation]] = OrderedDict()
    for n in negotiations:
        grouped.setdefault(n.property_address, []).append(n)

    properties = []
    for addr, negs in grouped.items():
        first = negs[0]
        lenders = []
        total_balance = 0.0
        active_count = 0
        approved_count = 0
        denied_count = 0

        for n in negs:
            lender = await _build_lender_summary(n, db)
            lenders.append(lender)

            balance = n.loan_balance or 0.0
            total_balance += balance

            if n.status == "active":
                active_count += 1
            elif n.status == "approved":
                approved_count += 1
            elif n.status == "denied":
                denied_count += 1

        properties.append({
            "property_address": addr,
            "property_city": first.property_city,
            "property_state": first.property_state,
            "property_zip": first.property_zip,
            "lenders": lenders,
            "total_lenders": len(negs),
            "active_lenders": active_count,
            "approved_lenders": approved_count,
            "denied_lenders": denied_count,
            "total_balance": round(total_balance, 2),
        })

    return properties


@router.get("/for-deal")
async def get_negotiations_for_deal(
    property_address: str = Query(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return lender negotiations for a property address (CRM integration).

    If bank_negotiation_enabled is False for the user, returns an empty
    lenders array instead of 403 — the CRM always calls this endpoint.
    """
    if not user.is_superadmin and not user.bank_negotiation_enabled:
        return {
            "property_address": property_address,
            "bank_negotiation_enabled": False,
            "lenders": [],
            "summary": {
                "total": 0,
                "active": 0,
                "approved": 0,
                "denied": 0,
                "pending_followups": 0,
            },
        }

    stmt = (
        select(BankNegotiation)
        .where(
            BankNegotiation.user_id == workspace_user_id(user),
            BankNegotiation.property_address == property_address,
        )
        .order_by(BankNegotiation.created_at.desc())
    )
    result = await db.execute(stmt)
    negotiations = result.scalars().all()

    lenders = []
    active_count = 0
    approved_count = 0
    denied_count = 0
    pending_followups = 0

    for n in negotiations:
        lender = await _build_lender_summary(n, db)
        lenders.append(lender)

        if n.status == "active":
            active_count += 1
        elif n.status == "approved":
            approved_count += 1
        elif n.status == "denied":
            denied_count += 1

        if n.next_followup_date and n.next_followup_date >= datetime.utcnow():
            pending_followups += 1

    return {
        "property_address": property_address,
        "bank_negotiation_enabled": True,
        "lenders": lenders,
        "summary": {
            "total": len(negotiations),
            "active": active_count,
            "approved": approved_count,
            "denied": denied_count,
            "pending_followups": pending_followups,
        },
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_negotiation(
    body: NegotiationCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Create a new bank negotiation and trigger background contact research."""
    # Rate limit: 20 per hour per user
    if not check_rate_limit(rl_key(user.id, "create_negotiation"), max_requests=20, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")

    # Sanitize inputs
    try:
        bank_name = sanitize_text(body.bank_name, 200)
        property_address = sanitize_text(body.property_address, 300)
        property_city = sanitize_text(body.property_city, 100)
        property_state = sanitize_state_code(body.property_state)
        property_zip = sanitize_text(body.property_zip, 10)
        loan_number = sanitize_text(body.loan_number, 50) if body.loan_number else body.loan_number
        loan_balance = sanitize_currency(body.loan_balance) if body.loan_balance else None
        notes = sanitize_text(body.notes, 1000) if body.notes else body.notes
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    negotiation = BankNegotiation(
        user_id=workspace_user_id(user),
        property_address=property_address,
        property_city=property_city,
        property_state=property_state,
        property_zip=property_zip,
        bank_name=bank_name,
        loan_number=loan_number,
        loan_balance=loan_balance,
        negotiation_type=body.negotiation_type,
        our_offer=body.our_offer,
        target_outcome=body.target_outcome,
        land_trust_id=body.land_trust_id,
        notes=notes,
        status="active",
        next_followup_date=datetime.utcnow() + timedelta(days=30),
    )

    db.add(negotiation)
    await db.commit()
    await db.refresh(negotiation)

    # Trigger background AI contact research
    background_tasks.add_task(
        _bg_research_bank_contacts,
        bank_name,
        property_state,
        negotiation.id,
        workspace_user_id(user),
    )

    # Create Google Drive folder structure (log only; actual creation deferred)
    folder_base = get_gdrive_negotiation_path(
        user, property_address, bank_name
    )
    subfolders = [
        f"{folder_base}/Documents",
        f"{folder_base}/Certified Mail",
        f"{folder_base}/Bank Correspondence",
        f"{folder_base}/Statements",
    ]
    negotiation.gdrive_folder_id = folder_base
    await db.commit()
    logger.info(
        "GDrive folder structure planned for negotiation %s: %s",
        negotiation.id,
        subfolders,
    )

    # Create initial follow-up task
    followup_task = Task(
        user_id=workspace_user_id(user),
        title=(
            f"Follow up on {bank_name} negotiation "
            f"- {property_address}"
        ),
        due_date=datetime.utcnow() + timedelta(days=30),
        priority="high",
        task_type="manual",
        status="pending",
    )
    db.add(followup_task)
    await db.commit()

    # Audit log
    try:
        await db.run_sync(lambda s: audit_log(
            s, action="create_negotiation", user_id=user.id, user_email=user.email,
            ip_address=request.client.host, resource_type="bank_negotiation",
            resource_id=negotiation.id,
            details={"bank": bank_name, "address": property_address, "type": body.negotiation_type},
        ))
    except Exception:
        pass

    return {
        "negotiation": _serialize_negotiation(negotiation),
        "message": "Created. AI is researching bank contacts in the background.",
    }


@router.get("/{neg_id}")
async def get_negotiation(
    neg_id: str,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Full negotiation detail with recipients, documents, correspondence, and letter series status."""
    negotiation = await _get_negotiation_or_404(neg_id, user, db)

    # Recipients
    rec_result = await db.execute(
        select(NegotiationRecipient).where(
            NegotiationRecipient.negotiation_id == neg_id
        )
    )
    recipients = rec_result.scalars().all()

    # Documents
    doc_result = await db.execute(
        select(NegotiationDocument).where(
            NegotiationDocument.negotiation_id == neg_id
        )
    )
    documents = doc_result.scalars().all()

    # Correspondence
    corr_result = await db.execute(
        select(NegotiationCorrespondence)
        .where(NegotiationCorrespondence.negotiation_id == neg_id)
        .order_by(NegotiationCorrespondence.sent_date.desc())
    )
    correspondence = corr_result.scalars().all()

    # Pending follow-ups
    fu_result = await db.execute(
        select(NegotiationFollowUp).where(
            NegotiationFollowUp.negotiation_id == neg_id,
            NegotiationFollowUp.completed.is_(False),
        )
    )
    pending_followups = fu_result.scalars().all()

    # USPS status summary
    delivered_count = 0
    in_transit_count = 0
    total_count = 0
    for c in correspondence:
        if c.usps_tracking_number:
            total_count += 1
            if c.usps_status == "delivered":
                delivered_count += 1
            elif c.usps_status in ("in_transit", "attempted"):
                in_transit_count += 1

    # Letter series status
    letter_series_status = _build_letter_series_status(correspondence)

    # Audit log
    try:
        await db.run_sync(lambda s: audit_log(
            s, action="view_negotiation", user_id=user.id, user_email=user.email,
            resource_type="bank_negotiation", resource_id=neg_id,
        ))
    except Exception:
        pass

    return {
        "negotiation": _serialize_negotiation(negotiation),
        "recipients": [format_recipient_for_display(r) for r in recipients],
        "documents": [_serialize_document(d) for d in documents],
        "correspondence": [_serialize_correspondence(c) for c in correspondence],
        "pending_followups": [_serialize_followup(f) for f in pending_followups],
        "usps_status_summary": {
            "delivered": delivered_count,
            "in_transit": in_transit_count,
            "total": total_count,
        },
        "letter_series_status": letter_series_status,
    }


@router.patch("/{neg_id}")
async def update_negotiation(
    neg_id: str,
    body: NegotiationUpdate,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Update negotiation fields."""
    negotiation = await _get_negotiation_or_404(neg_id, user, db)

    updates = body.model_dump(exclude_unset=True)
    old_status = negotiation.status

    for field, value in updates.items():
        setattr(negotiation, field, value)

    negotiation.updated_at = datetime.utcnow()

    # Log status change in correspondence if status changed
    new_status = updates.get("status")
    if new_status and new_status != old_status:
        logger.info(
            "Negotiation %s status changed: %s -> %s",
            neg_id,
            old_status,
            new_status,
        )

    await db.commit()
    await db.refresh(negotiation)

    return _serialize_negotiation(negotiation)


# ---------------------------------------------------------------------------
# RECIPIENT ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/{neg_id}/recipients")
async def list_recipients(
    neg_id: str,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Return all 4 recipients with full contact profiles."""
    await _get_negotiation_or_404(neg_id, user, db)

    result = await db.execute(
        select(NegotiationRecipient).where(
            NegotiationRecipient.negotiation_id == neg_id
        )
    )
    recipients = result.scalars().all()

    return [format_recipient_for_display(r) for r in recipients]


@router.patch("/{neg_id}/recipients/{rec_id}")
async def update_recipient(
    neg_id: str,
    rec_id: str,
    body: RecipientUpdate,
    request: Request,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Update recipient contact info manually."""
    await _get_negotiation_or_404(neg_id, user, db)

    result = await db.execute(
        select(NegotiationRecipient).where(
            NegotiationRecipient.id == rec_id,
            NegotiationRecipient.negotiation_id == neg_id,
        )
    )
    recipient = result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    # Sanitize contact fields
    try:
        updates = body.model_dump(exclude_unset=True)
        if "name" in updates and updates["name"]:
            updates["name"] = sanitize_text(updates["name"], 200)
        if "phone" in updates and updates["phone"]:
            updates["phone"] = sanitize_phone(updates["phone"])
        if "fax" in updates and updates["fax"]:
            updates["fax"] = sanitize_phone(updates["fax"])
        if "email" in updates and updates["email"]:
            updates["email"] = sanitize_email(updates["email"])
        if "mailing_address" in updates and updates["mailing_address"]:
            updates["mailing_address"] = sanitize_text(updates["mailing_address"], 300)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    for field, value in updates.items():
        setattr(recipient, field, value)

    recipient.manually_verified = True
    recipient.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(recipient)

    # Audit log
    try:
        await db.run_sync(lambda s: audit_log(
            s, action="update_recipient", user_id=user.id, user_email=user.email,
            ip_address=request.client.host, resource_type="negotiation_recipient",
            resource_id=rec_id,
            details={"recipient_type": recipient.recipient_type, "manually_verified": True},
        ))
    except Exception:
        pass

    return format_recipient_for_display(recipient)


@router.post("/{neg_id}/recipients/{rec_id}/refresh")
async def refresh_recipient(
    neg_id: str,
    rec_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Trigger fresh AI research for one recipient."""
    negotiation = await _get_negotiation_or_404(neg_id, user, db)

    result = await db.execute(
        select(NegotiationRecipient).where(
            NegotiationRecipient.id == rec_id,
            NegotiationRecipient.negotiation_id == neg_id,
        )
    )
    recipient = result.scalar_one_or_none()
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient not found")

    background_tasks.add_task(
        _bg_refresh_single_recipient,
        negotiation.bank_name,
        negotiation.property_state,
        rec_id,
        recipient.recipient_type,
        workspace_user_id(user),
    )

    return {"message": "Research triggered"}


# ---------------------------------------------------------------------------
# DOCUMENT ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/{neg_id}/documents")
async def list_documents(
    neg_id: str,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Return all documents for negotiation."""
    await _get_negotiation_or_404(neg_id, user, db)

    result = await db.execute(
        select(NegotiationDocument).where(
            NegotiationDocument.negotiation_id == neg_id
        )
    )
    documents = result.scalars().all()

    return [_serialize_document(d) for d in documents]


@router.post("/{neg_id}/documents", status_code=status.HTTP_201_CREATED)
async def create_document(
    neg_id: str,
    body: DocumentCreate,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Create a new document record for negotiation."""
    await _get_negotiation_or_404(neg_id, user, db)

    document = NegotiationDocument(
        negotiation_id=neg_id,
        user_id=workspace_user_id(user),
        document_type=body.document_type,
        document_name=body.document_name,
        gdrive_url=body.gdrive_url,
        gdrive_file_id=body.gdrive_file_id,
        notes=body.notes,
    )

    db.add(document)
    await db.commit()
    await db.refresh(document)

    return _serialize_document(document)


@router.patch("/{neg_id}/documents/{doc_id}")
async def update_document(
    neg_id: str,
    doc_id: str,
    body: DocumentUpdate,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Update document fields."""
    await _get_negotiation_or_404(neg_id, user, db)

    result = await db.execute(
        select(NegotiationDocument).where(
            NegotiationDocument.id == doc_id,
            NegotiationDocument.negotiation_id == neg_id,
        )
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(document, field, value)

    await db.commit()
    await db.refresh(document)

    return _serialize_document(document)


# ---------------------------------------------------------------------------
# CORRESPONDENCE ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/{neg_id}/correspondence")
async def list_correspondence(
    neg_id: str,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Return all correspondence records ordered by sent_date desc."""
    await _get_negotiation_or_404(neg_id, user, db)

    result = await db.execute(
        select(NegotiationCorrespondence)
        .where(NegotiationCorrespondence.negotiation_id == neg_id)
        .order_by(NegotiationCorrespondence.sent_date.desc())
    )
    correspondence = result.scalars().all()

    return [_serialize_correspondence(c) for c in correspondence]


@router.post("/{neg_id}/send")
async def send_correspondence(
    neg_id: str,
    body: SendCorrespondence,
    request: Request,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Send document to all 4 recipients via specified methods."""
    # Rate limit: 10 sends per hour per user
    if not check_rate_limit(rl_key(user.id, "send_correspondence"), max_requests=10, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many requests. Try again later.")

    # Sanitize fax_media_url if provided
    if body.fax_media_url:
        try:
            body.fax_media_url = sanitize_url(body.fax_media_url)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))

    settings = get_settings()
    negotiation = await _get_negotiation_or_404(neg_id, user, db)

    # Fetch recipients
    rec_result = await db.execute(
        select(NegotiationRecipient).where(
            NegotiationRecipient.negotiation_id == neg_id
        )
    )
    recipients = rec_result.scalars().all()

    if not recipients:
        raise HTTPException(
            status_code=400,
            detail="No recipients found. Wait for AI research to complete.",
        )

    now = datetime.utcnow()
    sent_count = 0
    failed_count = 0
    correspondence_records = []

    for recipient in recipients:
        for method in body.send_methods:
            if method == "certified_mail":
                tracking = None
                sig_tracking = None
                if body.usps_tracking_numbers:
                    tracking = body.usps_tracking_numbers.get(
                        recipient.recipient_type
                    )
                if body.usps_signature_tracking_numbers:
                    sig_tracking = body.usps_signature_tracking_numbers.get(
                        recipient.recipient_type
                    )

                corr = NegotiationCorrespondence(
                    negotiation_id=neg_id,
                    document_id=body.document_id,
                    recipient_id=recipient.id,
                    user_id=workspace_user_id(user),
                    send_method="certified_mail",
                    sent_date=now,
                    usps_tracking_number=tracking,
                    usps_signature_tracking_number=sig_tracking,
                    followup_due_date=now + timedelta(days=30),
                    status="sent",
                    letter_number=body.letter_number,
                    letter_type=body.letter_type,
                )
                db.add(corr)
                sent_count += 1
                correspondence_records.append(corr)

            elif method == "fax":
                if not recipient.fax:
                    corr = NegotiationCorrespondence(
                        negotiation_id=neg_id,
                        document_id=body.document_id,
                        recipient_id=recipient.id,
                        user_id=workspace_user_id(user),
                        send_method="fax",
                        sent_date=now,
                        fax_status="failed",
                        followup_due_date=now + timedelta(days=30),
                        status="failed",
                        notes="No fax number on file",
                        letter_number=body.letter_number,
                        letter_type=body.letter_type,
                    )
                    db.add(corr)
                    failed_count += 1
                    correspondence_records.append(corr)
                    continue

                if not body.fax_media_url:
                    corr = NegotiationCorrespondence(
                        negotiation_id=neg_id,
                        document_id=body.document_id,
                        recipient_id=recipient.id,
                        user_id=workspace_user_id(user),
                        send_method="fax",
                        sent_date=now,
                        fax_status="failed",
                        followup_due_date=now + timedelta(days=30),
                        status="failed",
                        notes="No fax media URL provided",
                        letter_number=body.letter_number,
                        letter_type=body.letter_type,
                    )
                    db.add(corr)
                    failed_count += 1
                    correspondence_records.append(corr)
                    continue

                fax_result = await send_fax_to_recipient(
                    recipient, body.fax_media_url, settings
                )

                if fax_result.get("success"):
                    corr = NegotiationCorrespondence(
                        negotiation_id=neg_id,
                        document_id=body.document_id,
                        recipient_id=recipient.id,
                        user_id=workspace_user_id(user),
                        send_method="fax",
                        sent_date=now,
                        twilio_fax_sid=fax_result.get("fax_sid"),
                        fax_status=fax_result.get("status"),
                        followup_due_date=now + timedelta(days=30),
                        status="sent",
                        letter_number=body.letter_number,
                        letter_type=body.letter_type,
                    )
                    db.add(corr)
                    sent_count += 1
                    correspondence_records.append(corr)
                else:
                    corr = NegotiationCorrespondence(
                        negotiation_id=neg_id,
                        document_id=body.document_id,
                        recipient_id=recipient.id,
                        user_id=workspace_user_id(user),
                        send_method="fax",
                        sent_date=now,
                        fax_status="failed",
                        followup_due_date=now + timedelta(days=30),
                        status="failed",
                        notes=fax_result.get("error", "Fax send failed"),
                        letter_number=body.letter_number,
                        letter_type=body.letter_type,
                    )
                    db.add(corr)
                    failed_count += 1
                    correspondence_records.append(corr)

    # Update negotiation follow-up date
    negotiation.next_followup_date = now + timedelta(days=30)
    negotiation.updated_at = now

    # Create follow-up Task record
    followup_task = Task(
        user_id=workspace_user_id(user),
        title=(
            f"Follow up: {negotiation.bank_name} "
            f"- {negotiation.property_address}"
        ),
        due_date=now + timedelta(days=30),
        priority="high",
        task_type="manual",
        status="pending",
    )
    db.add(followup_task)

    # Letter series task logic
    if body.letter_number == 1:
        # Auto-create Letter 2 and Letter 3 reminder tasks
        letter2_task = Task(
            user_id=workspace_user_id(user),
            title=(
                f"\u26a0\ufe0f Letter 2 ready to send: "
                f"{negotiation.bank_name} - {negotiation.property_address}"
            ),
            due_date=now + timedelta(days=30),
            notes=(
                f"Review bank response before sending Letter 2 of 3. "
                f"Original send date: {now.strftime('%Y-%m-%d')}"
            ),
            priority="high",
            task_type="manual",
            status="pending",
        )
        letter3_task = Task(
            user_id=workspace_user_id(user),
            title=(
                f"\u26a0\ufe0f Letter 3 ready to send: "
                f"{negotiation.bank_name} - {negotiation.property_address}"
            ),
            due_date=now + timedelta(days=60),
            notes=(
                f"Review bank response before sending Letter 3 of 3. "
                f"Original send date: {now.strftime('%Y-%m-%d')}"
            ),
            priority="high",
            task_type="manual",
            status="pending",
        )
        db.add(letter2_task)
        db.add(letter3_task)

    elif body.letter_number == 2:
        # Cancel/complete the Letter 2 Task
        l2_result = await db.execute(
            select(Task).where(
                Task.user_id == workspace_user_id(user),
                Task.title.contains("Letter 2 ready to send"),
                Task.title.contains(negotiation.bank_name),
                Task.status != "completed",
            )
        )
        l2_tasks = l2_result.scalars().all()
        for t in l2_tasks:
            t.status = "completed"
            t.completed_at = now

        # Update Letter 3 task due_date = letter_2_sent_date + 30 days
        l3_result = await db.execute(
            select(Task).where(
                Task.user_id == workspace_user_id(user),
                Task.title.contains("Letter 3 ready to send"),
                Task.title.contains(negotiation.bank_name),
                Task.status != "completed",
            )
        )
        l3_tasks = l3_result.scalars().all()
        for t in l3_tasks:
            t.due_date = now + timedelta(days=30)

    elif body.letter_number == 3:
        # Complete the Letter 3 Task
        l3_result = await db.execute(
            select(Task).where(
                Task.user_id == workspace_user_id(user),
                Task.title.contains("Letter 3 ready to send"),
                Task.title.contains(negotiation.bank_name),
                Task.status != "completed",
            )
        )
        l3_tasks = l3_result.scalars().all()
        for t in l3_tasks:
            t.status = "completed"
            t.completed_at = now

    await db.commit()

    # Refresh to get IDs
    for corr in correspondence_records:
        await db.refresh(corr)

    # Audit log
    try:
        await db.run_sync(lambda s: audit_log(
            s, action="send_to_recipients", user_id=user.id, user_email=user.email,
            ip_address=request.client.host, resource_type="bank_negotiation",
            resource_id=neg_id,
            details={"letter_number": body.letter_number, "methods": body.send_methods, "sent_count": sent_count},
        ))
    except Exception:
        pass

    return {
        "sent_count": sent_count,
        "failed_count": failed_count,
        "correspondence_records": [
            _serialize_correspondence(c) for c in correspondence_records
        ],
        "followup_date": (now + timedelta(days=30)).isoformat(),
    }


@router.post("/{neg_id}/correspondence/{corr_id}/update-tracking")
async def update_single_tracking(
    neg_id: str,
    corr_id: str,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Manually trigger tracking update for a single correspondence record."""
    settings = get_settings()
    await _get_negotiation_or_404(neg_id, user, db)

    result = await db.execute(
        select(NegotiationCorrespondence).where(
            NegotiationCorrespondence.id == corr_id,
            NegotiationCorrespondence.negotiation_id == neg_id,
        )
    )
    corr = result.scalar_one_or_none()
    if not corr:
        raise HTTPException(status_code=404, detail="Correspondence not found")

    tracking_result = None
    if corr.send_method == "certified_mail" and corr.usps_tracking_number:
        # Use run_sync to call the sync DB-based updater
        tracking_result = await db.run_sync(
            lambda sync_session: None  # placeholder
        )
        tracking_result = await update_correspondence_tracking(
            corr.id, db.sync_session, settings
        )
    elif corr.send_method == "fax" and corr.twilio_fax_sid:
        tracking_result = await update_fax_status(
            corr.id, db.sync_session, settings
        )

    await db.refresh(corr)
    return _serialize_correspondence(corr)


# ---------------------------------------------------------------------------
# TRACKING ENDPOINTS
# ---------------------------------------------------------------------------


@router.post("/tracking/refresh-all")
async def refresh_all_tracking(
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Refresh tracking for all active correspondence records."""
    settings = get_settings()
    cutoff = datetime.utcnow() - timedelta(days=60)

    stmt = select(NegotiationCorrespondence).where(
        NegotiationCorrespondence.sent_date >= cutoff,
    )

    if not user.is_superadmin:
        stmt = stmt.where(NegotiationCorrespondence.user_id == workspace_user_id(user))

    result = await db.execute(stmt)
    all_corr = result.scalars().all()

    updated = 0
    skipped_already_delivered = 0
    errors = 0

    for corr in all_corr:
        # Skip records already in final status
        if corr.usps_tracking_number and corr.usps_status in ("delivered", "returned"):
            skipped_already_delivered += 1
            continue
        if corr.twilio_fax_sid and corr.fax_status in ("delivered", "failed", "canceled"):
            skipped_already_delivered += 1
            continue

        try:
            if corr.usps_tracking_number:
                await update_correspondence_tracking(
                    corr.id, db.sync_session, settings
                )
                updated += 1
            if corr.twilio_fax_sid:
                await update_fax_status(
                    corr.id, db.sync_session, settings
                )
                updated += 1
        except Exception:
            logger.exception(
                "Tracking refresh failed for correspondence %s", corr.id
            )
            errors += 1

    return {
        "updated": updated,
        "skipped_already_delivered": skipped_already_delivered,
        "errors": errors,
    }


@router.get("/{neg_id}/tracking-summary")
async def get_tracking_summary(
    neg_id: str,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Per-recipient tracking status summary."""
    await _get_negotiation_or_404(neg_id, user, db)

    rec_result = await db.execute(
        select(NegotiationRecipient).where(
            NegotiationRecipient.negotiation_id == neg_id
        )
    )
    recipients = rec_result.scalars().all()

    summary = []
    for r in recipients:
        # Get correspondence for this recipient
        corr_result = await db.execute(
            select(NegotiationCorrespondence).where(
                NegotiationCorrespondence.recipient_id == r.id,
            )
        )
        corr_records = corr_result.scalars().all()

        mail_info = None
        fax_info = None

        for c in corr_records:
            if c.send_method == "certified_mail" and c.usps_tracking_number:
                mail_info = {
                    "tracking_number": c.usps_tracking_number,
                    "signature_tracking": c.usps_signature_tracking_number,
                    "status": c.usps_status,
                    "delivered_date": (
                        c.usps_delivered_date.isoformat()
                        if c.usps_delivered_date
                        else None
                    ),
                    "signed_by": c.usps_signed_by,
                    "letter_number": c.letter_number,
                    "letter_type": c.letter_type,
                }
            elif c.send_method == "fax" and c.twilio_fax_sid:
                fax_info = {
                    "fax_sid": c.twilio_fax_sid,
                    "status": c.fax_status,
                    "delivered_at": (
                        c.fax_delivered_at.isoformat()
                        if c.fax_delivered_at
                        else None
                    ),
                    "pages": c.fax_pages,
                    "letter_number": c.letter_number,
                    "letter_type": c.letter_type,
                }

        summary.append({
            "recipient_type": r.recipient_type,
            "recipient_name": r.name,
            "certified_mail": mail_info,
            "fax": fax_info,
        })

    return summary


# ---------------------------------------------------------------------------
# FOLLOW-UP ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/followups/pending")
async def list_pending_followups(
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Returns all pending follow-ups due within next 7 days."""
    cutoff = datetime.utcnow() + timedelta(days=7)

    stmt = (
        select(NegotiationFollowUp)
        .where(
            NegotiationFollowUp.user_id == workspace_user_id(user),
            NegotiationFollowUp.due_date <= cutoff,
            NegotiationFollowUp.completed.is_(False),
        )
        .order_by(NegotiationFollowUp.due_date.asc())
    )

    result = await db.execute(stmt)
    followups = result.scalars().all()

    return [_serialize_followup(f) for f in followups]


@router.patch("/followups/{followup_id}/complete")
async def complete_followup(
    followup_id: str,
    body: FollowUpComplete,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Mark follow-up as completed and auto-create next one."""
    result = await db.execute(
        select(NegotiationFollowUp).where(
            NegotiationFollowUp.id == followup_id,
        )
    )
    followup = result.scalar_one_or_none()
    if not followup:
        raise HTTPException(status_code=404, detail="Follow-up not found")

    if not user.is_superadmin and followup.user_id != workspace_user_id(user):
        raise HTTPException(status_code=403, detail="Not authorized")

    now = datetime.utcnow()
    followup.completed = True
    followup.completed_at = now
    followup.completed_notes = body.completed_notes

    # Auto-create next follow-up 30 days from now
    next_followup = NegotiationFollowUp(
        negotiation_id=followup.negotiation_id,
        user_id=workspace_user_id(user),
        due_date=now + timedelta(days=30),
        follow_up_type="general",
    )
    db.add(next_followup)
    await db.commit()
    await db.refresh(next_followup)

    return {
        "followup": _serialize_followup(followup),
        "next_followup": _serialize_followup(next_followup),
    }


# ---------------------------------------------------------------------------
# ADMIN ENDPOINTS
# ---------------------------------------------------------------------------


@router.get("/admin/all")
async def admin_list_all(
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Superadmin only — all negotiations across all users."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin only")

    result = await db.execute(
        select(BankNegotiation).order_by(BankNegotiation.created_at.desc())
    )
    negotiations = result.scalars().all()

    items = []
    for n in negotiations:
        # Fetch user email
        user_result = await db.execute(
            select(User.email).where(User.id == n.user_id)
        )
        user_email = user_result.scalar_one_or_none()

        items.append({
            **_serialize_negotiation(n),
            "user_email": user_email,
        })

    return items


@router.post("/admin/enable/{user_id}")
async def admin_enable_banking(
    user_id: int,
    user: User = Depends(get_current_user_with_banking),
    db: AsyncSession = Depends(get_db),
):
    """Superadmin only — enable bank negotiation for a user."""
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin only")

    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    target_user.bank_negotiation_enabled = True
    await db.commit()

    return {"success": True}


# ---------------------------------------------------------------------------
# Letter series status builder
# ---------------------------------------------------------------------------


def _build_letter_series_status(
    correspondence: list[NegotiationCorrespondence],
) -> dict:
    """Build letter series status from correspondence records."""
    letter_1 = {"sent": False, "sent_date": None, "all_delivered": False}
    letter_2 = {
        "sent": False,
        "sent_date": None,
        "scheduled_date": None,
        "all_delivered": False,
    }
    letter_3 = {
        "sent": False,
        "sent_date": None,
        "scheduled_date": None,
        "all_delivered": False,
    }

    l1_records = [c for c in correspondence if c.letter_number == 1]
    l2_records = [c for c in correspondence if c.letter_number == 2]
    l3_records = [c for c in correspondence if c.letter_number == 3]

    if l1_records:
        letter_1["sent"] = True
        earliest = min(c.sent_date for c in l1_records)
        letter_1["sent_date"] = earliest.isoformat() if earliest else None
        letter_1["all_delivered"] = all(
            c.status == "delivered" for c in l1_records
        )
        # Set scheduled dates for letters 2 and 3
        letter_2["scheduled_date"] = (
            (earliest + timedelta(days=30)).isoformat() if earliest else None
        )
        letter_3["scheduled_date"] = (
            (earliest + timedelta(days=60)).isoformat() if earliest else None
        )

    if l2_records:
        letter_2["sent"] = True
        earliest = min(c.sent_date for c in l2_records)
        letter_2["sent_date"] = earliest.isoformat() if earliest else None
        letter_2["all_delivered"] = all(
            c.status == "delivered" for c in l2_records
        )

    if l3_records:
        letter_3["sent"] = True
        earliest = min(c.sent_date for c in l3_records)
        letter_3["sent_date"] = earliest.isoformat() if earliest else None
        letter_3["all_delivered"] = all(
            c.status == "delivered" for c in l3_records
        )

    return {
        "letter_1": letter_1,
        "letter_2": letter_2,
        "letter_3": letter_3,
    }


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def _serialize_negotiation(n: BankNegotiation) -> dict:
    return {
        "id": n.id,
        "user_id": n.user_id,
        "land_trust_id": n.land_trust_id,
        "property_address": n.property_address,
        "property_city": n.property_city,
        "property_state": n.property_state,
        "property_zip": n.property_zip,
        "bank_name": n.bank_name,
        "loan_number": n.loan_number,
        "loan_balance": n.loan_balance,
        "negotiation_type": n.negotiation_type,
        "our_offer": n.our_offer,
        "target_outcome": n.target_outcome,
        "status": n.status,
        "gdrive_folder_id": n.gdrive_folder_id,
        "admin_notes": n.admin_notes,
        "next_followup_date": (
            n.next_followup_date.isoformat() if n.next_followup_date else None
        ),
        "notes": n.notes,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


def _serialize_document(d: NegotiationDocument) -> dict:
    return {
        "id": d.id,
        "negotiation_id": d.negotiation_id,
        "document_type": d.document_type,
        "document_name": d.document_name,
        "sent_date": d.sent_date.isoformat() if d.sent_date else None,
        "gdrive_url": d.gdrive_url,
        "gdrive_file_id": d.gdrive_file_id,
        "notes": d.notes,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _serialize_correspondence(c: NegotiationCorrespondence) -> dict:
    return {
        "id": c.id,
        "negotiation_id": c.negotiation_id,
        "document_id": c.document_id,
        "recipient_id": c.recipient_id,
        "send_method": c.send_method,
        "sent_date": c.sent_date.isoformat() if c.sent_date else None,
        "letter_number": c.letter_number,
        "letter_type": c.letter_type,
        "usps_tracking_number": c.usps_tracking_number,
        "usps_signature_tracking_number": c.usps_signature_tracking_number,
        "usps_status": c.usps_status,
        "usps_delivered_date": (
            c.usps_delivered_date.isoformat() if c.usps_delivered_date else None
        ),
        "usps_signed_by": c.usps_signed_by,
        "twilio_fax_sid": c.twilio_fax_sid,
        "fax_status": c.fax_status,
        "fax_pages": c.fax_pages,
        "fax_delivered_at": (
            c.fax_delivered_at.isoformat() if c.fax_delivered_at else None
        ),
        "followup_due_date": (
            c.followup_due_date.isoformat() if c.followup_due_date else None
        ),
        "status": c.status,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def _serialize_followup(f: NegotiationFollowUp) -> dict:
    return {
        "id": f.id,
        "negotiation_id": f.negotiation_id,
        "due_date": f.due_date.isoformat() if f.due_date else None,
        "follow_up_type": f.follow_up_type,
        "notes": f.notes,
        "completed": f.completed,
        "completed_at": (
            f.completed_at.isoformat() if f.completed_at else None
        ),
        "completed_notes": f.completed_notes,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }
