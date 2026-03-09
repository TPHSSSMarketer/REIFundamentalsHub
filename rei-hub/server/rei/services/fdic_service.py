"""FDIC BankFind API integration for looking up bank institution details.

Free public API — no key required.
Docs: https://banks.data.fdic.gov/bankfind-suite
"""

from __future__ import annotations

import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

FDIC_BASE = "https://banks.data.fdic.gov/api"

# Fields we want back from the institution search
INSTITUTION_FIELDS = "INSTNAME,CITY,STNAME,STALP,ZIP,ADDRESS,PHONE,WEBADDR,ACTIVE,CERT"

# Fields for location/branch search
LOCATION_FIELDS = "INSTNAME,BRANCHNAME,CITY,STNAME,STALP,ZIP,ADDRESS,MAINOFF,BRSERTYP"


async def search_institution(bank_name: str, state: str = "") -> list[dict]:
    """Search FDIC for institutions matching a bank name.

    Returns a list of matching institutions with address, phone, website, etc.
    """
    params = {
        "filters": f'INSTNAME:"{bank_name}" AND ACTIVE:1',
        "fields": INSTITUTION_FIELDS,
        "limit": 10,
        "sort_by": "INSTNAME",
        "sort_order": "ASC",
    }

    # Add state filter if provided
    if state and len(state) == 2:
        params["filters"] = f'INSTNAME:"{bank_name}" AND STALP:{state} AND ACTIVE:1'

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{FDIC_BASE}/institutions", params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("FDIC institution search failed for %r: %s", bank_name, exc)
        return []

    results = []
    for item in data.get("data", []):
        inst = item.get("data", {})
        results.append({
            "name": inst.get("INSTNAME", ""),
            "city": inst.get("CITY", ""),
            "state": inst.get("STNAME", ""),
            "state_code": inst.get("STALP", ""),
            "zip": inst.get("ZIP", ""),
            "address": inst.get("ADDRESS", ""),
            "phone": inst.get("PHONE", ""),
            "website": inst.get("WEBADDR", ""),
            "cert": inst.get("CERT", ""),
            "active": inst.get("ACTIVE", 0),
            "source": "FDIC BankFind",
        })

    logger.info("FDIC search for %r returned %d institutions", bank_name, len(results))
    return results


async def search_institution_fuzzy(bank_name: str) -> list[dict]:
    """Fuzzy/broader search - tries multiple variations of the bank name.

    Useful when exact name doesn't match (e.g. user types "Chase" but
    FDIC has "JPMORGAN CHASE BANK, NATIONAL ASSOCIATION").
    """
    # Try exact first
    results = await search_institution(bank_name)
    if results:
        return results

    # Try without common suffixes
    simplified = bank_name.upper()
    for suffix in [", N.A.", " N.A.", ", NA", " NATIONAL ASSOCIATION",
                   " BANK", " MORTGAGE", " HOME LOANS", " FINANCIAL",
                   " SERVICES", " CORP", " CORPORATION", " INC", " LLC"]:
        simplified = simplified.replace(suffix, "")
    simplified = simplified.strip()

    if simplified != bank_name.upper():
        results = await search_institution(simplified)
        if results:
            return results

    # Try wildcard search
    params = {
        "search": bank_name,
        "fields": INSTITUTION_FIELDS,
        "limit": 10,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{FDIC_BASE}/institutions", params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("FDIC fuzzy search failed for %r: %s", bank_name, exc)
        return []

    results = []
    for item in data.get("data", []):
        inst = item.get("data", {})
        results.append({
            "name": inst.get("INSTNAME", ""),
            "city": inst.get("CITY", ""),
            "state": inst.get("STNAME", ""),
            "state_code": inst.get("STALP", ""),
            "zip": inst.get("ZIP", ""),
            "address": inst.get("ADDRESS", ""),
            "phone": inst.get("PHONE", ""),
            "website": inst.get("WEBADDR", ""),
            "cert": inst.get("CERT", ""),
            "active": inst.get("ACTIVE", 0),
            "source": "FDIC BankFind",
        })

    logger.info("FDIC fuzzy search for %r returned %d institutions", bank_name, len(results))
    return results


async def get_institution_branches(cert: str, state: str = "") -> list[dict]:
    """Get branch locations for a specific institution by FDIC cert number."""
    params = {
        "filters": f"CERT:{cert}",
        "fields": LOCATION_FIELDS,
        "limit": 50,
        "sort_by": "MAINOFF",
        "sort_order": "DESC",  # Main office first
    }

    if state and len(state) == 2:
        params["filters"] = f"CERT:{cert} AND STALP:{state}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"{FDIC_BASE}/locations", params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("FDIC branch search failed for cert %s: %s", cert, exc)
        return []

    branches = []
    for item in data.get("data", []):
        loc = item.get("data", {})
        branches.append({
            "institution": loc.get("INSTNAME", ""),
            "branch_name": loc.get("BRANCHNAME", ""),
            "city": loc.get("CITY", ""),
            "state": loc.get("STNAME", ""),
            "state_code": loc.get("STALP", ""),
            "zip": loc.get("ZIP", ""),
            "address": loc.get("ADDRESS", ""),
            "is_main_office": loc.get("MAINOFF", 0) == 1,
            "source": "FDIC BankFind Locations",
        })

    logger.info("FDIC branches for cert %s: %d results", cert, len(branches))
    return branches


def format_fdic_context(institutions: list[dict]) -> str:
    """Format FDIC results into a text context block for the AI prompt.

    This is injected into the AI research prompt so the AI has real data
    to work with instead of guessing from training data.
    """
    if not institutions:
        return ""

    lines = ["=== FDIC BankFind Data (verified government source) ==="]
    for i, inst in enumerate(institutions[:3], 1):
        lines.append(f"\nInstitution #{i}:")
        lines.append(f"  Official Name: {inst['name']}")
        lines.append(f"  HQ Address: {inst['address']}, {inst['city']}, {inst['state_code']} {inst['zip']}")
        if inst.get("phone"):
            lines.append(f"  Phone: {inst['phone']}")
        if inst.get("website"):
            lines.append(f"  Website: {inst['website']}")
        if inst.get("cert"):
            lines.append(f"  FDIC Cert #: {inst['cert']}")

    return "\n".join(lines)
