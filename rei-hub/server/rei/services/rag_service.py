"""RAG (Retrieval Augmented Generation) service for REI Hub.

Handles embedding generation, storage in Qdrant vector database, and semantic
retrieval of knowledge entries so the AI Chat gets only the most relevant
context for each query.

The embedding model (sentence-transformers) is loaded lazily on first use.
Vectors are stored in Qdrant Cloud (or a local Qdrant instance).
If Qdrant is not configured, falls back to SQLite-based storage.

Architecture:
  - KnowledgeEntry metadata lives in SQLite (the main DB)
  - Embedding vectors live in Qdrant (fast semantic search)
  - Collection name: "knowledge_{user_id}" per user, plus "knowledge_platform"
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.user import KnowledgeEntry

logger = logging.getLogger(__name__)

# ── Embedding model (lazy-loaded singleton) ──────────────────────────────

_model = None
_MODEL_NAME = "all-MiniLM-L6-v2"
_EMBEDDING_DIM = 384  # Output dimension for all-MiniLM-L6-v2

# ── Qdrant client (lazy-loaded singleton) ────────────────────────────────

_qdrant_client = None
_qdrant_checked = False  # Prevents repeated failed connection attempts

_PLATFORM_COLLECTION = "knowledge_platform"


def _get_model():
    """Lazy-load the sentence-transformers model. Cached after first call."""
    global _model
    if _model is not None:
        return _model
    try:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading embedding model '%s'...", _MODEL_NAME)
        _model = SentenceTransformer(_MODEL_NAME)
        logger.info("Embedding model loaded successfully.")
        return _model
    except ImportError:
        logger.warning(
            "sentence-transformers not installed — RAG disabled, "
            "falling back to full knowledge injection."
        )
        return None
    except Exception as exc:
        logger.error("Failed to load embedding model: %s", exc)
        return None


def _embed(text: str) -> Optional[list[float]]:
    """Embed a single text string. Returns None if model unavailable."""
    model = _get_model()
    if model is None:
        return None
    # Truncate very long texts to keep embedding quality
    text = text[:8000]
    vector = model.encode(text, show_progress_bar=False)
    return vector.tolist()


async def _get_qdrant():
    """Lazy-load the Qdrant client from stored credentials.

    Returns None if Qdrant is not configured (graceful fallback).
    """
    global _qdrant_client, _qdrant_checked

    if _qdrant_client is not None:
        return _qdrant_client

    if _qdrant_checked:
        # Already tried and failed — don't retry every call
        return None

    _qdrant_checked = True

    try:
        from qdrant_client import QdrantClient

        # Try to load credentials from DB
        qdrant_url, qdrant_api_key = await _load_qdrant_credentials()

        if not qdrant_url:
            logger.info(
                "Qdrant URL not configured — RAG will use SQLite fallback. "
                "Configure Qdrant in SuperAdmin > Credentials for vector search."
            )
            return None

        kwargs = {"url": qdrant_url, "timeout": 30}
        if qdrant_api_key:
            kwargs["api_key"] = qdrant_api_key

        client = QdrantClient(**kwargs)

        # Quick connectivity check
        client.get_collections()

        _qdrant_client = client
        logger.info("Connected to Qdrant at %s", qdrant_url)
        return _qdrant_client

    except ImportError:
        logger.warning("qdrant-client not installed — using SQLite fallback.")
        return None
    except Exception as exc:
        logger.error("Failed to connect to Qdrant: %s — using SQLite fallback.", exc)
        return None


async def _load_qdrant_credentials() -> tuple[str, str]:
    """Load Qdrant URL and API key from the credentials store."""
    try:
        from rei.database import async_session_factory
        from rei.services.credentials_service import get_provider_credentials

        async with async_session_factory() as db:
            creds = await get_provider_credentials(db, "qdrant")
            if creds:
                return creds.get("qdrant_url", ""), creds.get("qdrant_api_key", "")
    except Exception as exc:
        logger.warning("Could not load Qdrant credentials: %s", exc)
    return "", ""


def _collection_name(user_id: Optional[int]) -> str:
    """Return the Qdrant collection name for a user (or platform)."""
    if user_id is None:
        return _PLATFORM_COLLECTION
    return f"knowledge_user_{user_id}"


async def _ensure_collection(client, collection_name: str) -> None:
    """Create the Qdrant collection if it doesn't exist."""
    from qdrant_client.models import Distance, VectorParams

    collections = client.get_collections().collections
    existing = {c.name for c in collections}

    if collection_name not in existing:
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=_EMBEDDING_DIM,
                distance=Distance.COSINE,
            ),
        )
        logger.info("Created Qdrant collection '%s'.", collection_name)


