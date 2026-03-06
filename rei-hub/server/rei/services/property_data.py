"""ATTOM Property Data Service — real-time property lookups during AI calls.

When a caller mentions a property address, this service:
1. Hits the ATTOM Data API to get property details
2. Returns beds, baths, sqft, year built, lot size, etc.
3. That data gets fed back to the AI agent mid-conversation
   so it can say things like "Oh, your 3-bed 2-bath on Elm Street..."

Also provides property valuation data (AVM) when available.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import httpx

from rei.config import Settings

logger = logging.getLogger(__name__)

ATTOM_API_BASE = "https://api.gateway.attomdata.com/propertyapi/v1.0.0"


# ── Property Detail Lookup ──────────────────────────────────────────────

async def lookup_property(
    address: str,
    settings: Settings,
) -> Optional[dict[str, Any]]:
    """
    Look up property details from ATTOM Data API using a street address.

    Returns a dict with property characteristics like:
    {
        "address": "123 Elm St, Phoenix, AZ 85001",
        "beds": 3,
        "baths": 2,
        "sqft": 1850,
        "lot_sqft": 7200,
        "year_built": 1995,
        "garage": "2-car attached",
        "property_type": "Single Family",
        "stories": 1,
        "pool": false,
        "estimated_value": 285000,
        "last_sale_price": 220000,
        "last_sale_date": "2019-03-15",
        "tax_assessment": 265000,
        "owner_name": "John Smith",
        "zoning": "R-1"
    }

    Returns None if the property is not found or the API call fails.
    """
    api_key = getattr(settings, "attom_api_key", None)
    if not api_key:
        logger.warning("ATTOM API key not configured, skipping property lookup")
        return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # ATTOM property detail endpoint
            resp = await client.get(
                f"{ATTOM_API_BASE}/property/detail",
                headers={
                    "apikey": api_key,
                    "Accept": "application/json",
                },
                params={
                    "address1": address,
                },
            )

            if resp.status_code == 404:
                logger.info(f"Property not found in ATTOM: {address}")
                return None

            resp.raise_for_status()
            data = resp.json()

            # Parse the ATTOM response into our clean format
            return _parse_attom_response(data)

    except httpx.HTTPStatusError as e:
        logger.warning(f"ATTOM API error ({e.response.status_code}): {e}")
        return None
    except Exception as e:
        logger.error(f"ATTOM property lookup failed: {e}")
        return None


async def lookup_property_avm(
    address: str,
    settings: Settings,
) -> Optional[dict[str, Any]]:
    """
    Get an Automated Valuation Model (AVM) estimate for a property.
    This gives the estimated current market value.
    """
    api_key = getattr(settings, "attom_api_key", None)
    if not api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{ATTOM_API_BASE}/valuation/homeequity",
                headers={
                    "apikey": api_key,
                    "Accept": "application/json",
                },
                params={
                    "address1": address,
                },
            )

            if resp.status_code == 404:
                return None

            resp.raise_for_status()
            data = resp.json()

            properties = data.get("property", [])
            if not properties:
                return None

            prop = properties[0]
            avm = prop.get("avm", {})

            return {
                "estimated_value": avm.get("amount", {}).get("value"),
                "value_low": avm.get("amount", {}).get("low"),
                "value_high": avm.get("amount", {}).get("high"),
                "confidence_score": avm.get("amount", {}).get("scr"),
            }

    except Exception as e:
        logger.warning(f"ATTOM AVM lookup failed: {e}")
        return None


def _parse_attom_response(data: dict) -> Optional[dict[str, Any]]:
    """Parse ATTOM property detail response into a clean, flat dict."""
    try:
        properties = data.get("property", [])
        if not properties:
            return None

        prop = properties[0]

        # Building info
        building = prop.get("building", {})
        size = building.get("size", {})
        rooms = building.get("rooms", {})
        interior = building.get("interior", {})
        parking = building.get("parking", {})

        # Lot info
        lot = prop.get("lot", {})

        # Summary
        summary = prop.get("summary", {})

        # Address
        address_info = prop.get("address", {})

        # Sale history
        sale = prop.get("sale", {})
        sale_history = sale.get("saleTransactionRecording", {}) if sale else {}

        # Assessment
        assessment = prop.get("assessment", {})
        assessed = assessment.get("assessed", {})

        # Owner
        owner = prop.get("assessment", {}).get("owner", {})

        result = {
            # Address
            "address": address_info.get("oneLine", ""),
            "city": address_info.get("locality", ""),
            "state": address_info.get("countrySubd", ""),
            "zip": address_info.get("postal1", ""),

            # Property details
            "beds": rooms.get("beds"),
            "baths_full": rooms.get("bathsFull"),
            "baths_half": rooms.get("bathsHalf"),
            "baths": rooms.get("bathsTotal"),
            "sqft": size.get("livingSize") or size.get("universalSize"),
            "lot_sqft": lot.get("lotSize1"),
            "year_built": summary.get("yearBuilt"),
            "stories": building.get("summary", {}).get("levels"),
            "property_type": summary.get("propType", ""),
            "property_subtype": summary.get("propSubType", ""),

            # Features
            "garage": parking.get("garageType", ""),
            "garage_spaces": parking.get("prkgSpaces"),
            "pool": building.get("summary", {}).get("pool", False),
            "fireplace": interior.get("fplcCount"),
            "heating": building.get("summary", {}).get("heatType", ""),
            "cooling": building.get("summary", {}).get("coolType", ""),
            "roof": building.get("construction", {}).get("roofCover", ""),

            # Financial
            "last_sale_price": sale_history.get("saleTransAmount") if sale_history else None,
            "last_sale_date": sale_history.get("saleTransDate") if sale_history else None,
            "tax_assessment": assessed.get("assdTtlValue"),
            "tax_year": assessment.get("tax", {}).get("taxYear"),

            # Owner
            "owner_name": f"{owner.get('owner1', {}).get('firstNameAndMi', '')} {owner.get('owner1', {}).get('lastName', '')}".strip() if owner.get("owner1") else None,
        }

        # Clean up None values and empty strings
        result = {k: v for k, v in result.items() if v is not None and v != ""}

        return result

    except Exception as e:
        logger.error(f"Failed to parse ATTOM response: {e}")
        return None


# ── Helper: Format property data for AI conversation ────────────────────

def format_property_for_agent(prop_data: dict[str, Any]) -> str:
    """
    Format property data into a natural language string that gets
    injected into the AI agent's context mid-conversation.

    This lets the agent say things like:
    "I can see your property is a 3-bed, 2-bath with about 1,850 sqft..."
    """
    parts = []

    if prop_data.get("beds") or prop_data.get("baths"):
        bed_bath = []
        if prop_data.get("beds"):
            bed_bath.append(f"{prop_data['beds']}-bedroom")
        if prop_data.get("baths"):
            bed_bath.append(f"{prop_data['baths']}-bathroom")
        parts.append(", ".join(bed_bath))

    if prop_data.get("sqft"):
        parts.append(f"approximately {prop_data['sqft']:,} square feet")

    if prop_data.get("year_built"):
        parts.append(f"built in {prop_data['year_built']}")

    if prop_data.get("lot_sqft"):
        lot_acres = prop_data["lot_sqft"] / 43560
        if lot_acres >= 1:
            parts.append(f"on {lot_acres:.1f} acres")
        else:
            parts.append(f"on a {prop_data['lot_sqft']:,} sqft lot")

    if prop_data.get("garage"):
        parts.append(f"with a {prop_data['garage'].lower()}")

    if prop_data.get("pool"):
        parts.append("with a pool")

    if prop_data.get("stories"):
        parts.append(f"{prop_data['stories']}-story")

    property_summary = "The property is a " + ", ".join(parts) + "." if parts else ""

    # Financial context (don't share with caller, but helps AI negotiate)
    financial_parts = []
    if prop_data.get("tax_assessment"):
        financial_parts.append(f"Tax assessed value: ${prop_data['tax_assessment']:,.0f}")
    if prop_data.get("last_sale_price"):
        financial_parts.append(f"Last sold for: ${prop_data['last_sale_price']:,.0f}")
    if prop_data.get("last_sale_date"):
        financial_parts.append(f"Last sale date: {prop_data['last_sale_date']}")

    financial_note = ""
    if financial_parts:
        financial_note = (
            "\n\nFINANCIAL CONTEXT (use for your knowledge ONLY — "
            "do NOT share exact numbers with the caller unless they bring it up first):\n"
            + "\n".join(f"- {fp}" for fp in financial_parts)
        )

    return f"""
PROPERTY DATA JUST RETRIEVED FOR THE ADDRESS THE CALLER MENTIONED:
{property_summary}

Address: {prop_data.get('address', 'Unknown')}
{f"Owner on record: {prop_data['owner_name']}" if prop_data.get('owner_name') else ""}
{financial_note}

USE THIS DATA naturally in your conversation. You can reference the beds, baths,
sqft, and features to show you know the property. Do NOT read it like a list —
weave it in naturally. For example: "Oh that's a nice property — 3 beds, 2 baths,
about 1,800 square feet, right?"
""".strip()
