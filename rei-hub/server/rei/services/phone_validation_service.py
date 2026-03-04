"""NumVerify Phone Validation API Service — Phone number validation and lookup.

Free tier: 100 validations/month. Sign up at numverify.com.

Docs: https://numverify.com/documentation
"""

from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from rei.config import get_settings
from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)

# Note: Free tier uses HTTP only (no HTTPS)
NUMVERIFY_BASE = "http://apilayer.net/api/validate"

# ── In-memory cache (24 hour TTL) ──
_phone_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 86400


async def _get_api_key(db=None) -> str:
    """Resolve NumVerify API key from config or credentials DB."""
    settings = get_settings()
    key = settings.numverify_api_key
    if key:
        return key
    if db:
        creds = await get_provider_credentials(db, "numverify")
        if creds:
            return creds.get("numverify_api_key", "")
    return ""


async def validate_phone(
    phone: str,
    country_code: str = "US",
    db=None,
) -> Optional[dict]:
    """Validate a phone number using the NumVerify API.

    Args:
        phone: The phone number to validate (any format).
        country_code: ISO 2-letter country code (default US).

    Returns:
        {
            "phone": str,              # E.164 formatted number
            "is_valid": bool,
            "phone_type": str | None,  # "mobile", "landline", "voip", "toll_free", etc.
            "carrier": str | None,
            "country_code": str | None,
            "country_name": str | None,
            "location": str | None,    # city/region if available
            "source": str,
        }
        or None if the API call fails.
    """
    if not phone or not phone.strip():
        return None

    # Normalize phone — strip common formatting characters
    clean_phone = phone.strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "").replace(".", "")

    # Check cache
    cache_key = f"{clean_phone}_{country_code}"
    if cache_key in _phone_cache:
        data, timestamp = _phone_cache[cache_key]
        if time.time() - timestamp < _CACHE_TTL_SECONDS:
            return data

    api_key = await _get_api_key(db)
    if not api_key:
        logger.warning("NumVerify API key not configured")
        return None

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                NUMVERIFY_BASE,
                params={
                    "access_key": api_key,
                    "number": clean_phone,
                    "country_code": country_code,
                    "format": 1,
                },
            )
            if resp.status_code == 200:
                raw = resp.json()

                # Check for API error response
                if "error" in raw:
                    error = raw["error"]
                    logger.warning(
                        "NumVerify API error %s: %s",
                        error.get("code", "?"),
                        error.get("info", "Unknown error"),
                    )
                    return None

                # Determine phone type from line_type
                line_type = raw.get("line_type") or None
                phone_type = _normalize_line_type(line_type)

                result = {
                    "phone": raw.get("international_format", clean_phone),
                    "is_valid": bool(raw.get("valid", False)),
                    "phone_type": phone_type,
                    "carrier": raw.get("carrier") or None,
                    "country_code": raw.get("country_code") or None,
                    "country_name": raw.get("country_name") or None,
                    "location": raw.get("location") or None,
                    "source": "NumVerify Phone Validation API",
                }
                _phone_cache[cache_key] = (result, time.time())
                return result
            else:
                logger.warning(
                    "NumVerify API error %s: %s",
                    resp.status_code,
                    resp.text[:200],
                )
    except Exception as e:
        logger.warning("NumVerify API request failed: %s", e)

    return None


def _normalize_line_type(line_type: Optional[str]) -> Optional[str]:
    """Normalize NumVerify line_type to a clean label."""
    if not line_type:
        return None
    lt = line_type.lower().strip()
    type_map = {
        "mobile": "Mobile",
        "landline": "Landline",
        "fixed_line": "Landline",
        "voip": "VoIP",
        "toll_free": "Toll-Free",
        "premium_rate": "Premium",
        "special_services": "Special",
    }
    return type_map.get(lt, line_type.title())
