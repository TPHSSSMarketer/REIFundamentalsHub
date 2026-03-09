"""AI-powered contact lookup for bank negotiation recipients.

Uses NVIDIA AI-Q (best for research tasks) via the central ai_service layer.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings
from rei.services.ai_service import ai_complete

logger = logging.getLogger(__name__)

# ── Recipient types for bank negotiation pipeline ─────────────────────────

RECIPIENT_TYPES = {
    "ceo": {
        "title": "Chief Executive Officer / Chairman",
        "search_hint": (
            "Look for the CEO, Chairman, or President of the company. "
            "Check the company's investor relations page, SEC filings, "
            "and corporate leadership page for the current executive."
        ),
    },
    "general_counsel": {
        "title": "General Counsel / Chief Legal Officer",
        "search_hint": (
            "Look for the General Counsel, Chief Legal Officer, Senior Vice President "
            "of Legal, or head of the legal department. Check SEC filings (DEF 14A proxy "
            "statements), the company's leadership page, and LinkedIn."
        ),
    },
    "registered_agent": {
        "title": "Registered Agent (Service of Process)",
        "search_hint": (
            "Look up the registered agent through SEC EDGAR filings (search for the "
            "company's 10-K or annual report which lists the registered agent). Also "
            "check the Secretary of State business entity database for the state where "
            "the company is incorporated (usually Delaware for large banks)."
        ),
    },
    "respa_address": {
        "title": "RESPA Designated Address (QWR / Loss Mitigation)",
        "search_hint": (
            "Look for the bank's designated address for Qualified Written Requests (QWR), "
            "Notices of Error, and loss mitigation correspondence under RESPA/Regulation X. "
            "This is typically found on the bank's website under 'Mortgage Help', 'Loss "
            "Mitigation', or 'Customer Service' sections, or on monthly mortgage statements. "
            "It may be a specific P.O. Box or department address different from headquarters."
        ),
    },
}

# Tax-specific recipient types — only used for county_tax service type cases
TAX_RECIPIENT_TYPES = {
    "tax_local": {
        "title": "Local Tax Collector (Town / City / Municipality)",
        "search_hint": (
            "Find the local tax collecting office for the property. IMPORTANT: Do NOT rely "
            "solely on the mailing city or zip code — determine the actual town/municipality "
            "the property is in. For example, Northport, NY 11731 is in the Town of Huntington, "
            "while Fort Salonga, NY 11768 (nearby, overlapping zip codes) is in the Town of "
            "Smithtown. Use the full street address to determine jurisdiction.\n\n"
            "Look for: Town Tax Receiver, City Tax Collector, Town Comptroller, Municipal Tax "
            "Department, or any variation. Check the town/city government website for the tax "
            "office address, phone, and hours. In many NY counties (like Suffolk County), "
            "property taxes are collected by the Town first."
        ),
    },
    "tax_county": {
        "title": "County Tax Office (Comptroller / Treasurer / Assessor)",
        "search_hint": (
            "Find the county-level tax authority for the property. Determine which county the "
            "property is in from the full address. Look for: County Comptroller, County "
            "Treasurer, County Tax Collector, County Tax Assessor's Office, or County Real "
            "Property Tax Services.\n\n"
            "Check the county government website. The county tax office handles things like "
            "tax lien sales, delinquent tax collection, and property tax assessment. Provide "
            "the main mailing address for tax payments or correspondence."
        ),
    },
}


# ── Research functions ────────────────────────────────────────────────────


async def research_bank_contacts(
    bank_name: str,
    state: str,
    negotiation_id: str,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
    property_address: str = "",
    service_type: str = "bank",
) -> list[dict]:
    """Research recipient contact info for a negotiation case.

    For bank cases: researches 4 bank-related contacts (CEO, GC, RA, RESPA).
    For county_tax cases: researches 2 tax authority contacts only.
    """
    import asyncio

    # Choose which recipients to research based on service type
    if service_type == "county_tax":
        types_to_research: dict = dict(TAX_RECIPIENT_TYPES)
        logger.info("Tax deal — researching tax authority contacts only")
    else:
        types_to_research = dict(RECIPIENT_TYPES)
        logger.info("Bank deal — researching bank contacts only")

    results: list[dict] = []

    for i, (recipient_type, config) in enumerate(types_to_research.items()):
        # Small delay between API calls to avoid rate limiting
        if i > 0:
            await asyncio.sleep(2)

        try:
            result = await _research_one_recipient(
                bank_name=bank_name,
                state=state,
                recipient_type=recipient_type,
                config=config,
                user_id=user_id,
                db=db,
                settings=settings,
                property_address=property_address,
            )
        except Exception as exc:
            logger.error("Research call failed for %s: %s", recipient_type, exc)
            result = _empty_result()
            result["recipient_type"] = recipient_type
            result["_raw_preview"] = f"EXCEPTION: {str(exc)[:150]}"
            result["_provider"] = "error"
            result["_model"] = "error"
            result["_tokens"] = 0

        results.append(result)

    return results


async def research_bank_contacts_agent(
    bank_name: str,
    state: str,
    negotiation_id: str,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
    property_address: str = "",
    service_type: str = "bank",
    on_step=None,
) -> list[dict]:
    """Research recipient contact info using the agentic tool-calling loop.

    This is the agent-powered alternative to research_bank_contacts().
    Instead of single-shot AI calls, each recipient research runs through
    an agent loop where Kimi K2.5 uses tools to search, verify, and
    cross-reference information before returning results.

    Same return format as research_bank_contacts() for drop-in compatibility.
    """
    from rei.services.research_agent import research_recipient_with_agent

    # Resolve NVIDIA API key
    nvidia_key = ""
    try:
        from rei.services.credentials_service import get_provider_credentials
        nv_creds = await get_provider_credentials(db, "nvidia")
        if nv_creds and nv_creds.get("nvidia_api_key"):
            nvidia_key = nv_creds["nvidia_api_key"]
    except Exception as exc:
        logger.warning("Failed to get NVIDIA credentials: %s", exc)

    if not nvidia_key:
        logger.error("No NVIDIA API key available for agent research")
        # Fall back to single-shot research
        return await research_bank_contacts(
            bank_name=bank_name,
            state=state,
            negotiation_id=negotiation_id,
            user_id=user_id,
            db=db,
            settings=settings,
            property_address=property_address,
            service_type=service_type,
        )

    # Choose which recipients to research based on service type
    if service_type == "county_tax":
        types_to_research: dict = dict(TAX_RECIPIENT_TYPES)
        logger.info("Agent research: Tax deal — researching tax authority contacts")
    else:
        types_to_research = dict(RECIPIENT_TYPES)
        logger.info("Agent research: Bank deal — researching bank contacts")

    results: list[dict] = []

    for i, (recipient_type, config) in enumerate(types_to_research.items()):
        # Small delay between agents to stay within rate limits
        if i > 0:
            await asyncio.sleep(3)

        logger.info(
            "=== Agent research for %s (%d/%d) ===",
            recipient_type, i + 1, len(types_to_research),
        )

        try:
            result = await research_recipient_with_agent(
                bank_name=bank_name,
                state=state,
                recipient_type=recipient_type,
                config=config,
                api_key=nvidia_key,
                property_address=property_address,
                on_step=on_step,
            )

            agent_turns = result.get("_agent_turns", 0)
            agent_tools = result.get("_agent_tools", [])
            tokens = result.get("_tokens", 0)
            logger.info(
                "Agent research for %s completed: turns=%d, tools=%s, tokens=%d",
                recipient_type, agent_turns, agent_tools, tokens,
            )
        except Exception as exc:
            logger.error("Agent research failed for %s: %s", recipient_type, exc)
            result = _empty_result()
            result["recipient_type"] = recipient_type
            result["_raw_preview"] = f"AGENT_EXCEPTION: {str(exc)[:150]}"
            result["_provider"] = "nvidia_kimi_agent"
            result["_model"] = "moonshotai/kimi-k2.5"
            result["_tokens"] = 0

        results.append(result)

    return results


async def research_single_recipient(
    bank_name: str,
    state: str,
    recipient_type: str,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
    property_address: str = "",
) -> dict:
    """Research a single recipient. Used for manual refresh of one contact."""
    # Check both standard and tax recipient types
    all_types = {**RECIPIENT_TYPES, **TAX_RECIPIENT_TYPES}
    config = all_types.get(recipient_type)
    if not config:
        return {
            "recipient_type": recipient_type,
            "error": f"Unknown recipient type: {recipient_type}",
        }

    return await _research_one_recipient(
        bank_name=bank_name,
        state=state,
        recipient_type=recipient_type,
        config=config,
        user_id=user_id,
        db=db,
        settings=settings,
        property_address=property_address,
    )


async def _research_one_recipient(
    bank_name: str,
    state: str,
    recipient_type: str,
    config: dict,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
    property_address: str = "",
) -> dict:
    """Internal helper — research one recipient type via AI."""
    title = config["title"]
    search_hint = config.get("search_hint", "")

    state_ctx = f" The property is in {state}." if state else ""
    addr_ctx = f"\nProperty address: {property_address}" if property_address else ""

    # For tax-related lookups, focus on the property location instead of bank
    is_tax_type = recipient_type.startswith("tax_")

    if is_tax_type:
        prompt = (
            f"You are a real estate paralegal assistant. Research the following "
            f"tax authority contact information for a property.{state_ctx}{addr_ctx}\n\n"
            f"Recipient: {title}\n\n"
            f"Research guidance: {search_hint}\n\n"
        )
    else:
        prompt = (
            f"You are a real estate paralegal assistant. Research the following "
            f"contact information for {bank_name} (mortgage servicer/bank).{state_ctx}{addr_ctx}\n\n"
            f"Recipient: {title}\n\n"
            f"Research guidance: {search_hint}\n\n"
        )

    prompt += (
        "Return your findings as a single JSON object with these exact keys:\n"
        "```json\n"
        "{\n"
        '  "name": "Full name or department name",\n'
        '  "title": "Exact title or role",\n'
        '  "mailing_address": "Street address",\n'
        '  "mailing_city": "City",\n'
        '  "mailing_state": "2-letter state code",\n'
        '  "mailing_zip": "ZIP code",\n'
        '  "phone": "Phone number with area code",\n'
        '  "fax": "Fax number or null",\n'
        '  "email": "Email address or null",\n'
        '  "confidence": "high or medium or low",\n'
        '  "sources": ["Source 1 description", "Source 2 description"]\n'
        "}\n"
        "```\n\n"
        "Rules:\n"
        "- Use null for any field you cannot determine.\n"
        "- Do NOT include any text before or after the JSON.\n"
        "- Do NOT wrap in markdown code fences.\n"
        "- Return ONLY the raw JSON object, nothing else."
    )

    messages = [{"role": "user", "content": prompt}]

    # Try primary provider (nvidia_kimi for research), then fallback to Anthropic
    ai_result = await ai_complete(
        messages=messages,
        user_id=user_id,
        db=db,
        settings=settings,
        task_type="research",
        max_tokens=2000,
        temperature=0.2,
    )

    raw_content = ai_result.get("content", "") or ""
    provider_used = ai_result.get("provider", "unknown")
    model_used = ai_result.get("model", "unknown")
    tokens_used = ai_result.get("tokens_used", 0)

    # Detect if the AI returned an error or empty/unparseable response
    is_error = (
        raw_content.startswith("No AI provider")
        or raw_content.startswith("AI provider error")
        or tokens_used == 0
        or not raw_content.strip()          # empty response
        or "{" not in raw_content           # no JSON at all
    )

    # FALLBACK: If primary provider failed or returned garbage, retry with Anthropic
    if is_error:
        logger.warning(
            "Primary AI failed for %s [%s/%s]: %s — trying Anthropic fallback",
            recipient_type, provider_used, model_used, raw_content[:200],
        )
        try:
            ai_result = await ai_complete(
                messages=messages,
                user_id=user_id,
                db=db,
                settings=settings,
                task_type="general",  # routes to Anthropic Claude Sonnet
                max_tokens=2000,
                temperature=0.2,
            )
            raw_content = ai_result.get("content", "") or ""
            provider_used = ai_result.get("provider", "unknown")
            model_used = ai_result.get("model", "unknown")
            tokens_used = ai_result.get("tokens_used", 0)

            is_error = (
                raw_content.startswith("No AI provider")
                or raw_content.startswith("AI provider error")
                or tokens_used == 0
                or not raw_content.strip()
                or "{" not in raw_content
            )

            if not is_error:
                logger.info(
                    "Anthropic fallback SUCCEEDED for %s [%s/%s]: tokens=%d",
                    recipient_type, provider_used, model_used, tokens_used,
                )
        except Exception as fallback_err:
            logger.error("Anthropic fallback also failed for %s: %s", recipient_type, fallback_err)

    logger.info(
        "AI research for %s [%s/%s]: tokens=%d, is_error=%s, preview=%s",
        recipient_type, provider_used, model_used,
        tokens_used, is_error, raw_content[:300] if raw_content else "(empty)",
    )

    if is_error:
        logger.error(
            "AI research FAILED for %s (all providers): provider=%s, model=%s, response=%s",
            recipient_type, provider_used, model_used, raw_content[:500],
        )

    parsed = _parse_json_response(raw_content)
    parsed["recipient_type"] = recipient_type

    # Attach debug metadata so callers can see what the AI actually returned
    parsed["_raw_preview"] = raw_content[:200] if raw_content else "(empty)"
    parsed["_provider"] = provider_used
    parsed["_model"] = model_used
    parsed["_tokens"] = tokens_used

    return parsed


def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from an AI response string.

    Handles common AI response quirks:
    - Direct JSON
    - JSON wrapped in markdown code fences (```json ... ```)
    - JSON buried in explanatory text
    - Thinking tags (<think>...</think>) before JSON
    """
    import re

    if not text or not text.strip():
        logger.warning("Empty AI response — cannot parse")
        return _empty_result()

    # Strip thinking tags (e.g., <think>...</think>) that some models prepend
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Try direct parse first
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        pass

    # Try to extract JSON from markdown code fence (```json ... ``` or ``` ... ```)
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except (json.JSONDecodeError, TypeError):
            pass

    # Try to find JSON object in the response (first { to last })
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except (json.JSONDecodeError, TypeError):
            pass

    logger.warning("Could not parse JSON from AI response (len=%d): %s", len(text), text[:500])
    return _empty_result()


