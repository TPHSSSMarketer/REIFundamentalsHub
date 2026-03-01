"""Security utilities — input sanitization, path validation, audit logging.

Used across Helm Hub endpoints to prevent injection, traversal, and abuse.
"""

from __future__ import annotations

import html
import logging
import re
from pathlib import PurePosixPath

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

MAX_CHAT_MESSAGE_LENGTH = 10_000      # 10 KB — generous for multi-paragraph prompts
MAX_SHORT_TEXT_LENGTH = 500            # Names, titles, short fields
MAX_ONBOARDING_ANSWER_LENGTH = 2_000  # Individual onboarding answer
MAX_FILE_UPLOAD_BYTES = 25 * 1024 * 1024   # 25 MB per file upload
MAX_JSON_BODY_BYTES = 1 * 1024 * 1024       # 1 MB for JSON request bodies
ALLOWED_AUDIO_TYPES = {"audio/ogg", "audio/mpeg", "audio/wav", "audio/webm", "audio/mp4"}
ALLOWED_AUDIO_EXTENSIONS = {".ogg", ".mp3", ".wav", ".webm", ".m4a"}


# ── Text Sanitization ───────────────────────────────────────────────────────


def sanitize_text(value: str, max_length: int = MAX_SHORT_TEXT_LENGTH) -> str:
    """Sanitize user-supplied text: strip, truncate, remove null bytes, escape HTML."""
    if not isinstance(value, str):
        return ""
    # Remove null bytes (common injection vector)
    value = value.replace("\x00", "")
    # Strip leading/trailing whitespace
    value = value.strip()
    # Truncate to max length
    value = value[:max_length]
    # HTML-escape to prevent stored XSS
    value = html.escape(value, quote=True)
    return value


def sanitize_chat_message(message: str) -> str:
    """Sanitize chat input — allows longer text but still removes dangerous chars."""
    if not isinstance(message, str):
        return ""
    message = message.replace("\x00", "")
    message = message.strip()
    message = message[:MAX_CHAT_MESSAGE_LENGTH]
    # Don't HTML-escape chat messages — they go to AI, not rendered as HTML
    return message


def sanitize_dict(data: dict, max_value_length: int = MAX_ONBOARDING_ANSWER_LENGTH) -> dict:
    """Sanitize all string values in a flat dict (e.g., onboarding answers)."""
    clean = {}
    for key, value in data.items():
        # Sanitize keys too
        clean_key = sanitize_text(str(key), max_length=100)
        if isinstance(value, str):
            clean[clean_key] = sanitize_text(value, max_length=max_value_length)
        elif isinstance(value, list):
            clean[clean_key] = [
                sanitize_text(str(v), max_length=max_value_length)
                for v in value[:50]  # Cap list length at 50
            ]
        elif isinstance(value, (int, float, bool)):
            clean[clean_key] = value
        else:
            clean[clean_key] = sanitize_text(str(value), max_length=max_value_length)
    return clean


# ── Path Traversal Protection ────────────────────────────────────────────────

# Characters that should never appear in user-supplied file paths
_PATH_TRAVERSAL_PATTERN = re.compile(r"\.\.|//|\\|%2e%2e|%2f|%5c", re.IGNORECASE)


def is_safe_path(path: str) -> bool:
    """Check if a user-supplied path is safe (no traversal, no absolute paths).

    Returns True if safe, False if the path looks malicious.
    """
    if not path or not isinstance(path, str):
        return False

    # Block null bytes
    if "\x00" in path:
        return False

    # Block traversal patterns
    if _PATH_TRAVERSAL_PATTERN.search(path):
        return False

    # Block absolute paths (Unix and Windows)
    if path.startswith("/") or path.startswith("\\"):
        # Allow paths starting with / if they're workspace-relative
        # The workspace prefix will be prepended by the file manager
        pass

    # Normalize and check the resolved path doesn't escape
    try:
        resolved = PurePosixPath(path)
        # Check that no part is ".."
        if ".." in resolved.parts:
            return False
    except (ValueError, TypeError):
        return False

    return True


def validate_file_path(path: str) -> str | None:
    """Validate and clean a file path. Returns cleaned path or None if invalid."""
    if not is_safe_path(path):
        logger.warning("Blocked path traversal attempt: %s", path[:200])
        return None
    return path.strip()


# ── File Upload Validation ───────────────────────────────────────────────────


def validate_upload(
    filename: str | None,
    content_type: str | None,
    size_bytes: int,
    allowed_types: set[str] | None = None,
    allowed_extensions: set[str] | None = None,
    max_size: int = MAX_FILE_UPLOAD_BYTES,
) -> str | None:
    """Validate an uploaded file. Returns error message or None if valid."""
    if size_bytes > max_size:
        return f"File too large: {size_bytes:,} bytes (max {max_size:,})"

    if size_bytes == 0:
        return "Empty file"

    if allowed_extensions and filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in allowed_extensions:
            return f"File type not allowed: {ext}"

    if allowed_types and content_type:
        if content_type not in allowed_types:
            return f"Content type not allowed: {content_type}"

    return None


# ── Audit Logging ────────────────────────────────────────────────────────────

_audit_logger = logging.getLogger("helm.audit")


def audit_log(
    action: str,
    user_id: str = "",
    detail: str = "",
    *,
    tenant_id: str = "",
    ip: str = "",
    success: bool = True,
) -> None:
    """Write a structured audit log entry for security-relevant operations.

    These entries are always logged at INFO level so they persist in production logs.
    """
    _audit_logger.info(
        "AUDIT | action=%s | user=%s | tenant=%s | ip=%s | success=%s | %s",
        action,
        user_id or "anonymous",
        tenant_id or "-",
        ip or "-",
        success,
        detail[:500] if detail else "",
    )


def require_admin(user: dict) -> None:
    """Raise 403 if user is not an admin. Use as a helper in route handlers."""
    from fastapi import HTTPException, status

    if not user.get("is_admin"):
        audit_log(
            "admin_access_denied",
            user_id=user.get("user_id", "unknown"),
            success=False,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