def reset_qdrant_client() -> None:
    """Reset the cached Qdrant client (useful after credential changes)."""
    global _qdrant_client, _qdrant_checked
    _qdrant_client = None
    _qdrant_checked = False
    logger.info("Qdrant client cache cleared — will reconnect on next use.")


# ── Embedding CRUD ───────────────────────────────────────────────────────


async def embed_knowledge_entry(entry_id: str, db: AsyncSession) -> bool:
    """Create or update the embedding for a knowledge entry.

    Stores the vector in Qdrant. Falls back to SQLite if Qdrant unavailable.
    Returns True if embedding was stored, False if model unavailable.
    """
    # Fetch the entry
    result = await db.execute(
        select(KnowledgeEntry).where(KnowledgeEntry.id == entry_id)
    )
    entry = result.scalar_one_or_none()
    if not entry:
        logger.warning("Knowledge entry %s not found for embedding.", entry_id)
        return False

    # Build text to embed: combine name + content for better semantic match
    text_to_embed = f"{entry.name}\n{entry.content}"
    vector = _embed(text_to_embed)
    if vector is None:
        return False

    # Try Qdrant first
    client = await _get_qdrant()
    if client is not None:
        return await _upsert_qdrant(client, entry, vector)

    # Fallback: store in SQLite (legacy KnowledgeEmbedding table)
    return await _upsert_sqlite(entry_id, entry, vector, db)


async def _upsert_qdrant(client, entry, vector: list[float]) -> bool:
    """Store embedding in Qdrant."""
    from qdrant_client.models import PointStruct

    try:
        col = _collection_name(entry.user_id)
        await _ensure_collection(client, col)

        # Use entry.id as point ID (Qdrant supports string IDs)
        point = PointStruct(
            id=entry.id,
            vector=vector,
            payload={
                "entry_id": entry.id,
                "user_id": entry.user_id,
                "name": entry.name,
                "entry_type": entry.entry_type,
                "content": entry.content,
            },
        )
        client.upsert(collection_name=col, points=[point])
        logger.info("Embedded '%s' (%s) in Qdrant collection '%s'.", entry.name, entry.id, col)
        return True

    except Exception as exc:
        logger.error("Qdrant upsert failed for %s: %s", entry.id, exc)
        return False


async def _upsert_sqlite(entry_id: str, entry, vector: list[float], db: AsyncSession) -> bool:
    """Legacy fallback: store embedding in SQLite KnowledgeEmbedding table."""
    import json

    from sqlalchemy import select as sa_select

    from rei.models.user import KnowledgeEmbedding

    try:
        existing = await db.execute(
            sa_select(KnowledgeEmbedding).where(
                KnowledgeEmbedding.entry_id == entry_id
            )
        )
        emb = existing.scalar_one_or_none()
        if emb:
            emb.embedding = json.dumps(vector)
            emb.model_name = _MODEL_NAME
        else:
            emb = KnowledgeEmbedding(
                entry_id=entry_id,
                user_id=entry.user_id,
                embedding=json.dumps(vector),
                model_name=_MODEL_NAME,
            )
            db.add(emb)

        await db.commit()
        logger.info("Embedded '%s' (%s) in SQLite (Qdrant unavailable).", entry.name, entry_id)
        return True
    except Exception as exc:
        logger.error("SQLite embedding fallback failed: %s", exc)
        return False


async def delete_embedding(entry_id: str, db: AsyncSession) -> None:
    """Remove the embedding for a deleted knowledge entry."""
    # Try Qdrant first
    client = await _get_qdrant()
    if client is not None:
        await _delete_from_qdrant(client, entry_id, db)
        return

    # Fallback: delete from SQLite
    from sqlalchemy import delete as sa_delete

    from rei.models.user import KnowledgeEmbedding

    await db.execute(
        sa_delete(KnowledgeEmbedding).where(
            KnowledgeEmbedding.entry_id == entry_id
        )
    )
    await db.commit()


async def _delete_from_qdrant(client, entry_id: str, db: AsyncSession) -> None:
    """Remove a point from all Qdrant collections that might contain it."""
    from qdrant_client.models import PointIdsList

    try:
        # Need to know which collection it's in — check the entry
        result = await db.execute(
            select(KnowledgeEntry).where(KnowledgeEntry.id == entry_id)
        )
        entry = result.scalar_one_or_none()

        # Try to delete from the appropriate collection
        collections_to_try = []
        if entry:
            collections_to_try.append(_collection_name(entry.user_id))
        else:
            # Entry already deleted — try both user and platform
            collections_to_try.append(_PLATFORM_COLLECTION)
            # We can't enumerate all user collections, but the entry is gone anyway

        for col in collections_to_try:
            try:
                client.delete(
                    collection_name=col,
                    points_selector=PointIdsList(points=[entry_id]),
                )
                logger.info("Deleted embedding %s from Qdrant collection '%s'.", entry_id, col)
            except Exception:
                pass  # Collection might not exist

    except Exception as exc:
        logger.warning("Failed to delete from Qdrant: %s", exc)


