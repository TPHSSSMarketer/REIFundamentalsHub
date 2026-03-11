"""Content Hub service — persistent content database with Qdrant vector search.

Provides save, search, and analytics functions for ContentHub.
Uses the same embedding model as the Voice AI RAG but stores embeddings in
a SEPARATE Qdrant collection (content_user_{id}) so the two systems stay
completely isolated from the knowledge base vectors.

Architecture:
  - ContentEntry metadata lives in SQLite (the main DB)
  - Embedding vectors live in Qdrant collection "content_user_{user_id}"
  - Falls back to SQLite content_embeddings table if Qdrant unavailable
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.crm import ContentEmbedding, ContentEntry, ContentPublishRecord

logger = logging.getLogger(__name__)

# ── Embedding (reuses the same lazy-loaded model from rag_service) ────────

_MODEL_NAME = "all-MiniLM-L6-v2"
_EMBEDDING_DIM = 384


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


# ── Qdrant helpers (reuse the connection from rag_service) ────────────────


def _content_collection_name(user_id: int) -> str:
    """Qdrant collection name for a user's content library."""
    return f"content_user_{user_id}"


async def _get_qdrant():
    """Get the shared Qdrant client from rag_service."""
    from rei.services.rag_service import _get_qdrant as _rag_get_qdrant
    return await _rag_get_qdrant()


async def _ensure_content_collection(client, user_id: int) -> str:
    """Create the content collection if it doesn't exist. Returns name."""
    from qdrant_client.models import Distance, VectorParams

    col = _content_collection_name(user_id)
    collections = client.get_collections().collections
    existing = {c.name for c in collections}

    if col not in existing:
        client.create_collection(
            collection_name=col,
            vectors_config=VectorParams(
                size=_EMBEDDING_DIM,
                distance=Distance.COSINE,
            ),
        )
        logger.info("Created Qdrant content collection '%s'.", col)

    return col


# ── Content Embedding CRUD ────────────────────────────────────────────────


async def _embed_content_entry(
    entry_id: str, text: str, user_id: int, db: AsyncSession,
    entry_meta: Optional[dict] = None,
) -> bool:
    """Create or update the embedding for a content entry.

    Tries Qdrant first, falls back to SQLite.
    entry_meta is optional payload to store alongside the vector in Qdrant.
    """
    vector = _embed(text)
    if vector is None:
        return False

    # Try Qdrant first
    client = await _get_qdrant()
    if client is not None:
        return await _upsert_content_qdrant(client, entry_id, vector, user_id, entry_meta)

    # Fallback: SQLite
    return await _upsert_content_sqlite(entry_id, vector, user_id, db)


async def _upsert_content_qdrant(
    client, entry_id: str, vector: list[float], user_id: int,
    entry_meta: Optional[dict] = None,
) -> bool:
    """Store content embedding in Qdrant."""
    from qdrant_client.models import PointStruct

    try:
        col = await _ensure_content_collection(client, user_id)

        payload = {
            "content_entry_id": entry_id,
            "user_id": user_id,
        }
        if entry_meta:
            payload.update(entry_meta)

        point = PointStruct(
            id=entry_id,
            vector=vector,
            payload=payload,
        )
        client.upsert(collection_name=col, points=[point])
        logger.info("Embedded content '%s' in Qdrant collection '%s'.", entry_id, col)
        return True

    except Exception as exc:
        logger.error("Qdrant content upsert failed for %s: %s", entry_id, exc)
        return False


async def _upsert_content_sqlite(
    entry_id: str, vector: list[float], user_id: int, db: AsyncSession,
) -> bool:
    """Legacy fallback: store content embedding in SQLite."""
    try:
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
    except Exception as exc:
        logger.error("SQLite content embedding fallback failed: %s", exc)
        return False


async def _delete_content_embedding(entry_id: str, user_id: int, db: AsyncSession) -> None:
    """Remove embedding for a deleted content entry."""
    # Try Qdrant first
    client = await _get_qdrant()
    if client is not None:
        try:
            from qdrant_client.models import PointIdsList
            col = _content_collection_name(user_id)
            client.delete(
                collection_name=col,
                points_selector=PointIdsList(points=[entry_id]),
            )
            logger.info("Deleted content embedding %s from Qdrant.", entry_id)
        except Exception as exc:
            logger.warning("Failed to delete content embedding from Qdrant: %s", exc)
        return

    # Fallback: SQLite
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
    meta = {
        "content_type": "source_article",
        "topic": topic,
        "source_url": source_url or "",
    }
    await _embed_content_entry(entry.id, embed_text, user_id, db, entry_meta=meta)
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
    """Save generated waterfall content and embed for semantic search."""
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
    all_content_parts = [f"Content waterfall: {topic}"]
    platforms_summary = []
    for platform, content in waterfall_output.items():
        if content:
            all_content_parts.append(f"{platform}: {content[:1000]}")
            platforms_summary.append(platform)
    embed_text = "\n".join(all_content_parts)[:8000]

    meta = {
        "content_type": "waterfall",
        "topic": topic,
        "platforms": ", ".join(platforms_summary),
        "tags": json.dumps(tags),
    }
    await _embed_content_entry(entry.id, embed_text, user_id, db, entry_meta=meta)

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
    """Semantic search over the user's content library.

    Uses Qdrant for fast vector search, falls back to SQLite brute-force.
    """
    query_vec = _embed(query)
    if query_vec is None:
        # Fallback: return all entries if embedding model unavailable
        return await list_content_entries(user_id, db)

    # Try Qdrant first
    client = await _get_qdrant()
    if client is not None:
        results = await _search_content_qdrant(
            client, user_id, query_vec, top_k, similarity_threshold, db
        )
        if results is not None:
            return results

    # Fallback: SQLite brute-force search
    return await _search_content_sqlite(user_id, query_vec, top_k, similarity_threshold, db)


