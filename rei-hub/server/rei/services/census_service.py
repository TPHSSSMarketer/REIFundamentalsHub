"""US Census Bureau API Service — Demographics and housing data.

Free API with key (sign up at api.census.gov/data/key_signup.html).
Uses the American Community Survey (ACS) 5-Year Estimates for
reliable small-area data.

Docs: https://api.census.gov/data.html
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from rei.config import get_settings
from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)

CENSUS_BASE = "https://api.census.gov/data"

# ── In-memory cache (1 hour TTL — census data changes slowly) ────────
_census_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 3600

# ── State FIPS codes (needed for Census API) ─────────────────────────
STATE_FIPS: dict[str, str] = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06",
    "CO": "08", "CT": "09", "DE": "10", "FL": "12", "GA": "13",
    "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19",
    "KS": "20", "KY": "21", "LA": "22", "ME": "23", "MD": "24",
    "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29",
    "MT": "30", "NE": "31", "NV": "32", "NH": "33", "NJ": "34",
    "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39",
    "OK": "40", "OR": "41", "PA": "42", "RI": "44", "SC": "45",
    "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50",
    "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56",
    "DC": "11",
}


async def _get_api_key(db=None) -> str:
    """Resolve Census Bureau API key from config or credentials DB."""
    settings = get_settings()
    key = settings.census_bureau_api_key
    if key:
        return key
    if db:
        creds = await get_provider_credentials(db, "census_bureau")
        if creds:
            return creds.get("census_bureau_api_key", "")
    return ""


async def get_demographics(
    state_abbrev: str,
    db=None,
) -> Optional[dict]:
    """Get demographic data for a state from the US Census Bureau.

    Uses ACS 5-Year Estimates (most recent available year).

    Returns:
        {
            "population": int,
            "median_household_income": int,
            "median_home_value": int,
            "total_housing_units": int,
            "owner_occupied_percent": float,
            "poverty_rate": float,
            "median_age": float,
            "source": str,
        }
        or None if the API call fails.
    """
    state = state_abbrev.upper()
    fips = STATE_FIPS.get(state)
    if not fips:
        logger.warning("Unknown state abbreviation: %s", state)
        return None

    # Check cache
    cache_key = f"demographics_{fips}"
    if cache_key in _census_cache:
        data, timestamp = _census_cache[cache_key]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return data

    api_key = await _get_api_key(db)
    if not api_key:
        logger.warning("Census Bureau API key not configured")
        return None

    # ACS 5-Year variables:
    # B01003_001E = Total population
    # B19013_001E = Median household income
    # B25077_001E = Median home value
    # B25001_001E = Total housing units
    # B25003_002E = Owner-occupied housing units
    # B17001_002E = Population below poverty
    # B01002_001E = Median age
    variables = "B01003_001E,B19013_001E,B25077_001E,B25001_001E,B25003_002E,B17001_002E,B01002_001E"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{CENSUS_BASE}/2022/acs/acs5",
                params={
                    "get": f"NAME,{variables}",
                    "for": f"state:{fips}",
                    "key": api_key,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                if len(data) >= 2:
                    # First row is headers, second row is values
                    values = data[1]
                    population = _safe_int(values[1])
                    median_income = _safe_int(values[2])
                    median_home_value = _safe_int(values[3])
                    total_housing = _safe_int(values[4])
                    owner_occupied = _safe_int(values[5])
                    poverty_pop = _safe_int(values[6])
                    median_age = _safe_float(values[7])

                    owner_pct = (owner_occupied / total_housing * 100) if total_housing > 0 else 0
                    poverty_rate = (poverty_pop / population * 100) if population > 0 else 0

                    result = {
                        "population": population,
                        "median_household_income": median_income,
                        "median_home_value": median_home_value,
                        "total_housing_units": total_housing,
                        "owner_occupied_percent": round(owner_pct, 1),
                        "poverty_rate": round(poverty_rate, 1),
                        "median_age": median_age,
                        "source": "ACS 5-Year Estimates (2022)",
                    }
                    _census_cache[cache_key] = (result, time.time())
                    return result
            else:
                logger.warning("Census API error %s: %s", resp.status_code, resp.text[:200])
    except Exception as e:
        logger.warning("Census API request failed: %s", e)

    return None


def _safe_int(val) -> int:
    """Convert a Census API value to int, handling nulls and negatives."""
    try:
        v = int(val)
        return max(v, 0)
    except (TypeError, ValueError):
        return 0


def _safe_float(val) -> float:
    """Convert a Census API value to float, handling nulls."""
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0
