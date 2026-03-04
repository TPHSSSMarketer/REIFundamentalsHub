"""Frankfurter Currency Exchange API Service — Free currency conversion.

Completely free, no API key required, unlimited requests.
Uses European Central Bank reference rates.

Docs: https://www.frankfurter.app/docs/
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

FRANKFURTER_BASE = "https://api.frankfurter.app"

# ── In-memory cache (1 hour TTL — rates update daily) ──
_rates_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 3600


async def convert_currency(
    amount: float,
    from_currency: str = "USD",
    to_currency: str = "EUR",
) -> Optional[dict]:
    """Convert an amount between currencies using Frankfurter API.

    Args:
        amount: The amount to convert.
        from_currency: Source currency ISO code (e.g. "USD").
        to_currency: Target currency ISO code (e.g. "EUR").

    Returns:
        {
            "amount": float,           # original amount
            "from": str,               # source currency
            "to": str,                 # target currency
            "converted": float,        # converted amount
            "rate": float,             # exchange rate used
            "date": str,               # date of the rate (YYYY-MM-DD)
            "source": str,
        }
        or None if the API call fails.
    """
    from_cur = from_currency.upper().strip()
    to_cur = to_currency.upper().strip()

    if from_cur == to_cur:
        return {
            "amount": amount,
            "from": from_cur,
            "to": to_cur,
            "converted": amount,
            "rate": 1.0,
            "date": "",
            "source": "Same currency — no conversion needed",
        }

    # Check cache
    cache_key = f"convert_{from_cur}_{to_cur}"
    if cache_key in _rates_cache:
        data, timestamp = _rates_cache[cache_key]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            rate = data["rate"]
            return {
                "amount": amount,
                "from": from_cur,
                "to": to_cur,
                "converted": round(amount * rate, 2),
                "rate": rate,
                "date": data["date"],
                "source": "Frankfurter (European Central Bank)",
            }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{FRANKFURTER_BASE}/latest",
                params={
                    "amount": 1,
                    "from": from_cur,
                    "to": to_cur,
                },
            )
            if resp.status_code == 200:
                raw = resp.json()
                rates = raw.get("rates", {})
                rate = rates.get(to_cur)
                date = raw.get("date", "")

                if rate is None:
                    logger.warning("Frankfurter: no rate found for %s→%s", from_cur, to_cur)
                    return None

                # Cache the rate
                _rates_cache[cache_key] = ({"rate": rate, "date": date}, time.time())

                return {
                    "amount": amount,
                    "from": from_cur,
                    "to": to_cur,
                    "converted": round(amount * rate, 2),
                    "rate": rate,
                    "date": date,
                    "source": "Frankfurter (European Central Bank)",
                }
            else:
                logger.warning(
                    "Frankfurter API error %s: %s",
                    resp.status_code,
                    resp.text[:200],
                )
    except Exception as e:
        logger.warning("Frankfurter API request failed: %s", e)

    return None


async def get_latest_rates(
    base_currency: str = "USD",
) -> Optional[dict]:
    """Get latest exchange rates for a base currency.

    Returns:
        {
            "base": str,
            "date": str,
            "rates": {str: float},  # e.g. {"EUR": 0.92, "GBP": 0.79, ...}
            "source": str,
        }
        or None if the API call fails.
    """
    base = base_currency.upper().strip()

    # Check cache
    cache_key = f"rates_{base}"
    if cache_key in _rates_cache:
        data, timestamp = _rates_cache[cache_key]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return data

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{FRANKFURTER_BASE}/latest",
                params={"from": base},
            )
            if resp.status_code == 200:
                raw = resp.json()
                result = {
                    "base": raw.get("base", base),
                    "date": raw.get("date", ""),
                    "rates": raw.get("rates", {}),
                    "source": "Frankfurter (European Central Bank)",
                }
                _rates_cache[cache_key] = (result, time.time())
                return result
            else:
                logger.warning(
                    "Frankfurter rates API error %s: %s",
                    resp.status_code,
                    resp.text[:200],
                )
    except Exception as e:
        logger.warning("Frankfurter rates API request failed: %s", e)

    return None


async def get_available_currencies() -> Optional[dict]:
    """Get list of available currencies.

    Returns:
        {"USD": "United States Dollar", "EUR": "Euro", ...}
        or None if the API call fails.
    """
    cache_key = "currencies_list"
    if cache_key in _rates_cache:
        data, timestamp = _rates_cache[cache_key]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return data

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{FRANKFURTER_BASE}/currencies")
            if resp.status_code == 200:
                data = resp.json()
                _rates_cache[cache_key] = (data, time.time())
                return data
            else:
                logger.warning(
                    "Frankfurter currencies API error %s: %s",
                    resp.status_code,
                    resp.text[:200],
                )
    except Exception as e:
        logger.warning("Frankfurter currencies API request failed: %s", e)

    return None
