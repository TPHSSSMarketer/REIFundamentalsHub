"""Structured JSON logging configuration for production.

Provides a JSON formatter that outputs structured log entries with
consistent fields: timestamp, level, logger, message, and optional
extras (tenant_id, agent_name, duration_ms, etc.).

Usage:
    from helm.logging_config import setup_logging
    setup_logging()  # Call once at startup
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Formats log records as single-line JSON objects."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Add exception info if present
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Add extra fields commonly used in Helm
        for field in ("tenant_id", "agent_name", "action", "duration_ms",
                      "channel", "breaker_name", "error_detail"):
            value = getattr(record, field, None)
            if value is not None:
                log_entry[field] = value

        return json.dumps(log_entry, default=str)


def setup_logging(
    level: str = "INFO",
    json_output: bool = True,
) -> None:
    """Configure logging for the entire application.

    Args:
        level: Root log level (DEBUG, INFO, WARNING, ERROR).
        json_output: If True, use JSON formatter. If False, use human-readable format.
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove existing handlers
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)

    if json_output:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
        ))

    root.addHandler(handler)

    # Quiet noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
