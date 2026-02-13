"""Circuit breaker pattern — prevents cascading failures from flaky external APIs.

Wraps any async function.  If it fails too often, the breaker "opens" and
short-circuits requests for a cooldown period instead of hammering a dead
service.  After the cooldown, it enters "half-open" state and lets one
request through to test if the service is back.

Usage:
    from helm.reliability.circuit_breaker import CircuitBreaker

    ghl_breaker = CircuitBreaker("ghl", failure_threshold=3, reset_timeout=30)

    result = await ghl_breaker.call(ghl_client.get_contact, contact_id="123")
"""

from __future__ import annotations

import asyncio
import logging
import time
from enum import Enum
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)


class BreakerState(str, Enum):
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing — reject requests
    HALF_OPEN = "half_open"  # Testing — let one through


class CircuitBreaker:
    """Async circuit breaker for external API calls."""

    def __init__(
        self,
        name: str,
        failure_threshold: int = 3,
        reset_timeout: float = 30.0,
        fallback: Callable | None = None,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.fallback = fallback

        self._state = BreakerState.CLOSED
        self._failure_count = 0
        self._last_failure_time: float = 0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> BreakerState:
        if self._state == BreakerState.OPEN:
            if time.time() - self._last_failure_time > self.reset_timeout:
                self._state = BreakerState.HALF_OPEN
        return self._state

    async def call(self, func: Callable[..., Coroutine], *args: Any, **kwargs: Any) -> Any:
        """Execute the function through the circuit breaker."""
        current_state = self.state

        if current_state == BreakerState.OPEN:
            logger.warning("Circuit breaker [%s] is OPEN — request blocked.", self.name)
            if self.fallback:
                return self.fallback()
            return None

        try:
            result = await func(*args, **kwargs)
            await self._on_success()
            return result
        except Exception as exc:
            await self._on_failure(exc)
            if self.fallback:
                return self.fallback()
            return None

    async def _on_success(self) -> None:
        async with self._lock:
            self._failure_count = 0
            if self._state == BreakerState.HALF_OPEN:
                logger.info("Circuit breaker [%s] recovered → CLOSED.", self.name)
            self._state = BreakerState.CLOSED

    async def _on_failure(self, exc: Exception) -> None:
        async with self._lock:
            self._failure_count += 1
            self._last_failure_time = time.time()

            if self._failure_count >= self.failure_threshold:
                self._state = BreakerState.OPEN
                logger.error(
                    "Circuit breaker [%s] OPENED after %d failures. "
                    "Will retry in %ds. Last error: %s",
                    self.name,
                    self._failure_count,
                    self.reset_timeout,
                    exc,
                )
            else:
                logger.warning(
                    "Circuit breaker [%s] failure %d/%d: %s",
                    self.name,
                    self._failure_count,
                    self.failure_threshold,
                    exc,
                )

    def get_status(self) -> dict:
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "failure_threshold": self.failure_threshold,
            "reset_timeout": self.reset_timeout,
        }
