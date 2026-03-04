"""Document & Contract Automation routes."""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.crm import CrmDeal, DealFile
from rei.models.user import (
    ContractChecklistTemplate,
    DealContractChecklist,
    DocumentTemplate,
    GeneratedContract,
    LetterOfIntent,
    User,
)
from rei.services import document_service, storage_service

logger = logging.getLogger(__name__)
documents_router = APIRouter(prefix="/documents", tags=["documents"])


# ── Schemas ─────────────────────────────────────────────────────────────


class GenerateContractRequest(BaseModel):
    template_id: str
    homeowner_name: str
    buying_entity: str
    property_address: str = ""
    purchase_price: Optional[float] = None
    closing_date: Optional[str] = None
    emd_amount: Optional[float] = None
    additional_clauses: Optional[str] = None
    custom_fields: Optional[dict] = None
    storage_provider: str = Field(description="google_drive or dropbox")
    deal_id: Optional[str] = None


class UpdateSettingsRequest(BaseModel):
    company_name: str


class CreateChecklistTemplateRequest(BaseModel):
    deal_type: str
    name: str
    is_required: bool = False
    document_template_id: Optional[str] = None
    state: Optional[str] = None
    sort_order: int = 0


class UpdateChecklistTemplateRequest(BaseModel):
    deal_type: Optional[str] = None
    name: Optional[str] = None
    is_required: Optional[bool] = None
    document_template_id: Optional[str] = None
    state: Optional[str] = None
    sort_order: Optional[int] = None


class AddChecklistItemRequest(BaseModel):
    name: str
    document_template_id: Optional[str] = None
    sort_order: int = 0


