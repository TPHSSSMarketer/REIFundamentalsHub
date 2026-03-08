"""Negotiation cases API routes — case list, detail, update, and research trigger."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.negotiation import NegotiationCase, NegotiationActivity, NegotiationMessage, NegotiationRecipient
from rei.models.user import User

logger = logging.getLogger(__name__)

negotiation_cases_router = APIRouter(prefix="/api/negotiations/cases", tags=["negotiations"])


# ── Pydantic schemas ──────────────────────────────────────────────────


class UpdateCaseBody(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None


# ── Helper functions ─────────────────────────────────────────────────


def _case_to_dict(c: NegotiationCase) -> dict:
    """Convert NegotiationCase to camelCase dict."""
    return {
        "id": c.id,
        "requestId": c.request_id,
        "dealId": c.deal_id,
        "userId": c.user_id,
        "serviceType": c.service_type,
        "status": c.status,
        "priority": c.priority,
        "propertyAddress": c.property_address,
        "assignedAt": c.assigned_at.isoformat() if c.assigned_at else None,
        "resolvedAt": c.resolved_at.isoformat() if c.resolved_at else None,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
        "updatedAt": c.updated_at.isoformat() if c.updated_at else None,
    }


def _activity_to_dict(a: NegotiationActivity, is_admin: bool = False) -> dict:
    """Convert NegotiationActivity to camelCase dict with two-note visibility system.

    Always include: id, caseId, activityType, sendMethod, trackingStatus, uspsDeliveredDate,
    uspsSignedBy, createdBy, createdAt
    If is_admin: include adminNote, uspsTrackingNumber, uspsSignatureTrackingNumber, attachmentsJson
    If not is_admin: include userSummary (instead of adminNote), NO tracking numbers, NO attachments
    """
    result = {
        "id": a.id,
        "caseId": a.case_id,
        "activityType": a.activity_type,
        "sendMethod": a.send_method,
        "trackingStatus": a.tracking_status,
        "uspsDeliveredDate": a.usps_delivered_date.isoformat() if a.usps_delivered_date else None,
        "uspsSignedBy": a.usps_signed_by,
        "createdBy": a.created_by,
        "createdAt": a.created_at.isoformat() if a.created_at else None,
    }

    if is_admin:
        result["adminNote"] = a.admin_note
        result["uspsTrackingNumber"] = a.usps_tracking_number
        result["uspsSignatureTrackingNumber"] = a.usps_signature_tracking_number
        attachments = None
        if a.attachments_json:
            try:
                attachments = json.loads(a.attachments_json)
            except (json.JSONDecodeError, TypeError):
                attachments = None
        result["attachmentsJson"] = attachments
    else:
        result["userSummary"] = a.user_summary

    return result


# ── Endpoints ─────────────────────────────────────────────────────────


@negotiation_cases_router.get("")
async def list_cases(
    status: Optional[str] = Query(None),
    service_type: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List negotiation cases.

    If user.is_superadmin: list ALL cases
    Else: list only user's own cases

    Support query params: status, service_type
    Order by created_at desc
    """
    query = select(NegotiationCase)

    # Filter by user unless superadmin
    if not user.is_superadmin:
        query = query.where(NegotiationCase.user_id == user.id)

    # Apply optional filters
    if status is not None:
        query = query.where(NegotiationCase.status == status)
    if service_type is not None:
        query = query.where(NegotiationCase.service_type == service_type)

    # Order by created_at desc
    query = query.order_by(NegotiationCase.created_at.desc())

    result = await db.execute(query)
    cases = result.scalars().all()

    return [_case_to_dict(c) for c in cases]


