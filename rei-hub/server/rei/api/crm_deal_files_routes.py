"""CRM Deal Files — photos and documents attached to deals."""

from __future__ import annotations

import base64
import io
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.crm import DealFile
from rei.models.user import User

logger = logging.getLogger(__name__)

crm_deal_files_router = APIRouter(prefix="/crm/deals", tags=["crm-deal-files"])


# ── Helpers ─────────────────────────────────────────────────


def compress_image(
    file_bytes: bytes, max_width: int = 1920, quality: int = 85
) -> tuple[bytes, bytes]:
    """
    Compress an image and create a thumbnail.

    Args:
        file_bytes: Raw image bytes
        max_width: Maximum width for the compressed image
        quality: JPEG quality (1-100)

    Returns:
        Tuple of (compressed_bytes, thumbnail_bytes)
    """
    try:
        # Open image with PIL
        img = Image.open(io.BytesIO(file_bytes))

        # Convert RGBA to RGB (handle PNG transparency)
        if img.mode == "RGBA":
            rgb_img = Image.new("RGB", img.size, (255, 255, 255))
            rgb_img.paste(img, mask=img.split()[3])
            img = rgb_img

        # Resize if width exceeds max_width, maintaining aspect ratio
        if img.width > max_width:
            ratio = max_width / img.width
            new_height = int(img.height * ratio)
            img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)

        # Save compressed image as JPEG
        compressed_buffer = io.BytesIO()
        img.save(compressed_buffer, format="JPEG", quality=quality, optimize=True)
        compressed_bytes = compressed_buffer.getvalue()

        # Create thumbnail (300px wide)
        thumbnail_img = img.copy()
        if thumbnail_img.width > 300:
            ratio = 300 / thumbnail_img.width
            new_height = int(thumbnail_img.height * ratio)
            thumbnail_img = thumbnail_img.resize((300, new_height), Image.Resampling.LANCZOS)

        thumbnail_buffer = io.BytesIO()
        thumbnail_img.save(
            thumbnail_buffer, format="JPEG", quality=70, optimize=True
        )
        thumbnail_bytes = thumbnail_buffer.getvalue()

        return compressed_bytes, thumbnail_bytes
    except Exception as e:
        logger.error(f"Image compression failed: {e}")
        raise HTTPException(
            status_code=400, detail=f"Failed to compress image: {str(e)}"
        )


def _file_to_dict(f: DealFile) -> dict:
    """Convert DealFile to dict (metadata only, no content)."""
    return {
        "id": f.id,
        "dealId": f.deal_id,
        "fileType": f.file_type,
        "category": f.category,
        "fileName": f.file_name,
        "mimeType": f.mime_type,
        "fileSize": f.file_size,
        "notes": f.notes,
        "transactionPhase": f.transaction_phase,
        "createdAt": f.created_at.isoformat() if f.created_at else None,
    }


def _file_to_dict_full(f: DealFile) -> dict:
    """Convert DealFile to dict with content (for single-file endpoints)."""
    result = _file_to_dict(f)
    result["fileContent"] = f.file_content
    result["thumbnail"] = f.thumbnail
    return result


# ── Endpoints ───────────────────────────────────────────────


