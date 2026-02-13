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

    def clear(self, conversation_id: str) -> None:
        self._store.pop(conversation_id, None)

    def list_conversations(self) -> list[str]:
        return list(self._store.keys())


# Singleton instance
memory = ConversationMemory()
