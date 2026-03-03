"""AI Admin Assistant — Background task scheduler for scheduled tasks.

The scheduled task system allows users to automate skills to run on recurring
schedules. This service:

1. Checks every 60 seconds for tasks that are due (process_due_tasks)
2. Calculates next run time from cron expressions (calculate_next_run)
3. Executes linked skills and updates execution records
4. Returns summary of processed, succeeded, and failed tasks

Integration:
- Called from main.py background task every 60 seconds
- Works with AdminScheduledTask model
- Imports and calls execute_skill from admin_skill_service
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Optional

from dateutil.tz import gettz
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings
from rei.models.admin_assistant import AdminScheduledTask

logger = logging.getLogger(__name__)

# Try to import croniter for robust cron parsing; fallback to regex-based parser
try:
    from croniter import croniter
    CRONITER_AVAILABLE = True
except ImportError:
    CRONITER_AVAILABLE = False


# ─────────────────────────────────────────────────────────────────────────────
# CRON EXPRESSION PARSING
# ─────────────────────────────────────────────────────────────────────────────


def calculate_next_run(
    cron_expression: str,
    timezone: str,
    from_time: Optional[datetime] = None,
) -> datetime:
    """
    Parse cron expression and calculate next run time in UTC.

    Supports standard 5-field cron format:
    - minute (0-59)
    - hour (0-23)
    - day of month (1-31)
    - month (1-12)
    - day of week (0-6, where 0=Sunday)

    Examples:
    - "0 8 * * *" — Every day at 8:00 AM
    - "0 8 * * 1-5" — Weekdays at 8:00 AM
    - "0 9 * * 1" — Every Monday at 9:00 AM
    - "30 8 * * *" — Every day at 8:30 AM

    Args:
        cron_expression: Standard 5-field cron string
        timezone: Timezone string (e.g., "America/New_York")
        from_time: Base time for calculation (defaults to now)

    Returns:
        Next run time as UTC datetime
    """
    if from_time is None:
        from_time = datetime.utcnow()

    try:
        # If croniter is available, use it for robust parsing
        if CRONITER_AVAILABLE:
            # Convert from UTC to target timezone for cron evaluation
            tz = gettz(timezone)
            if tz is None:
                tz = gettz("America/New_York")  # Fallback

            # Create timezone-aware datetime in target timezone
            local_time = from_time.replace(tzinfo=dt_timezone.utc).astimezone(tz)

            # Use croniter to find next occurrence
            cron = croniter(cron_expression, local_time)
            next_local = cron.get_next(datetime)

            # Convert back to UTC
            return next_local.astimezone(dt_timezone.utc).replace(tzinfo=None)

        # Fallback: simple regex-based parser for common patterns
        else:
            return _parse_cron_fallback(cron_expression, timezone, from_time)

    except Exception as e:
        logger.error(f"Failed to parse cron expression '{cron_expression}': {e}")
        # Default fallback: run 1 hour from now
        return from_time + timedelta(hours=1)


def _parse_cron_fallback(
    cron_expression: str,
    timezone: str,
    from_time: datetime,
) -> datetime:
    """
    Fallback cron parser for common patterns (no croniter).

    Handles:
    - "0 8 * * *" (daily at 8am)
    - "0 8 * * 1-5" (weekdays at 8am)
    - "0 8 * * 0" or "0 8 * * 7" (Sunday at 8am, where 7 also means Sunday)
    - "0 9 * * 1" (Monday at 9am)

    For more complex patterns, defaults to 1 hour from now.
    """
    tz = gettz(timezone)
    if tz is None:
        tz = gettz("America/New_York")

    # Parse the cron fields
    parts = cron_expression.strip().split()
    if len(parts) != 5:
        logger.warning(f"Invalid cron format: {cron_expression}")
        return from_time + timedelta(hours=1)

    try:
        minute_str, hour_str, dom_str, month_str, dow_str = parts

        minute = int(minute_str)
        hour = int(hour_str)

        # Convert from_time to target timezone
        local_time = from_time.replace(tzinfo=dt_timezone.utc).astimezone(tz)

        # Start with tomorrow at the specified time
        next_run = local_time.replace(
            hour=hour, minute=minute, second=0, microsecond=0
        )

        # If that time hasn't passed today, use it
        if next_run > local_time:
            # Still need to check day-of-week constraints
            if _matches_cron_dow(next_run, dow_str):
                result = next_run.astimezone(dt_timezone.utc).replace(tzinfo=None)
                return result

        # Otherwise, find next matching day
        next_run += timedelta(days=1)
        for _ in range(7):  # Search up to 7 days ahead
            if _matches_cron_dow(next_run, dow_str):
                result = next_run.astimezone(dt_timezone.utc).replace(tzinfo=None)
                return result
            next_run += timedelta(days=1)

        # Fallback if no match found
        return from_time + timedelta(hours=1)

    except (ValueError, IndexError):
        logger.warning(f"Failed to parse cron expression: {cron_expression}")
        return from_time + timedelta(hours=1)


def _matches_cron_dow(dt: datetime, dow_str: str) -> bool:
    """
    Check if a datetime matches the day-of-week cron field.

    dow_str can be:
    - "*" (any day)
    - "0" or "7" (Sunday)
    - "1-5" (Monday through Friday)
    - Single digit (specific day)
    """
    if dow_str == "*":
        return True

    # Python weekday: Monday=0, Sunday=6
    # Cron weekday: Sunday=0, Monday=1, Saturday=6
    # Convert: cron_dow = (python_dow + 1) % 7
    python_dow = dt.weekday()
    cron_dow = (python_dow + 1) % 7

    # Handle ranges like "1-5"
    if "-" in dow_str:
        start, end = dow_str.split("-")
        start_day = int(start)
        end_day = int(end)
        return start_day <= cron_dow <= end_day

    # Handle single values (allow 7 as alias for 0/Sunday)
    cron_value = int(dow_str)
    if cron_value == 7:
        cron_value = 0
    return cron_dow == cron_value


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULED TASK MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────


async def create_scheduled_task(
    user_id: int,
    skill_id: str,
    name: str,
    cron_expression: str,
    timezone: str,
    description: Optional[str],
    db: AsyncSession,
) -> AdminScheduledTask:
    """
    Create a new scheduled task for a user.

    Calculates the next run time from the cron expression and timezone,
    then creates and returns the task record.
    """
    now = datetime.utcnow()
    next_run_at = calculate_next_run(cron_expression, timezone, now)

    task = AdminScheduledTask(
        user_id=user_id,
        skill_id=skill_id,
        name=name,
        description=description,
        cron_expression=cron_expression,
        timezone=timezone,
        next_run_at=next_run_at,
        enabled=True,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    logger.info(
        f"Created scheduled task '{name}' for user {user_id} with cron '{cron_expression}' "
        f"(next run: {next_run_at})"
    )
    return task


async def update_scheduled_task(
    task_id: str,
    user_id: int,
    updates: dict,
    db: AsyncSession,
) -> Optional[AdminScheduledTask]:
    """
    Update a scheduled task.

    If cron_expression or timezone is updated, recalculate next_run_at.
    Returns the updated task, or None if not found.
    """
    result = await db.execute(
        select(AdminScheduledTask).where(
            and_(AdminScheduledTask.id == task_id, AdminScheduledTask.user_id == user_id)
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        return None

    # Update fields
    for field, value in updates.items():
        if value is not None:
            setattr(task, field, value)

    # Recalculate next_run_at if cron or timezone changed
    if "cron_expression" in updates or "timezone" in updates:
        cron = task.cron_expression
        tz = task.timezone
        task.next_run_at = calculate_next_run(cron, tz)

    task.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(task)

    logger.info(f"Updated scheduled task {task_id} for user {user_id}")
    return task


async def delete_scheduled_task(task_id: str, user_id: int, db: AsyncSession) -> bool:
    """
    Delete a scheduled task.

    Returns True if deleted, False if not found.
    """
    result = await db.execute(
        select(AdminScheduledTask).where(
            and_(AdminScheduledTask.id == task_id, AdminScheduledTask.user_id == user_id)
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        return False

    await db.delete(task)
    await db.commit()

    logger.info(f"Deleted scheduled task {task_id} for user {user_id}")
    return True


async def list_scheduled_tasks(user_id: int, db: AsyncSession) -> list[dict]:
    """
    List all scheduled tasks for a user.

    Returns list of task dicts with all fields plus calculated next_run_in_seconds.
    """
    result = await db.execute(
        select(AdminScheduledTask)
        .where(AdminScheduledTask.user_id == user_id)
        .order_by(AdminScheduledTask.next_run_at.asc())
    )
    tasks = result.scalars().all()

    now = datetime.utcnow()
    return [
        {
            "id": t.id,
            "skill_id": t.skill_id,
            "name": t.name,
            "description": t.description,
            "cron_expression": t.cron_expression,
            "timezone": t.timezone,
            "enabled": t.enabled,
            "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
            "next_run_at": t.next_run_at.isoformat() if t.next_run_at else None,
            "next_run_in_seconds": (
                int((t.next_run_at - now).total_seconds())
                if t.next_run_at
                else None
            ),
            "last_run_status": t.last_run_status,
            "total_runs": t.total_runs,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tasks
    ]


# ─────────────────────────────────────────────────────────────────────────────
# BACKGROUND TASK EXECUTION
# ─────────────────────────────────────────────────────────────────────────────


async def get_due_tasks(
    db: AsyncSession,
    now: Optional[datetime] = None,
) -> list[AdminScheduledTask]:
    """
    Find all enabled scheduled tasks that are due to run.

    A task is "due" when:
    - enabled=True
    - next_run_at <= now
    """
    if now is None:
        now = datetime.utcnow()

    result = await db.execute(
        select(AdminScheduledTask).where(
            and_(
                AdminScheduledTask.enabled.is_(True),
                AdminScheduledTask.next_run_at <= now,
            )
        )
    )
    return list(result.scalars().all())


async def execute_task(
    task: AdminScheduledTask,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """
    Execute a scheduled task: run its linked skill.

    Steps:
    1. Import and call execute_skill from admin_skill_service
    2. Update last_run_at, last_run_status, result data
    3. Calculate next run time from cron
    4. Increment total_runs

    Returns a dict with execution status info.
    """
    from rei.services.admin_skill_service import execute_skill

    try:
        # Execute the linked skill
        result = await execute_skill(
            skill_id=task.skill_id,
            user_id=task.user_id,
            db=db,
            settings=settings,
        )

        # Update task with execution results
        task.last_run_at = datetime.utcnow()
        task.last_run_status = "success"
        task.last_run_result = json.dumps(result)
        task.total_runs += 1

        # Recalculate next_run_at
        task.next_run_at = calculate_next_run(
            task.cron_expression, task.timezone
        )

        await db.commit()

        logger.info(
            f"Successfully executed scheduled task {task.id} "
            f"(skill: {task.skill_id}, next run: {task.next_run_at})"
        )
        return {
            "status": "success",
            "task_id": task.id,
            "skill_id": task.skill_id,
            "result": result,
        }

    except Exception as e:
        logger.error(f"Failed to execute scheduled task {task.id}: {e}")
        task.last_run_at = datetime.utcnow()
        task.last_run_status = "failed"
        task.last_run_result = json.dumps({"error": str(e)})
        task.total_runs += 1

        # Still recalculate next_run_at so it doesn't get stuck
        task.next_run_at = calculate_next_run(
            task.cron_expression, task.timezone
        )

        await db.commit()
        return {
            "status": "failed",
            "task_id": task.id,
            "skill_id": task.skill_id,
            "error": str(e),
        }


async def run_task_now(
    task_id: str,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """
    Execute a task immediately, regardless of schedule.

    Useful for testing or manual triggers. Still updates execution records.
    """
    result = await db.execute(
        select(AdminScheduledTask).where(
            and_(AdminScheduledTask.id == task_id, AdminScheduledTask.user_id == user_id)
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        return {"status": "not_found", "task_id": task_id}

    return await execute_task(task, db, settings)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN BACKGROUND LOOP (called every 60 seconds)
# ─────────────────────────────────────────────────────────────────────────────


async def process_due_tasks(db: AsyncSession, settings: Settings) -> dict:
    """
    Main background task loop called every 60 seconds from main.py.

    Finds all due tasks, executes them, and returns a summary.

    Returns:
        {"processed": int, "succeeded": int, "failed": int, "results": list}
    """
    due = await get_due_tasks(db)

    if not due:
        return {"processed": 0, "succeeded": 0, "failed": 0}

    results = []
    succeeded = 0
    failed = 0

    for task in due:
        result = await execute_task(task, db, settings)
        results.append(result)

        if result.get("status") == "success":
            succeeded += 1
        else:
            failed += 1

    logger.info(
        f"Processed {len(results)} scheduled tasks: "
        f"{succeeded} succeeded, {failed} failed"
    )

    return {
        "processed": len(results),
        "succeeded": succeeded,
        "failed": failed,
        "results": results,
    }
