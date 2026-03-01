"""HUD User API integration — USPS ZIP Code Crosswalk data.

Used to map zip codes to market areas (cities, counties, metro areas).
API key is stored in the SuperAdmin credentials system.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from rei.config import get_settings

logger = logging.getLogger(__name__)

HUD_BASE_URL = "https://www.huduser.gov/hudapi/public/usps"


async def get_hud_api_key() -> Optional[str]:
    """Get the HUD API key from the credentials service."""
    try:
        from rei.services.credentials_service import get_credential
        key = await get_credential("hud_pdr")
        return key.get("hud_api_key") if key else None
    except Exception as e:
        logger.error("Failed to get HUD API key: %s", e)
        return None


async def fetch_zip_crosswalk(zip_code: str, api_key: str) -> dict | None:
    """Fetch USPS ZIP code crosswalk data from HUD API.
    
    Returns data like:
    {
        "zip": "78201",
        "city": "San Antonio",
        "county": "Bexar County",
        "cbsa": "San Antonio-New Braunfels, TX",
        "state": "TX"
    }
    """
    # The crosswalk endpoint: type 1 = ZIP to Tract, type 2 = ZIP to County, etc.
    # type=4 is ZIP to CBSA (Core Based Statistical Area / metro area)
    # type=2 is ZIP to County
    url = f"{HUD_BASE_URL}"
    
    headers = {"Authorization": f"Bearer {api_key}"}
    
    result = {"zip": zip_code}
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            # Get ZIP to County crosswalk (type 2)
            resp = await client.get(
                url,
                params={"type": 2, "query": zip_code},
                headers=headers,
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict) and "data" in data:
                    records = data["data"].get("results", [])
                elif isinstance(data, list) and len(data) > 0:
                    records = data
                else:
                    records = []
                
                if records:
                    first = records[0] if isinstance(records, list) else records
                    result["county"] = first.get("county", "")
                    result["city"] = first.get("city", first.get("usps_zip_pref_city", ""))
                    result["state"] = first.get("state", first.get("usps_zip_pref_state", ""))
            
            # Get ZIP to CBSA crosswalk (type 4) for metro area name
            resp2 = await client.get(
                url,
                params={"type": 4, "query": zip_code},
                headers=headers,
            )
            if resp2.status_code == 200:
                data2 = resp2.json()
                if isinstance(data2, dict) and "data" in data2:
                    records2 = data2["data"].get("results", [])
                elif isinstance(data2, list) and len(data2) > 0:
                    records2 = data2
                else:
                    records2 = []
                
                if records2:
                    first2 = records2[0] if isinstance(records2, list) else records2
                    result["cbsa"] = first2.get("cbsa_name", first2.get("cbsa", ""))
            
        except httpx.TimeoutException:
            logger.warning("HUD API timeout for zip %s", zip_code)
            return None
        except Exception as e:
            logger.error("HUD API error for zip %s: %s", zip_code, e)
            return None
    
    return result


async def resolve_zip_to_market(zip_code: str) -> Optional[str]:
    """Resolve a zip code to a market name.
    
    First checks the local market_zip_codes table.
    If not found, calls the HUD API and caches the result.
    
    Returns market name string or None.
    """
    from rei.database import async_session_factory
    from sqlalchemy import select
    from rei.models.crm import MarketZipCode
    
    # Check local cache first
    async with async_session_factory() as db:
        result = await db.execute(
            select(MarketZipCode).where(MarketZipCode.zip_code == zip_code)
        )
        cached = result.scalar_one_or_none()
        if cached:
            return cached.market_name
    
    # Not cached — fetch from HUD API
    api_key = await get_hud_api_key()
    if not api_key:
        logger.warning("No HUD API key configured, cannot resolve zip %s", zip_code)
        return None
    
    data = await fetch_zip_crosswalk(zip_code, api_key)
    if not data:
        return None
    
    # Build market name: prefer CBSA (metro area), fallback to city + state
    market_name = data.get("cbsa") or ""
    if not market_name:
        city = data.get("city", "")
        state = data.get("state", "")
        market_name = f"{city}, {state}".strip(", ") if city else ""
    
    if not market_name:
        return None
    
    # Cache in database
    async with async_session_factory() as db:
        try:
            entry = MarketZipCode(
                zip_code=zip_code,
                market_name=market_name,
                state=data.get("state"),
            )
            db.add(entry)
            await db.commit()
            logger.info("Cached zip %s → %s", zip_code, market_name)
        except Exception:
            # Unique constraint violation — another request cached it first
            await db.rollback()
    
    return market_name
