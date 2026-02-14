"""Named circuit breaker instances for each external service.

Centralises all breaker instances so they can be imported anywhere and
their collective status queried from the health check / API layer.

Usage:
    from helm.reliability.breakers import ghl_breaker, protected_call

    # Direct usage
    result = await ghl_breaker.call(ghl_client.get_contact, contact_id="123")

    # Convenience wrapper (looks up breaker by name)
    result = await protected_call("ghl", ghl_client.get_contact, contact_id="123")
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Coroutine

from helm.reliability.circuit_breaker import CircuitBreaker

logger = logging.getLogger(__name__)

# ── Named breaker instances ──────────────────────────────────────────────────

ghl_breaker = CircuitBreaker("ghl", failure_threshold=3, reset_timeout=30)
elevenlabs_breaker = CircuitBreaker("elevenlabs", failure_threshold=3, reset_timeout=30)
whatsapp_breaker = CircuitBreaker("whatsapp", failure_threshold=5, reset_timeout=60)
telegram_breaker = CircuitBreaker("telegram", failure_threshold=5, reset_timeout=60)
supabase_breaker = CircuitBreaker("supabase", failure_threshold=3, reset_timeout=30)
openrouter_breaker = CircuitBreaker("openrouter", failure_threshold=3, reset_timeout=30)

# Registry of all breakers keyed by name for easy lookup
_ALL_BREAKERS: dict[str, CircuitBreaker] = {
    "ghl": ghl_breaker,
    "elevenlabs": elevenlabs_breaker,
    "whatsapp": whatsapp_breaker,
    "telegram": telegram_breaker,
    "supabase": supabase_breaker,
    "openrouter": openrouter_breaker,
}


def get_breaker(name: str) -> CircuitBreaker | None:
    """Look up a circuit breaker by service name."""
    return _ALL_BREAKERS.get(name)


def get_all_breaker_status() -> dict:
    """Return the status of every registered circuit breaker.

    Returns a dict with a top-level ``breakers`` list and an ``open_count``
    indicating how many are currently in the OPEN (failing) state.
    """
    statuses = [breaker.get_status() for breaker in _ALL_BREAKERS.values()]
    open_count = sum(1 for s in statuses if s["state"] == "open")
    return {
        "breakers": statuses,
        "open_count": open_count,
        "total": len(statuses),
    }


async def protected_call(
    breaker_name: str,
    func: Callable[..., Coroutine],
    *args: Any,
    **kwargs: Any,
) -> Any:
    """Execute an async function through the named circuit breaker.

    This is a convenience wrapper so callers don't need to import the
    individual breaker instance.  If the breaker name is unknown the
    function is called directly (fail-open).

    Args:
        breaker_name: Key in the breaker registry (e.g. ``"ghl"``).
        func: The async callable to protect.
        *args: Positional arguments forwarded to *func*.
        **kwargs: Keyword arguments forwarded to *func*.

    Returns:
        Whatever *func* returns, or ``None`` if the breaker is open and
        no fallback is configured.
    """
    breaker = _ALL_BREAKERS.get(breaker_name)
    if breaker is None:
        logger.warning(
            "No circuit breaker registered for '%s' — calling function directly.",
            breaker_name,
        )
        return await func(*args, **kwargs)

    return await breaker.call(func, *args, **kwargs)
