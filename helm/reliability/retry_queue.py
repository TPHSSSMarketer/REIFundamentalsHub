"""Retry queue — persists failed actions and retries with exponential backoff.

When an external API call fails (GHL down, Supabase timeout, etc.), the
action gets queued here instead of being lost.  A background processor
retries failed actions with exponential backoff.

For now, the queue is in-memory with optional file-based persistence.
Swap to Redis or Supabase for production multi-process deployments.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

QUEUE_FILE = Path("workspace/retry_queue.json")


@dataclass
class QueuedAction:
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    action_name: str = ""
    payload: dict = field(default_factory=dict)
    attempts: int = 0
    max_attempts: int = 3
    next_retry_at: float = 0
    backoff_ms: int = 5000
    created_at: float = field(default_factory=time.time)
    last_error: str = ""


class RetryQueue:
    """In-memory retry queue with file-based persistence."""

    def __init__(self) -> None:
        self._queue: list[QueuedAction] = []
        self._handlers: dict[str, Callable[..., Coroutine]] = {}
        self._load()

    def register_handler(self, action_name: str, handler: Callable[..., Coroutine]) -> None:
        """Register an async handler function for an action type."""
        self._handlers[action_name] = handler

    def enqueue(self, action_name: str, payload: dict, max_attempts: int = 3) -> str:
        """Add a failed action to the retry queue."""
        action = QueuedAction(
            action_name=action_name,
            payload=payload,
            max_attempts=max_attempts,
            next_retry_at=time.time() + 5,  # First retry in 5 seconds
        )
        self._queue.append(action)
        self._persist()
        logger.info(
            "Action queued for retry: %s [%s] (max %d attempts)",
            action_name,
            action.id,
            max_attempts,
        )
        return action.id

    async def process(self) -> dict:
        """Process all due retries.  Returns a summary."""
        now = time.time()
        due = [a for a in self._queue if a.next_retry_at <= now]

        results = {"processed": 0, "succeeded": 0, "failed": 0, "exhausted": 0}

        for action in due:
            handler = self._handlers.get(action.action_name)
            if not handler:
                logger.warning("No handler for action: %s", action.action_name)
                continue

            action.attempts += 1
            results["processed"] += 1

            try:
                await handler(**action.payload)
                self._queue.remove(action)
                results["succeeded"] += 1
                logger.info("Retry succeeded: %s [%s]", action.action_name, action.id)
            except Exception as exc:
                action.last_error = str(exc)
                if action.attempts >= action.max_attempts:
                    self._queue.remove(action)
                    results["exhausted"] += 1
                    logger.error(
                        "Action exhausted after %d attempts: %s [%s] — %s",
                        action.attempts,
                        action.action_name,
                        action.id,
                        exc,
                    )
                else:
                    # Exponential backoff
                    action.backoff_ms *= 2
                    action.next_retry_at = now + (action.backoff_ms / 1000)
                    results["failed"] += 1
                    logger.warning(
                        "Retry %d/%d failed for %s [%s]: %s. Next in %ds.",
                        action.attempts,
                        action.max_attempts,
                        action.action_name,
                        action.id,
                        exc,
                        action.backoff_ms // 1000,
                    )

        self._persist()
        return results

    @property
    def pending_count(self) -> int:
        return len(self._queue)

    def get_status(self) -> dict:
        return {
            "pending": self.pending_count,
            "actions": [
                {
                    "id": a.id,
                    "action": a.action_name,
                    "attempts": a.attempts,
                    "max_attempts": a.max_attempts,
                    "last_error": a.last_error,
                }
                for a in self._queue
            ],
        }

    def _persist(self) -> None:
        """Save queue to disk for crash recovery."""
        try:
            QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
            data = [asdict(a) for a in self._queue]
            QUEUE_FILE.write_text(json.dumps(data, indent=2))
        except Exception as exc:
            logger.error("Failed to persist retry queue: %s", exc)

    def _load(self) -> None:
        """Load queue from disk on startup."""
        if QUEUE_FILE.exists():
            try:
                data = json.loads(QUEUE_FILE.read_text())
                self._queue = [QueuedAction(**item) for item in data]
                if self._queue:
                    logger.info("Loaded %d pending actions from retry queue.", len(self._queue))
            except Exception as exc:
                logger.error("Failed to load retry queue: %s", exc)


# Singleton
retry_queue = RetryQueue()
