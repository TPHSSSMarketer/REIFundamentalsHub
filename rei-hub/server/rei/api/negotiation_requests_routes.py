"""Negotiation Requests API routes — User submissions and admin queue."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.crm import CrmDeal
from rei.models.negotiation import NegotiationRequest, NegotiationCase
from rei.models.user import User

logger = logging.getLogger(__name__)

negotiation_requests_router = APIRouter(prefix="/api/negotiations/requests", tags=["negotiations"])


# ── Pydantic Schemas ────────────────────────────────────────


class SubmitNegotiationRequestBody(BaseModel):
    """User submits selected liens for negotiation."""
    dealId: str
    lienIds: list[str]
    serviceTypes: list[str]
    message: Optional[str] = None


class RequestMoreInfoBody(BaseModel):
    """Admin requests additional information from user."""
    message: Optional[str] = None


# ── Helper Functions ────────────────────────────────────────


def _request_to_dict(r: NegotiationRequest) -> dict:
    """Convert NegotiationRequest to camelCase dict."""
    lien_ids = []
    service_types = []

    try:
        lien_ids = json.loads(r.lien_ids_json) if r.lien_ids_json else []
    except (json.JSONDecodeError, ValueError):
        lien_ids = []

    try:
        service_types = json.loads(r.service_types_json) if r.service_types_json else []
    except (json.JSONDecodeError, ValueError):
        service_types = []

    return {
        "id": r.id,
        "dealId": r.deal_id,
        "userId": r.user_id,
        "lienIds": lien_ids,
        "serviceTypes": service_types,
        "message": r.message,
        "status": r.status,
        "propertyAddress": r.property_address,
        "propertyCity": r.property_city,
        "propertyState": r.property_state,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
        "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
    }


# ── Endpoints ───────────────────────────────────────────────


@negotiation_requests_router.post("/", status_code=status.HTTP_201_CREATED)
async def submit_negotiation_request(
    body: SubmitNegotiationRequestBody,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """User submits selected liens for negotiation."""
    uid = workspace_user_id(user)

    # Verify deal exists and belongs to user
    deal_result = await db.execute(
        select(CrmDeal.id, CrmDeal.property_address, CrmDeal.property_city, CrmDeal.property_state).where(
            CrmDeal.id == body.dealId,
            CrmDeal.user_id == uid,
            CrmDeal.is_deleted == False,
        )
    )
    deal_row = deal_result.one_or_none()
    if not deal_row:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal_id, property_address, property_city, property_state = deal_row

    # Create negotiation request
    now = datetime.utcnow()
    request = NegotiationRequest(
        deal_id=deal_id,
        user_id=uid,
        lien_ids_json=json.dumps(body.lienIds),
        service_types_json=json.dumps(body.serviceTypes),
        message=body.message,
        status="pending",
        property_address=property_address,
        property_city=property_city,
        property_state=property_state,
        created_at=now,
        updated_at=now,
    )

    db.add(request)
    await db.commit()
    await db.refresh(request)

    # Notify admin (Telegram) + user (email)
    try:
        from rei.services.negotiation_notifications import notify_new_request
        from rei.config import get_settings
        await notify_new_request(
            request_data={"property_address": property_address or "Unknown", "service_types_json": body.serviceTypes, "deal_id": str(body.dealId)},
            user_email=user.email,
            user_name=user.full_name or user.email,
            settings=get_settings(),
        )
    except Exception as e:
        logger.warning("Failed to send new request notification: %s", e)

    return _request_to_dict(request)


@negotiation_requests_router.get("/")
async def list_negotiation_requests(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List negotiation requests.

    - Superadmins see ALL requests (admin queue)
    - Regular users see only their own requests
    """
    if user.is_superadmin:
        # Admin view: all requests, newest first
        result = await db.execute(
            select(NegotiationRequest).order_by(NegotiationRequest.created_at.desc())
        )
    else:
        # User view: only their own requests
        uid = workspace_user_id(user)
        result = await db.execute(
            select(NegotiationRequest)
            .where(NegotiationRequest.user_id == uid)
            .order_by(NegotiationRequest.created_at.desc())
        )

    requests = result.scalars().all()
    return [_request_to_dict(r) for r in requests]


@negotiation_requests_router.patch("/{request_id}/accept")
async def accept_negotiation_request(
    request_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin accepts a negotiation request and creates cases.

    Creates one NegotiationCase per service_type.
    Only superadmins can accept requests.
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Only superadmins can accept requests")

    # Fetch the request
    result = await db.execute(
        select(NegotiationRequest).where(NegotiationRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Update request status
    req.status = "accepted"
    req.updated_at = datetime.utcnow()

    # Parse service types
    try:
        service_types = json.loads(req.service_types_json) if req.service_types_json else []
    except (json.JSONDecodeError, ValueError):
        service_types = []

    # Create a case for each service type
    cases = []
    now = datetime.utcnow()

    for service_type in service_types:
        case = NegotiationCase(
            request_id=req.id,
            deal_id=req.deal_id,
            user_id=req.user_id,
            service_type=service_type,
            status="intake",
            property_address=req.property_address,
            created_at=now,
            updated_at=now,
        )
        db.add(case)
        cases.append(case)

    await db.commit()

    # Refresh request and cases
    await db.refresh(req)
    for case in cases:
        await db.refresh(case)

    return {
        "request": _request_to_dict(req),
        "cases": [
            {
                "id": c.id,
                "requestId": c.request_id,
                "dealId": c.deal_id,
                "userId": c.user_id,
                "serviceType": c.service_type,
                "status": c.status,
                "propertyAddress": c.property_address,
                "createdAt": c.created_at.isoformat() if c.created_at else None,
                "updatedAt": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in cases
        ],
    }


@negotiation_requests_router.patch("/{request_id}/request-info")
async def request_more_info(
    request_id: str,
    body: RequestMoreInfoBody,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin requests additional information from user.

    Only superadmins can request info.
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Only superadmins can request info")

    # Fetch the request
    result = await db.execute(
        select(NegotiationRequest).where(NegotiationRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Update status
    req.status = "info_requested"
    req.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(req)

    # Notify user of status change
    try:
        from rei.services.negotiation_notifications import notify_request_update
        from rei.config import get_settings
        # Fetch the request owner to get their email
        owner_result = await db.execute(
            select(User).where(User.id == req.user_id)
        )
        owner = owner_result.scalar_one_or_none()
        await notify_request_update(
            request_id=str(req.id),
            new_status=req.status,
            user_email=owner.email if owner else "",
            settings=get_settings(),
        )
    except Exception as e:
        logger.warning("Failed to send request update notification: %s", e)

    return _request_to_dict(req)


@negotiation_requests_router.patch("/{request_id}/decline")
async def decline_negotiation_request(
    request_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin declines a negotiation request.

    Only superadmins can decline requests.
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Only superadmins can decline requests")

    # Fetch the request
    result = await db.execute(
        select(NegotiationRequest).where(NegotiationRequest.id == request_id)
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # Update status
    req.status = "declined"
    req.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(req)

    # Send notification to user
    try:
        from rei.services.negotiation_notifications import notify_request_update
        from rei.config import get_settings
        # Fetch the request owner to get their email
        owner_result = await db.execute(
            select(User).where(User.id == req.user_id)
        )
        owner = owner_result.scalar_one_or_none()
        await notify_request_update(
            request_id=str(req.id),
            new_status=req.status,
            user_email=owner.email if owner else "",
            settings=get_settings(),
        )
    except Exception as e:
        logger.warning("Failed to send request update notification: %s", e)

    return _request_to_dict(req)