@negotiation_cases_router.get("/{case_id}")
async def get_case(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get case detail with activities and unread message count.

    Superadmin can see any case; regular user can only see their own.
    Return case dict + activities list + unread message count
    """
    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Check authorization
    if not user.is_superadmin and case.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Fetch activities
    activities_result = await db.execute(
        select(NegotiationActivity)
        .where(NegotiationActivity.case_id == case_id)
        .order_by(NegotiationActivity.created_at.desc())
    )
    activities = activities_result.scalars().all()

    # Count unread messages (messages where read_at is None and sender is not the current user)
    unread_count_result = await db.execute(
        select(func.count(NegotiationMessage.id)).where(
            NegotiationMessage.case_id == case_id,
            NegotiationMessage.read_at.is_(None),
            NegotiationMessage.sender_id != user.id,
        )
    )
    unread_count = unread_count_result.scalar() or 0

    return {
        "case": _case_to_dict(case),
        "activities": [_activity_to_dict(a, is_admin=user.is_superadmin) for a in activities],
        "unreadMessageCount": unread_count,
    }


@negotiation_cases_router.patch("/{case_id}")
async def update_case(
    case_id: str,
    body: UpdateCaseBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update case (admin only).

    Superadmin only.
    If status changes to "resolved", set resolved_at = now
    Create a NegotiationActivity with activity_type="status_change" and admin_note describing the change
    """
    # Authorization check: superadmin only
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    old_status = case.status

    # Update status if provided
    if body.status is not None:
        case.status = body.status

        # If resolving, set resolved_at
        if body.status == "resolved":
            case.resolved_at = datetime.utcnow()

    # Update priority if provided
    if body.priority is not None:
        case.priority = body.priority

    case.updated_at = datetime.utcnow()

    # Create activity for status change
    if body.status is not None and body.status != old_status:
        activity = NegotiationActivity(
            case_id=case_id,
            activity_type="status_change",
            admin_note=f"Status changed from '{old_status}' to '{body.status}'",
            created_by="admin",
        )
        db.add(activity)

    db.add(case)
    await db.commit()
    await db.refresh(case)

    return _case_to_dict(case)


@negotiation_cases_router.post("/{case_id}/research")
async def trigger_research(
    case_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger AI contact research.

    Superadmin only.
    Set case status to "researching"
    Return {"detail": "Research started"}
    """
    # Authorization check: superadmin only
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    case.status = "researching"
    case.updated_at = datetime.utcnow()

    db.add(case)
    await db.commit()

    # Trigger contact research as a background task
    async def _run_research(case_id_: str, deal_id_: str, user_id_: int):
        try:
            import json as _json
            from rei.services.contact_research import research_bank_contacts
            from rei.config import get_settings
            from rei.database import async_session_factory
            from rei.models.crm import CrmDeal
            from rei.models.negotiation import DealLien, NegotiationRecipient, NegotiationActivity

            async with async_session_factory() as bg_db:
                # Get deal to find property state
                deal = await bg_db.get(CrmDeal, deal_id_)
                state = deal.property_state if deal else ""

                # Get first lien holder name for research
                lien_result = await bg_db.execute(
                    select(DealLien).where(DealLien.deal_id == deal_id_).limit(1)
                )
                lien = lien_result.scalar_one_or_none()
                bank_name = lien.lien_holder if lien else "Unknown"

                results = await research_bank_contacts(
                    bank_name=bank_name,
                    state=state or "",
                    negotiation_id=case_id_,
                    user_id=user_id_,
                    db=bg_db,
                    settings=get_settings(),
                )

                # Delete existing recipients for this case (re-research replaces old data)
                old = await bg_db.execute(
                    select(NegotiationRecipient).where(NegotiationRecipient.case_id == case_id_)
                )
                for r in old.scalars().all():
                    await bg_db.delete(r)

                # Save each recipient to the database
                for r in results:
                    recipient = NegotiationRecipient(
                        case_id=case_id_,
                        recipient_type=r.get("recipient_type", ""),
                        name=r.get("name"),
                        title=r.get("title"),
                        mailing_address=r.get("mailing_address"),
                        mailing_city=r.get("mailing_city"),
                        mailing_state=r.get("mailing_state"),
                        mailing_zip=r.get("mailing_zip"),
                        phone=r.get("phone"),
                        fax=r.get("fax"),
                        email=r.get("email"),
                        confidence=r.get("confidence"),
                        sources_json=_json.dumps(r.get("sources", [])),
                    )
                    bg_db.add(recipient)

                # Log an activity for the research completion
                activity = NegotiationActivity(
                    case_id=case_id_,
                    activity_type="ai_research",
                    admin_note=f"AI research completed for {bank_name}. Found {len(results)} recipient contacts.",
                    user_summary="Contact research has been completed for your case.",
                    created_by="ai",
                )
                bg_db.add(activity)

                # Update case status to in_progress now that research is done
                case_obj = await bg_db.get(NegotiationCase, case_id_)
                if case_obj:
                    case_obj.status = "in_progress"
                    from datetime import datetime as _dt
                    case_obj.updated_at = _dt.utcnow()

                await bg_db.commit()
                logger.info("Research completed and saved for case %s: %d recipients", case_id_, len(results))

        except Exception as e:
            logger.error("Background contact research failed for case %s: %s", case_id_, e)

    background_tasks.add_task(_run_research, str(case.id), str(case.deal_id), user.id)

    return {"detail": "Research started"}


@negotiation_cases_router.get("/{case_id}/recipients")
async def list_recipients(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List AI-researched recipients for a negotiation case.

    Superadmin only.
    Returns list of recipient dicts with contact info.
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationRecipient)
        .where(NegotiationRecipient.case_id == case_id)
        .order_by(NegotiationRecipient.created_at.asc())
    )
    recipients = result.scalars().all()

    return [
        {
            "id": r.id,
            "caseId": r.case_id,
            "recipientType": r.recipient_type,
            "name": r.name,
            "title": r.title,
            "mailingAddress": r.mailing_address,
            "mailingCity": r.mailing_city,
            "mailingState": r.mailing_state,
            "mailingZip": r.mailing_zip,
            "phone": r.phone,
            "fax": r.fax,
            "email": r.email,
            "confidence": r.confidence,
            "sources": json.loads(r.sources_json) if r.sources_json else [],
            "createdAt": r.created_at.isoformat() if r.created_at else None,
            "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in recipients
    ]
