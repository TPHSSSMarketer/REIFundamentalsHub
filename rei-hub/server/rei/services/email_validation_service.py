"""Abstract Email Validation API Service — Email deliverability checking.

Free tier: 100 validations/month. Sign up at abstractapi.com.

Docs: https://docs.abstractapi.com/email-validation
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from rei.config import get_settings
from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)

ABSTRACT_EMAIL_BASE = "https://emailvalidation.abstractapi.com/v1"

# ── In-memory cache (24 hour TTL — email validity is fairly stable) ──
_email_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 86400


async def _get_api_key(db=None) -> str:
    """Resolve Abstract Email Validation API key from config or credentials DB."""
    settings = get_settings()
    key = settings.abstract_email_api_key
    if key:
        return key
    if db:
        creds = await get_provider_credentials(db, "abstract_email")
        if creds:
            return creds.get("abstract_email_api_key", "")
    return ""


async def validate_email(
    email: str,
    db=None,
) -> Optional[dict]:
    """Validate an email address using the Abstract Email Validation API.

    Returns:
        {
            "email": str,
            "is_valid": bool,
            "is_deliverable": bool | None,
            "is_free_email": bool | None,
            "is_disposable": bool | None,
            "suggestion": str | None,       # e.g. "did you mean user@gmail.com?"
            "mx_found": bool | None,
            "quality_score": float | None,   # 0.0 - 1.0
            "source": str,
        }
        or None if the API call fails.
    """
    if not email or not email.strip():
        return None

    email_lower = email.strip().lower()

    # Check cache
    if email_lower in _email_cache:
        data, timestamp = _email_cache[email_lower]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return data

    api_key = await _get_api_key(db)
    if not api_key:
        logger.warning("Abstract Email Validation API key not configured")
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                ABSTRACT_EMAIL_BASE,
                params={
                    "api_key": api_key,
                    "email": email_lower,
                },
            )
            if resp.status_code == 200:
                raw = resp.json()

                # Abstract API returns these fields:
                # email, autocorrect, deliverability, quality_score,
                # is_valid_format, is_free_email, is_disposable_email,
                # is_role_email, is_catchall_email, is_mx_found, is_smtp_valid

                deliverability = raw.get("deliverability", "UNKNOWN")
                is_deliverable = (
                    True if deliverability == "DELIVERABLE"
                    else False if deliverability == "UNDELIVERABLE"
                    else None
                )

                quality = raw.get("quality_score")
                quality_float = float(quality) if quality is not None else None

                result = {
                    "email": raw.get("email", email_lower),
                    "is_valid": bool(raw.get("is_valid_format", {}).get("value", False)),
                    "is_deliverable": is_deliverable,
                    "is_free_email": _bool_or_none(raw.get("is_free_email", {})),
                    "is_disposable": _bool_or_none(raw.get("is_disposable_email", {})),
                    "suggestion": raw.get("autocorrect") or None,
                    "mx_found": _bool_or_none(raw.get("is_mx_found", {})),
                    "quality_score": quality_float,
                    "source": "Abstract Email Validation API",
                }
                _email_cache[email_lower] = (result, time.time())
                return result
            else:
                logger.warning(
                    "Abstract Email API error %s: %s",
                    resp.status_code,
                    resp.text[:200],
                )
    except Exception as e:
        logger.warning("Abstract Email API request failed: %s", e)

    return None


def _bool_or_none(field) -> Optional[bool]:
    """Extract boolean from Abstract API nested format {value: bool, text: str}."""
    if isinstance(field, dict):
        val = field.get("value")
        if val is not None:
            return bool(val)
    if isinstance(field, bool):
        return field
    return None
