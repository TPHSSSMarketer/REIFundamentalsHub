"""Weather Service — Fetch current weather data from OpenWeatherMap.

Free tier: 1,000 API calls/day. Results are cached for 30 minutes
to minimize API usage.

Docs: https://openweathermap.org/current
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from rei.config import get_settings
from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)

OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"

# ── In-memory cache (30 min TTL) ─────────────────────────────────────
_weather_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 1800  # 30 minutes


async def _get_api_key(db=None) -> str:
    """Resolve OpenWeatherMap API key from config or credentials DB."""
    settings = get_settings()
    key = settings.openweathermap_api_key
    if key:
        return key
    if db:
        creds = await get_provider_credentials(db, "openweathermap")
        if creds:
            return creds.get("openweathermap_api_key", "")
    return ""


async def get_current_weather(
    latitude: float,
    longitude: float,
    db=None,
) -> Optional[dict]:
    """Get current weather for a location.

    Returns:
        {
            "temperature_f": float,
            "feels_like_f": float,
            "description": str,
            "icon": str,
            "humidity": int,
            "wind_speed_mph": float,
            "pressure": int,
            "cloud_cover": int,
        }
        or None if the API call fails.
    """
    # Check cache
    cache_key = f"{latitude:.2f}_{longitude:.2f}"
    if cache_key in _weather_cache:
        data, timestamp = _weather_cache[cache_key]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return data

    api_key = await _get_api_key(db)
    if not api_key:
        logger.warning("OpenWeatherMap API key not configured")
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{OPENWEATHER_BASE}/weather",
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "appid": api_key,
                    "units": "imperial",  # Fahrenheit for US users
                },
            )
            if resp.status_code == 200:
                raw = resp.json()
                result = {
                    "temperature_f": raw.get("main", {}).get("temp", 0),
                    "feels_like_f": raw.get("main", {}).get("feels_like", 0),
                    "description": raw.get("weather", [{}])[0].get("description", ""),
                    "icon": raw.get("weather", [{}])[0].get("icon", ""),
                    "humidity": raw.get("main", {}).get("humidity", 0),
                    "wind_speed_mph": raw.get("wind", {}).get("speed", 0),
                    "pressure": raw.get("main", {}).get("pressure", 0),
                    "cloud_cover": raw.get("clouds", {}).get("all", 0),
                }
                _weather_cache[cache_key] = (result, time.time())
                return result
            else:
                logger.warning("OpenWeatherMap API error %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.warning("OpenWeatherMap request failed: %s", e)

    return None


async def get_5day_forecast(
    latitude: float,
    longitude: float,
    db=None,
) -> Optional[list[dict]]:
    """Get a 5-day / 3-hour forecast for a location.

    Returns a list of forecast entries, each with:
        {"date": str, "temperature_f": float, "description": str, "icon": str}
    """
    api_key = await _get_api_key(db)
    if not api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{OPENWEATHER_BASE}/forecast",
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "appid": api_key,
                    "units": "imperial",
                    "cnt": 40,  # 5 days * 8 entries/day
                },
            )
            if resp.status_code == 200:
                raw = resp.json()
                forecasts = []
                for entry in raw.get("list", []):
                    forecasts.append({
                        "date": entry.get("dt_txt", ""),
                        "temperature_f": entry.get("main", {}).get("temp", 0),
                        "description": entry.get("weather", [{}])[0].get("description", ""),
                        "icon": entry.get("weather", [{}])[0].get("icon", ""),
                    })
                return forecasts
    except Exception as e:
        logger.warning("OpenWeatherMap forecast failed: %s", e)

    return None
