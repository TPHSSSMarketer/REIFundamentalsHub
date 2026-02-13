"""Conversation memory — in-memory cache backed by persistent SQLite storage.

Uses an in-memory store for fast access during the session, with async
persistence to the SQLite database for durability across restarts.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


@dataclass
class Turn:
    role: str
    content: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ConversationMeta:
    """Lightweight metadata about a conversation for the sidebar list."""

    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int
    preview: str


class ConversationMemory:
    """In-memory conversation store with SQLite persistence.

    The in-memory cache provides fast reads during the session.
    All writes are also persisted to the database asynchronously.
    On startup, conversations can be loaded from the database.
    """

    def __init__(self, max_turns: int = 50) -> None:
        self._store: dict[str, list[Turn]] = defaultdict(list)
        self._max_turns = max_turns
        self._db_loaded: set[str] = set()

    def add(self, conversation_id: str, role: str, content: str) -> None:
        history = self._store[conversation_id]
        history.append(Turn(role=role, content=content))
        if len(history) > self._max_turns:
            self._store[conversation_id] = history[-self._max_turns :]

    async def add_and_persist(self, conversation_id: str, role: str, content: str) -> None:
        """Add to memory and persist to database."""
        self.add(conversation_id, role, content)
        await self._persist_message(conversation_id, role, content)

    def get_history(self, conversation_id: str) -> list[dict[str, str]]:
        """Return history formatted for the AI provider's messages array."""
        return [
            {"role": turn.role, "content": turn.content}
            for turn in self._store[conversation_id]
        ]

    def get_full_history(self, conversation_id: str) -> list[dict]:
        """Return history with timestamps for the frontend chat log."""
        return [
            {
                "role": turn.role,
                "content": turn.content,
                "timestamp": turn.timestamp.isoformat(),
            }
            for turn in self._store[conversation_id]
        ]

    def clear(self, conversation_id: str) -> None:
        self._store.pop(conversation_id, None)

    def list_conversations(self) -> list[str]:
        return list(self._store.keys())

    def list_conversations_meta(self) -> list[ConversationMeta]:
        """Return metadata for all conversations, newest first."""
        result: list[ConversationMeta] = []

        for conv_id, turns in self._store.items():
            if not turns:
                continue

            first_user = next(
                (t for t in turns if t.role == "user"), None
            )
            title = first_user.content[:80] if first_user else "New conversation"
            if first_user and len(first_user.content) > 80:
                title += "..."

            last = turns[-1]
            preview = last.content[:120]
            if len(last.content) > 120:
                preview += "..."

            result.append(ConversationMeta(
                id=conv_id,
                title=title,
                created_at=turns[0].timestamp,
                updated_at=turns[-1].timestamp,
                message_count=len(turns),
                preview=preview,
            ))

        result.sort(key=lambda m: m.updated_at, reverse=True)
        return result

    # ── Database Persistence ────────────────────────────────────────────

    async def _persist_message(self, conversation_id: str, role: str, content: str) -> None:
        """Persist a message to the database."""
        try:
            from helm.models.database import Conversation, Message, async_session
            from sqlalchemy import select

            async with async_session() as session:
                result = await session.execute(
                    select(Conversation).where(Conversation.id == conversation_id)
                )
                conv = result.scalar_one_or_none()
                if not conv:
                    title = content[:80] if role == "user" else "New conversation"
                    conv = Conversation(id=conversation_id, title=title)
                    session.add(conv)

                msg = Message(
                    conversation_id=conversation_id,
                    role=role,
                    content=content,
                )
                session.add(msg)
                conv.updated_at = datetime.now(timezone.utc)
                await session.commit()
        except Exception as exc:
            logger.warning("Failed to persist message: %s", exc)

    async def load_from_db(self) -> int:
        """Load recent conversations from the database into memory. Returns count."""
        try:
            from helm.models.database import Conversation, async_session
            from sqlalchemy import select
            from sqlalchemy.orm import selectinload

            async with async_session() as session:
                result = await session.execute(
                    select(Conversation)
                    .options(selectinload(Conversation.messages))
                    .order_by(Conversation.updated_at.desc())
                    .limit(50)
                )
                conversations = result.scalars().all()

                count = 0
                for conv in conversations:
                    if conv.id in self._store:
                        continue
                    for msg in conv.messages:
                        ts = msg.created_at or datetime.now(timezone.utc)
                        self._store[conv.id].append(
                            Turn(role=msg.role, content=msg.content, timestamp=ts)
                        )
                    self._db_loaded.add(conv.id)
                    count += 1

                logger.info("Loaded %d conversations from database.", count)
                return count
        except Exception as exc:
            logger.warning("Failed to load conversations from database: %s", exc)
            return 0


# Singleton instance
memory = ConversationMemory()
