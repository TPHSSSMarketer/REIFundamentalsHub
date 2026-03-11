"""ContentHub API routes — persistent content database, search, and analytics."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.user import User
from rei.services.content_hub_service import (
    get_publish_history,
    list_content_entries,
    rebuild_content_embeddings,
    save_publish_record,
    save_source_article,
    save_waterfall_content,
    search_content,
    update_performance,
)

logger = logging.getLogger(__name__)
content_hub_router = APIRouter(prefix="/content-hub", tags=["content-hub"])


# ── Schemas ───────────────────────────────────────────────────────────────


class SaveSourceRequest(BaseModel):
    source_url: Optional[str] = None
    source_text: str
    topic: str
    tags: list[str] = []


class SaveWaterfallRequest(BaseModel):
    topic: str
    waterfall_output: dict
    source_article_id: Optional[str] = None
    tags: list[str] = []


class PublishRecordRequest(BaseModel):
    content_entry_id: str
    platform: str
    platform_post_id: Optional[str] = None
    status: str = "success"
    error_message: Optional[str] = None


class UpdatePerformanceRequest(BaseModel):
    rating: Optional[str] = None  # worked, flopped, pending
    notes: Optional[str] = None


class SearchRequest(BaseModel):
    query: str


# ── Endpoints ─────────────────────────────────────────────────────────────


@content_hub_router.post("/save-source")
async def api_save_source(
    body: SaveSourceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a scraped source article to the content database + auto-embed."""
    uid = workspace_user_id(user)
    try:
        entry_id = await save_source_article(
            user_id=uid,
            source_url=body.source_url,
            source_text=body.source_text,
            topic=body.topic,
            tags=body.tags,
            db=db,
        )
        return {"status": "saved", "id": entry_id}
    except Exception as exc:
        logger.error("Failed to save source article: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])


@content_hub_router.post("/save-waterfall")
async def api_save_waterfall(
    body: SaveWaterfallRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save generated waterfall content + auto-embed for semantic search."""
    uid = workspace_user_id(user)
    try:
        entry_id = await save_waterfall_content(
            user_id=uid,
            topic=body.topic,
            waterfall_output=body.waterfall_output,
            source_article_id=body.source_article_id,
            tags=body.tags,
            db=db,
        )
        return {"status": "saved", "id": entry_id}
    except Exception as exc:
        logger.error("Failed to save waterfall: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])


@content_hub_router.post("/publish-record")
async def api_record_publish(
    body: PublishRecordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record that content was published to a social platform."""
    uid = workspace_user_id(user)
    try:
        record_id = await save_publish_record(
            user_id=uid,
            content_entry_id=body.content_entry_id,
            platform=body.platform,
            platform_post_id=body.platform_post_id,
            status=body.status,
            error_message=body.error_message,
            db=db,
        )
        return {"status": "recorded", "id": record_id}
    except Exception as exc:
        logger.error("Failed to record publish: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])


@content_hub_router.get("/library")
async def api_list_library(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    content_type: Optional[str] = None,
    platform: Optional[str] = None,
    tag: Optional[str] = None,
    rating: Optional[str] = None,
):
    """List the user's content library with optional filters."""
    uid = workspace_user_id(user)
    entries = await list_content_entries(
        user_id=uid, db=db,
        content_type=content_type, platform=platform, tag=tag, rating=rating,
    )
    return {"entries": entries, "count": len(entries)}


@content_hub_router.post("/search")
async def api_search(
    body: SearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Semantic search over the user's content database."""
    uid = workspace_user_id(user)
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="Search query is required.")
    results = await search_content(user_id=uid, query=body.query.strip(), db=db)
    return {"results": results, "count": len(results)}


@content_hub_router.put("/content/{content_id}/performance")
async def api_update_performance(
    content_id: str,
    body: UpdatePerformanceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update performance tracking — rate as worked/flopped and add notes."""
    uid = workspace_user_id(user)
    try:
        entry = await update_performance(
            user_id=uid, content_entry_id=content_id,
            rating=body.rating, notes=body.notes, db=db,
        )
        return {"status": "updated", "entry": entry}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@content_hub_router.get("/publish-history")
async def api_publish_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    content_entry_id: Optional[str] = None,
):
    """Get publish records with engagement metrics."""
    uid = workspace_user_id(user)
    records = await get_publish_history(user_id=uid, db=db, content_entry_id=content_entry_id)
    return {"records": records, "count": len(records)}


@content_hub_router.post("/rebuild-embeddings")
async def api_rebuild_embeddings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Re-embed all content entries into Qdrant (migration / sync tool)."""
    uid = workspace_user_id(user)
    try:
        count = await rebuild_content_embeddings(user_id=uid, db=db)
        return {"status": "completed", "count": count}
    except Exception as exc:
        logger.error("Failed to rebuild content embeddings: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)[:200])
