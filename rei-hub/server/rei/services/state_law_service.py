"""AI-powered state law research for real estate investing topics."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings
from rei.models.user import StateLawResearch
from rei.services.ai_service import ai_legal_research

logger = logging.getLogger(__name__)

RESEARCH_TOPICS = [
    "contract_for_deed",
    "owner_finance",
    "subject_to",
    "rent_to_own",
    "eviction_timeline",
    "foreclosure_process",
    "payment_collection_as_principal",
]

# Map topic names to StateLawResearch model fields
_TOPIC_TO_FIELD = {
    "contract_for_deed": "contract_for_deed",
    "owner_finance": "owner_finance",
    "subject_to": "subject_to",
    "rent_to_own": "rent_to_own",
    "eviction_timeline": "eviction_timeline",
    "foreclosure_process": "foreclosure_process",
    "payment_collection_as_principal": "payment_collection",
}

_NY_DEFAULTS = {
    "notice_1_days": 5,
    "notice_1_type": "5-Day Notice to Cure",
    "notice_2_days": 14,
    "notice_2_type": "14-Day Notice to Quit",
    "cure_period_days": 30,
    "filing_requirements": "File in local court",
}


def _parse_sections(content: str) -> dict[str, str]:
    """Split AI response content into per-topic sections.

    Looks for topic names (case-insensitive, underscores replaced with spaces
    or kept as-is) as section headers and captures everything until the next
    header.
    """
    sections: dict[str, str] = {}
    # Build pattern from topic names — match either underscored or spaced form
    topic_patterns = []
    for topic in RESEARCH_TOPICS:
        escaped = re.escape(topic)
        spaced = re.escape(topic.replace("_", " "))
        topic_patterns.append(f"(?P<t_{topic}>{escaped}|{spaced})")

    combined = "|".join(topic_patterns)
    # Match lines that look like headers containing a topic name
    header_re = re.compile(
        rf"(?:^|\n)[\s#*]*(?:{combined})[\s#*:]*\n",
        re.IGNORECASE,
    )

    matches = list(header_re.finditer(content))
    for i, match in enumerate(matches):
        # Determine which topic matched
        matched_topic = None
        for topic in RESEARCH_TOPICS:
            if match.group(0).lower().replace(" ", "_").find(topic) != -1:
                matched_topic = topic
                break
            # Also check spaced form
            spaced = topic.replace("_", " ")
            if spaced in match.group(0).lower():
                matched_topic = topic
                break

        if not matched_topic:
            continue

        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(content)
        sections[matched_topic] = content[start:end].strip()

    return sections


def _extract_eviction_json(text: str) -> str:
    """Try to extract or build structured eviction timeline JSON from AI text.

    If the AI response already contains a JSON block, parse and return it.
    Otherwise, attempt to extract key numbers from the plain text and build
    the structured dict, then return as a JSON string.
    """
    # Try to find an embedded JSON block
    json_match = re.search(r"\{[^{}]*\"notice_1_days\"[^{}]*\}", text, re.DOTALL)
    if json_match:
        try:
            parsed = json.loads(json_match.group(0))
            return json.dumps(parsed)
        except json.JSONDecodeError:
            pass

    # Fallback: extract numbers heuristically
    def _find_days(pattern: str, default: int) -> int:
        m = re.search(pattern, text, re.IGNORECASE)
        return int(m.group(1)) if m else default

    notice_1_days = _find_days(r"(\d+)[- ]*day[s]?\s*(?:notice\s*to\s*cure|cure)", 5)
    notice_2_days = _find_days(r"(\d+)[- ]*day[s]?\s*(?:notice\s*to\s*quit|quit)", 14)
    cure_days = _find_days(r"cure\s*period[:\s]*(\d+)", 30)

    # Try to extract notice type strings
    notice_1_type_match = re.search(
        r"(\d+-[Dd]ay\s+[Nn]otice\s+to\s+[Cc]ure)", text
    )
    notice_1_type = notice_1_type_match.group(1) if notice_1_type_match else f"{notice_1_days}-Day Notice to Cure"

    notice_2_type_match = re.search(
        r"(\d+-[Dd]ay\s+[Nn]otice\s+to\s+[Qq]uit)", text
    )
    notice_2_type = notice_2_type_match.group(1) if notice_2_type_match else f"{notice_2_days}-Day Notice to Quit"

    # Extract filing requirements
    filing_match = re.search(r"(?:fil(?:e|ing)\s*(?:requirements?|in)[:\s]*)(.+?)(?:\n|$)", text, re.IGNORECASE)
    filing_requirements = filing_match.group(1).strip() if filing_match else "File in local court"

    # Extract statute citations
    citations = re.findall(r"§\s*[\d.]+[-–\d.]*|[A-Z]{2,}\s+§\s*[\d.]+", text)

    result = {
        "notice_1_days": notice_1_days,
        "notice_1_type": notice_1_type,
        "notice_2_days": notice_2_days,
        "notice_2_type": notice_2_type,
        "cure_period_days": cure_days,
        "filing_requirements": filing_requirements,
        "state_statute_citations": citations,
    }
    return json.dumps(result)


async def research_state_laws(
    state: str,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
) -> StateLawResearch:
    """Research state laws for all loan-servicing topics.

    Returns a cached record if it was researched within the last 90 days,
    otherwise calls the AI legal research service and stores the results.
    """
    state_upper = state.upper()

    # Check for existing research
    result = await db.execute(
        select(StateLawResearch).where(StateLawResearch.state == state_upper)
    )
    existing = result.scalar_one_or_none()

    if existing:
        days_old = (datetime.utcnow() - existing.researched_at).days
        if days_old < 90:
            return existing

    # Call AI legal research
    ai_result = await ai_legal_research(
        state=state,
        topics=RESEARCH_TOPICS,
        user_id=user_id,
        db=db,
        settings=settings,
    )

    content = ai_result.get("content", "")
    provider = ai_result.get("provider", "")

    # Parse response into per-topic sections
    sections = _parse_sections(content)

    # Build field values — fall back to full content if section parsing missed a topic
    field_values: dict[str, str] = {}
    for topic, field_name in _TOPIC_TO_FIELD.items():
        field_values[field_name] = sections.get(topic, "")

    # For eviction_timeline, extract structured JSON
    eviction_text = field_values.get("eviction_timeline", "")
    if eviction_text:
        field_values["eviction_timeline"] = _extract_eviction_json(eviction_text)

    # Store citations
    citations_json = json.dumps(ai_result.get("citations", []))

    now = datetime.utcnow()

    if existing:
        existing.contract_for_deed = field_values.get("contract_for_deed", existing.contract_for_deed)
        existing.owner_finance = field_values.get("owner_finance", existing.owner_finance)
        existing.subject_to = field_values.get("subject_to", existing.subject_to)
        existing.rent_to_own = field_values.get("rent_to_own", existing.rent_to_own)
        existing.eviction_timeline = field_values.get("eviction_timeline", existing.eviction_timeline)
        existing.foreclosure_process = field_values.get("foreclosure_process", existing.foreclosure_process)
        existing.payment_collection = field_values.get("payment_collection", existing.payment_collection)
        existing.citations = citations_json
        existing.researched_at = now
        existing.researched_by_provider = provider
        existing.last_updated = now
        await db.commit()
        await db.refresh(existing)
        return existing

    record = StateLawResearch(
        state=state_upper,
        contract_for_deed=field_values.get("contract_for_deed", ""),
        owner_finance=field_values.get("owner_finance", ""),
        subject_to=field_values.get("subject_to", ""),
        rent_to_own=field_values.get("rent_to_own", ""),
        eviction_timeline=field_values.get("eviction_timeline", ""),
        foreclosure_process=field_values.get("foreclosure_process", ""),
        payment_collection=field_values.get("payment_collection", ""),
        citations=citations_json,
        researched_at=now,
        researched_by_provider=provider,
        last_updated=now,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def get_eviction_timeline(
    state: str,
    db: AsyncSession,
) -> dict:
    """Return structured eviction timeline data for a state.

    Falls back to New York defaults if no research exists or parsing fails.
    """
    result = await db.execute(
        select(StateLawResearch).where(StateLawResearch.state == state.upper())
    )
    research = result.scalar_one_or_none()

    if not research or not research.eviction_timeline:
        return dict(_NY_DEFAULTS)

    try:
        parsed = json.loads(research.eviction_timeline)
        return {
            "notice_1_days": parsed.get("notice_1_days", _NY_DEFAULTS["notice_1_days"]),
            "notice_1_type": parsed.get("notice_1_type", _NY_DEFAULTS["notice_1_type"]),
            "notice_2_days": parsed.get("notice_2_days", _NY_DEFAULTS["notice_2_days"]),
            "notice_2_type": parsed.get("notice_2_type", _NY_DEFAULTS["notice_2_type"]),
            "cure_period_days": parsed.get("cure_period_days", _NY_DEFAULTS["cure_period_days"]),
            "filing_requirements": parsed.get("filing_requirements", _NY_DEFAULTS["filing_requirements"]),
        }
    except (json.JSONDecodeError, TypeError):
        return dict(_NY_DEFAULTS)
