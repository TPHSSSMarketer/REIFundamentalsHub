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

    # Build address2 carefully — avoid malformed values like ", 11768"
    if city and state:
        address2 = f"{city}, {state} {zip_code}".strip()
    elif zip_code:
        address2 = zip_code
    else:
        address2 = f"{city} {state}".strip()

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
    logger.info("ATTOM lookup: address1=%s, address2=%s", address_params["address1"], address_params["address2"])
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

    # Fallback 3: try with just zip code (no city name) in address2
    # Sometimes ATTOM is picky about the city name format
    if not detail_data or not detail_data.get("property"):
        if zip_code:
            zip_only_params = {"address1": normalized, "address2": zip_code}
            logger.info("ATTOM: trying normalized address with zip-only address2: %s, %s", normalized, zip_code)
            detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", zip_only_params)

    # Fallback 4: try original address with just zip code
    if not detail_data or not detail_data.get("property"):
        if zip_code and normalized != address:
            zip_only_params = {"address1": address, "address2": zip_code}
            logger.info("ATTOM: trying original address with zip-only: %s, %s", address, zip_code)
            detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", zip_only_params)

    # Fallback 5: try "and" preserved (not &) with abbreviated street type
    # e.g. "273 Bread and Cheese Hollow Rd"
    if not detail_data or not detail_data.get("property"):
        and_preserved = address
        words_ap = and_preserved.split()
        if len(words_ap) >= 2:
            last_lower = words_ap[-1].lower().rstrip(".,")
            if last_lower in _STREET_ABBREVS:
                words_ap[-1] = _STREET_ABBREVS[last_lower]
                and_preserved = " ".join(words_ap)
        if and_preserved != normalized and and_preserved != address:
            logger.info("ATTOM: trying 'and' preserved + abbreviated suffix: %s", and_preserved)
            address_params = {"address1": and_preserved, "address2": address2}
            detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", address_params)

    # Fallback 6: try "and" preserved with zip-only
    if not detail_data or not detail_data.get("property"):
        and_preserved = address
        words_ap = and_preserved.split()
        if len(words_ap) >= 2:
            last_lower = words_ap[-1].lower().rstrip(".,")
            if last_lower in _STREET_ABBREVS:
                words_ap[-1] = _STREET_ABBREVS[last_lower]
                and_preserved = " ".join(words_ap)
        if zip_code and and_preserved != address:
            logger.info("ATTOM: trying 'and' preserved + zip-only: %s, %s", and_preserved, zip_code)
            address_params = {"address1": and_preserved, "address2": zip_code}
            detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", address_params)

    # Fallback 7: try without the street type entirely
    # e.g. "273 Bread & Cheese Hollow" (drop "Rd"/"Road")
    if not detail_data or not detail_data.get("property"):
        words = normalized.split()
        if len(words) >= 3 and words[-1].lower().rstrip(".,") in _STREET_ABBREVS:
            no_type = " ".join(words[:-1])
            logger.info("ATTOM: trying address without street type suffix: %s", no_type)
            address_params = {"address1": no_type, "address2": address2}
            detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", address_params)

    # Fallback 8: try original address (with "and") without street suffix + zip-only
    if not detail_data or not detail_data.get("property"):
        orig_words = address.split()
        if len(orig_words) >= 3:
            last_lower = orig_words[-1].lower().rstrip(".,")
            if last_lower in _STREET_ABBREVS or last_lower in [v.lower() for v in _STREET_ABBREVS.values()]:
                no_type_orig = " ".join(orig_words[:-1])
                if zip_code:
                    logger.info("ATTOM: trying original without suffix + zip-only: %s, %s", no_type_orig, zip_code)
                    address_params = {"address1": no_type_orig, "address2": zip_code}
                    detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", address_params)

    # Fallback 9: try with just house number + first few words (for very long street names)
    if not detail_data or not detail_data.get("property"):
        if zip_code:
            # Strip both "and"/"&" and street suffix, keep core name
            clean = re.sub(r"\b(and|&)\b", "", address, flags=re.IGNORECASE)
            clean = " ".join(clean.split())  # collapse whitespace
            clean_words = clean.split()
            if len(clean_words) >= 3:
                last_lower = clean_words[-1].lower().rstrip(".,")
                if last_lower in _STREET_ABBREVS or last_lower in [v.lower() for v in _STREET_ABBREVS.values()]:
                    clean = " ".join(clean_words[:-1])
                logger.info("ATTOM: trying stripped address + zip-only: %s, %s", clean, zip_code)
                address_params = {"address1": clean, "address2": zip_code}
                detail_data = await _attom_get(api_key, "/propertyapi/v1.0.0/property/detail", address_params)

    # Log final outcome
    if detail_data and detail_data.get("property"):
        logger.info("ATTOM: property detail found for %s", address)
    else:
        logger.warning("ATTOM: NO property detail found for %s after all fallbacks", address)

    # ── 1. Property Detail — capture ALL data ATTOM returns ──
    if detail_data:
        properties = detail_data.get("property", [])
        if properties:
            prop = properties[0] if isinstance(properties, list) else properties
            building = prop.get("building", {})
            lot = prop.get("lot", {})
            summary = prop.get("summary", {})
            area = prop.get("area", {})
            address_info = prop.get("address", {})
            location = prop.get("location", {})
            identifier = prop.get("identifier", {})
            utilities = prop.get("utilities", {})
            rooms = building.get("rooms", {})
            size = building.get("size", {})

            result["property_detail"] = {
                # Core identifiers
                "attom_id": identifier.get("attomId", ""),
                "fips": identifier.get("fips", ""),
                "apn": identifier.get("apn", ""),

                # Address (ATTOM's canonical form)
                "address_one_line": address_info.get("oneLine", ""),
                "address_line1": address_info.get("line1", ""),
                "address_line2": address_info.get("line2", ""),
                "city": address_info.get("locality", ""),
                "state": address_info.get("countrySubd", ""),
                "zip": address_info.get("postal1", ""),
                "zip4": address_info.get("postal2", ""),
                "county": address_info.get("countrysecsubd", "") or area.get("countrysecsubd", ""),

                # Location / Geocoding
                "latitude": location.get("latitude", ""),
                "longitude": location.get("longitude", ""),
                "geo_accuracy": location.get("accuracy", ""),

                # Property classification
                "property_type": summary.get("propclass", ""),
                "property_subtype": summary.get("propsubtype", ""),
                "prop_type_detail": summary.get("proptype", ""),
                "absentee_owner": summary.get("absenteeInd", ""),
                "occupancy_status": summary.get("occupancystatus", ""),
                "year_built": building.get("yearbuilt", ""),

                # Building details
                "bedrooms": rooms.get("beds", ""),
                "bathrooms_full": rooms.get("bathsfull", ""),
                "bathrooms_half": rooms.get("bathshalf", ""),
                "bathrooms_total": rooms.get("bathstotal", ""),
                "total_rooms": rooms.get("roomsTotal", ""),
                "stories": building.get("summary", {}).get("stories", "")
                    or building.get("stories", ""),

                # Size
                "square_footage": size.get("livingsize", "") or size.get("universalsize", ""),
                "building_size": size.get("bldgsize", ""),
                "gross_size": size.get("grosssize", ""),

                # Lot
                "lot_size_acres": lot.get("lotsize1", ""),
                "lot_size_sqft": lot.get("lotsize2", ""),
                "lot_depth": lot.get("depth", ""),
                "lot_frontage": lot.get("frontage", ""),
                "lot_number": lot.get("lotnum", ""),
                "pool_type": lot.get("pooltype", ""),
                "zoning": lot.get("zoningtype", ""),

                # Construction & features
                "construction_type": building.get("construction", {}).get("constructiontype", ""),
                "exterior_walls": building.get("construction", {}).get("wallType", ""),
                "roof_type": building.get("construction", {}).get("roofcover", ""),
                "foundation_type": building.get("construction", {}).get("foundationtype", ""),
                "basement_size": building.get("interior", {}).get("bsmtsize", ""),
                "basement_type": building.get("interior", {}).get("bsmttype", ""),
                "fireplace": building.get("interior", {}).get("fplccount", ""),
                "garage_type": building.get("parking", {}).get("garagetype", ""),
                "parking_spaces": building.get("parking", {}).get("prkgSpaces", ""),
                "parking_type": building.get("parking", {}).get("prkgType", ""),
                "heating": building.get("summary", {}).get("heatingtype", "")
                    or utilities.get("heatingtype", ""),
                "cooling": building.get("summary", {}).get("coolingtype", "")
                    or utilities.get("coolingtype", ""),
                "water": utilities.get("watertype", ""),
                "sewer": utilities.get("sewertype", ""),

                # Area / Legal
                "legal_description": area.get("locallegaldescrip", ""),
                "subdivision": area.get("subdname", ""),
                "school_district": area.get("schoolDistrictName", ""),
                "census_tract": area.get("subdtractnum", ""),
                "tax_code_area": area.get("taxcodearea", ""),
                "county_use_code": area.get("countyuse1", ""),
                "municipality": area.get("munname", ""),
            }

            # Store the raw ATTOM response for anything we didn't explicitly map
            result["raw_property_detail"] = prop

    # ── 2. Tax Assessment — capture ALL data ──
    assess_data = await _attom_get(api_key, "/propertyapi/v1.0.0/assessment/detail", address_params)
    if assess_data:
        properties = assess_data.get("property", [])
        if properties:
            prop = properties[0] if isinstance(properties, list) else properties
            assessment = prop.get("assessment", {})
            market = assessment.get("market", {})
            assessed = assessment.get("assessed", {})
            appraised = assessment.get("appraised", {})
            calculated = assessment.get("calculations", {})
            tax = assessment.get("tax", {})
            mortgage = assessment.get("mortgage", {})

            result["tax_assessment"] = {
                # Market values
                "market_total_value": market.get("mktttlvalue", ""),
                "market_land_value": market.get("mktlandvalue", ""),
                "market_improvement_value": market.get("mktimprvalue", ""),

                # Assessed values
                "assessed_total_value": assessed.get("assdttlvalue", ""),
                "assessed_land_value": assessed.get("assdlandvalue", ""),
                "assessed_improvement_value": assessed.get("assdimprvalue", ""),

                # Appraised values
                "appraised_total_value": appraised.get("apprttlvalue", ""),
                "appraised_land_value": appraised.get("apprlandvalue", ""),
                "appraised_improvement_value": appraised.get("apprimprvalue", ""),

                # Calculated values
                "calc_total_value": calculated.get("calcttlvalue", ""),
                "calc_land_value": calculated.get("calclandvalue", ""),
                "calc_improvement_value": calculated.get("calcimprvalue", ""),

                # Tax
                "tax_amount": tax.get("taxamt", ""),
                "tax_year": tax.get("taxyear", ""),
                "tax_per_sqft": tax.get("taxpersizeunit", ""),
            }

            # ── Owner / Mailing Address ──
            owner = assessment.get("owner", {})
            owner1 = owner.get("owner1", {})
            mailing = prop.get("address", {})  # Assessment address may be mailing addr

            result["owner_info"] = {
                "owner_name": (
                    f"{owner1.get('firstNameAndMi', '')} {owner1.get('lastName', '')}".strip()
                    if owner1 else ""
                ),
                "owner_name2": (
                    f"{owner.get('owner2', {}).get('firstNameAndMi', '')} {owner.get('owner2', {}).get('lastName', '')}".strip()
                    if owner.get("owner2") else ""
                ),
                "owner_type": owner1.get("type", ""),
                "mailing_address": owner.get("mailingAddressOneLine", ""),
                "mailing_line1": owner.get("mailaddressline1", ""),
                "mailing_line2": owner.get("mailaddressline2", ""),
                "mailing_city": owner.get("mailaddressline3", "").split(",")[0].strip() if owner.get("mailaddressline3") else "",
                "mailing_state": owner.get("mailaddressline3", "").split(",")[-1].strip().split(" ")[0] if owner.get("mailaddressline3") else "",
                "mailing_zip": owner.get("mailaddressline3", "").split()[-1] if owner.get("mailaddressline3") else "",
                "absentee_owner": prop.get("summary", {}).get("absenteeInd", ""),
            }

            # ── Lien / Mortgage Records (from assessment response) ──
            if mortgage:
                for key in ["firstConcurrent", "secondConcurrent", "thirdConcurrent"]:
                    lien = mortgage.get(key, {})
                    if lien and (lien.get("amount") or lien.get("companyName")):
                        result["lien_records"].append({
                            "type": key,
                            "amount": lien.get("amount", ""),
                            "lender": lien.get("companyName", ""),
                            "date": lien.get("date", ""),
                            "interest_rate": lien.get("interestRate", ""),
                            "interest_rate_type": lien.get("interestRateType", ""),
                            "loan_type": lien.get("loanType", ""),
                            "term": lien.get("term", ""),
                            "due_date": lien.get("dueDate", ""),
                        })

            # Store raw for anything we missed
            result["raw_assessment"] = prop

    # ── 3. Sale History — capture ALL data ──
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
                        "recording_date": sale.get("saleRecDate", ""),
                        "document_number": sale.get("saleDocNum", ""),
                        "disclosure_type": sale.get("saleDisclosureType", ""),
                        "deed_type": sale.get("deedType", ""),
                        "price_per_sqft": prop.get("calculations", {}).get("pricepersizeunit", ""),
                        "price_per_bed": prop.get("calculations", {}).get("priceperbed", ""),
                    })

    return result
