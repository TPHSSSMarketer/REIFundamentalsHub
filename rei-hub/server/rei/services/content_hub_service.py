"""Content Hub service — persistent content database with its own RAG embeddings.

Provides save, search, and analytics functions for ContentHub.
Uses the same embedding model as the Voice AI RAG but stores embeddings in
a SEPARATE table (content_embeddings) so the two systems stay isolated.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

import numpy as np
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.crm import ContentEmbedding, ContentEntry, ContentPublishRecord

logger = logging.getLogger(__name__)

# ── Embedding (reuses the same lazy-loaded model from rag_service) ────────

_MODEL_NAME = "all-MiniLM-L6-v2"


def _get_model():
    """Reuse the same sentence-transformers model as rag_service."""
    from rei.services.rag_service import _get_model as _rag_get_model
    return _rag_get_model()


def _embed(text: str) -> Optional[list[float]]:
    """Embed a single text string. Returns None if model unavailable."""
    model = _get_model()
    if model is None:
        return None
    text = text[:8000]
    vector = model.encode(text, show_progress_bar=False)
    return vector.tolist()


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    a_arr = np.array(a, dtype=np.float32)
    b_arr = np.array(b, dtype=np.float32)
    dot = np.dot(a_arr, b_arr)
    norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    if norm == 0:
        return 0.0
    return float(dot / norm)


# ── Content Embedding CRUD ────────────────────────────────────────────────


async def _embed_content_entry(entry_id: str, text: str, user_id: int, db: AsyncSession) -> bool:
    """Create or update the embedding for a content entry."""
    vector = _embed(text)
    if vector is None:
        return False

    existing = await db.execute(
        select(ContentEmbedding).where(ContentEmbedding.content_entry_id == entry_id)
    )
    emb = existing.scalar_one_or_none()
    if emb:
        emb.embedding = json.dumps(vector)
        emb.model_name = _MODEL_NAME
    else:
        emb = ContentEmbedding(
            content_entry_id=entry_id,
            user_id=user_id,
            embedding=json.dumps(vector),
            model_name=_MODEL_NAME,
        )
        db.add(emb)
    return True


async def _delete_content_embedding(entry_id: str, db: AsyncSession) -> None:
    """Remove embedding for a deleted content entry."""
    await db.execute(
        delete(ContentEmbedding).where(ContentEmbedding.content_entry_id == entry_id)
    )


# ── Save Functions ────────────────────────────────────────────────────────


async def save_source_article(
    user_id: int,
    source_url: Optional[str],
    source_text: str,
    topic: str,
    tags: list[str],
    db: AsyncSession,
) -> str:
    """Save a scraped source article and embed it for semantic search."""
    entry = ContentEntry(
        user_id=user_id,
        content_type="source_article",
        source_url=source_url,
        source_text=source_text,
        topic=topic,
        tags_json=json.dumps(tags),
    )
    db.add(entry)
    await db.flush()

    # Embed: combine topic + source text
    embed_text = f"Source article: {topic}\n{source_text[:6000]}"
    await _embed_content_entry(entry.id, embed_text, user_id, db)
    await db.commit()

    logger.info("Saved source article '%s' (id=%s) for user %s", topic, entry.id, user_id)
    return entry.id


async def save_waterfall_content(
    user_id: int,
    topic: str,
    waterfall_output: dict,
    source_article_id: Optional[str],
    tags: list[str],
    db: AsyncSession,
) -> str:
    """Save generated waterfall content and create per-platform embeddings."""
    # Save the master waterfall entry
    entry = ContentEntry(
        user_id=user_id,
        content_type="waterfall",
        topic=topic,
        content_json=json.dumps(waterfall_output),
        source_text=source_article_id,  # Store reference to source
        tags_json=json.dumps(tags),
    )
    db.add(entry)
    await db.flush()

    # Create an embedding for the combined waterfall content
    # This makes the whole waterfall searchable
    all_content_parts = [f"Content waterfall: {topic}"]
    for platform, content in waterfall_output.items():
        if content:
            all_content_parts.append(f"{platform}: {content[:1000]}")
    embed_text = "\n".join(all_content_parts)[:8000]
    await _embed_content_entry(entry.id, embed_text, user_id, db)

    await db.commit()
    logger.info("Saved waterfall for topic '%s' (id=%s), user %s", topic, entry.id, user_id)
    return entry.id


async def save_publish_record(
    user_id: int,
    content_entry_id: str,
    platform: str,
    platform_post_id: Optional[str],
    status: str = "success",
    error_message: Optional[str] = None,
    db: AsyncSession = None,
) -> str:
    """Record that content was published to a social platform."""
    record = ContentPublishRecord(
        user_id=user_id,
        content_entry_id=content_entry_id,
        platform=platform,
        platform_post_id=platform_post_id,
        status=status,
        error_message=error_message,
    )
    db.add(record)
    await db.commit()
    logger.info("Recorded publish: %s → %s (post_id=%s)", content_entry_id, platform, platform_post_id)
    return record.id


# ── Query Functions ───────────────────────────────────────────────────────


async def list_content_entries(
    user_id: int,
    db: AsyncSession,
    content_type: Optional[str] = None,
    platform: Optional[str] = None,
    tag: Optional[str] = None,
    rating: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """List content entries with optional filtering. Returns newest first."""
    query = (
        select(ContentEntry)
        .where(and_(ContentEntry.user_id == user_id, ContentEntry.is_active.is_(True)))
        .order_by(ContentEntry.created_at.desc())
        .limit(limit)
    )
    if content_type:
        query = query.where(ContentEntry.content_type == content_type)
    if platform:
        query = query.where(ContentEntry.platform == platform)
    if rating:
        query = query.where(ContentEntry.rating == rating)

    result = await db.execute(query)
    entries = result.scalars().all()

    # Post-filter by tag (JSON array)
    if tag:
        entries = [e for e in entries if tag in json.loads(e.tags_json or "[]")]

    return [_entry_to_dict(e) for e in entries]


async def search_content(
    user_id: int,
    query: str,
    db: AsyncSession,
    top_k: int = 10,
    similarity_threshold: float = 0.25,
) -> list[dict]:
    """Semantic search over the user's content using ContentEmbedding vectors."""
    query_vec = _embed(query)
    if query_vec is None:
        # Fallback: return all entries if embedding model unavailable
        return await list_content_entries(user_id, db)

    # Load all content embeddings for this user
    result = await db.execute(
        select(ContentEmbedding).where(ContentEmbedding.user_id == user_id)
    )
    embeddings = result.scalars().all()

    # Score each
    scored = []
    for emb in embeddings:
        try:
            stored_vec = json.loads(emb.embedding)
        except json.JSONDecodeError:
            continue
        sim = _cosine_similarity(query_vec, stored_vec)
        if sim >= similarity_threshold:
            scored.append((emb.content_entry_id, sim))

    # Sort by similarity descending
    scored.sort(key=lambda x: x[1], reverse=True)
    top_ids = [entry_id for entry_id, _ in scored[:top_k]]

    if not top_ids:
        return []

    # Fetch the matching ContentEntry rows
    result = await db.execute(
        select(ContentEntry).where(
            and_(
                ContentEntry.id.in_(top_ids),
                ContentEntry.is_active.is_(True),
            )
        )
    )
    entries_map = {e.id: e for e in result.scalars().all()}

    # Return in similarity order
    results = []
    for entry_id, sim in scored[:top_k]:
        entry = entries_map.get(entry_id)
        if entry:
            d = _entry_to_dict(entry)
            d["similarity"] = round(sim, 4)
            results.append(d)

    return results