async def rebuild_all_embeddings(user_id: int, db: AsyncSession) -> int:
    """Re-embed all active entries for a user (platform + account level).

    Returns the number of entries embedded.
    """
    result = await db.execute(
        select(KnowledgeEntry).where(
            and_(
                (KnowledgeEntry.user_id == user_id)
                | (KnowledgeEntry.user_id.is_(None)),
                KnowledgeEntry.is_active == True,
            )
        )
    )
    entries = result.scalars().all()
    count = 0
    for entry in entries:
        ok = await embed_knowledge_entry(entry.id, db)
        if ok:
            count += 1
    logger.info("Rebuilt %d embeddings for user %s.", count, user_id)
    return count


# ── Retrieval ────────────────────────────────────────────────────────────


# Entry types that are ALWAYS included regardless of relevance score.
# Training content sets the AI's mindset, tone, and approach for every interaction.
_ALWAYS_INCLUDE_TYPES = {"training"}


async def retrieve_relevant_knowledge(
    user_id: int,
    query: str,
    db: AsyncSession,
    top_k: int = 7,
    similarity_threshold: float = 0.25,
) -> list[dict]:
    """Find the top-K most relevant knowledge entries for a chat query.

    Training entries are ALWAYS included first — they set the AI's baseline
    mindset and tone. Then the most relevant scripts, objection handlers,
    and other entries are added based on the query.

    Falls back to returning ALL active entries if the embedding model
    is not available (graceful degradation).
    """
    # ── Step 1: Always load training entries (they set the AI's foundation) ──
    training_result = await db.execute(
        select(KnowledgeEntry).where(
            and_(
                (KnowledgeEntry.user_id == user_id)
                | (KnowledgeEntry.user_id.is_(None)),
                KnowledgeEntry.is_active == True,
                KnowledgeEntry.entry_type.in_(list(_ALWAYS_INCLUDE_TYPES)),
            )
        )
    )
    all_training = training_result.scalars().all()

    # Separate user training from platform training
    user_training = [e for e in all_training if e.user_id is not None]
    platform_training = [e for e in all_training if e.user_id is None]

    # Use user training if available, otherwise fall back to platform training
    training_entries = user_training if user_training else platform_training
    training_ids = {e.id for e in training_entries}
    training_results = [
        {"name": e.name, "content": e.content, "entry_type": e.entry_type}
        for e in training_entries
    ]

    # How many RAG slots remain after training entries
    remaining_slots = max(top_k - len(training_results), 3)

    # ── Step 2: Embed the query for semantic search ──
    query_vector = _embed(query)
    if query_vector is None:
        # Model not available — return training + all other entries as fallback
        logger.info("RAG model unavailable, falling back to full knowledge retrieval.")
        fallback = await _fallback_all_entries(user_id, db)
        other = [e for e in fallback if e["name"] not in {t["name"] for t in training_results}]
        return training_results + other

    # ── Step 3: Search Qdrant (or fall back to SQLite) ──
    client = await _get_qdrant()
    if client is not None:
        rag_results = await _search_qdrant(
            client, user_id, query_vector, training_ids,
            remaining_slots, similarity_threshold
        )
    else:
        rag_results = await _search_sqlite(
            user_id, query_vector, training_ids, db,
            remaining_slots, similarity_threshold
        )

    return training_results + rag_results


