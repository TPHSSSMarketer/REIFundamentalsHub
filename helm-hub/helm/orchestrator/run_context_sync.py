"""Standalone runner for the context sync process.

Designed to be executed by PM2 on a cron schedule (every 15 minutes).
Runs the sync once and exits.

Usage:
    python -m helm.orchestrator.run_context_sync
"""

from __future__ import annotations

import asyncio
import logging
import sys

from helm.orchestrator.context_sync import sync_context_files

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Context sync starting...")
    try:
        result = await sync_context_files()
        synced = result.get("synced", [])
        errors = result.get("errors", [])
        logger.info("Context sync complete: %d files synced", len(synced))
        if errors:
            logger.warning("Context sync errors: %s", errors)
    except Exception as exc:
        logger.error("Context sync failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