class UpdateChecklistItemRequest(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    sort_order: Optional[int] = None


class GenerateLoiRequest(BaseModel):
    deal_id: str
    included_options: list[str]
    homeowner_name: str
    property_address: str
    purchase_price: Optional[float] = None
    as_is_value: Optional[float] = None
    existing_mortgage_balance: Optional[float] = None
    monthly_payment: Optional[float] = None
    interest_rate: Optional[float] = None
    owner_finance_down: Optional[float] = None
    lease_option_term: Optional[str] = None
    lease_monthly_payment: Optional[float] = None
    option_purchase_price: Optional[float] = None
    additional_notes: Optional[str] = None
    storage_provider: str


# ═══════════════════════════════════════════════════════════════
# Template endpoints
# ═══════════════════════════════════════════════════════════════


@documents_router.get("/templates")
async def list_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all templates for the current user (including system defaults)."""
    result = await db.execute(
        select(DocumentTemplate).where(
            (DocumentTemplate.user_id == current_user.id)
            | (DocumentTemplate.is_default == True)  # noqa: E712
        ).order_by(DocumentTemplate.created_at.desc())
    )
    templates = result.scalars().all()

    return {
        "templates": [
            {
                "id": t.id,
                "name": t.name,
                "category": t.category,
                "file_name": t.file_name,
                "is_default": t.is_default,
                "merge_fields": json.loads(t.merge_fields) if t.merge_fields else [],
                "created_at": t.created_at.isoformat(),
                "updated_at": t.updated_at.isoformat(),
            }
            for t in templates
        ]
    }


@documents_router.post("/templates")
async def upload_template(
    name: str = Form(...),
    category: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a .docx template, detect merge fields, and save."""
    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .docx files are supported",
        )

    contents = await file.read()
    file_b64 = base64.b64encode(contents).decode("ascii")

    try:
        fields = document_service.detect_merge_fields(file_b64)
    except Exception as e:
        logger.error("Merge field detection error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to parse .docx file",
        ) from e

    template = DocumentTemplate(
        user_id=current_user.id,
        name=name,
        category=category,
        file_name=file.filename,
        file_content=file_b64,
        is_default=False,
        merge_fields=json.dumps(fields),
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    return {
        "id": template.id,
        "name": template.name,
        "category": template.category,
        "file_name": template.file_name,
        "is_default": False,
        "merge_fields": fields,
        "created_at": template.created_at.isoformat(),
        "updated_at": template.updated_at.isoformat(),
    }


@documents_router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return template metadata (without file_content for speed)."""
    result = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.id == template_id,
            (DocumentTemplate.user_id == current_user.id)
            | (DocumentTemplate.is_default == True),  # noqa: E712
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    return {
        "id": t.id,
        "name": t.name,
        "category": t.category,
        "file_name": t.file_name,
        "is_default": t.is_default,
        "merge_fields": json.loads(t.merge_fields) if t.merge_fields else [],
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


@documents_router.get("/templates/{template_id}/download")
async def download_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the base64 file_content for download."""
    result = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.id == template_id,
            (DocumentTemplate.user_id == current_user.id)
            | (DocumentTemplate.is_default == True),  # noqa: E712
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    return {
        "file_name": t.file_name,
        "file_content": t.file_content,
    }


@documents_router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user-uploaded template (system defaults cannot be deleted)."""
    result = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.id == template_id,
            DocumentTemplate.user_id == current_user.id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    if t.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="System default templates cannot be deleted",
        )

    await db.delete(t)
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# Contract generation endpoints
# ═══════════════════════════════════════════════════════════════


@documents_router.post("/generate")
async def generate_contract(
    body: GenerateContractRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a merged contract and save to Google Drive or Dropbox."""
    settings = get_settings()

    # Fetch template
    result = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.id == body.template_id,
            (DocumentTemplate.user_id == current_user.id)
            | (DocumentTemplate.is_default == True),  # noqa: E712
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Build merge data
    contract_data = {
        "homeowner_name": body.homeowner_name,
        "buying_entity": body.buying_entity,
        "property_address": body.property_address,
        "purchase_price": body.purchase_price,
        "closing_date": body.closing_date,
        "emd_amount": body.emd_amount,
        "additional_clauses": body.additional_clauses or "",
        "custom_fields": body.custom_fields,
    }
    merge_data = document_service.build_merge_data(current_user, contract_data)

    # Merge document
    try:
        merged_b64 = document_service.merge_document(
            template.file_content, merge_data
        )
    except Exception as e:
        logger.error("Document merge error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to merge document",
        ) from e

    # Generate file name: Document Name - Homeowner - Address
    file_name = document_service.generate_file_name(
        template.name,
        body.homeowner_name,
        property_address=body.property_address,
        buying_entity=body.buying_entity,
    )

    # Save to storage
    company_name = current_user.company_name or "My Company"
    storage_url = ""
    storage_path = ""

    if body.storage_provider == "google_drive":
        try:
            result_storage = await storage_service.save_to_google_drive(
                merged_b64, file_name, company_name, body.homeowner_name, settings
            )
            storage_url = result_storage.get("web_view_link", "")
            storage_path = result_storage.get("file_id", "")
        except Exception as e:
            logger.error("Google Drive upload error: %s", e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to save to Google Drive: {e}",
            ) from e
    elif body.storage_provider == "dropbox":
        try:
            result_storage = await storage_service.save_to_dropbox(
                merged_b64, file_name, company_name, body.homeowner_name, settings
            )
            storage_url = result_storage.get("sharing_url", "")
            storage_path = result_storage.get("path_display", "")
        except Exception as e:
            logger.error("Dropbox upload error: %s", e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to save to Dropbox: {e}",
            ) from e
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="storage_provider must be 'google_drive' or 'dropbox'",
        )

    # Persist contract record
    contract = GeneratedContract(
        user_id=current_user.id,
        template_id=template.id,
        deal_id=body.deal_id,
        file_name=file_name,
        homeowner_name=body.homeowner_name,
        buying_entity=body.buying_entity,
        property_address=body.property_address,
        purchase_price=body.purchase_price,
        closing_date=body.closing_date,
        emd_amount=body.emd_amount,
        additional_clauses=body.additional_clauses,
        custom_fields=json.dumps(body.custom_fields) if body.custom_fields else None,
        storage_provider=body.storage_provider,
        storage_path=storage_path,
        storage_url=storage_url,
    )
    db.add(contract)
    await db.commit()
    await db.refresh(contract)

    return {
        "contract_id": contract.id,
        "file_name": file_name,
        "storage_url": storage_url,
    }


