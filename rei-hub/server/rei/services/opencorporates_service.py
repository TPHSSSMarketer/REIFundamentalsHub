"""OpenCorporates API integration for looking up company officers and registered agents.

Free tier: 500 API calls/month, no key required.
Docs: https://api.opencorporates.com/documentation/API-Reference
"""

from __future__ import annotations

import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

OC_BASE = "https://api.opencorporates.com/v0.4"
OC_TIMEOUT = 15.0


def _state_to_jurisdiction(state: str) -> str:
    """Convert a 2-letter US state code to OpenCorporates jurisdiction format.

    E.g. 'NY' -> 'us_ny', 'DE' -> 'us_de'
    """
    if not state or len(state) != 2:
        return ""
    return f"us_{state.lower()}"


async def search_company(company_name: str, jurisdiction: str = "") -> list[dict]:
    """Search for a company by name.

    Args:
        company_name: Company name to search for
        jurisdiction: Optional jurisdiction code (e.g. 'us_de' for Delaware)

    Returns list of matching companies with basic info.
    """
    params = {"q": company_name}
    if jurisdiction:
        params["jurisdiction_code"] = jurisdiction

    try:
        async with httpx.AsyncClient(timeout=OC_TIMEOUT) as client:
            resp = await client.get(f"{OC_BASE}/companies/search", params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("OpenCorporates company search failed for %r: %s", company_name, exc)
        return []

    companies_data = data.get("results", {}).get("companies", [])
    results = []

    for item in companies_data[:10]:
        company = item.get("company", {})
        ra = company.get("registered_address", {}) or {}

        results.append({
            "name": company.get("name", ""),
            "company_number": company.get("company_number", ""),
            "jurisdiction": company.get("jurisdiction_code", ""),
            "status": company.get("current_status", ""),
            "incorporation_date": company.get("incorporation_date", ""),
            "company_type": company.get("company_type", ""),
            "registered_address": {
                "street": ra.get("street_address", ""),
                "city": ra.get("locality", ""),
                "state": ra.get("region", ""),
                "zip": ra.get("postal_code", ""),
                "country": ra.get("country", ""),
            },
            "opencorporates_url": company.get("opencorporates_url", ""),
            "registry_url": company.get("registry_url", ""),
            "agent_name": company.get("agent_name", ""),
            "agent_address": company.get("agent_address", ""),
            "source": "OpenCorporates",
        })

    logger.info("OpenCorporates company search for %r: %d results", company_name, len(results))
    return results


async def search_officers(name: str, jurisdiction: str = "") -> list[dict]:
    """Search for corporate officers by name.

    Args:
        name: Officer name to search for
        jurisdiction: Optional jurisdiction code

    Returns list of matching officers with their company associations.
    """
    params = {"q": name}
    if jurisdiction:
        params["jurisdiction_code"] = jurisdiction

    try:
        async with httpx.AsyncClient(timeout=OC_TIMEOUT) as client:
            resp = await client.get(f"{OC_BASE}/officers/search", params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("OpenCorporates officer search failed for %r: %s", name, exc)
        return []

    officers_data = data.get("results", {}).get("officers", [])
    results = []

    for item in officers_data[:10]:
        officer = item.get("officer", {})
        company = officer.get("company", {}) or {}

        results.append({
            "name": officer.get("name", ""),
            "position": officer.get("position", ""),
            "start_date": officer.get("start_date", ""),
            "end_date": officer.get("end_date", ""),
            "company_name": company.get("name", ""),
            "company_number": company.get("company_number", ""),
            "jurisdiction": company.get("jurisdiction_code", ""),
            "opencorporates_url": officer.get("opencorporates_url", ""),
            "source": "OpenCorporates",
        })

    logger.info("OpenCorporates officer search for %r: %d results", name, len(results))
    return results


async def get_company_officers(jurisdiction: str, company_number: str) -> list[dict]:
    """Get all officers for a specific company.

    Args:
        jurisdiction: Jurisdiction code (e.g. 'us_de')
        company_number: Company registration number

    Returns list of officers with roles.
    """
    url = f"{OC_BASE}/companies/{jurisdiction}/{company_number}"

    try:
        async with httpx.AsyncClient(timeout=OC_TIMEOUT) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("OpenCorporates company detail failed for %s/%s: %s",
                     jurisdiction, company_number, exc)
        return []

    company = data.get("results", {}).get("company", {})
    officers_data = company.get("officers", [])

    results = []
    for item in officers_data:
        officer = item.get("officer", {})
        results.append({
            "name": officer.get("name", ""),
            "position": officer.get("position", ""),
            "start_date": officer.get("start_date", ""),
            "end_date": officer.get("end_date", ""),
            "source": "OpenCorporates",
        })

    # Also grab registered agent info if available
    agent_name = company.get("agent_name", "")
    agent_address = company.get("agent_address", "")
    registered_address = company.get("registered_address", {}) or {}

    return {
        "officers": results,
        "agent_name": agent_name,
        "agent_address": agent_address,
        "registered_address": {
            "street": registered_address.get("street_address", ""),
            "city": registered_address.get("locality", ""),
            "state": registered_address.get("region", ""),
            "zip": registered_address.get("postal_code", ""),
        },
        "company_name": company.get("name", ""),
        "status": company.get("current_status", ""),
        "incorporation_date": company.get("incorporation_date", ""),
    }


async def lookup_company_full(company_name: str, state: str = "") -> dict:
    """Full lookup: search for company, then get officers and registered agent.

    Combines search + detail into a single call.
    Tries Delaware first (most large companies incorporate there),
    then the provided state.
    """
    jurisdictions_to_try = []

    # Most large banks are incorporated in Delaware
    jurisdictions_to_try.append("us_de")

    if state and len(state) == 2:
        jur = _state_to_jurisdiction(state)
        if jur != "us_de":
            jurisdictions_to_try.append(jur)

    # Also try without jurisdiction restriction
    jurisdictions_to_try.append("")

    for jur in jurisdictions_to_try:
        companies = await search_company(company_name, jurisdiction=jur)
        if companies:
            # Found a match — try to get details
            best = companies[0]
            if best.get("jurisdiction") and best.get("company_number"):
                try:
                    detail = await get_company_officers(
                        best["jurisdiction"],
                        best["company_number"]
                    )
                    if isinstance(detail, dict):
                        detail["search_match"] = best
                        return detail
                except Exception as exc:
                    logger.warning("Failed to get company detail: %s", exc)

            # Return just the search result if detail fails
            return {"search_match": best, "officers": [], "agent_name": "", "agent_address": ""}

    return {"search_match": None, "officers": [], "agent_name": "", "agent_address": ""}


def format_opencorporates_context(data: dict) -> str:
    """Format OpenCorporates data into text context for the AI prompt."""
    if not data or not data.get("search_match"):
        return ""

    match = data["search_match"]
    lines = ["=== OpenCorporates Corporate Registry Data ==="]
    lines.append(f"Company: {match.get('name', 'Unknown')}")
    lines.append(f"Jurisdiction: {match.get('jurisdiction', 'Unknown')}")
    lines.append(f"Status: {match.get('status', 'Unknown')}")

    if match.get("incorporation_date"):
        lines.append(f"Incorporated: {match['incorporation_date']}")

    ra = match.get("registered_address", {})
    if ra and ra.get("street"):
        lines.append(f"Registered Address: {ra['street']}, {ra.get('city', '')}, {ra.get('state', '')} {ra.get('zip', '')}")

    if match.get("agent_name"):
        lines.append(f"Registered Agent: {match['agent_name']}")
    if match.get("agent_address"):
        lines.append(f"Agent Address: {match['agent_address']}")

    if data.get("agent_name"):
        lines.append(f"Registered Agent: {data['agent_name']}")
    if data.get("agent_address"):
        lines.append(f"Agent Address: {data['agent_address']}")

    officers = data.get("officers", [])
    if officers:
        lines.append(f"\nOfficers ({len(officers)} found):")
        for off in officers[:10]:
            end = f" (ended {off['end_date']})" if off.get("end_date") else ""
            lines.append(f"  - {off['name']} — {off.get('position', 'Unknown role')}{end}")

    return "\n".join(lines)
