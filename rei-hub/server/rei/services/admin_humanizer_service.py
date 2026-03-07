"""AI Admin Assistant — Communication Humanizer.

Detects and rewrites AI-sounding language in SMS and email
messages before they're sent. Based on patterns from the Wikipedia
AI Cleanup project and blader/humanizer.

The goal is to make AI-drafted communications sound natural and
conversational — like a real estate investor, not a chatbot.

Usage:
    from rei.services.admin_humanizer_service import humanize_text
    message = humanize_text("I am delighted to inform you...")
    # → "I'm happy to let you know..."
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════
# AI WRITING PATTERNS — Detect and replace
# ═══════════════════════════════════════════════════════════════

# (regex_pattern, replacement, category)
AI_PATTERNS: list[tuple[str, str, str]] = [
    # ── Significance inflation ──
    (r"\bgroundbreaking\b", "useful", "inflation"),
    (r"\brevolutionary\b", "helpful", "inflation"),
    (r"\bgame-?changing\b", "useful", "inflation"),
    (r"\bcutting-?edge\b", "modern", "inflation"),
    (r"\bunparalleled\b", "strong", "inflation"),
    (r"\bseamless(?:ly)?\b", "smooth", "inflation"),
    (r"\brobust\b", "solid", "inflation"),
    (r"\bleverage\b", "use", "inflation"),
    (r"\bsynergy\b", "teamwork", "inflation"),

    # ── AI vocabulary ──
    (r"\bdelve(?:s|d)?\s+into\b", "look into", "vocabulary"),
    (r"\bI am delighted\b", "I'm happy", "vocabulary"),
    (r"\bI am pleased\b", "I'm happy", "vocabulary"),
    (r"\bI am thrilled\b", "I'm excited", "vocabulary"),
    (r"\btapestry\b", "mix", "vocabulary"),
    (r"\blandscape\b(?!\s+(?:architect|design|company))", "space", "vocabulary"),
    (r"\bparadigm\b", "approach", "vocabulary"),
    (r"\bholistic\b", "complete", "vocabulary"),
    (r"\bfacilitate\b", "help with", "vocabulary"),
    (r"\butilize\b", "use", "vocabulary"),
    (r"\bcommence\b", "start", "vocabulary"),

    # ── Filler & hedging ──
    (r"\bIt(?:'s| is) (?:important|worth) (?:to )?not(?:e|ing) that\b", "", "filler"),
    (r"\bIn today's (?:fast-paced |ever-changing )?(?:world|landscape|market)\b", "Right now", "filler"),
    (r"\bAt the end of the day\b", "Ultimately", "filler"),
    (r"\bMoving forward\b", "Going forward", "filler"),
    (r"\bIn order to\b", "To", "filler"),
    (r"\bAt this point in time\b", "Now", "filler"),
    (r"\bDue to the fact that\b", "Because", "filler"),
    (r"\bIn the near future\b", "Soon", "filler"),

    # ── Chatbot artifacts ──
    (r"\bI hope this (?:helps|information is useful|message finds you well)[.!]*\b", "", "chatbot"),
    (r"\bPlease (?:don't hesitate to|feel free to) (?:reach out|contact (?:me|us))[.!]*\b", "Let me know if you need anything.", "chatbot"),
    (r"\bI'd be happy to (?:help|assist)[.!]*\b", "", "chatbot"),
    (r"\bIs there anything else (?:I can help (?:you )?with|you'd like to know)\?*\b", "", "chatbot"),
    (r"\bThank you for (?:your patience|reaching out|your inquiry)[.!]*\b", "Thanks!", "chatbot"),
    (r"\bI understand (?:your|the) concern[.!]*\b", "", "chatbot"),

    # ── Style patterns ──
    (r"\bAdditionally,\s*", "Also, ", "style"),
    (r"\bFurthermore,\s*", "Plus, ", "style"),
    (r"\bMoreover,\s*", "Also, ", "style"),
    (r"\bNevertheless,\s*", "Still, ", "style"),
    (r"\bConsequently,\s*", "So, ", "style"),
    (r"\bSubsequently,\s*", "Then, ", "style"),

    # ── Em dash & special characters ──
    (r"\s*—\s*", " - ", "punctuation"),
    (r"\s*–\s*", " - ", "punctuation"),  # en dash too

    # ── Content marketing fluff ──
    (r"\bcomprehensive guide\b", "guide", "content"),
    (r"\bin this article,?\s*", "", "content"),
    (r"\bkey takeaways?\b", "takeaways", "content"),
    (r"\blet's dive in[.!]*\s*", "", "content"),
    (r"\bwithout further ado[,.]?\s*", "", "content"),
    (r"\bin conclusion,?\s*", "", "content"),
    (r"\bas mentioned (?:earlier|above|before),?\s*", "", "content"),
    (r"\bit's no secret that\s*", "", "content"),
    (r"\bthe bottom line is\s*", "", "content"),
    (r"\bwhether you're a (?:beginner|seasoned|experienced)\s+\w+\s+or\s+(?:a\s+)?(?:beginner|seasoned|experienced)\s+\w+,?\s*", "", "content"),
]


def humanize_text(text: str) -> str:
    """Rewrite text to sound more natural and less AI-generated.

    Applies pattern-based rewrites to remove common AI writing tells.
    Preserves the meaning while making the tone more conversational.

    Args:
        text: The AI-generated text to humanize

    Returns:
        Rewritten text with AI patterns replaced
    """
    result = text

    for pattern, replacement, _category in AI_PATTERNS:
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)

    # Clean up: remove double spaces, leading/trailing whitespace on lines
    result = re.sub(r"  +", " ", result)
    result = re.sub(r"\n\s*\n\s*\n", "\n\n", result)
    result = result.strip()

    return result


def detect_ai_patterns(text: str) -> list[dict]:
    """Detect AI-sounding patterns in text without changing it.

    Useful for showing users which parts of a message sound AI-generated
    so they can review before sending.

    Returns:
        List of dicts: [{"pattern": str, "category": str, "match": str}, ...]
    """
    detected = []

    for pattern, _replacement, category in AI_PATTERNS:
        matches = re.finditer(pattern, text, flags=re.IGNORECASE)
        for m in matches:
            detected.append({
                "pattern": pattern[:40],
                "category": category,
                "match": m.group(0),
            })

    return detected


def get_humanization_stats(original: str, humanized: str) -> dict:
    """Compare original and humanized text, return stats.

    Returns:
        {
            "original_length": int,
            "humanized_length": int,
            "patterns_fixed": int,
            "reduction_pct": float,
        }
    """
    patterns_fixed = 0
    for pattern, _replacement, _category in AI_PATTERNS:
        patterns_fixed += len(re.findall(pattern, original, flags=re.IGNORECASE))

    orig_len = len(original)
    human_len = len(humanized)

    return {
        "original_length": orig_len,
        "humanized_length": human_len,
        "patterns_fixed": patterns_fixed,
        "reduction_pct": round((1 - human_len / orig_len) * 100, 1) if orig_len > 0 else 0,
    }
