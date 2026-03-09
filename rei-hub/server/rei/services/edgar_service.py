"""SEC EDGAR API integration for looking up corporate officers and filings.

Free public API — no key required, but requires User-Agent header per SEC policy.
Docs: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
"""

from __future__ import annotations

import logging
import re
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

# SEC requires a User-Agent with contact info
SEC_USER_AGENT = "REIFundamentalsHub/1.0 (chris@macartneyservices.com)"
SEC_HEADERS = {"User-Agent": SEC_USER_AGENT, "Accept": "application/json"}

# Rate limiting — SEC allows 10 req/sec, we'll be conservative
SEC_TIMEOUT = 15.0


async def search_company(company_name: str) -> list[dict]:
    """Search EDGAR for a company by name.

    Returns list of matching companies with CIK, name, ticker, etc.
    Uses the EDGAR company search endpoint.
    """
    # Use the company tickers JSON endpoint for fast lookup
    # But for search, use the EFTS endpoint
    url = "https://efts.sec.gov/LATEST/search-index"
    params = {
        "q": f'"{company_name}"',
        "dateRange": "custom",
        "forms": "10-K,10-Q,DEF 14A",
        "from": 0,
        "size": 5,
    }

    try:
        async with httpx.AsyncClient(timeout=SEC_TIMEOUT, headers=SEC_HEADERS) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("EDGAR company search failed for %r: %s", company_name, exc)
        return []

    hits = data.get("hits", {}).get("hits", [])
    results = []
    seen_ciks = set()

    for hit in hits:
        source = hit.get("_source", {})
        cik = str(source.get("entity_id", ""))
        if cik in seen_ciks:
            continue
        seen_ciks.add(cik)

        results.append({
            "cik": cik,
            "name": source.get("display_names", [company_name])[0] if source.get("display_names") else source.get("entity_name", company_name),
            "form_type": source.get("form_type", ""),
            "filing_date": source.get("file_date", ""),
            "source": "SEC EDGAR",
        })

    logger.info("EDGAR search for %r returned %d unique companies", company_name, len(results))
    return results


async def get_company_info(cik: str) -> Optional[dict]:
    """Get detailed company info from EDGAR submissions endpoint.

    This returns the company's official filings metadata including:
    - Company name, CIK, SIC code
    - State of incorporation
    - Business address and mailing address
    - Phone number
    - Recent filings list
    """
    # Pad CIK to 10 digits
    cik_padded = cik.zfill(10)
    url = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"

    try:
        async with httpx.AsyncClient(timeout=SEC_TIMEOUT, headers=SEC_HEADERS) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("EDGAR company info failed for CIK %s: %s", cik, exc)
        return None

    # Extract addresses
    biz_addr = data.get("addresses", {}).get("business", {})
    mail_addr = data.get("addresses", {}).get("mailing", {})

    # Extract recent filings for officer info
    recent_filings = data.get("filings", {}).get("recent", {})

    result = {
        "cik": data.get("cik", cik),
        "name": data.get("name", ""),
        "sic": data.get("sic", ""),
        "sic_description": data.get("sicDescription", ""),
        "state_of_incorporation": data.get("stateOfIncorporation", ""),
        "fiscal_year_end": data.get("fiscalYearEnd", ""),
        "business_address": {
            "street1": biz_addr.get("street1", ""),
            "street2": biz_addr.get("street2", ""),
            "city": biz_addr.get("city", ""),
            "state": biz_addr.get("stateOrCountry", ""),
            "zip": biz_addr.get("zipCode", ""),
            "phone": biz_addr.get("phone", ""),
        },
        "mailing_address": {
            "street1": mail_addr.get("street1", ""),
            "street2": mail_addr.get("street2", ""),
            "city": mail_addr.get("city", ""),
            "state": mail_addr.get("stateOrCountry", ""),
            "zip": mail_addr.get("zipCode", ""),
        },
        "tickers": data.get("tickers", []),
        "exchanges": data.get("exchanges", []),
        "source": "SEC EDGAR Submissions",
    }

    logger.info("EDGAR company info for CIK %s: %s", cik, result["name"])
    return result


async def search_officers_from_proxy(company_name: str) -> list[dict]:
    """Search for DEF 14A (proxy statement) filings to find corporate officers.

    Proxy statements list executive officers and directors.
    We search the full text for officer titles.
    """
    url = "https://efts.sec.gov/LATEST/search-index"
    params = {
        "q": f'"{company_name}" AND ("Chief Executive Officer" OR "General Counsel" OR "Chief Legal Officer" OR "Registered Agent")',
        "forms": "DEF 14A,10-K",
        "from": 0,
        "size": 3,
    }

    try:
        async with httpx.AsyncClient(timeout=SEC_TIMEOUT, headers=SEC_HEADERS) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("EDGAR proxy search failed for %r: %s", company_name, exc)
        return []

    hits = data.get("hits", {}).get("hits", [])
    results = []

    for hit in hits:
        source = hit.get("_source", {})
        results.append({
            "cik": str(source.get("entity_id", "")),
            "name": source.get("display_names", [company_name])[0] if source.get("display_names") else source.get("entity_name", ""),
            "form_type": source.get("form_type", ""),
            "filing_date": source.get("file_date", ""),
            "description": source.get("display_description", ""),
            "source": "SEC EDGAR Proxy/10-K",
        })

    logger.info("EDGAR proxy search for %r returned %d filings", company_name, len(results))
    return results


async def lookup_bank_full(bank_name: str) -> Optional[dict]:
    """Full lookup pipeline: search for company, then get detailed info.

    Combines search + company info into a single call.
    Returns the most relevant match with full details.
    """
    # Step 1: Search for the company
    companies = await search_company(bank_name)
    if not companies:
        logger.info("No EDGAR results for %r", bank_name)
        return None

    # Step 2: Get detailed info for the first match
    cik = companies[0]["cik"]
    info = await get_company_info(cik)
    if not info:
        return None

    return info


def format_edgar_context(company_info: Optional[dict]) -> str:
    """Format EDGAR data into a text context block for the AI prompt."""
    if not company_info:
        return ""

    lines = ["=== SEC EDGAR Filing Data (verified government source) ==="]
    lines.append(f"Company: {company_info['name']}")
    lines.append(f"CIK: {company_info['cik']}")

    if company_info.get("state_of_incorporation"):
        lines.append(f"State of Incorporation: {company_info['state_of_incorporation']}")

    if company_info.get("tickers"):
        lines.append(f"Ticker(s): {', '.join(company_info['tickers'])}")

    biz = company_info.get("business_address", {})
    if biz.get("street1"):
        addr_parts = [biz["street1"]]
        if biz.get("street2"):
            addr_parts.append(biz["street2"])
        addr_parts.append(f"{biz.get('city', '')}, {biz.get('state', '')} {biz.get('zip', '')}")
        lines.append(f"Business Address: {', '.join(addr_parts)}")

    if biz.get("phone"):
        lines.append(f"Phone: {biz['phone']}")

    mail = company_info.get("mailing_address", {})
    if mail.get("street1"):
        mail_parts = [mail["street1"]]
        if mail.get("street2"):
            mail_parts.append(mail["street2"])
        mail_parts.append(f"{mail.get('city', '')}, {mail.get('state', '')} {mail.get('zip', '')}")
        lines.append(f"Mailing Address: {', '.join(mail_parts)}")

    return "\n".join(lines)
