"""Standalone runner for the smart check-in scheduler.

Designed to be executed by PM2 on a cron schedule (every 30 minutes).
Runs one check-in cycle for all tenants and exits.

Usage:
    python -m helm.checkins.run_checkins
"""

from __future__ import annotations

import asyncio
import logging
import sys

from helm.checkins.scheduler import checkin_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def main() -> None:
    logger.info("Check-in cycle starting...")
    try:
        results = await checkin_scheduler.run_all_tenants()
        logger.info("Check-in cycle complete: %s", results)
    except Exception as exc:
        logger.error("Check-in cycle failed: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
