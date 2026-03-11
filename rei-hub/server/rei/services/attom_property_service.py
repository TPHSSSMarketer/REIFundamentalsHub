"""ATTOM Property Data Service — fetches property-level data for underwriting.

Uses the ATTOM Data API (api.gateway.attomdata.com) to pull:
- Tax assessment data
- Sale/comp history
- Ownership & lien records
- Permit & zoning info

Gracefully returns empty data if the ATTOM key is not configured.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)

# ── Street type abbreviations (USPS standard) ──
_STREET_ABBREVS: dict[str, str] = {
    "road": "Rd", "street": "St", "avenue": "Ave", "drive": "Dr",
    "lane": "Ln", "court": "Ct", "place": "Pl", "circle": "Cir",
    "boulevard": "Blvd", "terrace": "Ter", "trail": "Trl",
    "highway": "Hwy", "parkway": "Pkwy", "way": "Way",
    "hollow": "Holw", "run": "Run", "ridge": "Rdg",
    "crossing": "Xing", "alley": "Aly", "pike": "Pike",
    "turnpike": "Tpke", "path": "Path", "pass": "Pass",
}

# Directional abbreviations
_DIR_ABBREVS: dict[str, str] = {
    "north": "N", "south": "S", "east": "E", "west": "W",
    "northeast": "NE", "northwest": "NW", "southeast": "SE", "southwest": "SW",
}


def _normalize_address(raw: str) -> str:
    """Normalize a street address for ATTOM API matching.

    Abbreviates common street types (Road → Rd) and directional prefixes
    (North → N) per USPS standards. Returns the cleaned address.
    """
    if not raw:
        return raw

    # Collapse extra whitespace
    addr = " ".join(raw.split())

    # Normalize "and" ↔ "&" — ATTOM databases vary on which form they store.
    # We standardize to "&" for the primary attempt (shorter, more common in
    # property records). The retry logic will try the original if this fails.
    addr = re.sub(r"\band\b", "&", addr, flags=re.IGNORECASE)

    # Replace directional words (whole-word, case-insensitive)
    for full, abbr in _DIR_ABBREVS.items():
        addr = re.sub(rf"\b{full}\b", abbr, addr, flags=re.IGNORECASE)

    # Replace street type (typically the last word)
    words = addr.split()
    if len(words) >= 2:
        last_lower = words[-1].lower().rstrip(".,")
        if last_lower in _STREET_ABBREVS:
            words[-1] = _STREET_ABBREVS[last_lower]
            addr = " ".join(words)

    return addr

ATTOM_BASE_URL = "https://api.gateway.attomdata.com"


async def _get_attom_key(db: AsyncSession) -> str:
    """Resolve the ATTOM API key from the credentials DB."""
    creds = await get_provider_credentials(db, "attom")
    if creds and creds.get("attom_api_key"):
        return creds["attom_api_key"]
    return ""


async def _attom_get(api_key: str, endpoint: str, params: dict) -> dict:
    """Make an authenticated GET request to the ATTOM API."""
    headers = {
        "apikey": api_key,
        "Accept": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{ATTOM_BASE_URL}{endpoint}",
                headers=headers,
                params=params,
            )
            if resp.status_code == 200:
                return resp.json()
            logger.warning("ATTOM %s returned %d: %s", endpoint, resp.status_code, resp.text[:300])
            return {}
    except Exception as exc:
        logger.warning("ATTOM request to %s failed: %s", endpoint, exc)
        return {}


async def lookup_property_data(
    address: str,
    city: str,
    state: str,
    zip_code: str,
    db: AsyncSession,
) -> dict:
    """Fetch comprehensive property-level ATTOM data for underwriting.

    Returns a structured dict with all available data fields.
    Returns empty dict if ATTOM key is not configured.
    """
    api_key = await _get_attom_key(db)
    if not api_key:
        logger.info("No ATTOM API key configured — skipping property data lookup")
        return {}

    # Normalize the street address for better ATTOM matching
    normalized = _normalize_address(address)
    address2 = f"{city}, {state} {zip_code}".strip()

    # Build address params for ATTOM
    address_params = {
        "address1": normalized,
        "address2": address2,
    }

    result: dict = {
        "source": "attom",
        "tax_assessment": {},
        "sale_history": [],
        "lien_records": [],
        "property_detail": {},
    }

    # ── 1. Property Detail (basic info + zoning) ──
    detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", address_params)

    # If normalized address got no results, try fallback variants.
    # Addresses like "Bread and Cheese Hollow Road" might be stored as
    # "Bread & Cheese Hollow Rd" or vice versa in ATTOM's database.
    if not detail_data or not detail_data.get("property"):
        # Fallback 1: try the original raw address
        if normalized != address:
            logger.info("ATTOM: normalized address got no results, retrying with original: %s", address)
            address_params = {"address1": address, "address2": address2}
            detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", address_params)

    if not detail_data or not detail_data.get("property"):
        # Fallback 2: swap "and" ↔ "&" in the original address
        swapped = None
        if " and " in address.lower():
            swapped = re.sub(r"\band\b", "&", address, flags=re.IGNORECASE)
        elif "&" in address:
            swapped = address.replace("&", "and")
        if swapped and swapped != normalized and swapped != address:
            logger.info("ATTOM: trying and/& swap variant: %s", swapped)
            address_params = {"address1": swapped, "address2": address2}
            detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", address_params)

    # Fallback 3: try street number + zip only (less strict matching)
    if not detail_data or not detail_data.get("property"):
        # Extract the street number from the start of the address
        street_num_match = re.match(r"^(\d+)\s+", address)
        if street_num_match and zip_code:
            street_num = street_num_match.group(1)
            # Try ATTOM's address search endpoint which is more forgiving
            search_params = {
                "postalcode": zip_code,
                "address1": f"{street_num} %",  # Wildcard partial match
            }
            logger.info("ATTOM: trying partial match with street number %s + zip %s", street_num, zip_code)
            detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", search_params)

    # Fallback 4: try without abbreviating anything, just clean whitespace
    if not detail_data or not detail_data.get("property"):
        clean = " ".join(address.split())
        if clean != address and clean != normalized:
            logger.info("ATTOM: trying clean-whitespace only: %s", clean)
            address_params = {"address1": clean, "address2": address2}
            detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", address_params)

    if detail_data:
        properties = detail_data.get("property", [])
        if properties:
            prop = properties[0] if isinstance(properties, list) else properties
            building = prop.get("building", {})
            lot = prop.get("lot", {})
            summary = prop.get("summary", {})
            result["property_detail"] = {
                "property_type": summary.get("propclass", ""),
                "year_built": building.get("yearbuilt", ""),
                "bedrooms": building.get("rooms", {}).get("beds", ""),
                "bathrooms": building.get("rooms", {}).get("bathsfull", ""),
                "square_footage": building.get("size", {}).get("livingsize", ""),
                "lot_size_sqft": lot.get("lotsize1", ""),
                "lot_size_acres": lot.get("lotsize2", ""),
                "zoning": lot.get("zoningtype", ""),
                "legal_description": prop.get("area", {}).get("locallegaldescrip", ""),
            }

    # ── 2. Tax Assessment ──
    assess_data = await _attom_get(api_key, "/propertyapi/v1.0.0/assessment/detail", address_params)
    if assess_data:
        properties = assess_data.get("property", [])
        if properties:
            prop = properties[0] if isinstance(properties, list) else properties
            assessment = prop.get("assessment", {})
            market = assessment.get("market", {})
            assessed = assessment.get("assessed", {})
            tax = assessment.get("tax", {})
            result["tax_assessment"] = {
                "market_total_value": market.get("mktttlvalue", ""),
                "market_land_value": market.get("mktlandvalue", ""),
                "market_improvement_value": market.get("mktimprvalue", ""),
                "assessed_total_value": assessed.get("asdttlvalue", ""),
                "tax_amount": tax.get("taxamt", ""),
                "tax_year": tax.get("taxyear", ""),
            }

    # ── 3. Sale History (comps) ──
    sale_data = await _attom_get(api_key, "/propertyapi/v1.0.0/saleshistory/detail", address_params)
    if sale_data:
        properties = sale_data.get("property", [])
        if isinstance(properties, list):
            for prop in properties[:10]:  # Limit to 10 records
                sale = prop.get("saleTransferEvent", {})
                if sale:
                    result["sale_history"].append({
                        "sale_date": sale.get("saleTransDate", ""),
                        "sale_price": sale.get("saleTransAmount", ""),
                        "sale_type": sale.get("saleTransType", ""),
                        "buyer_name": sale.get("buyerName", ""),
                        "seller_name": sale.get("sellerName", ""),
                    })

    # ── 4. Lien Records ──
    lien_data = await _attom_get(api_key, "/propertyapi/v1.0.0/assessment/detail", {
        **address_params,
        "includeliens": "true",
    })
    if lien_data:
        properties = lien_data.get("property", [])
        if properties:
            prop = properties[0] if isinstance(properties, list) else properties
            liens = prop.get("assessment", {}).get("mortgage", {})
            if liens:
                for key in ["firstConcurrent", "secondConcurrent"]:
                    lien = liens.get(key, {})
                    if lien and lien.get("amount"):
                        result["lien_records"].append({
                            "type": key,
                            "amount": lien.get("amount", ""),
                            "lender": lien.get("companyName", ""),
                            "date": lien.get("date", ""),
                            "interest_rate": lien.get("interestRate", ""),
                            "loan_type": lien.get("loanType", ""),
                        })

    return result
