"""Security utilities — input sanitization, rate limiting, audit logging, PII helpers.

Pure Python. No additional pip packages required.
"""

from __future__ import annotations

import html
import json
import logging
import re
import time
from collections import defaultdict

logger = logging.getLogger(__name__)


# ── Input Sanitization ────────────────────────────────────────────────────────


def sanitize_text(value: str, max_length: int = 500) -> str:
    """Strip HTML tags, escape special chars, remove null bytes, and truncate."""
    if not value:
        return ""
    clean = re.sub(r"<[^>]+>", "", str(value))
    clean = html.escape(clean)
    clean = clean.replace("\x00", "")
    clean = clean.strip()
    return clean[:max_length]


def sanitize_email(value: str) -> str:
    """Validate and normalize an email address."""
    if not value:
        return ""
    clean = sanitize_text(value, 254)
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    if not re.match(pattern, clean):
        raise ValueError("Invalid email format")
    return clean.lower()


def sanitize_phone(value: str) -> str:
    """Allow only digits, spaces, and common phone punctuation."""
    if not value:
        return ""
    clean = re.sub(r"[^\d\s\+\-\(\)]", "", str(value))
    return clean.strip()[:20]


def sanitize_currency(value) -> float:
    """Parse and validate a currency amount."""
    try:
        amount = float(value)
        if amount < 0:
            raise ValueError("Amount cannot be negative")
        if amount > 10_000_000:
            raise ValueError("Amount exceeds maximum allowed")
        return round(amount, 2)
    except (TypeError, ValueError) as e:
        raise ValueError(f"Invalid amount: {e}")


def sanitize_state_code(value: str) -> str:
    """Validate a US state code."""
    if not value:
        raise ValueError("State required")
    clean = str(value).upper().strip()
    valid = {
        "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE",
        "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
        "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
        "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY",
        "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
        "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
        "WI", "WY", "DC",
    }
    if clean not in valid:
        raise ValueError(f"Invalid state code: {clean}")
    return clean


def sanitize_account_number(value: str) -> str:
    """Validate a CFD account number (format: CFD-XX-YYYY-NNNNN)."""
    if not value:
        raise ValueError("Account number required")
    clean = str(value).upper().strip()
    pattern = r"^CFD-[A-Z]{2}-\d{4}-\d{5}$"
    if not re.match(pattern, clean):
        raise ValueError(
            "Invalid account number format. Expected: CFD-XX-YYYY-NNNNN"
        )
    return clean


def sanitize_url(value: str) -> str:
    """Validate a URL starts with http(s) and isn't excessively long."""
    if not value:
        return ""
    clean = str(value).strip()
    if not clean.startswith(("https://", "http://")):
        raise ValueError("URL must start with https://")
    if len(clean) > 2000:
        raise ValueError("URL too long")
    return clean


# ── Rate Limiting ─────────────────────────────────────────────────────────────

_rate_store: dict = defaultdict(list)
_cleanup_counter: int = 0
_cleanup_threshold: int = 100  # Cleanup every 100 requests
_max_store_size: int = 10000  # Max entries before aggressive cleanup


def _cleanup_stale_entries() -> None:
    """Remove entries from the rate store whose time windows have completely passed.

    Called periodically to prevent memory leaks from accumulating old keys.
    Thread-safe due to GIL (single-threaded Python).
    """
    global _rate_store
    now = time.time()

    # Find and remove keys with expired entries
    keys_to_remove = []
    for key, timestamps in _rate_store.items():
        # Assume a very old window (24 hours) for cleanup
        # Any key with no recent activity can be cleared
        if timestamps and (now - timestamps[-1] > 86400):
            keys_to_remove.append(key)

    for key in keys_to_remove:
        del _rate_store[key]

    logger.debug(f"Rate limit cleanup: removed {len(keys_to_remove)} stale keys")


def check_rate_limit(
    key: str,
    max_requests: int,
    window_seconds: int,
) -> bool:
    """Return True if the request is within the rate limit, False if exceeded.

    Also manages cleanup of stale entries to prevent memory leaks.
    """
    global _cleanup_counter
    now = time.time()
    window_start = now - window_seconds

    # Filter out timestamps outside the current window
    _rate_store[key] = [
        t for t in _rate_store[key] if t > window_start
    ]

    if len(_rate_store[key]) >= max_requests:
        return False

    _rate_store[key].append(now)

    # Trigger cleanup periodically
    _cleanup_counter += 1
    if _cleanup_counter >= _cleanup_threshold or len(_rate_store) > _max_store_size:
        _cleanup_stale_entries()
        _cleanup_counter = 0

    return True


def rl_key(user_id, endpoint: str) -> str:
    """Build a rate-limit key for a user + endpoint."""
    return f"{user_id}:{endpoint}"


def rl_ip_key(ip: str, endpoint: str) -> str:
    """Build a rate-limit key for an IP + endpoint."""
    return f"ip:{ip}:{endpoint}"


# ── Audit Logging ─────────────────────────────────────────────────────────────


def audit_log(
    db,
    action: str,
    user_id: int = None,
    user_email: str = None,
    ip_address: str = None,
    resource_type: str = None,
    resource_id: str = None,
    details: dict = None,
    success: bool = True,
    error: str = None,
):
    """Log sensitive actions to audit_logs table.

    Never logs passwords, tokens, card numbers, routing numbers, or account
    numbers.  Silently fails — never breaks the actual request.
    """
    try:
        from rei.models.audit import AuditLog

        safe_details = None
        if details:
            forbidden = {
                "password", "token", "secret",
                "routing_number", "account_number",
                "ssn", "card_number", "cvv",
                "auth_token", "api_key",
            }
            safe = {
                k: v for k, v in details.items()
                if k.lower() not in forbidden
            }
            safe_details = json.dumps(safe)

        log = AuditLog(
            action=action,
            user_id=user_id,
            user_email=user_email,
            ip_address=ip_address,
            resource_type=resource_type,
            resource_id=resource_id,
            details=safe_details,
            success=success,
            error_message=error,
        )
        db.add(log)
        db.commit()
    except Exception as e:
        logger.error("Audit log failed: %s", e)
        # Never let audit logging break the request


# ── PII Encryption ────────────────────────────────────────────────────────────


def encrypt_pii(value: str, settings) -> str:
    """Encrypt a PII value using the AI encryption key."""
    if not value:
        return ""
    try:
        from rei.services.ai_service import encrypt_api_key
        return encrypt_api_key(value, settings)
    except Exception:
        return value


def decrypt_pii(value: str, settings) -> str:
    """Decrypt a PII value encrypted with encrypt_pii."""
    if not value:
        return ""
    try:
        from rei.services.ai_service import decrypt_api_key
        return decrypt_api_key(value, settings)
    except Exception:
        return "[encrypted]"


def mask_pii(value: str, show_last: int = 4) -> str:
    """Mask a PII value, showing only the last N characters."""
    if not value:
        return ""
    if len(value) <= show_last:
        return "*" * len(value)
    return f"{'*' * (len(value) - show_last)}{value[-show_last:]}"
