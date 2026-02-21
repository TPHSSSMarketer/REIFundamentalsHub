"""Document & Contract Automation routes."""

from __future__ import annotations

import base64
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import DocumentTemplate, GeneratedContract, User
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

    # Generate file name
    file_name = document_service.generate_file_name(
        template.name, body.homeowner_name, body.buying_entity
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
