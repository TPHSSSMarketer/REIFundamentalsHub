"""RAG (Retrieval Augmented Generation) service for REI Hub.

Handles embedding generation, storage, and semantic retrieval of knowledge
entries so the AI Chat gets only the most relevant context for each query.

The embedding model is loaded lazily on first use and cached in memory.
If sentence-transformers is not installed, the service falls back gracefully
to returning all active entries (same behavior as before RAG).
"""

from __future__ import annotations

import json
import logging
from typing import Optional

import numpy as np
from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.user import KnowledgeEmbedding, KnowledgeEntry

logger = logging.getLogger(__name__)

# ── Embedding model (lazy-loaded singleton) ──────────────────────────────

_model = None
_MODEL_NAME = "all-MiniLM-L6-v2"
_EMBEDDING_DIM = 384  # Output dimension for all-MiniLM-L6-v2


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


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors using numpy."""
    a_arr = np.array(a, dtype=np.float32)
    b_arr = np.array(b, dtype=np.float32)
    dot = np.dot(a_arr, b_arr)
    norm = np.linalg.norm(a_arr) * np.linalg.norm(b_arr)
    if norm == 0:
        return 0.0
    return float(dot / norm)


# ── Embedding CRUD ───────────────────────────────────────────────────────


async def embed_knowledge_entry(entry_id: str, db: AsyncSession) -> bool:
    """Create or update the embedding for a knowledge entry.

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

    # Upsert the embedding
    existing = await db.execute(
        select(KnowledgeEmbedding).where(
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
    logger.info("Embedded knowledge entry '%s' (%s).", entry.name, entry_id)
    return True


async def delete_embedding(entry_id: str, db: AsyncSession) -> None:
    """Remove the embedding for a deleted knowledge entry."""
    await db.execute(
        delete(KnowledgeEmbedding).where(
            KnowledgeEmbedding.entry_id == entry_id
        )
    )
    await db.commit()


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

    Steps:
    1. Load all active training entries (always included)
    2. Embed the query
    3. Fetch all non-training embeddings for this user
    4. Compute cosine similarity and pick top matches
    5. Return training entries first, then relevant entries

    Falls back to returning ALL active entries if the embedding model
    is not available (graceful degradation).
    """
    # ── Step 1: Always load training entries (they set the AI's foundation) ──
    # User training entries take priority; platform training is the fallback.
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

    # ── Step 2: Embed the query for semantic search on remaining entries ──
    query_vector = _embed(query)
    if query_vector is None:
        # Model not available — return training + all other entries as fallback
        logger.info("RAG model unavailable, falling back to full knowledge retrieval.")
        fallback = await _fallback_all_entries(user_id, db)
        # Put training first, then everything else (deduped)
        other = [e for e in fallback if e["name"] not in {t["name"] for t in training_results}]
        return training_results + other

    # Fetch all embeddings for this user (platform + their own),
    # excluding training entries (we already have those)
    result = await db.execute(
        select(KnowledgeEmbedding).where(
            and_(
                (KnowledgeEmbedding.user_id == user_id)
                | (KnowledgeEmbedding.user_id.is_(None)),
                ~KnowledgeEmbedding.entry_id.in_(training_ids) if training_ids else True,
            )
        )
    )
    embeddings = result.scalars().all()

    if not embeddings:
        # No non-training embeddings — just return training entries
        return training_results

    # Score each embedding against the query.
    # User entries (user_id set) get a boost over platform entries (user_id=NULL)
    # so the user's own content always takes priority.
    USER_BOOST = 0.10  # Add 10% similarity bonus to user-owned entries

    scored = []
    for emb in embeddings:
        try:
            stored_vector = json.loads(emb.embedding)
            score = _cosine_similarity(query_vector, stored_vector)
            # Boost user-owned entries so they outrank platform entries on ties
            is_user_entry = emb.user_id is not None
            boosted_score = score + USER_BOOST if is_user_entry else score
            scored.append((emb.entry_id, boosted_score, score, is_user_entry))
        except (json.JSONDecodeError, ValueError):
            continue

    # Sort by boosted score descending
    scored.sort(key=lambda x: x[1], reverse=True)

    # Filter by threshold (using raw score, not boosted)
    above_threshold = [s for s in scored if s[2] >= similarity_threshold]
    if not above_threshold:
        # Nothing above threshold — take top 3 by boosted score anyway
        above_threshold = scored[:3]

    if not above_threshold:
        return []

    # Fetch all candidate entries to check for user-vs-platform overlap
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

    # Deduplicate: if a user entry and a platform entry cover the same topic
    # (same entry_type and similar name/content), keep only the user's version.
    final_results = []
    seen_types_from_user = set()

    # First pass: collect user entries (they have priority)
    for entry_id, boosted, raw, is_user in above_threshold:
        if entry_id not in entry_map:
            continue
        entry = entry_map[entry_id]
        if is_user:
            seen_types_from_user.add(entry.entry_type)
            final_results.append(
                {"name": entry.name, "content": entry.content, "entry_type": entry.entry_type}
            )

    # Second pass: add platform entries only if user doesn't already
    # have entries of the same type in the results
    for entry_id, boosted, raw, is_user in above_threshold:
        if entry_id not in entry_map:
            continue
        entry = entry_map[entry_id]
        if not is_user:
            # Skip platform entries whose type is already covered by user content
            if entry.entry_type in seen_types_from_user:
                continue
            final_results.append(
                {"name": entry.name, "content": entry.content, "entry_type": entry.entry_type}
            )

    # Trim non-training results to remaining slots, then prepend training
    return training_results + final_results[:remaining_slots]


async def _fallback_all_entries(user_id: int, db: AsyncSession) -> list[dict]:
    """Return all active knowledge entries (pre-RAG behavior)."""
    from rei.services.ai_service import get_user_knowledge

    return await get_user_knowledge(user_id, db)
