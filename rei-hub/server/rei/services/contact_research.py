"""AI-powered contact lookup for bank negotiation recipients.

Uses NVIDIA AI-Q (best for research tasks) via the central ai_service layer.
"""

from __future__ import annotations

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


# ── Research functions ────────────────────────────────────────────────────


async def research_bank_contacts(
    bank_name: str,
    state: str,
    negotiation_id: str,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
) -> list[dict]:
    """Research all 4 recipient contact info for a bank/servicer.

    Returns list of 4 recipient dicts with contact details.
    Uses NVIDIA AI-Q for research via ai_service.
    """
    import asyncio

    results: list[dict] = []

    for i, (recipient_type, config) in enumerate(RECIPIENT_TYPES.items()):
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


async def research_single_recipient(
    bank_name: str,
    state: str,
    recipient_type: str,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """Research a single recipient. Used for manual refresh of one contact."""
    config = RECIPIENT_TYPES.get(recipient_type)
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
    )


async def _research_one_recipient(
    bank_name: str,
    state: str,
    recipient_type: str,
    config: dict,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """Internal helper — research one recipient type via AI."""
    title = config["title"]
    search_hint = config.get("search_hint", "")

    state_ctx = f" The property is in {state}." if state else ""

    prompt = (
        f"You are a real estate paralegal assistant. Research the following "
        f"contact information for {bank_name} (mortgage servicer/bank).{state_ctx}\n\n"
        f"Recipient: {title}\n\n"
        f"Research guidance: {search_hint}\n\n"
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

    # Detect if the AI returned an error message instead of JSON
    is_error = (
        raw_content.startswith("No AI provider")
        or raw_content.startswith("AI provider error")
        or tokens_used == 0
    )

    # FALLBACK: If primary provider failed, retry with Anthropic Claude
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