async def update_performance(
    user_id: int,
    content_entry_id: str,
    rating: Optional[str],
    notes: Optional[str],
    db: AsyncSession,
) -> dict:
    """Update performance tracking for a content entry."""
    result = await db.execute(
        select(ContentEntry).where(
            and_(ContentEntry.id == content_entry_id, ContentEntry.user_id == user_id)
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise ValueError("Content entry not found")

    if rating is not None:
        entry.rating = rating
    if notes is not None:
        entry.performance_notes = notes
    entry.updated_at = datetime.utcnow()
    await db.commit()
    return _entry_to_dict(entry)


async def get_publish_history(
    user_id: int,
    db: AsyncSession,
    content_entry_id: Optional[str] = None,
) -> list[dict]:
    """Get publish records for a content entry or all user content."""
    query = (
        select(ContentPublishRecord)
        .where(ContentPublishRecord.user_id == user_id)
        .order_by(ContentPublishRecord.published_at.desc())
    )
    if content_entry_id:
        query = query.where(ContentPublishRecord.content_entry_id == content_entry_id)

    result = await db.execute(query)
    records = result.scalars().all()

    return [
        {
            "id": r.id,
            "content_entry_id": r.content_entry_id,
            "platform": r.platform,
            "platform_post_id": r.platform_post_id,
            "status": r.status,
            "error_message": r.error_message,
            "likes": r.likes,
            "comments": r.comments,
            "shares": r.shares,
            "views": r.views,
            "published_at": r.published_at.isoformat() if r.published_at else None,
        }
        for r in records
    ]


# ── Helpers ───────────────────────────────────────────────────────────────


def _entry_to_dict(entry: ContentEntry) -> dict:
    """Convert ContentEntry model to API response dict."""
    content = {}
    if entry.content_json:
        try:
            content = json.loads(entry.content_json)
        except json.JSONDecodeError:
            pass

    return {
        "id": entry.id,
        "content_type": entry.content_type,
        "topic": entry.topic,
        "platform": entry.platform,
        "source_url": entry.source_url,
        "tags": json.loads(entry.tags_json or "[]"),
        "content": content,
        "rating": entry.rating,
        "performance_notes": entry.performance_notes,
        "engagement_count": entry.engagement_count,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }
