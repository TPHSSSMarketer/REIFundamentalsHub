"""Deal detail routes — aggregated deal view with notes, contracts, POF, activity."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.user import (
    DealAnalyzerResult,
    DealContractChecklist,
    DealNote,
    GeneratedContract,
    PofRequest,
    ProofOfFundsCertificate,
    User,
)

logger = logging.getLogger(__name__)

deals_router = APIRouter(prefix="/deals", tags=["deals"])


# ── Models ─────────────────────────────────────────────────────────────


class AddNoteBody(BaseModel):
    content: str


class UpdateStageBody(BaseModel):
    stage_id: str


class UpdateAnalyzerPrefsBody(BaseModel):
    arv_multiplier: Optional[float] = None
    default_closing_costs_pct: Optional[float] = None
    default_agent_commission_pct: Optional[float] = None
    default_holding_months: Optional[int] = None
    default_monthly_holding_cost: Optional[float] = None
    min_profit: Optional[float] = None
    min_roi_pct: Optional[float] = None
    sub2_default_interest_rate: Optional[float] = None
    sub2_default_rental_income: Optional[float] = None
    sub2_default_vacancy_pct: Optional[float] = None
    sub2_default_mgmt_pct: Optional[float] = None
    of_default_interest_rate: Optional[float] = None
    of_default_term_years: Optional[int] = None
    of_default_down_pct: Optional[float] = None
    lo_default_option_term_years: Optional[int] = None
    lo_default_monthly_credit_pct: Optional[float] = None
    blend_cash_pct: Optional[float] = None


class PatchDealBody(BaseModel):
    analyzer_data: Optional[str] = None
    closing_date: Optional[str] = None
    contact_id: Optional[str] = None


# ── GET /api/deals/analyzer/preferences ────────────────────────────────

_ANALYZER_FIELDS = [
    "arv_multiplier",
    "default_closing_costs_pct",
    "default_agent_commission_pct",
    "default_holding_months",
    "default_monthly_holding_cost",
    "min_profit",
    "min_roi_pct",
    "sub2_default_interest_rate",
    "sub2_default_rental_income",
    "sub2_default_vacancy_pct",
    "sub2_default_mgmt_pct",
    "of_default_interest_rate",
    "of_default_term_years",
    "of_default_down_pct",
    "lo_default_option_term_years",
    "lo_default_monthly_credit_pct",
    "blend_cash_pct",
]


@deals_router.get("/analyzer/preferences")
async def get_analyzer_preferences(
    user: User = Depends(get_current_user),
):
    """Return all analyzer preference values for the current user."""
    return {
        field: getattr(user, f"analyzer_{field}", None)
        for field in _ANALYZER_FIELDS
    }


# ── PATCH /api/deals/analyzer/preferences ─────────────────────────────


@deals_router.patch("/analyzer/preferences")
async def update_analyzer_preferences(
    body: UpdateAnalyzerPrefsBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user's analyzer default preferences."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )
    for field, value in updates.items():
        setattr(user, f"analyzer_{field}", value)
    await db.commit()
    await db.refresh(user)
    return {
        field: getattr(user, f"analyzer_{field}", None)
        for field in _ANALYZER_FIELDS
    }


# ── PATCH /api/deals/{deal_id} ────────────────────────────────────────


@deals_router.patch("/{deal_id}")
async def patch_deal(
    deal_id: str,
    body: PatchDealBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save or update analyzer_data for a deal."""
    if body.analyzer_data is not None:
        result = await db.execute(
            select(DealAnalyzerResult).where(
                DealAnalyzerResult.user_id == workspace_user_id(user),
                DealAnalyzerResult.deal_id == deal_id,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.analyzer_data = body.analyzer_data
        else:
            row = DealAnalyzerResult(
                user_id=workspace_user_id(user),
                deal_id=deal_id,
                analyzer_data=body.analyzer_data,
            )
            db.add(row)

    # Auto-create closing task when closing_date is provided
    if body.closing_date:
        from rei.api.calendar_routes import auto_closing_task

        closing_dt = datetime.fromisoformat(body.closing_date)
        await auto_closing_task(
            db=db,
            user_id=user.id,
            deal_id=deal_id,
            contact_id=body.contact_id,
            closing_date=closing_dt,
        )

    await db.commit()
    return {"success": True}


# ── GET /api/deals/{deal_id} ───────────────────────────────────────────


@deals_router.get("/{deal_id}")
async def get_deal_detail(
    deal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregated deal data from local DB tables."""

    # Generated contracts for this deal
    contracts_result = await db.execute(
        select(GeneratedContract)
        .where(GeneratedContract.user_id == workspace_user_id(user), GeneratedContract.deal_id == deal_id)
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

    # POF requests (match on property address heuristic — all user's requests)
    pof_req_result = await db.execute(
        select(PofRequest)
        .where(PofRequest.requestor_id == workspace_user_id(user))
        .order_by(desc(PofRequest.created_at))
    )
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
        for p in pof_req_result.scalars().all()
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

    # Deal notes (persisted in DB)
    notes_result = await db.execute(
        select(DealNote)
        .where(DealNote.user_id == workspace_user_id(user), DealNote.deal_id == deal_id)
        .order_by(desc(DealNote.created_at))
    )
    notes = [
        {
            "id": n.id,
            "deal_id": n.deal_id,
            "user_id": n.user_id,
            "content": n.content,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notes_result.scalars().all()
    ]

    # Build activity feed
    activity_feed = []

    for gc in generated_contracts:
        activity_feed.append({
            "type": "contract",
            "id": gc["id"],
            "timestamp": gc["created_at"],
            "summary": f"Contract generated: {gc['file_name']}",
            "data": gc,
        })

    for p in pof_requests:
        activity_feed.append({
            "type": "pof",
            "id": p["id"],
            "timestamp": p["created_at"],
            "summary": f"POF {p['status']}: ${p['required_amount']:,.0f}",
            "data": p,
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
        "generated_contracts": generated_contracts,
        "pof_requests": pof_requests,
        "pof_certificates": pof_certificates,
        "notes": notes,
        "activity_feed": activity_feed,
    }


# ── POST /api/deals/{deal_id}/notes ──────────────────────────────────


@deals_router.post("/{deal_id}/notes")
async def add_deal_note(
    deal_id: str,
    body: AddNoteBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not body.content.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note content cannot be empty",
        )
    note = DealNote(
        user_id=workspace_user_id(user),
        deal_id=deal_id,
        content=body.content.strip(),
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return {
        "note_id": note.id,
        "content": note.content,
        "created_at": note.created_at.isoformat() if note.created_at else None,
    }


# ── DELETE /api/deals/{deal_id}/notes/{note_id} ──────────────────────


@deals_router.delete("/{deal_id}/notes/{note_id}")
async def delete_deal_note(
    deal_id: str,
    note_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DealNote).where(
            DealNote.id == note_id,
            DealNote.user_id == workspace_user_id(user),
            DealNote.deal_id == deal_id,
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )
    await db.delete(note)
    await db.commit()
    return {"success": True}
