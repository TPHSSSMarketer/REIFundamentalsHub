"""Real-time mid-call data extraction service.

During an AI voice call, this service monitors the transcript as it builds
and extracts key data in real-time:
1. Detects when a caller mentions their name → updates CRM contact
2. Detects when a caller mentions a property address → triggers ATTOM lookup
3. Feeds property data back to the AI agent so it can reference it naturally

This runs as a background task during the call — the AI never pauses or
waits for it. The data just appears in the agent's context within seconds.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional

from rei.config import Settings
from rei.services.ai_service import ai_complete
from rei.services.property_data import (
    format_property_for_agent,
    lookup_property,
    lookup_property_avm,
)

logger = logging.getLogger(__name__)


# ── Real-time entity extraction ─────────────────────────────────────────

async def extract_entities_from_utterance(
    utterance: str,
    conversation_context: list[dict[str, str]],
    settings: Settings,
) -> dict[str, Any]:
    """
    Quickly extract entities (name, address, email, phone) from a single
    caller utterance during a live call.

    This runs on each new caller message. Uses a fast, lightweight prompt
    to minimize latency — we're mid-call, speed matters.

    Args:
        utterance: The latest thing the caller said
        conversation_context: The last few messages for context
        settings: App settings with API keys

    Returns:
        {
            "name": "John Smith" or null,
            "email": "john@email.com" or null,
            "phone": "555-123-4567" or null,
            "address": "123 Elm St, Phoenix AZ 85001" or null,
            "has_address": true/false  (whether an address was detected)
        }
    """
    # Quick regex checks first (fast, no API call needed)
    result: dict[str, Any] = {
        "name": None,
        "email": None,
        "phone": None,
        "address": None,
        "has_address": False,
    }

    # Check for email
    email_match = re.search(
        r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', utterance
    )
    if email_match:
        result["email"] = email_match.group()

    # Check for phone number
    phone_match = re.search(
        r'(\+?1?\s*[-.]?\s*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4})', utterance
    )
    if phone_match:
        result["phone"] = phone_match.group().strip()

    # Check for potential address (has a number followed by a street name)
    address_pattern = re.search(
        r'\d+\s+[A-Za-z]+\s+(Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|'
        r'Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Circle|Cir)',
        utterance,
        re.IGNORECASE,
    )
    if address_pattern:
        result["has_address"] = True

    # If we detected a potential address or the utterance is long enough
    # to contain name/address info, use a quick AI extraction
    if result["has_address"] or len(utterance) > 30:
        # Build mini-context (last 3 messages only — speed matters)
        context = ""
        for msg in conversation_context[-3:]:
            role = "Agent" if msg.get("role") == "agent" else "Caller"
            context += f"{role}: {msg.get('text', '')}\n"
        context += f"Caller: {utterance}\n"

        extracted = await _quick_extract(context, settings)
        if extracted:
            if extracted.get("name"):
                result["name"] = extracted["name"]
            if extracted.get("address"):
                result["address"] = extracted["address"]
                result["has_address"] = True
            # Don't override regex matches — they're more reliable for email/phone

    return result


async def _quick_extract(
    context: str,
    settings: Settings,
) -> Optional[dict[str, str]]:
    """
    Fast AI extraction — uses a very concise prompt for minimal latency.
    We use claude-haiku for speed since this runs mid-call.
    """
    try:
        response = await ai_complete(
            prompt=f"""Extract name and address from this call snippet. Return JSON only.
If not mentioned, use null. Be concise.

{context}

{{"name": "<full name or null>", "address": "<street address with city/state or null>"}}""",
            user_id=None,
            db=None,
            settings=settings,
            provider="anthropic",
            model="claude-haiku-4-5-20251001",  # Haiku for speed
        )

        text = response.get("content", "").strip()
        # Clean markdown
        if "```" in text:
            text = text.split("```")[1].split("```")[0]
            if text.startswith("json"):
                text = text[4:]

        return json.loads(text.strip())
    except Exception:
        return None


# ── Property data lookup + context injection ────────────────────────────

async def lookup_and_format_property(
    address: str,
    settings: Settings,
) -> Optional[str]:
    """
    Look up property data from ATTOM and format it for the AI agent.

    Returns a formatted string that can be injected into the agent's
    conversation context so it can reference property details naturally.

    Returns None if the property isn't found.
    """
    prop_data = await lookup_property(address, settings)
    if not prop_data:
        return None

    # Also try to get AVM (valuation) data
    avm_data = await lookup_property_avm(address, settings)
    if avm_data and avm_data.get("estimated_value"):
        prop_data["estimated_value"] = avm_data["estimated_value"]

    return format_property_for_agent(prop_data)


# ── Process a new transcript event (called during live call) ────────────

async def process_transcript_event(
    utterance: str,
    role: str,
    conversation_context: list[dict[str, str]],
    already_extracted: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    """
    Process a new transcript event during a live call.

    Called each time the caller or agent says something. Only processes
    caller messages (we don't need to extract from our own agent's words).

    Args:
        utterance: What was just said
        role: "caller" or "agent"
        conversation_context: Full conversation so far
        already_extracted: Data we've already extracted (avoid re-extracting)
        settings: App settings

    Returns:
        {
            "new_data": {"name": "John", "address": "..."}, // only newly found data
            "property_context": "..." or null,  // formatted property data for agent
            "should_update_agent": true/false,   // whether to update agent context
        }
    """
    result: dict[str, Any] = {
        "new_data": {},
        "property_context": None,
        "should_update_agent": False,
    }

    # Only extract from caller messages
    if role != "caller":
        return result

    # Extract entities
    entities = await extract_entities_from_utterance(
        utterance, conversation_context, settings
    )

    # Check what's new (not already extracted)
    for field in ["name", "email", "phone"]:
        if entities.get(field) and not already_extracted.get(field):
            result["new_data"][field] = entities[field]

    # If we found a new address, do property lookup
    if entities.get("address") and not already_extracted.get("address"):
        result["new_data"]["address"] = entities["address"]

        # Look up property data from ATTOM
        property_context = await lookup_and_format_property(
            entities["address"], settings
        )
        if property_context:
            result["property_context"] = property_context
            result["should_update_agent"] = True

    # Signal that we have new data to inject
    if result["new_data"]:
        result["should_update_agent"] = True

    return result
