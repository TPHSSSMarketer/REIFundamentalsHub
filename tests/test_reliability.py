"""Tests for reliability patterns — circuit breaker and retry queue."""

from __future__ import annotations

import pytest

from helm.reliability.circuit_breaker import BreakerState, CircuitBreaker
from helm.reliability.retry_queue import RetryQueue


# ── Circuit Breaker ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_circuit_breaker_stays_closed_on_success():
    breaker = CircuitBreaker("test", failure_threshold=2)

    async def success():
        return "ok"

    result = await breaker.call(success)
    assert result == "ok"
    assert breaker.state == BreakerState.CLOSED


@pytest.mark.asyncio
async def test_circuit_breaker_opens_after_threshold():
    breaker = CircuitBreaker("test", failure_threshold=2, reset_timeout=60)

    async def fail():
        raise ConnectionError("down")

    await breaker.call(fail)
    await breaker.call(fail)

    assert breaker.state == BreakerState.OPEN


@pytest.mark.asyncio
async def test_circuit_breaker_returns_fallback_when_open():
    breaker = CircuitBreaker(
        "test",
        failure_threshold=1,
        reset_timeout=60,
        fallback=lambda: "fallback_value",
    )

    async def fail():
        raise ConnectionError("down")

    await breaker.call(fail)  # Opens the breaker
    result = await breaker.call(fail)  # Should use fallback
    assert result == "fallback_value"


@pytest.mark.asyncio
async def test_circuit_breaker_resets_on_success():
    breaker = CircuitBreaker("test", failure_threshold=3)

    async def fail():
        raise ConnectionError("down")

    async def success():
        return "ok"

    await breaker.call(fail)
    await breaker.call(fail)
    # Two failures but threshold is 3, still closed
    assert breaker.state == BreakerState.CLOSED

    result = await breaker.call(success)
    assert result == "ok"
    assert breaker._failure_count == 0


# ── Retry Queue ──────────────────────────────────────────────────────────────


def test_retry_queue_enqueue():
    queue = RetryQueue()
    queue._queue = []  # Clear any loaded state
    action_id = queue.enqueue("test_action", {"key": "value"})
    assert queue.pending_count == 1
    assert action_id


@pytest.mark.asyncio
async def test_retry_queue_processes_successfully():
    queue = RetryQueue()
    queue._queue = []

    results_collected = []

    async def handler(**kwargs):
        results_collected.append(kwargs)

    queue.register_handler("test_action", handler)
    queue.enqueue("test_action", {"key": "value"})

    result = await queue.process()
    assert result["succeeded"] == 1
    assert queue.pending_count == 0
    assert results_collected[0] == {"key": "value"}


def test_retry_queue_status():
    queue = RetryQueue()
    queue._queue = []
    queue.enqueue("action_a", {"x": 1})
    queue.enqueue("action_b", {"y": 2})

    status = queue.get_status()
    assert status["pending"] == 2
    assert len(status["actions"]) == 2
