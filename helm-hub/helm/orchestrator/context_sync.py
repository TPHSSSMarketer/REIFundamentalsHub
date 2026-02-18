"""Context file sync — keeps shared AI context files up-to-date.

Runs periodically (default: every 15 minutes) to:
  1. Read the master context/claude.md
  2. Sync content to context/gemini.md and context/agents.md
  3. Update active deal summaries from GHL
  4. Update current goals from the database
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

CONTEXT_DIR = Path(__file__).resolve().parent.parent.parent / "context"


async def sync_context_files() -> dict:
    """Sync master context to all agent context files."""
    CONTEXT_DIR.mkdir(parents=True, exist_ok=True)

    results = {"synced": [], "errors": []}

    # Read master context
    master_path = CONTEXT_DIR / "claude.md"
    if not master_path.exists():
        master_content = _generate_default_context()
        master_path.write_text(master_content)
        results["synced"].append("claude.md (created)")
    else:
        master_content = master_path.read_text()

    # Append dynamic sections
    dynamic_sections = await _gather_dynamic_context()
    full_context = master_content
    if dynamic_sections:
        full_context += "\n\n" + dynamic_sections

    # Sync to other context files
    for target in ["gemini.md", "agents.md"]:
        try:
            target_path = CONTEXT_DIR / target
            target_path.write_text(full_context)
            results["synced"].append(target)
        except Exception as exc:
            results["errors"].append(f"{target}: {exc}")

    logger.info("Context sync complete: %s", results)
    return results


async def _gather_dynamic_context() -> str:
    """Gather dynamic context from active integrations."""
    sections = []
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    sections.append(f"--- Last synced: {now} ---")

    # Active goals from database
    try:
        from helm.models.database import Goal, async_session
        from sqlalchemy import select

        async with async_session() as session:
            result = await session.execute(
                select(Goal).where(Goal.status == "active").limit(20)
            )
            goals = result.scalars().all()
            if goals:
                goals_text = "\n".join(f"- {g.goal}" for g in goals)
                sections.append(f"## Active Goals\n{goals_text}")
    except Exception as exc:
        logger.debug("Could not fetch goals for context: %s", exc)

    # GHL pipeline summary (if connected)
    try:
        from helm.integrations.ghl import ghl_client

        if ghl_client.is_configured:
            pipelines = await ghl_client.get_pipelines()
            if pipelines:
                pipeline_text = "\n".join(
                    f"- {p.get('name', 'Unknown')}: {len(p.get('stages', []))} stages"
                    for p in pipelines[:5]
                )
                sections.append(f"## Active Pipelines\n{pipeline_text}")
    except Exception as exc:
        logger.debug("Could not fetch GHL pipelines for context: %s", exc)

    return "\n\n".join(sections) if len(sections) > 1 else ""


def _generate_default_context() -> str:
    """Generate the initial master context file."""
    return """# Helm AI Assistant — Master Context

## About
Helm is your AI-powered command center for business and life.
This file is the master context shared with all AI agents.

## User Profile
(Complete onboarding to populate this section)

## Active Configuration
- Mode: Business
- Style: Default
- Check-ins: Enabled

## Notes
Add important context here that should be available to all agents.
"""