@documents_router.get("/contracts")
async def list_contracts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all generated contracts for the current user, most recent first."""
    result = await db.execute(
        select(GeneratedContract)
        .where(GeneratedContract.user_id == current_user.id)
        .order_by(GeneratedContract.created_at.desc())
    )
    contracts = result.scalars().all()

    return {
        "contracts": [
            {
                "id": c.id,
                "template_id": c.template_id,
                "deal_id": c.deal_id,
                "file_name": c.file_name,
                "homeowner_name": c.homeowner_name,
                "buying_entity": c.buying_entity,
                "property_address": c.property_address,
                "purchase_price": c.purchase_price,
                "closing_date": c.closing_date,
                "emd_amount": c.emd_amount,
                "storage_provider": c.storage_provider,
                "storage_url": c.storage_url,
                "created_at": c.created_at.isoformat(),
            }
            for c in contracts
        ]
    }


@documents_router.get("/contracts/{contract_id}")
async def get_contract(
    contract_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a single contract's metadata."""
    result = await db.execute(
        select(GeneratedContract).where(
            GeneratedContract.id == contract_id,
            GeneratedContract.user_id == current_user.id,
        )
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")

    return {
        "id": c.id,
        "template_id": c.template_id,
        "deal_id": c.deal_id,
        "file_name": c.file_name,
        "homeowner_name": c.homeowner_name,
        "buying_entity": c.buying_entity,
        "property_address": c.property_address,
        "purchase_price": c.purchase_price,
        "closing_date": c.closing_date,
        "emd_amount": c.emd_amount,
        "additional_clauses": c.additional_clauses,
        "custom_fields": json.loads(c.custom_fields) if c.custom_fields else None,
        "storage_provider": c.storage_provider,
        "storage_path": c.storage_path,
        "storage_url": c.storage_url,
        "created_at": c.created_at.isoformat(),
    }


@documents_router.delete("/contracts/{contract_id}")
async def delete_contract(
    contract_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a contract record (does NOT delete from Google Drive/Dropbox)."""
    result = await db.execute(
        select(GeneratedContract).where(
            GeneratedContract.id == contract_id,
            GeneratedContract.user_id == current_user.id,
        )
    )
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")

    await db.delete(c)
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# User settings
# ═══════════════════════════════════════════════════════════════


@documents_router.patch("/settings")
async def update_settings(
    body: UpdateSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the user's company name."""
    current_user.company_name = body.company_name
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# Default checklist seed data
# ═══════════════════════════════════════════════════════════════

_DEFAULT_CHECKLISTS: dict[str, list[tuple[str, bool]]] = {
    "subject_to": [
        ("Letter of Intent", False),
        ("Purchase Agreement", False),
        ("Subject To Agreement", False),
        ("Authorization to Release Information", False),
        ("Seller's Disclosure", False),
        ("Lead Based Paint Disclosure", True),
        ("Power of Attorney", False),
        ("Insurance Authorization", False),
        ("Mortgage Statement", False),
    ],
    "cash_purchase": [
        ("Letter of Intent", False),
        ("Purchase Agreement", False),
        ("Seller's Disclosure", False),
        ("Lead Based Paint Disclosure", True),
        ("HUD Settlement Statement", False),
        ("Title Commitment", False),
    ],
    "owner_financing": [
        ("Letter of Intent", False),
        ("Purchase Agreement", False),
        ("Promissory Note", False),
        ("Deed of Trust / Mortgage", False),
        ("Seller's Disclosure", False),
        ("Lead Based Paint Disclosure", True),
        ("Amortization Schedule", False),
    ],
    "lease_option": [
        ("Letter of Intent", False),
        ("Lease Agreement", False),
        ("Option to Purchase Agreement", False),
        ("Seller's Disclosure", False),
        ("Lead Based Paint Disclosure", True),
    ],
    "fix_and_flip": [
        ("Letter of Intent", False),
        ("Purchase Agreement", False),
        ("Seller's Disclosure", False),
        ("Lead Based Paint Disclosure", True),
        ("Assignment of Contract", False),
        ("HUD Settlement Statement", False),
    ],
}


async def seed_default_checklists(user_id: int, db: AsyncSession) -> None:
    """Create default checklist template items for a user if none exist."""
    for deal_type, items in _DEFAULT_CHECKLISTS.items():
        for idx, (name, required) in enumerate(items):
            tpl = ContractChecklistTemplate(
                user_id=user_id,
                deal_type=deal_type,
                name=name,
                is_required=required,
                sort_order=idx,
            )
            db.add(tpl)
    await db.commit()


# ═══════════════════════════════════════════════════════════════
# Checklist template endpoints
# ═══════════════════════════════════════════════════════════════


@documents_router.get("/checklist/templates")
async def list_checklist_templates(
    deal_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return checklist templates grouped by deal type. Seeds defaults if empty."""
    query = select(ContractChecklistTemplate).where(
        ContractChecklistTemplate.user_id == current_user.id
    )
    result = await db.execute(query)
    templates = result.scalars().all()

    if not templates:
        await seed_default_checklists(current_user.id, db)
        result = await db.execute(query)
        templates = result.scalars().all()

    if deal_type:
        templates = [t for t in templates if t.deal_type == deal_type]

    grouped: dict[str, list] = {}
    for t in sorted(templates, key=lambda x: x.sort_order):
        grouped.setdefault(t.deal_type, []).append({
            "id": t.id,
            "deal_type": t.deal_type,
            "name": t.name,
            "is_required": t.is_required,
            "document_template_id": t.document_template_id,
            "state": t.state,
            "sort_order": t.sort_order,
            "created_at": t.created_at.isoformat(),
        })

    return {"templates": grouped}


@documents_router.post("/checklist/templates")
async def create_checklist_template(
    body: CreateChecklistTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new checklist template item."""
    tpl = ContractChecklistTemplate(
        user_id=current_user.id,
        deal_type=body.deal_type,
        name=body.name,
        is_required=body.is_required,
        document_template_id=body.document_template_id,
        state=body.state,
        sort_order=body.sort_order,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)

    return {
        "id": tpl.id,
        "deal_type": tpl.deal_type,
        "name": tpl.name,
        "is_required": tpl.is_required,
        "document_template_id": tpl.document_template_id,
        "state": tpl.state,
        "sort_order": tpl.sort_order,
        "created_at": tpl.created_at.isoformat(),
    }


@documents_router.put("/checklist/templates/{template_id}")
async def update_checklist_template(
    template_id: str,
    body: UpdateChecklistTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a checklist template item."""
    result = await db.execute(
        select(ContractChecklistTemplate).where(
            ContractChecklistTemplate.id == template_id,
            ContractChecklistTemplate.user_id == current_user.id,
        )
    )
    tpl = result.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Checklist template not found")

    for field in ("deal_type", "name", "is_required", "document_template_id", "state", "sort_order"):
        val = getattr(body, field, None)
        if val is not None:
            setattr(tpl, field, val)

    await db.commit()
    await db.refresh(tpl)

    return {
        "id": tpl.id,
        "deal_type": tpl.deal_type,
        "name": tpl.name,
        "is_required": tpl.is_required,
        "document_template_id": tpl.document_template_id,
        "state": tpl.state,
        "sort_order": tpl.sort_order,
    }


@documents_router.delete("/checklist/templates/{template_id}")
async def delete_checklist_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a checklist template item."""
    result = await db.execute(
        select(ContractChecklistTemplate).where(
            ContractChecklistTemplate.id == template_id,
            ContractChecklistTemplate.user_id == current_user.id,
        )
    )
    tpl = result.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Checklist template not found")

    await db.delete(tpl)
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# Deal checklist endpoints
# ═══════════════════════════════════════════════════════════════


@documents_router.get("/checklist/{deal_id}")
async def get_deal_checklist(
    deal_id: str,
    deal_type: str = "subject_to",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return checklist items for a deal. Auto-creates from templates if none exist."""
    result = await db.execute(
        select(DealContractChecklist).where(
            DealContractChecklist.deal_id == deal_id,
            DealContractChecklist.user_id == current_user.id,
        ).order_by(DealContractChecklist.sort_order)
    )
    items = list(result.scalars().all())

    if not items:
        # Auto-create from templates
        tpl_result = await db.execute(
            select(ContractChecklistTemplate).where(
                ContractChecklistTemplate.user_id == current_user.id,
                ContractChecklistTemplate.deal_type == deal_type,
            ).order_by(ContractChecklistTemplate.sort_order)
        )
        templates = tpl_result.scalars().all()

        if not templates:
            await seed_default_checklists(current_user.id, db)
            tpl_result = await db.execute(
                select(ContractChecklistTemplate).where(
                    ContractChecklistTemplate.user_id == current_user.id,
                    ContractChecklistTemplate.deal_type == deal_type,
                ).order_by(ContractChecklistTemplate.sort_order)
            )
            templates = tpl_result.scalars().all()

        for tpl in templates:
            item = DealContractChecklist(
                user_id=current_user.id,
                deal_id=deal_id,
                checklist_template_id=tpl.id,
                name=tpl.name,
                document_template_id=tpl.document_template_id,
                sort_order=tpl.sort_order,
            )
            db.add(item)
            items.append(item)
        await db.commit()

    return {
        "items": [
            {
                "id": it.id,
                "deal_id": it.deal_id,
                "checklist_template_id": it.checklist_template_id,
                "name": it.name,
                "status": it.status,
                "document_template_id": it.document_template_id,
                "generated_contract_id": it.generated_contract_id,
                "signed_file_name": it.signed_file_name,
                "signed_at": it.signed_at.isoformat() if it.signed_at else None,
                "completed_at": it.completed_at.isoformat() if it.completed_at else None,
                "notes": it.notes,
                "sort_order": it.sort_order,
                "created_at": it.created_at.isoformat(),
            }
            for it in items
        ]
    }


@documents_router.post("/checklist/{deal_id}/items")
async def add_checklist_item(
    deal_id: str,
    body: AddChecklistItemRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a custom item to a deal's checklist."""
    # Create a placeholder template entry for custom items
    tpl = ContractChecklistTemplate(
        user_id=current_user.id,
        deal_type="custom",
        name=body.name,
        is_required=False,
        document_template_id=body.document_template_id,
        sort_order=body.sort_order,
    )
    db.add(tpl)
    await db.flush()

    item = DealContractChecklist(
        user_id=current_user.id,
        deal_id=deal_id,
        checklist_template_id=tpl.id,
        name=body.name,
        document_template_id=body.document_template_id,
        sort_order=body.sort_order,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return {
        "id": item.id,
        "deal_id": item.deal_id,
        "name": item.name,
        "status": item.status,
        "document_template_id": item.document_template_id,
        "sort_order": item.sort_order,
    }


@documents_router.patch("/checklist/items/{item_id}")
async def update_checklist_item(
    item_id: str,
    body: UpdateChecklistItemRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a checklist item's status, notes, or sort order."""
    result = await db.execute(
        select(DealContractChecklist).where(
            DealContractChecklist.id == item_id,
            DealContractChecklist.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    if body.status is not None:
        item.status = body.status
        if body.status == "filed":
            item.completed_at = datetime.utcnow()
    if body.notes is not None:
        item.notes = body.notes
    if body.sort_order is not None:
        item.sort_order = body.sort_order
    item.updated_at = datetime.utcnow()

    await db.commit()
    return {
        "id": item.id,
        "status": item.status,
        "notes": item.notes,
        "sort_order": item.sort_order,
        "completed_at": item.completed_at.isoformat() if item.completed_at else None,
    }


@documents_router.post("/checklist/items/{item_id}/sign")
async def upload_signed_copy(
    item_id: str,
    signed_file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a signed copy and set status to signed."""
    result = await db.execute(
        select(DealContractChecklist).where(
            DealContractChecklist.id == item_id,
            DealContractChecklist.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    contents = await signed_file.read()
    item.signed_file_name = signed_file.filename or "signed_document"
    item.signed_file_content = base64.b64encode(contents).decode("ascii")
    item.signed_at = datetime.utcnow()
    item.status = "signed"
    item.updated_at = datetime.utcnow()

    await db.commit()
    return {
        "id": item.id,
        "status": item.status,
        "signed_file_name": item.signed_file_name,
        "signed_at": item.signed_at.isoformat(),
    }


@documents_router.delete("/checklist/items/{item_id}")
async def delete_checklist_item(
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an item from a deal checklist."""
    result = await db.execute(
        select(DealContractChecklist).where(
            DealContractChecklist.id == item_id,
            DealContractChecklist.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    await db.delete(item)
    await db.commit()
    return {"success": True}


@documents_router.post("/checklist/items/{item_id}/generate")
async def generate_from_checklist(
    item_id: str,
    body: GenerateContractRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a contract for a checklist item using its linked template."""
    result = await db.execute(
        select(DealContractChecklist).where(
            DealContractChecklist.id == item_id,
            DealContractChecklist.user_id == current_user.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    template_id = body.template_id or item.document_template_id
    if not template_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No template linked to this checklist item",
        )

    # Reuse the generate contract logic
    body.template_id = template_id
    body.deal_id = body.deal_id or item.deal_id
    gen_result = await generate_contract(body, current_user, db)

    item.status = "generated"
    item.generated_contract_id = gen_result["contract_id"]
    item.updated_at = datetime.utcnow()
    await db.commit()

    return {
        "contract_id": gen_result["contract_id"],
        "storage_url": gen_result["storage_url"],
    }


# ═══════════════════════════════════════════════════════════════
# State matching
# ═══════════════════════════════════════════════════════════════


@documents_router.get("/templates/match")
async def match_template(
    state: str,
    deal_type: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find the best matching template for a state and deal type."""
    # 1. User's own template matching state + name pattern
    result = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.user_id == current_user.id,
        )
    )
    user_templates = result.scalars().all()
    state_upper = state.upper()

    for t in user_templates:
        if state_upper in (t.name or "").upper() or state_upper in (t.category or "").upper():
            return {"template_id": t.id, "source": "user"}

    # 2. System template matching state
    result = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.is_default == True,  # noqa: E712
        )
    )
    system_templates = result.scalars().all()

    for t in system_templates:
        if state_upper in (t.name or "").upper() or state_upper in (t.category or "").upper():
            return {"template_id": t.id, "source": "system"}

    # 3. Generic fallback — first system template matching deal_type category
    for t in system_templates:
        if deal_type.replace("_", " ").lower() in (t.category or "").lower():
            return {"template_id": t.id, "source": "generic"}

    # No match
    return {"template_id": None, "source": None}


# ═══════════════════════════════════════════════════════════════
# Letter of Intent
# ═══════════════════════════════════════════════════════════════


@documents_router.post("/loi/generate")
async def generate_loi(
    body: GenerateLoiRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a Letter of Intent .docx and save to storage."""
    settings = get_settings()

    loi_data = {
        "homeowner_name": body.homeowner_name,
        "property_address": body.property_address,
        "purchase_price": body.purchase_price,
        "as_is_value": body.as_is_value,
        "existing_mortgage_balance": body.existing_mortgage_balance,
        "monthly_payment": body.monthly_payment,
        "interest_rate": body.interest_rate,
        "owner_finance_down": body.owner_finance_down,
        "lease_option_term": body.lease_option_term,
        "lease_monthly_payment": body.lease_monthly_payment,
        "option_purchase_price": body.option_purchase_price,
        "additional_notes": body.additional_notes or "",
        "included_options": body.included_options,
    }

    try:
        docx_b64 = document_service.generate_loi_docx(loi_data, current_user)
    except Exception as e:
        logger.error("LOI generation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate LOI document",
        ) from e

    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    file_name = f"Letter of Intent - {body.homeowner_name} - {date_str}.docx"
    company_name = current_user.company_name or "My Company"
    storage_url = ""

    if body.storage_provider == "google_drive":
        try:
            result_storage = await storage_service.save_to_google_drive(
                docx_b64, file_name, company_name, body.homeowner_name, settings
            )
            storage_url = result_storage.get("web_view_link", "")
        except Exception as e:
            logger.error("Google Drive upload error: %s", e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to save to Google Drive: {e}",
            ) from e
    elif body.storage_provider == "dropbox":
        try:
            result_storage = await storage_service.save_to_dropbox(
                docx_b64, file_name, company_name, body.homeowner_name, settings
            )
            storage_url = result_storage.get("sharing_url", "")
        except Exception as e:
            logger.error("Dropbox upload error: %s", e)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to save to Dropbox: {e}",
            ) from e
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="storage_provider must be 'google_drive' or 'dropbox'",
        )

    loi = LetterOfIntent(
        user_id=current_user.id,
        deal_id=body.deal_id,
        included_options=json.dumps(body.included_options),
        homeowner_name=body.homeowner_name,
        property_address=body.property_address,
        purchase_price=body.purchase_price,
        as_is_value=body.as_is_value,
        existing_mortgage_balance=body.existing_mortgage_balance,
        monthly_payment=body.monthly_payment,
        interest_rate=body.interest_rate,
        owner_finance_down=body.owner_finance_down,
        lease_option_term=body.lease_option_term,
        lease_monthly_payment=body.lease_monthly_payment,
        option_purchase_price=body.option_purchase_price,
        additional_notes=body.additional_notes,
        generated_file_name=file_name,
        storage_url=storage_url,
    )
    db.add(loi)

    # Also create a checklist item for the LOI
    # Find or create a checklist template for LOI
    tpl_result = await db.execute(
        select(ContractChecklistTemplate).where(
            ContractChecklistTemplate.user_id == current_user.id,
            ContractChecklistTemplate.name == "Letter of Intent",
        ).limit(1)
    )
    checklist_tpl = tpl_result.scalar_one_or_none()

    if checklist_tpl:
        # Check if there's already an LOI checklist item for this deal
        existing_result = await db.execute(
            select(DealContractChecklist).where(
                DealContractChecklist.deal_id == body.deal_id,
                DealContractChecklist.user_id == current_user.id,
                DealContractChecklist.name == "Letter of Intent",
            ).limit(1)
        )
        existing_item = existing_result.scalar_one_or_none()

        if existing_item:
            existing_item.status = "generated"
            existing_item.updated_at = datetime.utcnow()
        else:
            cl_item = DealContractChecklist(
                user_id=current_user.id,
                deal_id=body.deal_id,
                checklist_template_id=checklist_tpl.id,
                name="Letter of Intent",
                status="generated",
                sort_order=0,
            )
            db.add(cl_item)

    await db.commit()
    await db.refresh(loi)

    return {
        "loi_id": loi.id,
        "file_name": file_name,
        "storage_url": storage_url,
    }


@documents_router.get("/loi/{deal_id}")
async def list_deal_lois(
    deal_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all LOIs for a deal."""
    result = await db.execute(
        select(LetterOfIntent).where(
            LetterOfIntent.deal_id == deal_id,
            LetterOfIntent.user_id == current_user.id,
        ).order_by(LetterOfIntent.created_at.desc())
    )
    lois = result.scalars().all()

    return {
        "lois": [
            {
                "id": loi.id,
                "deal_id": loi.deal_id,
                "included_options": json.loads(loi.included_options)
                if loi.included_options
                else [],
                "homeowner_name": loi.homeowner_name,
                "property_address": loi.property_address,
                "purchase_price": loi.purchase_price,
                "generated_file_name": loi.generated_file_name,
                "storage_url": loi.storage_url,
                "created_at": loi.created_at.isoformat(),
            }
            for loi in lois
        ]
    }


# ── Generate Contract from Deal Data ──────────────────────────────


class GenerateFromDealRequest(BaseModel):
    template_id: str
    transaction_phase: str = "buying"  # buying, selling, holding
    custom_fields: Optional[dict] = None


@documents_router.post("/generate-from-deal/{deal_id}")
async def generate_contract_from_deal(
    deal_id: str,
    body: GenerateFromDealRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a contract using a template + deal data, store as DealFile."""
    if body.transaction_phase not in ("buying", "selling", "holding"):
        raise HTTPException(status_code=400, detail="transaction_phase must be 'buying', 'selling', or 'holding'")

    # Fetch template
    result = await db.execute(
        select(DocumentTemplate).where(
            DocumentTemplate.id == body.template_id,
            DocumentTemplate.user_id == current_user.id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Fetch deal
    deal_result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == current_user.id,
            CrmDeal.is_deleted == False,
        )
    )
    deal = deal_result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Build merge data from deal fields
    full_address = " ".join(filter(None, [deal.address, deal.city, deal.state, deal.zip]))
    contract_data = {
        "homeowner_name": deal.contact_name or "",
        "buying_entity": "",
        "property_address": full_address,
        "purchase_price": deal.purchase_price,
        "closing_date": deal.closing_date.strftime("%m/%d/%Y") if deal.closing_date else "",
        "emd_amount": deal.earnest_money,
        "additional_clauses": "",
    }

    # Add extra deal fields as custom fields for templates that need them
    deal_custom = {
        "DEAL_TITLE": deal.title or "",
        "SELLER_NAME": deal.contact_name or "",
        "PROPERTY_TYPE": deal.property_type or "",
        "BEDROOMS": str(deal.bedrooms or ""),
        "BATHROOMS": str(deal.bathrooms or ""),
        "SQUARE_FOOTAGE": str(deal.square_footage or ""),
        "YEAR_BUILT": str(deal.year_built or ""),
        "LIST_PRICE": str(deal.list_price or ""),
        "OFFER_PRICE": str(deal.offer_price or ""),
        "ARV": str(deal.arv or ""),
        "LOAN_AMOUNT": str(deal.loan_amount or ""),
        "INTEREST_RATE": str(deal.interest_rate or ""),
        "MORTGAGE_BALANCE": str(deal.mortgage_balance or ""),
        "MONTHLY_RENT": str(deal.monthly_rent or ""),
    }
    if body.custom_fields:
        deal_custom.update(body.custom_fields)
    contract_data["custom_fields"] = deal_custom

    merge_data = document_service.build_merge_data(current_user, contract_data)
    merged_b64 = document_service.merge_document(template.file_content, merge_data)

    # Generate file name: Document Name - Homeowner - Street, City, ST Zip
    file_name = document_service.generate_file_name(
        template.name,
        deal.contact_name or "Unknown",
        property_address=full_address,
    )

    # Save as DealFile
    deal_file = DealFile(
        user_id=current_user.id,
        deal_id=deal_id,
        file_type="document",
        category="contract",
        file_name=file_name,
        mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        file_size=len(base64.b64decode(merged_b64)),
        file_content=merged_b64,
        transaction_phase=body.transaction_phase,
        created_at=datetime.utcnow(),
    )
    db.add(deal_file)
    await db.commit()
    await db.refresh(deal_file)

    return {
        "id": deal_file.id,
        "dealId": deal_file.deal_id,
        "fileType": deal_file.file_type,
        "category": deal_file.category,
        "fileName": deal_file.file_name,
        "mimeType": deal_file.mime_type,
        "fileSize": deal_file.file_size,
        "transactionPhase": deal_file.transaction_phase,
        "createdAt": deal_file.created_at.isoformat(),
    }
