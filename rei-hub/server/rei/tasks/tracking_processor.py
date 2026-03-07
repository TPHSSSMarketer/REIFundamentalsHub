"""Background processor for auto-updating USPS and fax tracking status.

Runs every 4 hours. Updates tracking for all active correspondence records
that are not yet in a final status.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


async def process_pending_tracking(db_session_factory, settings) -> None:
    """Update tracking for all non-final correspondence records.

    Filters:
    - USPS: skip records where usps_status in (delivered, returned)
    - Fax: skip records where fax_status in (delivered, failed, canceled)
    - Only records sent within last 60 days
    - Only records with a tracking number or fax SID
    """
    async with db_session_factory() as db:
        try:
            from sqlalchemy import select, or_, and_

            from rei.models.user import NegotiationCorrespondence
            from rei.services.usps_tracking import update_correspondence_tracking
            from rei.services.twilio_fax import update_fax_status

            cutoff = datetime.utcnow() - timedelta(days=60)

            # Find records needing update:
            # - Not in final status
            # - Sent within last 60 days
            # - Has tracking number or fax SID
            result = await db.execute(
                select(NegotiationCorrespondence).where(
                    NegotiationCorrespondence.sent_date >= cutoff,
                    or_(
                        and_(
                            NegotiationCorrespondence.usps_tracking_number.isnot(None),
                            NegotiationCorrespondence.usps_status.notin_(
                                ["delivered", "returned"]
                            ),
                        ),
                        and_(
                            NegotiationCorrespondence.twilio_fax_sid.isnot(None),
                            NegotiationCorrespondence.fax_status.notin_(
                                ["delivered", "failed", "canceled"]
                            ),
                        ),
                    ),
                )
            )
            pending = result.scalars().all()

            if not pending:
                logger.debug("No pending tracking records to update")
                return

            logger.info("Processing %d pending tracking records", len(pending))

            for corr in pending:
                try:
                    if (
                        corr.usps_tracking_number
                        and corr.usps_status not in ("delivered", "returned")
                    ):
                        await update_correspondence_tracking(
                            corr.id, db, settings
                        )

                    if (
                        corr.twilio_fax_sid
                        and corr.fax_status not in ("delivered", "failed", "canceled")
                    ):
                        await update_fax_status(
                            corr.id, db.sync_session, settings
                        )

                    # Small delay to avoid rate limits
                    await asyncio.sleep(0.5)

                except Exception as e:
                    logger.error(
                        "Tracking update failed for correspondence %s: %s",
                        corr.id,
                        e,
                    )
                    continue

        except Exception as e:
            logger.error("Tracking processor error: %s", e)
