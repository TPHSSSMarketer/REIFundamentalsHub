"""Negotiation activity API routes — admin activity journal for cases."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.negotiation import NegotiationCase, NegotiationActivity
from rei.models.user import User

logger = logging.getLogger(__name__)

negotiation_activity_router = APIRouter(prefix="/api/negotiations", tags=["negotiations"])


# ── Pydantic schemas ──────────────────────────────────────────────────


class ActivityAttachment(BaseModel):
    fileName: str
    fileType: str
    dealFileId: str


class CreateActivityBody(BaseModel):
    activityType: str
    adminNote: str
    sendMethod: Optional[str] = None
    uspsTrackingNumber: Optional[str] = None
    uspsSignatureTrackingNumber: Optional[str] = None
    attachments: Optional[list[ActivityAttachment]] = None


class UpdateTrackingBody(BaseModel):
    uspsTrackingNumber: Optional[str] = None
    uspsSignatureTrackingNumber: Optional[str] = None
    trackingStatus: Optional[str] = None


# ── Helper functions ─────────────────────────────────────────────────


def _activity_to_dict(a: NegotiationActivity, is_admin: bool = False) -> dict:
    """Convert NegotiationActivity to camelCase dict with two-note visibility system.

    Always include: id, caseId, activityType, sendMethod, trackingStatus, uspsDeliveredDate,
    uspsSignedBy, createdBy, createdAt
    If is_admin: include adminNote, uspsTrackingNumber, uspsSignatureTrackingNumber, attachments (parsed JSON)
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
        result["attachments"] = attachments
    else:
        result["userSummary"] = a.user_summary

    return result


# ── Endpoints ─────────────────────────────────────────────────────────


@negotiation_activity_router.post("/cases/{case_id}/activities")
async def create_activity(
    case_id: str,
    body: CreateActivityBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin adds an activity to a negotiation case.

    Superadmin only.
    Creates NegotiationActivity with:
    - activityType, adminNote from request body
    - sendMethod, uspsTrackingNumber, uspsSignatureTrackingNumber from optional fields
    - attachments stored as JSON
    - created_by="admin"

    Returns the activity dict.
    """
    # Authorization check: superadmin only
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    # Verify case exists and belongs to a real user
    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Convert attachments to JSON if provided
    attachments_json = None
    if body.attachments:
        attachments_json = json.dumps([a.model_dump() for a in body.attachments])

    # Create the activity
    activity = NegotiationActivity(
        case_id=case_id,
        activity_type=body.activityType,
        admin_note=body.adminNote,
        send_method=body.sendMethod,
        usps_tracking_number=body.uspsTrackingNumber,
        usps_signature_tracking_number=body.uspsSignatureTrackingNumber,
        attachments_json=attachments_json,
        created_by="admin",
    )

    db.add(activity)
    await db.commit()
    await db.refresh(activity)

    # Generate AI-sanitized user summary
    try:
        from rei.services.negotiation_summary import generate_user_summary
        user_summary = await generate_user_summary(body.adminNote, case.service_type)
        if user_summary:
            activity.user_summary = user_summary
            await db.commit()
    except Exception as e:
        logger.warning("Failed to generate user summary: %s", e)

    # Notify user of new activity
    try:
        from rei.services.negotiation_notifications import notify_new_activity
        from rei.config import get_settings
        # Get user email from case owner
        owner = await db.get(User, case.user_id)
        await notify_new_activity(
            case_id=str(case.id),
            user_summary=activity.user_summary or body.adminNote[:100],
            user_email=owner.email if owner else "",
            settings=get_settings(),
            user_id=case.user_id,
        )
    except Exception as e:
        logger.warning("Failed to send activity notification: %s", e)

    return _activity_to_dict(activity, is_admin=True)


@negotiation_activity_router.get("/cases/{case_id}/activities")
async def list_activities(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List activities for a negotiation case (chronological journal).

    Superadmin sees full admin_note + tracking numbers + attachments
    Regular user sees only user_summary + tracking status (no details)

    Order by created_at asc (chronological journal)
    """
    # Verify case exists and user has access
    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Check authorization: superadmin can see any case, user can only see own
    if not user.is_superadmin and case.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Fetch activities ordered chronologically
    activities_result = await db.execute(
        select(NegotiationActivity)
        .where(NegotiationActivity.case_id == case_id)
        .order_by(NegotiationActivity.created_at.asc())
    )
    activities = activities_result.scalars().all()

    is_admin = user.is_superadmin
    return [_activity_to_dict(a, is_admin=is_admin) for a in activities]


@negotiation_activity_router.patch("/activities/{activity_id}/tracking")
async def update_tracking(
    activity_id: str,
    body: UpdateTrackingBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update tracking numbers manually (superadmin only).

    Updates only tracking fields — no send required.
    """
    # Authorization check: superadmin only
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationActivity).where(NegotiationActivity.id == activity_id)
    )
    activity = result.scalar_one_or_none()

    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

    # Update tracking fields if provided
    if body.uspsTrackingNumber is not None:
        activity.usps_tracking_number = body.uspsTrackingNumber

    if body.uspsSignatureTrackingNumber is not None:
        activity.usps_signature_tracking_number = body.uspsSignatureTrackingNumber

    if body.trackingStatus is not None:
        activity.tracking_status = body.trackingStatus

    db.add(activity)
    await db.commit()
    await db.refresh(activity)

    return _activity_to_dict(activity, is_admin=True)