async def _search_content_qdrant(
    client, user_id: int, query_vec: list[float],
    top_k: int, threshold: float, db: AsyncSession,
) -> Optional[list[dict]]:
    """Search content in Qdrant. Returns None if collection doesn't exist."""
    try:
        col = _content_collection_name(user_id)
        collections = {c.name for c in client.get_collections().collections}

        if col not in collections:
            return None  # No content indexed yet

        hits = client.search(
            collection_name=col,
            query_vector=query_vec,
            limit=top_k,
            score_threshold=threshold,
        )

        if not hits:
            return []

        # Fetch full ContentEntry records from SQLite
        hit_ids = [h.id for h in hits]
        hit_scores = {h.id: h.score for h in hits}

        result = await db.execute(
            select(ContentEntry).where(
                and_(
                    ContentEntry.id.in_(hit_ids),
                    ContentEntry.is_active.is_(True),
                )
            )
        )
        entries_map = {e.id: e for e in result.scalars().all()}

        # Return in similarity order
        results = []
        for hit in hits:
            entry = entries_map.get(hit.id)
            if entry:
                d = _entry_to_dict(entry)
                d["similarity"] = round(hit.score, 4)
                results.append(d)

        return results

    except Exception as exc:
        logger.warning("Qdrant content search failed: %s — falling back to SQLite.", exc)
        return None


async def _search_content_sqlite(
    user_id: int, query_vec: list[float],
    top_k: int, threshold: float, db: AsyncSession,
) -> list[dict]:
    """Legacy SQLite brute-force vector search for content."""
    import numpy as np

    result = await db.execute(
        select(ContentEmbedding).where(ContentEmbedding.user_id == user_id)
    )
    embeddings = result.scalars().all()

    scored = []
    for emb in embeddings:
        try:
            stored_vec = json.loads(emb.embedding)
        except json.JSONDecodeError:
            continue
        # Cosine similarity
        a = np.array(query_vec, dtype=np.float32)
        b = np.array(stored_vec, dtype=np.float32)
        dot = np.dot(a, b)
        norm = np.linalg.norm(a) * np.linalg.norm(b)
        sim = float(dot / norm) if norm > 0 else 0.0

        if sim >= threshold:
            scored.append((emb.content_entry_id, sim))

    scored.sort(key=lambda x: x[1], reverse=True)
    top_ids = [entry_id for entry_id, _ in scored[:top_k]]

    if not top_ids:
        return []

    result = await db.execute(
        select(ContentEntry).where(
            and_(
                ContentEntry.id.in_(top_ids),
                ContentEntry.is_active.is_(True),
            )
        )
    )
    entries_map = {e.id: e for e in result.scalars().all()}

    results = []
    for entry_id, sim in scored[:top_k]:
        entry = entries_map.get(entry_id)
        if entry:
            d = _entry_to_dict(entry)
            d["similarity"] = round(sim, 4)
            results.append(d)

    return results


async def rebuild_content_embeddings(user_id: int, db: AsyncSession) -> int:
    """Re-embed all active content entries for a user into Qdrant.

    Useful after migrating to Qdrant or if embeddings get out of sync.
    Returns the number of entries re-embedded.
    """
    result = await db.execute(
        select(ContentEntry).where(
            and_(
                ContentEntry.user_id == user_id,
                ContentEntry.is_active.is_(True),
            )
        )
    )
    entries = result.scalars().all()
    count = 0

    for entry in entries:
        # Build embed text based on content type
        if entry.content_type == "source_article":
            embed_text = f"Source article: {entry.topic}\n{(entry.source_text or '')[:6000]}"
            meta = {
                "content_type": "source_article",
                "topic": entry.topic or "",
                "source_url": entry.source_url or "",
            }
        elif entry.content_type == "waterfall":
            parts = [f"Content waterfall: {entry.topic}"]
            try:
                waterfall = json.loads(entry.content_json or "{}")
                for platform, content in waterfall.items():
                    if content:
                        parts.append(f"{platform}: {content[:1000]}")
            except json.JSONDecodeError:
                pass
            embed_text = "\n".join(parts)[:8000]
            meta = {
                "content_type": "waterfall",
                "topic": entry.topic or "",
            }
        else:
            embed_text = f"{entry.topic}\n{(entry.source_text or '')[:6000]}"
            meta = {
                "content_type": entry.content_type or "unknown",
                "topic": entry.topic or "",
            }

        ok = await _embed_content_entry(entry.id, embed_text, user_id, db, entry_meta=meta)
        if ok:
            count += 1

    await db.commit()
    logger.info("Rebuilt %d content embeddings for user %s.", count, user_id)
    return count


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
