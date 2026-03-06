"""Background task — send trial ending reminder emails."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import and_, select

from rei.models.user import User
from rei.services.email import send_trial_ending_email

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from rei.config import Settings

logger = logging.getLogger(__name__)


async def send_trial_reminders(db: AsyncSession, settings: Settings) -> None:
    """Send trial-ending emails to users whose trial ends in 2–3 days.

    Only sends once per user (checks ``trial_reminder_sent``).
    """
    now = datetime.utcnow()
    window_start = now + timedelta(days=2)
    window_end = now + timedelta(days=3)

    result = await db.execute(
        select(User).where(
            and_(
                User.subscription_status == "trialing",
                User.trial_ends_at >= window_start,
                User.trial_ends_at <= window_end,
                User.trial_reminder_sent == False,  # noqa: E712
            )
        )
    )
    users = result.scalars().all()

    if not users:
        logger.info("Trial reminder: no users to notify")
        return

    for user in users:
        ok = await send_trial_ending_email(user, settings)
        if ok:
            user.trial_reminder_sent = True
            logger.info("Trial reminder sent to user %s (%s)", user.id, user.email)
        else:
            logger.warning("Trial reminder failed for user %s (%s)", user.id, user.email)

    await db.commit()
    logger.info("Trial reminder run complete: %d users processed", len(users))
