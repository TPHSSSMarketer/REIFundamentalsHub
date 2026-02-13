"""Supabase semantic memory — optional persistent memory with vector search.

When configured, Helm stores conversation context, facts, and insights as
vector embeddings in Supabase (PostgreSQL + pgvector).  This enables
semantic recall — Helm can find relevant memories by meaning, not just
keywords.

When NOT configured, Helm falls back to the in-memory ConversationMemory
store (helm/assistant/memory.py).  Everything still works, memories just
don't persist across restarts.

Setup:
  1. Create a Supabase project at https://supabase.com
  2. Run the schema SQL from CLAUDE.md (Phase 3, Step 7)
  3. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
  4. Optionally set OPENAI_API_KEY for embeddings
"""

from __future__ import annotations

import logging
from datetime import datetime

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class SupabaseMemory:
    """Semantic memory store using Supabase + pgvector."""

    def __init__(self) -> None:
        self._url = settings.supabase_url
        self._key = settings.supabase_service_role_key
        self._openai_key = settings.openai_api_key

    @property
    def is_configured(self) -> bool:
        return bool(self._url and self._key)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    # ── Embeddings ───────────────────────────────────────────────────────

    async def _get_embedding(self, text: str) -> list[float] | None:
        """Generate an embedding vector using OpenAI's API."""
        if not self._openai_key:
            logger.warning("OpenAI API key not set — cannot generate embeddings.")
            return None
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self._openai_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "text-embedding-3-large",
                        "input": text,
                        "dimensions": 1536,
                    },
                )
                resp.raise_for_status()
                return resp.json()["data"][0]["embedding"]
        except httpx.HTTPError as exc:
            logger.error("Embedding generation failed: %s", exc)
            return None

    # ── Memory CRUD ──────────────────────────────────────────────────────

    async def store(
        self,
        content: str,
        category: str = "general",
        tenant_id: str | None = None,
        metadata: dict | None = None,
    ) -> dict | None:
        """Store a memory with its embedding for semantic search."""
        if not self.is_configured:
            return None

        embedding = await self._get_embedding(content)

        payload = {
            "content": content,
            "category": category,
            "metadata": metadata or {},
        }
        if tenant_id:
            payload["tenant_id"] = tenant_id
        if embedding:
            payload["embedding"] = embedding

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self._url}/rest/v1/memories",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                logger.info("Memory stored: %s...", content[:60])
                return data[0] if isinstance(data, list) else data
        except httpx.HTTPError as exc:
            logger.error("Failed to store memory: %s", exc)
            return None

    async def search(
        self,
        query: str,
        tenant_id: str | None = None,
        limit: int = 10,
        threshold: float = 0.7,
    ) -> list[dict]:
        """Semantic search — find memories similar to the query."""
        if not self.is_configured:
            return []

        embedding = await self._get_embedding(query)
        if not embedding:
            return []

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self._url}/rest/v1/rpc/search_memories",
                    headers=self._headers,
                    json={
                        "query_embedding": embedding,
                        "match_tenant_id": tenant_id,
                        "match_count": limit,
                        "match_threshold": threshold,
                    },
                )
                resp.raise_for_status()
                results = resp.json()
                logger.info("Memory search for '%s...' → %d results", query[:40], len(results))
                return results
        except httpx.HTTPError as exc:
            logger.error("Memory search failed: %s", exc)
            return []

    # ── Conversation Logging ─────────────────────────────────────────────

    async def log_conversation(
        self,
        role: str,
        content: str,
        channel: str = "web",
        tenant_id: str | None = None,
        metadata: dict | None = None,
    ) -> dict | None:
        """Persist a conversation turn to Supabase."""
        if not self.is_configured:
            return None

        payload = {
            "role": role,
            "content": content,
            "channel": channel,
            "metadata": metadata or {},
        }
        if tenant_id:
            payload["tenant_id"] = tenant_id

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self._url}/rest/v1/conversation_logs",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Failed to log conversation: %s", exc)
            return None

    # ── Goals ────────────────────────────────────────────────────────────

    async def get_goals(
        self, tenant_id: str | None = None, status: str = "active"
    ) -> list[dict]:
        """Fetch active goals."""
        if not self.is_configured:
            return []

        params = {"status": f"eq.{status}", "order": "created_at.desc"}
        if tenant_id:
            params["tenant_id"] = f"eq.{tenant_id}"

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    f"{self._url}/rest/v1/goals",
                    headers=self._headers,
                    params=params,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Failed to fetch goals: %s", exc)
            return []

    async def create_goal(
        self, goal: str, target_date: str | None = None, tenant_id: str | None = None
    ) -> dict | None:
        """Create a new goal."""
        if not self.is_configured:
            return None

        payload = {"goal": goal, "status": "active"}
        if target_date:
            payload["target_date"] = target_date
        if tenant_id:
            payload["tenant_id"] = tenant_id

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self._url}/rest/v1/goals",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                return data[0] if isinstance(data, list) else data
        except httpx.HTTPError as exc:
            logger.error("Failed to create goal: %s", exc)
            return None


# Singleton
supabase_memory = SupabaseMemory()