async def _search_qdrant(
    client,
    user_id: int,
    query_vector: list[float],
    exclude_ids: set[str],
    limit: int,
    threshold: float,
) -> list[dict]:
    """Search Qdrant for relevant non-training entries.

    Searches both the user's collection and the platform collection,
    applies user-boost scoring, deduplicates, and returns top results.
    """
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    USER_BOOST = 0.10  # Boost user entries over platform entries

    all_hits = []

    # Search user's personal collection
    user_col = _collection_name(user_id)
    try:
        collections = {c.name for c in client.get_collections().collections}
        if user_col in collections:
            hits = client.search(
                collection_name=user_col,
                query_vector=query_vector,
                limit=limit + 5,  # Fetch extra for filtering
                score_threshold=threshold,
            )
            for hit in hits:
                if hit.payload.get("entry_id") not in exclude_ids:
                    all_hits.append({
                        "entry_id": hit.payload["entry_id"],
                        "name": hit.payload.get("name", ""),
                        "content": hit.payload.get("content", ""),
                        "entry_type": hit.payload.get("entry_type", ""),
                        "score": hit.score + USER_BOOST,
                        "raw_score": hit.score,
                        "is_user": True,
                    })
    except Exception as exc:
        logger.warning("Qdrant search on '%s' failed: %s", user_col, exc)

    # Search platform collection
    try:
        if _PLATFORM_COLLECTION in collections:
            hits = client.search(
                collection_name=_PLATFORM_COLLECTION,
                query_vector=query_vector,
                limit=limit + 5,
                score_threshold=threshold,
            )
            for hit in hits:
                if hit.payload.get("entry_id") not in exclude_ids:
                    all_hits.append({
                        "entry_id": hit.payload["entry_id"],
                        "name": hit.payload.get("name", ""),
                        "content": hit.payload.get("content", ""),
                        "entry_type": hit.payload.get("entry_type", ""),
                        "score": hit.score,
                        "raw_score": hit.score,
                        "is_user": False,
                    })
    except Exception as exc:
        logger.warning("Qdrant search on '%s' failed: %s", _PLATFORM_COLLECTION, exc)

    if not all_hits:
        return []

    # Sort by boosted score descending
    all_hits.sort(key=lambda x: x["score"], reverse=True)

    # Deduplicate: user entries take priority over platform entries of same type
    final = []
    seen_types_from_user = set()

    # First pass: user entries
    for hit in all_hits:
        if hit["is_user"]:
            seen_types_from_user.add(hit["entry_type"])
            final.append({
                "name": hit["name"],
                "content": hit["content"],
                "entry_type": hit["entry_type"],
            })

    # Second pass: platform entries (skip types covered by user)
    for hit in all_hits:
        if not hit["is_user"] and hit["entry_type"] not in seen_types_from_user:
            final.append({
                "name": hit["name"],
                "content": hit["content"],
                "entry_type": hit["entry_type"],
            })

    return final[:limit]


async def _search_sqlite(
    user_id: int,
    query_vector: list[float],
    exclude_ids: set[str],
    db: AsyncSession,
    limit: int,
    threshold: float,
) -> list[dict]:
    """Legacy SQLite-based vector search (fallback when Qdrant unavailable)."""
    import json

    import numpy as np

    from rei.models.user import KnowledgeEmbedding

    result = await db.execute(
        select(KnowledgeEmbedding).where(
            and_(
                (KnowledgeEmbedding.user_id == user_id)
                | (KnowledgeEmbedding.user_id.is_(None)),
                ~KnowledgeEmbedding.entry_id.in_(exclude_ids) if exclude_ids else True,
            )
        )
    )
    embeddings = result.scalars().all()

    if not embeddings:
        return []

    USER_BOOST = 0.10

    scored = []
    for emb in embeddings:
        try:
            stored_vector = json.loads(emb.embedding)
            # Cosine similarity
            a = np.array(query_vector, dtype=np.float32)
            b = np.array(stored_vector, dtype=np.float32)
            dot = np.dot(a, b)
            norm = np.linalg.norm(a) * np.linalg.norm(b)
            score = float(dot / norm) if norm > 0 else 0.0

            is_user = emb.user_id is not None
            boosted = score + USER_BOOST if is_user else score
            scored.append((emb.entry_id, boosted, score, is_user))
        except (json.JSONDecodeError, ValueError):
            continue

    scored.sort(key=lambda x: x[1], reverse=True)
    above_threshold = [s for s in scored if s[2] >= threshold]
    if not above_threshold:
        above_threshold = scored[:3]

    if not above_threshold:
        return []

    # Fetch entries from DB
    candidate_ids = [s[0] for s in above_threshold]
    result = await db.execute(
        select(KnowledgeEntry).where(
            and_(
                KnowledgeEntry.id.in_(candidate_ids),
                KnowledgeEntry.is_active == True,
            )
        )
    )
    entries = result.scalars().all()
    entry_map = {e.id: e for e in entries}

    final = []
    seen_types_from_user = set()

    for entry_id, boosted, raw, is_user in above_threshold:
        if entry_id not in entry_map:
            continue
        entry = entry_map[entry_id]
        if is_user:
            seen_types_from_user.add(entry.entry_type)
            final.append(
                {"name": entry.name, "content": entry.content, "entry_type": entry.entry_type}
            )

    for entry_id, boosted, raw, is_user in above_threshold:
        if entry_id not in entry_map:
            continue
        entry = entry_map[entry_id]
        if not is_user and entry.entry_type not in seen_types_from_user:
            final.append(
                {"name": entry.name, "content": entry.content, "entry_type": entry.entry_type}
            )

    return final[:limit]


async def _fallback_all_entries(user_id: int, db: AsyncSession) -> list[dict]:
    """Return all active knowledge entries (pre-RAG behavior)."""
    from rei.services.ai_service import get_user_knowledge

    return await get_user_knowledge(user_id, db)
