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
        "title": "Chief Executive Officer",
        "search_terms": [
            "CEO",
            "Chief Executive Officer",
            "President",
        ],
    },
    "general_counsel": {
        "title": "General Counsel",
        "search_terms": [
            "General Counsel",
            "Chief Legal Officer",
            "Office of General Counsel",
        ],
    },
    "registered_agent": {
        "title": "Registered Agent",
        "search_terms": [
            "registered agent",
            "statutory agent",
            "agent for service of process",
        ],
    },
    "respa_address": {
        "title": "RESPA Designated Address",
        "search_terms": [
            "qualified written request",
            "QWR address",
            "RESPA notice address",
            "loss mitigation address",
        ],
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
    results: list[dict] = []

    for recipient_type, config in RECIPIENT_TYPES.items():
        result = await _research_one_recipient(
            bank_name=bank_name,
            state=state,
            recipient_type=recipient_type,
            config=config,
            user_id=user_id,
            db=db,
            settings=settings,
        )
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

    state_hint = ""
    if recipient_type == "registered_agent":
        state_hint = (
            f"\nFor registered agent: search the {state} "
            "Secretary of State database."
        )
    elif recipient_type == "respa_address":
        state_hint = (
            "\nFor RESPA address: look for their designated QWR or "
            "loss mitigation address on their website or monthly "
            "mortgage statements."
        )

    prompt = (
        f"Research the following contact information for "
        f"{bank_name} (mortgage servicer/bank):\n\n"
        f"Recipient: {title}\n\n"
        "Find and return in JSON format:\n"
        "{\n"
        '  "name": "Full name or department name",\n'
        '  "title": "Exact title",\n'
        '  "mailing_address": "Street address",\n'
        '  "mailing_city": "City",\n'
        '  "mailing_state": "2-letter state",\n'
        '  "mailing_zip": "ZIP code",\n'
        '  "phone": "Phone number with area code",\n'
        '  "fax": "Fax number with area code",\n'
        '  "email": "Email address or department email",\n'
        '  "confidence": "high/medium/low",\n'
        '  "sources": ["source1", "source2"]\n'
        "}\n"
        f"{state_hint}\n\n"
        "If a field is unknown, use null.\n"
        "Return ONLY the JSON object."
    )

    messages = [{"role": "user", "content": prompt}]

    ai_result = await ai_complete(
        messages=messages,
        user_id=user_id,
        db=db,
        settings=settings,
        task_type="research",
        max_tokens=2000,
        temperature=0.2,
    )

    parsed = _parse_json_response(ai_result.get("content", ""))
    parsed["recipient_type"] = recipient_type

    return parsed


def _parse_json_response(text: str) -> dict:
    """Extract and parse JSON from an AI response string."""
    # Try direct parse first
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        pass

    # Try to find JSON object in the response
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except (json.JSONDecodeError, TypeError):
            pass

    logger.warning("Could not parse JSON from AI response: %s", text[:200])
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
    return {
        "id": recipient.id,
        "recipient_type": recipient.recipient_type,
        "name": recipient.name,
        "title": recipient.title,
        "mailing_address": recipient.mailing_address,
        "mailing_city": recipient.mailing_city,
        "mailing_state": recipient.mailing_state,
        "mailing_zip": recipient.mailing_zip,
        "phone": recipient.phone,
        "fax": recipient.fax,
        "email": recipient.email,
        "ai_researched": recipient.ai_researched,
        "ai_confidence": recipient.ai_confidence,
        "manually_verified": recipient.manually_verified,
        "ai_sources": json.loads(recipient.ai_sources or "[]"),
    }