@crm_deal_files_router.get("/{deal_id}/files")
async def list_deal_files(
    deal_id: str,
    file_type: Optional[str] = None,
    transaction_phase: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all files for a deal (metadata only, no content)."""
    query = select(DealFile).where(
        DealFile.user_id == user.id,
        DealFile.deal_id == deal_id,
    )

    if file_type:
        query = query.where(DealFile.file_type == file_type)
    if transaction_phase:
        query = query.where(DealFile.transaction_phase == transaction_phase)

    query = query.order_by(DealFile.created_at.desc())

    result = await db.execute(query)
    files = result.scalars().all()
    return [_file_to_dict(f) for f in files]


@crm_deal_files_router.get("/{deal_id}/files/{file_id}")
async def get_deal_file(
    deal_id: str,
    file_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single file with content."""
    result = await db.execute(
        select(DealFile).where(
            DealFile.user_id == user.id,
            DealFile.deal_id == deal_id,
            DealFile.id == file_id,
        )
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return _file_to_dict_full(file)


@crm_deal_files_router.get("/{deal_id}/files/{file_id}/thumbnail")
async def get_deal_file_thumbnail(
    deal_id: str,
    file_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get just the thumbnail base64 for a file."""
    result = await db.execute(
        select(DealFile).where(
            DealFile.user_id == user.id,
            DealFile.deal_id == deal_id,
            DealFile.id == file_id,
        )
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")
    return {"thumbnail": file.thumbnail}


@crm_deal_files_router.post("/{deal_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_deal_file(
    deal_id: str,
    file: UploadFile = File(...),
    category: str = Form(...),
    file_type: str = Form(default="photo"),
    notes: Optional[str] = Form(None),
    transaction_phase: Optional[str] = Form(None),
    replace_file_id: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file (photo or document) to a deal.

    Pass ``replace_file_id`` to overwrite an existing file in place
    (keeps same slot — same category, phase, position — just swaps
    the content, e.g. unsigned → signed contract).
    """
    # Validate transaction_phase if provided
    if transaction_phase and transaction_phase not in ("buying", "selling", "holding"):
        raise HTTPException(status_code=400, detail="transaction_phase must be 'buying', 'selling', or 'holding'")

    try:
        file_bytes = await file.read()
        mime_type = file.content_type or ""
        file_size = len(file_bytes)

        # Handle image compression for photos
        if file_type == "photo" and mime_type.startswith("image/"):
            compressed_bytes, thumbnail_bytes = compress_image(file_bytes)
            file_content_b64 = base64.b64encode(compressed_bytes).decode("utf-8")
            thumbnail_b64 = base64.b64encode(thumbnail_bytes).decode("utf-8")
        else:
            # For documents, just base64 encode raw bytes
            file_content_b64 = base64.b64encode(file_bytes).decode("utf-8")
            thumbnail_b64 = None

        # ── Overwrite existing file if replace_file_id provided ──
        if replace_file_id:
            result = await db.execute(
                select(DealFile).where(
                    DealFile.user_id == user.id,
                    DealFile.deal_id == deal_id,
                    DealFile.id == replace_file_id,
                )
            )
            existing = result.scalar_one_or_none()
            if not existing:
                raise HTTPException(status_code=404, detail="File to replace not found")

            # Update content in place — keep same id, category, phase, slot
            existing.file_name = file.filename or existing.file_name
            existing.mime_type = mime_type
            existing.file_size = file_size
            existing.file_content = file_content_b64
            existing.thumbnail = thumbnail_b64
            if notes is not None:
                existing.notes = notes
            existing.created_at = datetime.utcnow()  # bump timestamp

            await db.commit()
            await db.refresh(existing)
            return _file_to_dict(existing)

        # ── Normal: create new file ──
        deal_file = DealFile(
            user_id=user.id,
            deal_id=deal_id,
            file_type=file_type,
            category=category,
            file_name=file.filename or "unnamed",
            mime_type=mime_type,
            file_size=file_size,
            file_content=file_content_b64,
            thumbnail=thumbnail_b64,
            notes=notes,
            transaction_phase=transaction_phase,
            created_at=datetime.utcnow(),
        )

        db.add(deal_file)
        await db.commit()
        await db.refresh(deal_file)

        return _file_to_dict(deal_file)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File upload failed: {e}")
        raise HTTPException(status_code=400, detail=f"File upload failed: {str(e)}")


@crm_deal_files_router.delete("/{deal_id}/files/{file_id}")
async def delete_deal_file(
    deal_id: str,
    file_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a file (hard delete)."""
    result = await db.execute(
        select(DealFile).where(
            DealFile.user_id == user.id,
            DealFile.deal_id == deal_id,
            DealFile.id == file_id,
        )
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    await db.delete(file)
    await db.commit()
    return {"detail": "File deleted"}
