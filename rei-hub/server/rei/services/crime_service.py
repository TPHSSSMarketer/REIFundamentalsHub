"""FBI Crime Data API Service — Crime statistics by state.

Free API key from data.gov (sign up at api.data.gov/signup/).
Uses the FBI Uniform Crime Reporting (UCR) data.

Docs: https://crime-data-explorer.fr.cloud.gov/pages/docApi
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from rei.config import get_settings
from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)

FBI_CDE_BASE = "https://api.usa.gov/crime/fbi/sapi"

# ── In-memory cache (1 hour TTL — crime data updates annually) ───────
_crime_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 3600

# ── State abbreviation to FBI CDE state codes ────────────────────────
# FBI uses lowercase two-letter state abbreviation
STATE_ABBREV_LOWER: dict[str, str] = {
    "AL": "al", "AK": "ak", "AZ": "az", "AR": "ar", "CA": "ca",
    "CO": "co", "CT": "ct", "DE": "de", "FL": "fl", "GA": "ga",
    "HI": "hi", "ID": "id", "IL": "il", "IN": "in", "IA": "ia",
    "KS": "ks", "KY": "ky", "LA": "la", "ME": "me", "MD": "md",
    "MA": "ma", "MI": "mi", "MN": "mn", "MS": "ms", "MO": "mo",
    "MT": "mt", "NE": "ne", "NV": "nv", "NH": "nh", "NJ": "nj",
    "NM": "nm", "NY": "ny", "NC": "nc", "ND": "nd", "OH": "oh",
    "OK": "ok", "OR": "or", "PA": "pa", "RI": "ri", "SC": "sc",
    "SD": "sd", "TN": "tn", "TX": "tx", "UT": "ut", "VT": "vt",
    "VA": "va", "WA": "wa", "WV": "wv", "WI": "wi", "WY": "wy",
    "DC": "dc",
}


async def _get_api_key(db=None) -> str:
    """Resolve FBI Crime Data API key from config or credentials DB."""
    settings = get_settings()
    key = settings.fbi_crime_api_key
    if key:
        return key
    if db:
        creds = await get_provider_credentials(db, "fbi_crime_data")
        if creds:
            return creds.get("fbi_crime_api_key", "")
    return ""


async def get_crime_stats(
    state_abbrev: str,
    db=None,
) -> Optional[dict]:
    """Get crime statistics for a state.

    Uses the FBI CDE estimated crime data endpoint.

    Returns:
        {
            "violent_crime": int,
            "property_crime": int,
            "murder": int,
            "robbery": int,
            "aggravated_assault": int,
            "burglary": int,
            "larceny": int,
            "motor_vehicle_theft": int,
            "population": int,
            "violent_crime_rate": float,   (per 100k)
            "property_crime_rate": float,  (per 100k)
            "year": int,
            "source": str,
        }
        or None if the API call fails.
    """
    state = state_abbrev.upper()
    state_lower = STATE_ABBREV_LOWER.get(state)
    if not state_lower:
        logger.warning("Unknown state abbreviation for FBI API: %s", state)
        return None

    # Check cache
    cache_key = f"crime_{state_lower}"
    if cache_key in _crime_cache:
        data, timestamp = _crime_cache[cache_key]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return data

    api_key = await _get_api_key(db)
    if not api_key:
        logger.warning("FBI Crime Data API key not configured")
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Get estimated crime totals for the state
            resp = await client.get(
                f"{FBI_CDE_BASE}/api/estimates/states/{state_lower}",
                params={"api_key": api_key},
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])

                if not results:
                    return None

                # Get the most recent year's data
                latest = results[0]
                for entry in results:
                    if entry.get("year", 0) > latest.get("year", 0):
                        latest = entry

                population = latest.get("population", 0)
                violent = latest.get("violent_crime", 0)
                prop_crime = latest.get("property_crime", 0)

                violent_rate = (violent / population * 100000) if population > 0 else 0
                prop_rate = (prop_crime / population * 100000) if population > 0 else 0

                result = {
                    "violent_crime": violent,
                    "property_crime": prop_crime,
                    "murder": latest.get("homicide", 0),
                    "robbery": latest.get("robbery", 0),
                    "aggravated_assault": latest.get("aggravated_assault", 0),
                    "burglary": latest.get("burglary", 0),
                    "larceny": latest.get("larceny", 0),
                    "motor_vehicle_theft": latest.get("motor_vehicle_theft", 0),
                    "population": population,
                    "violent_crime_rate": round(violent_rate, 1),
                    "property_crime_rate": round(prop_rate, 1),
                    "year": latest.get("year", 0),
                    "source": "FBI Uniform Crime Reporting (UCR)",
                }
                _crime_cache[cache_key] = (result, time.time())
                return result
            else:
                logger.warning("FBI CDE API error %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.warning("FBI CDE API request failed: %s", e)

    return None
