"""Living file sync — reads structured markdown context files from per-tenant
workspace folders and injects them into the AI system prompt automatically.

Each tenant gets a ``workspaces/{tenant_id}/context/`` directory containing
markdown files that form the living context for their AI assistant.  These
files are read at prompt-build time so the AI always has up-to-date context.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

# Ordered list of living context files to load into the system prompt.
LIVING_FILE_NAMES: list[str] = [
    "CLAUDE.md",
    "DEALS_PIPELINE.md",
    "CONTACTS.md",
    "MARKET_CONTEXT.md",
    "PORTFOLIO.md",
    "MEMORY.md",
    "TOOLS.md",
    "CRON_JOBS.md",
    "ESCALATION.md",
]


def get_workspace_dir(tenant_id: str) -> Path:
    """Return the context directory for a tenant, creating it if needed."""
    path = Path("workspaces") / tenant_id / "context"
    path.mkdir(parents=True, exist_ok=True)
    return path


def read_living_file(tenant_id: str, filename: str) -> str | None:
    """Read a single living file for a tenant.

    Returns the file content as a string, or ``None`` if the file does not
    exist or cannot be read.
    """
    filepath = get_workspace_dir(tenant_id) / filename
    try:
        if not filepath.exists():
            return None
        return filepath.read_text(encoding="utf-8").strip()
    except OSError as exc:
        logger.warning("Could not read living file %s/%s: %s", tenant_id, filename, exc)
        return None


def read_all_living_files(tenant_id: str) -> dict[str, str]:
    """Read all living files for a tenant.

    Returns a dict of ``{filename: content}`` for files that exist and are
    non-empty.  Files that are missing or empty are skipped.
    """
    result: dict[str, str] = {}
    for filename in LIVING_FILE_NAMES:
        content = read_living_file(tenant_id, filename)
        if content:
            result[filename] = content
    return result


def build_living_context_block(tenant_id: str) -> str:
    """Build a formatted context block from all living files.

    Returns a string suitable for injection into the AI system prompt.
    Returns an empty string if no files are found.
    """
    files = read_all_living_files(tenant_id)
    if not files:
        return ""

    parts: list[str] = ["## Tenant Context\n"]
    for filename in LIVING_FILE_NAMES:
        if filename in files:
            parts.append(f"### {filename}\n{files[filename]}\n")

    return "\n".join(parts)


def write_living_file(tenant_id: str, filename: str, content: str) -> None:
    """Write content to a living file.

    Raises ``ValueError`` if the filename is not in ``LIVING_FILE_NAMES``.
    """
    if filename not in LIVING_FILE_NAMES:
        raise ValueError(
            f"Invalid living file name: {filename!r}. "
            f"Must be one of: {LIVING_FILE_NAMES}"
        )
    filepath = get_workspace_dir(tenant_id) / filename
    filepath.write_text(content, encoding="utf-8")
    logger.info("Living file written: %s/%s", tenant_id, filename)


def list_living_files(tenant_id: str) -> list[dict]:
    """List all living files for a tenant with metadata.

    Returns a list of dicts with keys: ``filename``, ``exists``,
    ``size_bytes``, ``last_modified``.
    """
    workspace_dir = get_workspace_dir(tenant_id)
    result: list[dict] = []

    for filename in LIVING_FILE_NAMES:
        filepath = workspace_dir / filename
        if filepath.exists():
            stat = filepath.stat()
            last_modified = datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat()
            result.append({
                "filename": filename,
                "exists": True,
                "size_bytes": stat.st_size,
                "last_modified": last_modified,
            })
        else:
            result.append({
                "filename": filename,
                "exists": False,
                "size_bytes": 0,
                "last_modified": None,
            })

    return result
