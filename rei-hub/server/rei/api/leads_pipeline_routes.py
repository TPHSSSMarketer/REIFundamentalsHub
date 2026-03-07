"""Leads Pipeline routes — upload lists, manage leads, promote to CRM deals."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.leads_pipeline import Lead, LeadList, MarketingTouch
from rei.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["leads-pipeline"])


# ── Pydantic Schemas ──────────────────────────────────────


class CreateListBody(BaseModel):
    list_name: str
    source: Optional[str] = None
    description: Optional[str] = None


class ConfirmImportBody(BaseModel):
    mapping: dict[str, str]
    # { "csv_header": "our_field_name" }


class UpdateLeadBody(BaseModel):
    status: Optional[str] = None
    tags_json: Optional[str] = None
    notes: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    property_type: Optional[str] = None


class CreateLeadBody(BaseModel):
    """For manually adding a single lead."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    property_type: Optional[str] = None
    list_id: Optional[int] = None
    tags_json: Optional[str] = None
    notes: Optional[str] = None


# ── List CRUD ─────────────────────────────────────────────


@router.get("/leads/lists")
async def get_lists(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Get all lead lists for the current user."""
    result = await db.execute(
        select(LeadList)
        .where(LeadList.user_id == uid, LeadList.is_deleted == False)
        .order_by(LeadList.created_at.desc())
    )
    lists = result.scalars().all()
    return [
        {
            "id": ll.id,
            "list_name": ll.list_name,
            "source": ll.source,
            "description": ll.description,
            "original_filename": ll.original_filename,
            "lead_count": ll.lead_count,
            "created_at": ll.created_at.isoformat() if ll.created_at else None,
        }
        for ll in lists
    ]


@router.post("/leads/lists")
async def create_list(
    body: CreateListBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Create a new lead list (metadata only — upload file separately)."""
    ll = LeadList(
        user_id=uid,
        list_name=body.list_name,
        source=body.source,
        description=body.description,
    )
    db.add(ll)
    await db.commit()
    await db.refresh(ll)
    return {"id": ll.id, "list_name": ll.list_name}


@router.delete("/leads/lists/{list_id}")
async def delete_list(
    list_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Soft-delete a lead list."""
    result = await db.execute(
        select(LeadList).where(LeadList.id == list_id, LeadList.user_id == uid)
    )
    ll = result.scalar_one_or_none()
    if not ll:
        raise HTTPException(status_code=404, detail="List not found")
    ll.is_deleted = True
    await db.commit()
    return {"status": "deleted"}


# ── File Upload + Column Mapping ──────────────────────────


@router.post("/leads/lists/{list_id}/upload")
async def upload_list_file(
    list_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Upload CSV/XLSX to a lead list. Returns detected column mapping for user confirmation."""
    from rei.services.leads_import_service import (
        detect_column_mapping,
        parse_csv_content,
        parse_xlsx_content,
    )

    result = await db.execute(
        select(LeadList).where(LeadList.id == list_id, LeadList.user_id == uid)
    )
    ll = result.scalar_one_or_none()
    if not ll:
        raise HTTPException(status_code=404, detail="List not found")

    content = await file.read()
    filename = file.filename or "upload"

    if filename.lower().endswith((".xlsx", ".xls")):
        headers, rows = parse_xlsx_content(content)
    elif filename.lower().endswith((".csv", ".tsv")):
        headers, rows = parse_csv_content(content)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload CSV or XLSX.")

    if not headers:
        raise HTTPException(status_code=400, detail="File appears empty or has no headers.")

    # Auto-detect column mapping
    mapping = detect_column_mapping(headers)

    # Store filename and raw data temporarily (in the session via list metadata)
    ll.original_filename = filename
    ll.column_mapping_json = json.dumps({"mapping": mapping, "row_count": len(rows)})

    # Store raw rows temporarily in a cache-like approach using the DB
    # We'll re-parse the file on confirm. Store content length for validation.
    await db.commit()

    return {
        "list_id": list_id,
        "filename": filename,
        "headers": headers,
        "suggested_mapping": mapping,
        "row_count": len(rows),
        "preview_rows": rows[:5],  # First 5 rows for preview
    }


@router.post("/leads/lists/{list_id}/confirm-import")
async def confirm_import(
    list_id: int,
    body: ConfirmImportBody,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Confirm column mapping and import leads from the uploaded file."""
    from rei.services.leads_import_service import (
        apply_mapping,
        parse_csv_content,
        parse_xlsx_content,
    )

    result = await db.execute(
        select(LeadList).where(LeadList.id == list_id, LeadList.user_id == uid)
    )
    ll = result.scalar_one_or_none()
    if not ll:
        raise HTTPException(status_code=404, detail="List not found")

    # Re-parse the uploaded file
    content = await file.read()
    filename = file.filename or "upload"

    if filename.lower().endswith((".xlsx", ".xls")):
        headers, rows = parse_xlsx_content(content)
    else:
        headers, rows = parse_csv_content(content)

    # Apply user-confirmed mapping
    mapped_rows = apply_mapping(rows, body.mapping)

    if not mapped_rows:
        raise HTTPException(status_code=400, detail="No valid leads found after mapping.")

    # Bulk insert leads
    imported_count = 0
    for row in mapped_rows:
        lead = Lead(
            user_id=uid,
            list_id=list_id,
            first_name=row.get("first_name"),
            last_name=row.get("last_name"),
            full_name=row.get("full_name"),
            phone=row.get("phone"),
            email=row.get("email"),
            address=row.get("address"),
            city=row.get("city"),
            state=row.get("state"),
            zip_code=row.get("zip_code"),
            property_type=row.get("property_type"),
            status="new",
        )
        db.add(lead)
        imported_count += 1

    ll.lead_count = imported_count
    ll.column_mapping_json = json.dumps(body.mapping)
    await db.commit()

    logger.info("Imported %d leads into list %d for user %d", imported_count, list_id, uid)
    return {"imported": imported_count, "list_id": list_id}


# ── Lead CRUD ─────────────────────────────────────────────


@router.get("/leads")
async def get_leads(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
    list_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    tag: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    """Fetch leads with optional filters."""
    query = select(Lead).where(Lead.user_id == uid, Lead.is_deleted == False)

    if list_id is not None:
        query = query.where(Lead.list_id == list_id)
    if status_filter:
        query = query.where(Lead.status == status_filter)
    if tag:
        query = query.where(Lead.tags_json.contains(tag))
    if search:
        like = f"%{search}%"
        query = query.where(
            or_(
                Lead.full_name.ilike(like),
                Lead.first_name.ilike(like),
                Lead.last_name.ilike(like),
                Lead.address.ilike(like),
                Lead.email.ilike(like),
                Lead.phone.ilike(like),
            )
        )

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginated results
    query = query.order_by(Lead.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    leads = result.scalars().all()

    return {
        "total": total,
        "leads": [
            {
                "id": l.id,
                "list_id": l.list_id,
                "first_name": l.first_name,
                "last_name": l.last_name,
                "full_name": l.full_name,
                "phone": l.phone,
                "email": l.email,
                "address": l.address,
                "city": l.city,
                "state": l.state,
                "zip_code": l.zip_code,
                "property_type": l.property_type,
                "status": l.status,
                "tags_json": l.tags_json,
                "notes": l.notes,
                "total_mailers_sent": l.total_mailers_sent,
                "last_mailed_at": l.last_mailed_at.isoformat() if l.last_mailed_at else None,
                "crm_contact_id": l.crm_contact_id,
                "crm_deal_id": l.crm_deal_id,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in leads
        ],
    }


@router.post("/leads")
async def create_lead(
    body: CreateLeadBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Manually add a single lead."""
    lead = Lead(
        user_id=uid,
        list_id=body.list_id,
        first_name=body.first_name,
        last_name=body.last_name,
        full_name=body.full_name or f"{body.first_name or ''} {body.last_name or ''}".strip(),
        phone=body.phone,
        email=body.email,
        address=body.address,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
        property_type=body.property_type,
        tags_json=body.tags_json or "[]",
        notes=body.notes,
        status="new",
    )
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return {"id": lead.id, "status": "created"}


@router.patch("/leads/{lead_id}")
async def update_lead(
    lead_id: str,
    body: UpdateLeadBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Update a lead's status, tags, notes, or contact info."""
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.user_id == uid)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(lead, field, value)

    lead.updated_at = datetime.utcnow()
    await db.commit()
    return {"id": lead.id, "status": "updated"}


@router.delete("/leads/{lead_id}")
async def delete_lead(
    lead_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Soft-delete a lead."""
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.user_id == uid)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    lead.is_deleted = True
    await db.commit()
    return {"status": "deleted"}


# ── Promote to Deal ───────────────────────────────────────


@router.post("/leads/{lead_id}/promote")
async def promote_lead_to_deal(
    lead_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Create a CRM Contact + Deal from a lead, carrying over marketing history."""
    from rei.models.crm import CrmContact, CrmDeal

    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.user_id == uid)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    if lead.crm_contact_id:
        raise HTTPException(status_code=400, detail="Lead already promoted to CRM.")

    # Create CRM Contact
    contact = CrmContact(
        user_id=uid,
        name=lead.full_name or f"{lead.first_name or ''} {lead.last_name or ''}".strip() or "Unknown",
        first_name=lead.first_name,
        last_name=lead.last_name,
        phone=lead.phone,
        email=lead.email,
        role="seller",
        source=f"Lead Pipeline (List #{lead.list_id})" if lead.list_id else "Lead Pipeline",
        notes=_build_promotion_notes(lead),
    )
    db.add(contact)
    await db.flush()

    # Create CRM Deal
    deal = CrmDeal(
        user_id=uid,
        contact_id=contact.id,
        title=f"Deal - {lead.full_name or lead.address or 'New Lead'}",
        stage="Lead",
        address=lead.address,
        city=lead.city,
        state=lead.state,
        zip=lead.zip_code,
        property_type=lead.property_type,
        notes=f"Promoted from Lead Pipeline. Total mailers sent: {lead.total_mailers_sent}.",
    )
    db.add(deal)
    await db.flush()

    # Update lead with CRM links
    lead.crm_contact_id = contact.id
    lead.crm_deal_id = deal.id
    lead.status = "converted"
    lead.updated_at = datetime.utcnow()

    await db.commit()

    logger.info("Promoted lead %s to contact %s + deal %s", lead_id, contact.id, deal.id)
    return {
        "lead_id": lead.id,
        "crm_contact_id": contact.id,
        "crm_deal_id": deal.id,
        "status": "promoted",
    }


def _build_promotion_notes(lead: Lead) -> str:
    """Build notes string with marketing history for CRM contact."""
    parts = []
    if lead.total_mailers_sent > 0:
        parts.append(f"Received {lead.total_mailers_sent} mailer(s) before converting.")
    if lead.last_mailed_at:
        parts.append(f"Last mailed: {lead.last_mailed_at.strftime('%Y-%m-%d')}.")
    if lead.notes:
        parts.append(f"Lead notes: {lead.notes}")
    return " ".join(parts) if parts else ""


# ── Lead Marketing History ────────────────────────────────


@router.get("/leads/{lead_id}/touches")
async def get_lead_touches(
    lead_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Get all marketing touches for a specific lead."""
    # Verify lead belongs to user
    lead_result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.user_id == uid)
    )
    lead = lead_result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    result = await db.execute(
        select(MarketingTouch)
        .where(MarketingTouch.lead_id == lead_id)
        .order_by(MarketingTouch.created_at.desc())
    )
    touches = result.scalars().all()
    return [
        {
            "id": t.id,
            "touch_type": t.touch_type,
            "delivery_status": t.delivery_status,
            "cost": t.cost,
            "provider_id": t.provider_id,
            "campaign_id": t.campaign_id,
            "sent_date": t.sent_date.isoformat() if t.sent_date else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in touches
    ]
