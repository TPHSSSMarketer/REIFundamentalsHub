"""Negotiation Summary Service — MiniMax AI auto-generates sanitized user summaries.

When the admin adds an activity note (full detail with internal strategy, names,
addresses, etc.), this service runs it through MiniMax to create a sanitized
version that the user can see — showing what action was taken and the current
status without revealing confidential negotiation details.

HOW IT WORKS:
1. Admin writes admin_note with full detail
2. This service sends admin_note → MiniMax with a stored system prompt
3. MiniMax returns a professional, sanitized user_summary
4. The user_summary is saved on the NegotiationActivity record
"""

from __future__ import annotations

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ── Stored system prompt (admin doesn't need to instruct AI) ─────────

NEGOTIATION_SUMMARY_SYSTEM_PROMPT = """You are a professional assistant summarizing negotiation activity updates for a real estate investor client.

Your job is to take the admin's internal note and create a clean, professional summary the client can see.

RULES:
- Remove ALL names of individuals (bank officers, attorneys, agents, etc.)
- Remove ALL specific mailing addresses, phone numbers, fax numbers, and email addresses
- Remove ALL internal strategy, tactics, and negotiation approach details
- DO include: what type of action was taken (letter sent, phone call made, document filed, etc.)
- DO include: which party was contacted (bank/servicer, county tax office, lien holder) — but NOT specific people
- DO include: current status and next expected steps
- DO include: any dates mentioned (sent date, expected response date, etc.)
- DO include: delivery confirmation status if tracking was mentioned
- Keep it professional, concise (2-4 sentences), and reassuring
- Write in past tense for completed actions
- Use phrases like "correspondence was sent to the bank/servicer" NOT "letter sent to John Smith at Chase"

Example input: "Sent QWR letter via certified mail to Jane Doe, VP of Loss Mitigation at Chase Bank, 123 Main St, Columbus OH 43215. Tracking #9400111899223100456789. Also called their RESPA department at 800-555-1234 and spoke with Mike, who confirmed receipt of our previous correspondence."

Example output: "A Qualified Written Request was sent to the bank's loss mitigation department via certified mail, and a follow-up phone call confirmed receipt of prior correspondence. We are currently awaiting the bank's formal response, which is expected within 30 business days."
"""


async def generate_user_summary(admin_note: str, service_type: str = "bank") -> Optional[str]:
    """Generate a sanitized user-facing summary from the admin's internal note.

    Uses MiniMax via the existing ai_service routing with task_type "negotiation_summary".

    Args:
        admin_note: The full admin note with all internal details
        service_type: "bank", "county_tax", or "other_lien" — for context

    Returns:
        Sanitized summary string, or None if generation fails
    """
    try:
        from rei.services.ai_service import call_ai

        service_label = {
            "bank": "bank/mortgage servicer",
            "county_tax": "county tax office",
            "other_lien": "lien holder",
        }.get(service_type, "financial institution")

        user_prompt = (
            f"This activity is related to a {service_label} negotiation. "
            f"Summarize the following admin note for the client:\n\n{admin_note}"
        )

        result = await call_ai(
            task_type="negotiation_summary",
            system_prompt=NEGOTIATION_SUMMARY_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            max_tokens=300,
        )

        if result and result.get("content"):
            summary = result["content"].strip()
            logger.info("Generated negotiation summary (%d chars)", len(summary))
            return summary

        logger.warning("MiniMax returned empty summary")
        return None

    except Exception as e:
        logger.error("Failed to generate negotiation summary: %s", e)
        return None