def _empty_result() -> dict:
    """Return an empty recipient result with parse_error flag."""
    return {
        "name": None,
        "title": None,
        "mailing_address": None,
        "mailing_city": None,
        "mailing_state": None,
        "mailing_zip": None,
        "phone": None,
        "fax": None,
        "email": None,
        "confidence": "low",
        "sources": [],
        "parse_error": True,
    }


# ── Display helper ────────────────────────────────────────────────────────


def format_recipient_for_display(recipient) -> dict:
    """Return safe display version of a NegotiationRecipient model instance."""
    # Build a combined address string for easy display
    address_parts = filter(None, [
        recipient.mailing_address,
        recipient.mailing_city,
        ((recipient.mailing_state or "") + " " + (recipient.mailing_zip or "")).strip() or None,
    ])
    combined_address = ", ".join(address_parts) or None

    return {
        "id": recipient.id,
        "recipient_type": recipient.recipient_type,
        "name": recipient.name,
        "title": recipient.title,
        "address": combined_address,
        "mailing_address": recipient.mailing_address,
        "mailing_city": recipient.mailing_city,
        "mailing_state": recipient.mailing_state,
        "mailing_zip": recipient.mailing_zip,
        "phone": recipient.phone,
        "fax": recipient.fax,
        "email": recipient.email,
        "confidence": recipient.confidence,
        "sources": json.loads(recipient.sources_json or "[]"),
    }
