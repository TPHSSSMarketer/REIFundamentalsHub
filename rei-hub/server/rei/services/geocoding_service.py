"""Geocoding Service — Convert addresses to latitude/longitude coordinates.

Uses two free providers with automatic fallback:
1. Nominatim (OpenStreetMap) — free, no API key, 1 req/sec rate limit
2. US Census Geocoder — free, no API key, US addresses only

Both are called via httpx async, following the same pattern as attom_service.py.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Optional

import httpx

from rei.config import get_settings

logger = logging.getLogger(__name__)

# ── In-memory cache to avoid re-geocoding the same address ────────────
_geocode_cache: dict[str, dict] = {}
_CACHE_MAX_SIZE = 5000

# ── Nominatim rate limiting (1 request per second) ────────────────────
_last_nominatim_call: float = 0.0
_nominatim_lock = asyncio.Lock()


def _cache_key(address: str, city: str, state: str, zip_code: str) -> str:
    """Build a normalized cache key from address components."""
    return f"{address.strip().lower()}|{city.strip().lower()}|{state.strip().upper()}|{zip_code.strip()}"


async def geocode_address(
    address: str = "",
    city: str = "",
    state: str = "",
    zip_code: str = "",
) -> Optional[dict]:
    """Geocode an address to latitude/longitude.

    Tries Nominatim first, falls back to US Census Geocoder.
    Returns None if both fail (caller should handle gracefully).

    Returns:
        {"latitude": float, "longitude": float, "source": "nominatim"|"census"}
        or None if geocoding failed.
    """
    # Build query string from components
    parts = [p.strip() for p in [address, city, state, zip_code] if p.strip()]
    if not parts:
        return None

    # Check cache first
    key = _cache_key(address, city, state, zip_code)
    if key in _geocode_cache:
        return _geocode_cache[key]

    query = ", ".join(parts)

    # Try Nominatim first
    result = await _call_nominatim(query)
    if result:
        _store_cache(key, result)
        return result

    # Fallback to Census Geocoder (US addresses only)
    result = await _call_census_geocoder(address, city, state, zip_code)
    if result:
        _store_cache(key, result)
        return result

    logger.warning("All geocoding attempts failed for: %s", query)
    return None


async def geocode_city_state(city: str, state: str) -> Optional[dict]:
    """Geocode just a city + state (for market records that don't have a street address)."""
    return await geocode_address(city=city, state=state)


def _store_cache(key: str, result: dict) -> None:
    """Store a geocoding result in the in-memory cache."""
    global _geocode_cache
    if len(_geocode_cache) >= _CACHE_MAX_SIZE:
        # Evict oldest half when cache is full
        keys = list(_geocode_cache.keys())
        for k in keys[: len(keys) // 2]:
            del _geocode_cache[k]
    _geocode_cache[key] = result


# ── Nominatim (OpenStreetMap) ─────────────────────────────────────────


async def _call_nominatim(query: str) -> Optional[dict]:
    """Call Nominatim geocoding API with rate limiting.

    Nominatim requires:
    - User-Agent header identifying your application
    - Maximum 1 request per second
    - No heavy automated usage
    """
    global _last_nominatim_call
    settings = get_settings()

    async with _nominatim_lock:
        # Enforce 1 req/sec rate limit
        now = time.monotonic()
        elapsed = now - _last_nominatim_call
        if elapsed < 1.0:
            await asyncio.sleep(1.0 - elapsed)
        _last_nominatim_call = time.monotonic()

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "us",
                },
                headers={
                    "User-Agent": settings.nominatim_user_agent,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                if data and len(data) > 0:
                    return {
                        "latitude": float(data[0]["lat"]),
                        "longitude": float(data[0]["lon"]),
                        "source": "nominatim",
                    }
    except Exception as e:
        logger.warning("Nominatim geocoding failed: %s", e)

    return None


# ── US Census Geocoder ────────────────────────────────────────────────


async def _call_census_geocoder(
    address: str = "",
    city: str = "",
    state: str = "",
    zip_code: str = "",
) -> Optional[dict]:
    """Call the US Census Bureau Geocoder API.

    Free, no API key needed, good accuracy for US addresses.
    Works best with a full street address but can handle city/state too.
    """
    # Build the street address — Census expects "street" separately
    street = address.strip() if address.strip() else ""

    # If we only have city/state (no street), use the one-line endpoint
    if not street:
        return await _census_onelineaddress(f"{city}, {state} {zip_code}".strip())

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://geocoding.geo.census.gov/geocoder/locations/address",
                params={
                    "street": street,
                    "city": city,
                    "state": state,
                    "zip": zip_code,
                    "benchmark": "Public_AR_Current",
                    "format": "json",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                matches = (
                    data.get("result", {})
                    .get("addressMatches", [])
                )
                if matches:
                    coords = matches[0].get("coordinates", {})
                    if coords.get("x") and coords.get("y"):
                        return {
                            "latitude": float(coords["y"]),
                            "longitude": float(coords["x"]),
                            "source": "census",
                        }
    except Exception as e:
        logger.warning("Census geocoder failed: %s", e)

    return None


async def _census_onelineaddress(address: str) -> Optional[dict]:
    """Geocode using the Census one-line address endpoint (for city/state only)."""
    if not address.strip():
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
                params={
                    "address": address,
                    "benchmark": "Public_AR_Current",
                    "format": "json",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                matches = (
                    data.get("result", {})
                    .get("addressMatches", [])
                )
                if matches:
                    coords = matches[0].get("coordinates", {})
                    if coords.get("x") and coords.get("y"):
                        return {
                            "latitude": float(coords["y"]),
                            "longitude": float(coords["x"]),
                            "source": "census",
                        }
    except Exception as e:
        logger.warning("Census one-line geocoder failed: %s", e)

    return None
