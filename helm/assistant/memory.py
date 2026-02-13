"""Conversation memory — stores and retrieves chat history per session."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Turn:
    role: str
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)


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
    """In-memory conversation store keyed by conversation_id.

    For production, swap this out for a persistent store (Redis, Postgres, etc.).
    """

    def __init__(self, max_turns: int = 50) -> None:
        self._store: dict[str, list[Turn]] = defaultdict(list)
        self._max_turns = max_turns

    def add(self, conversation_id: str, role: str, content: str) -> None:
        history = self._store[conversation_id]
        history.append(Turn(role=role, content=content))
        # Trim to keep context window manageable
        if len(history) > self._max_turns:
            self._store[conversation_id] = history[-self._max_turns :]

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

            # Title = first user message, truncated
            first_user = next(
                (t for t in turns if t.role == "user"), None
            )
            title = first_user.content[:80] if first_user else "New conversation"
            if first_user and len(first_user.content) > 80:
                title += "..."

            # Preview = last message, truncated
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

        # Sort newest first
        result.sort(key=lambda m: m.updated_at, reverse=True)
        return result


# Singleton instance
memory = ConversationMemory()
