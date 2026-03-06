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
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)

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

    # Build address params for ATTOM
    address_params = {
        "address1": address,
        "address2": f"{city}, {state} {zip_code}".strip(),
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
