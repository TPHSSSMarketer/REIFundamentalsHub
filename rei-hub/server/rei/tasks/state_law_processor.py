"""Background processor for pending state law research on land trusts."""

from __future__ import annotations

from datetime import datetime
import logging

logger = logging.getLogger(__name__)


async def process_pending_state_research(db_session_factory, settings) -> None:
    """Research state laws for land trusts that haven't been researched yet."""
    async with db_session_factory() as db:
        try:
            from rei.models.user import LandTrust, StateLawResearch
            from rei.services.state_law_service import research_state_laws

            from sqlalchemy import select

            result = await db.execute(
                select(LandTrust).where(LandTrust.state_law_research == None)  # noqa: E711
            )
            lands = result.scalars().all()

            for land_trust in lands:
                try:
                    await research_state_laws(
                        land_trust.property_state,
                        land_trust.user_id,
                        db,
                        settings,
                    )
                    land_trust.state_law_researched_at = datetime.utcnow()
                    await db.commit()
                    logger.info(
                        "State law research complete for %s",
                        land_trust.property_state,
                    )
                except Exception as e:
                    logger.error(
                        "Research failed for land trust %s: %s",
                        land_trust.id,
                        e,
                    )
                    continue
        except Exception as e:
            logger.error("State law processor error: %s", e)
