"""CRM Deal Matches — buyers matched to deals, send notifications."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import get_settings
from rei.models.crm import DealBuyerMatch, CrmDeal
from rei.models.user import User
from rei.services.email import send_buyer_match_notification

logger = logging.getLogger(__name__)

crm_deal_matches_router = APIRouter(prefix="/crm/deals", tags=["crm-deal-matches"])


# ── Pydantic Schemas ────────────────────────────────────────


class DealBuyerMatchResponse(BaseModel):
    id: str
    dealId: str
    buyerContactId: str
    buyerName: Optional[str] = None
    buyerEmail: Optional[str] = None
    buyingEntity: Optional[str] = None
    status: str
    sentAt: Optional[str] = None
    createdAt: str


# ── Helpers ─────────────────────────────────────────────────


def _match_to_dict(m: DealBuyerMatch) -> dict:
    """Convert DealBuyerMatch to response dict."""
    return {
        "id": m.id,
        "dealId": m.deal_id,
        "buyerContactId": m.buyer_contact_id,
        "buyerName": m.buyer_name,
        "buyerEmail": m.buyer_email,
        "buyingEntity": m.buying_entity,
        "status": m.status or "pending",
        "sentAt": m.sent_at.isoformat() if m.sent_at else None,
        "createdAt": m.created_at.isoformat() if m.created_at else None,
    }


# ── Endpoints ───────────────────────────────────────────────


@crm_deal_matches_router.get("/{deal_id}/matches")
async def list_deal_matches(
    deal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all matched buyers for a deal."""
    # Verify deal belongs to user
    deal_result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == workspace_user_id(user),
        )
    )
    deal = deal_result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Get all matches for this deal
    result = await db.execute(
        select(DealBuyerMatch)
        .where(DealBuyerMatch.deal_id == deal_id)
        .order_by(DealBuyerMatch.created_at.desc())
    )
    matches = result.scalars().all()
    return [_match_to_dict(m) for m in matches]


@crm_deal_matches_router.post("/{deal_id}/matches/{match_id}/send")
async def send_match_email(
    deal_id: str,
    match_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send email to a single matched buyer."""
    # Verify deal belongs to user
    deal_result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == workspace_user_id(user),
        )
    )
    deal = deal_result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Find the match
    match_result = await db.execute(
        select(DealBuyerMatch).where(
            DealBuyerMatch.id == match_id,
            DealBuyerMatch.deal_id == deal_id,
        )
    )
    match = match_result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    # Send email
    if not match.buyer_email:
        raise HTTPException(status_code=400, detail="Match has no email address")

    try:
        settings = get_settings()
        await send_buyer_match_notification(
            buyer_email=match.buyer_email,
            buyer_name=match.buyer_name,
            deal=deal,
            settings=settings,
        )
    except Exception as e:
        logger.error(f"Failed to send match email to {match.buyer_email}: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")

    # Update match status
    match.status = "sent"
    match.sent_at = datetime.utcnow()
    await db.commit()
    await db.refresh(match)
    return _match_to_dict(match)


@crm_deal_matches_router.post("/{deal_id}/matches/send-all")
async def send_all_match_emails(
    deal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send emails to all pending matched buyers for a deal."""
    # Verify deal belongs to user
    deal_result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == workspace_user_id(user),
        )
    )
    deal = deal_result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Get all pending matches with email
    result = await db.execute(
        select(DealBuyerMatch).where(
            DealBuyerMatch.deal_id == deal_id,
            DealBuyerMatch.status == "pending",
            DealBuyerMatch.buyer_email.isnot(None),
        )
    )
    matches = result.scalars().all()

    sent_count = 0
    failed_count = 0
    settings = get_settings()

    for match in matches:
        try:
            await send_buyer_match_notification(
                buyer_email=match.buyer_email,
                buyer_name=match.buyer_name,
                deal=deal,
                settings=settings,
            )
            match.status = "sent"
            match.sent_at = datetime.utcnow()
            sent_count += 1
        except Exception as e:
            logger.error(f"Failed to send match email to {match.buyer_email}: {e}")
            failed_count += 1

    await db.commit()
    return {"sent": sent_count, "failed": failed_count}


@crm_deal_matches_router.patch("/{deal_id}/matches/{match_id}/skip")
async def skip_match(
    deal_id: str,
    match_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a match as skipped (user chose not to send)."""
    # Verify deal belongs to user
    deal_result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == workspace_user_id(user),
        )
    )
    deal = deal_result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Find the match
    match_result = await db.execute(
        select(DealBuyerMatch).where(
            DealBuyerMatch.id == match_id,
            DealBuyerMatch.deal_id == deal_id,
        )
    )
    match = match_result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    match.status = "skipped"
    await db.commit()
    await db.refresh(match)
    return _match_to_dict(match)


@crm_deal_matches_router.delete("/{deal_id}/matches/{match_id}")
async def delete_match(
    deal_id: str,
    match_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a match."""
    # Verify deal belongs to user
    deal_result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == workspace_user_id(user),
        )
    )
    deal = deal_result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Find the match
    match_result = await db.execute(
        select(DealBuyerMatch).where(
            DealBuyerMatch.id == match_id,
            DealBuyerMatch.deal_id == deal_id,
        )
    )
    match = match_result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    await db.delete(match)
    await db.commit()
    return {"detail": "Match removed"}
