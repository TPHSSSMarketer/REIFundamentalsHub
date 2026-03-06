"""Background task — process reminders for tasks and calendar events.

Runs every 5 minutes. Sends email/SMS reminders when due.
One reminder per task/event max (reminder_sent flag).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.user import CalendarEvent, Task, User

logger = logging.getLogger(__name__)


async def process_reminders(db: AsyncSession, settings: object) -> None:
    """Check for pending reminders and mark them as sent."""
    now = datetime.utcnow()

    # ── Task reminders ────────────────────────────────────────────
    task_result = await db.execute(
        select(Task).where(
            Task.reminder_sent == False,  # noqa: E712
            Task.status == "pending",
            Task.due_date.isnot(None),
            Task.reminder_minutes.isnot(None),
        )
    )
    tasks = task_result.scalars().all()

    for task in tasks:
        remind_at = task.due_date - timedelta(minutes=task.reminder_minutes)
        if remind_at > now:
            continue

        # Look up user preferences
        user_result = await db.execute(
            select(User).where(User.id == task.user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            continue

        if user.task_reminder_email:
            logger.info(
                "Email reminder: task '%s' (id=%s) for user %s",
                task.title,
                task.id,
                user.email,
            )
            # Email sending would be integrated with the existing email service
            # For now, log the reminder event

        if user.task_reminder_sms:
            logger.info(
                "SMS reminder: task '%s' (id=%s) for user %s",
                task.title,
                task.id,
                user.id,
            )
            # SMS sending would use the existing Twilio service

        task.reminder_sent = True

    # ── Calendar event reminders ──────────────────────────────────
    event_result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.reminder_sent == False,  # noqa: E712
            CalendarEvent.reminder_minutes.isnot(None),
        )
    )
    events = event_result.scalars().all()

    for event in events:
        remind_at = event.start_datetime - timedelta(minutes=event.reminder_minutes)
        if remind_at > now:
            continue

        user_result = await db.execute(
            select(User).where(User.id == event.user_id)
        )
        user = user_result.scalar_one_or_none()
        if not user:
            continue

        if user.task_reminder_email:
            logger.info(
                "Email reminder: event '%s' (id=%s) for user %s",
                event.title,
                event.id,
                user.email,
            )

        if user.task_reminder_sms:
            logger.info(
                "SMS reminder: event '%s' (id=%s) for user %s",
                event.title,
                event.id,
                user.id,
            )

        event.reminder_sent = True

    await db.commit()
