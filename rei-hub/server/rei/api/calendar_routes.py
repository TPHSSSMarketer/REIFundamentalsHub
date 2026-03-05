"""Calendar & Task Management routes."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import get_settings
from rei.models.user import CalendarEvent, Task, User
from rei.services.calendar_sync import (
    _aes_decrypt,
    _aes_encrypt,
    caldav_test_connection,
    delete_event_from_all_providers,
    generate_ical_feed,
    google_exchange_code,
    google_get_auth_url,
    google_list_events,
    google_refresh_token,
    outlook_exchange_code,
    outlook_get_auth_url,
    outlook_list_events,
    outlook_refresh_token,
    sync_event_to_all_providers,
)

logger = logging.getLogger(__name__)

calendar_router = APIRouter(prefix="/calendar", tags=["calendar"])

settings = get_settings()


# ── Pydantic schemas ──────────────────────────────────────────────────


class CreateTaskBody(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None
    task_type: str = "manual"
    is_recurring: bool = False
    recurrence_rule: Optional[str] = None
    reminder_minutes: Optional[int] = None


class UpdateTaskBody(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None
    reminder_minutes: Optional[int] = None


class CreateEventBody(BaseModel):
    title: str
    description: Optional[str] = None
    event_type: str = "appointment"
    start_datetime: str
    end_datetime: str
    all_day: bool = False
    location: Optional[str] = None
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None
    reminder_minutes: Optional[int] = None
    is_recurring: bool = False
    recurrence_rule: Optional[str] = None


class UpdateEventBody(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    event_type: Optional[str] = None
    start_datetime: Optional[str] = None
    end_datetime: Optional[str] = None
    all_day: Optional[bool] = None
    location: Optional[str] = None
    contact_id: Optional[str] = None
    deal_id: Optional[str] = None
    reminder_minutes: Optional[int] = None


class GoogleCallbackBody(BaseModel):
    code: str


class OutlookCallbackBody(BaseModel):
    code: str


class CaldavConnectBody(BaseModel):
    username: str
    password: str
    calendar_url: str = "https://caldav.icloud.com"


# ── Helpers ───────────────────────────────────────────────────────────


def _serialize_task(t: Task) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "description": t.description,
        "status": t.status,
        "priority": t.priority,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "due_time": t.due_time,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "contact_id": t.contact_id,
        "deal_id": t.deal_id,
        "call_log_id": t.call_log_id,
        "task_type": t.task_type,
        "is_recurring": t.is_recurring,
        "recurrence_rule": t.recurrence_rule,
        "reminder_minutes": t.reminder_minutes,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


def _serialize_event(e: CalendarEvent) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "description": e.description,
        "event_type": e.event_type,
        "start_datetime": e.start_datetime.isoformat() if e.start_datetime else None,
        "end_datetime": e.end_datetime.isoformat() if e.end_datetime else None,
        "all_day": e.all_day,
        "location": e.location,
        "contact_id": e.contact_id,
        "deal_id": e.deal_id,
        "task_id": e.task_id,
        "is_recurring": e.is_recurring,
        "reminder_minutes": e.reminder_minutes,
        "last_synced_at": e.last_synced_at.isoformat() if e.last_synced_at else None,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


# ═══════════════════════════════════════════════════════════════
# TASK ENDPOINTS
# ═══════════════════════════════════════════════════════════════


@calendar_router.get("/tasks")
async def get_tasks(
    task_status: Optional[str] = None,
    priority: Optional[str] = None,
    contact_id: Optional[str] = None,
    deal_id: Optional[str] = None,
    overdue: Optional[bool] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get tasks grouped by timeline."""
    stmt = select(Task).where(Task.user_id == workspace_user_id(user))
    if task_status:
        stmt = stmt.where(Task.status == task_status)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if contact_id:
        stmt = stmt.where(Task.contact_id == contact_id)
    if deal_id:
        stmt = stmt.where(Task.deal_id == deal_id)
    stmt = stmt.order_by(Task.due_date.asc().nullslast(), Task.created_at.desc())

    result = await db.execute(stmt)
    tasks = result.scalars().all()

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    week_end = today_start + timedelta(days=7)

    grouped = {
        "overdue": [],
        "today": [],
        "this_week": [],
        "upcoming": [],
        "no_date": [],
    }

    for t in tasks:
        serialized = _serialize_task(t)
        if t.status in ("completed", "cancelled"):
            continue
        if t.due_date is None:
            grouped["no_date"].append(serialized)
        elif t.due_date < today_start:
            grouped["overdue"].append(serialized)
        elif t.due_date < today_end:
            grouped["today"].append(serialized)
        elif t.due_date < week_end:
            grouped["this_week"].append(serialized)
        else:
            grouped["upcoming"].append(serialized)

    if overdue:
        return {"tasks": grouped["overdue"]}

    return grouped


@calendar_router.post("/tasks")
async def create_task(
    body: CreateTaskBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a task and optionally a linked calendar event."""
    task = Task(
        user_id=workspace_user_id(user),
        title=body.title,
        description=body.description,
        priority=body.priority,
        due_date=datetime.fromisoformat(body.due_date) if body.due_date else None,
        due_time=body.due_time,
        contact_id=body.contact_id,
        deal_id=body.deal_id,
        task_type=body.task_type,
        is_recurring=body.is_recurring,
        recurrence_rule=body.recurrence_rule,
        reminder_minutes=body.reminder_minutes,
    )
    db.add(task)
    await db.flush()

    event = None
    if task.due_date:
        start = task.due_date
        if body.due_time:
            parts = body.due_time.split(":")
            start = start.replace(
                hour=int(parts[0]), minute=int(parts[1]) if len(parts) > 1 else 0
            )
        end = start + timedelta(hours=1)
        event = CalendarEvent(
            user_id=workspace_user_id(user),
            title=task.title,
            description=task.description,
            event_type="task",
            start_datetime=start,
            end_datetime=end,
            contact_id=task.contact_id,
            deal_id=task.deal_id,
            task_id=task.id,
            reminder_minutes=task.reminder_minutes,
        )
        db.add(event)
        await db.flush()

        try:
            await sync_event_to_all_providers(event, user, settings)
        except Exception:
            logger.exception("Failed to sync new task event")

    await db.commit()
    return {
        "task": _serialize_task(task),
        "event": _serialize_event(event) if event else None,
    }


@calendar_router.patch("/tasks/{task_id}")
async def update_task(
    task_id: str,
    body: UpdateTaskBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a task and its linked event."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == workspace_user_id(user))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    updates = body.model_dump(exclude_none=True)
    for field, value in updates.items():
        if field == "due_date" and value:
            setattr(task, field, datetime.fromisoformat(value))
        else:
            setattr(task, field, value)
    task.updated_at = datetime.utcnow()

    # Update linked event
    ev_result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.task_id == task_id, CalendarEvent.user_id == workspace_user_id(user)
        )
    )
    event = ev_result.scalar_one_or_none()
    if event:
        if body.title is not None:
            event.title = body.title
        if body.description is not None:
            event.description = body.description
        if body.due_date:
            start = datetime.fromisoformat(body.due_date)
            if body.due_time:
                parts = body.due_time.split(":")
                start = start.replace(
                    hour=int(parts[0]), minute=int(parts[1]) if len(parts) > 1 else 0
                )
            event.start_datetime = start
            event.end_datetime = start + timedelta(hours=1)
        if body.reminder_minutes is not None:
            event.reminder_minutes = body.reminder_minutes
        event.updated_at = datetime.utcnow()

        try:
            await sync_event_to_all_providers(event, user, settings)
        except Exception:
            logger.exception("Failed to sync updated task event")

    await db.commit()
    return _serialize_task(task)


@calendar_router.post("/tasks/{task_id}/complete")
async def complete_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Complete a task. If recurring, create next occurrence."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == workspace_user_id(user))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.status = "completed"
    task.completed_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()

    next_task = None
    if task.is_recurring and task.recurrence_rule and task.due_date:
        # Simple recurrence: daily, weekly, monthly
        rule = task.recurrence_rule.lower()
        if rule == "daily":
            next_due = task.due_date + timedelta(days=1)
        elif rule == "weekly":
            next_due = task.due_date + timedelta(weeks=1)
        elif rule == "monthly":
            next_due = task.due_date + timedelta(days=30)
        else:
            next_due = task.due_date + timedelta(weeks=1)

        next_task = Task(
            user_id=workspace_user_id(user),
            title=task.title,
            description=task.description,
            priority=task.priority,
            due_date=next_due,
            due_time=task.due_time,
            contact_id=task.contact_id,
            deal_id=task.deal_id,
            task_type=task.task_type,
            is_recurring=True,
            recurrence_rule=task.recurrence_rule,
            reminder_minutes=task.reminder_minutes,
        )
        db.add(next_task)

    await db.commit()
    resp: dict = {"task": _serialize_task(task)}
    if next_task:
        resp["next_task"] = _serialize_task(next_task)
    return resp


@calendar_router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a task, its linked event, and provider events."""
    result = await db.execute(
        select(Task).where(Task.id == task_id, Task.user_id == workspace_user_id(user))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Delete linked event
    ev_result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.task_id == task_id, CalendarEvent.user_id == workspace_user_id(user)
        )
    )
    event = ev_result.scalar_one_or_none()
    if event:
        try:
            await delete_event_from_all_providers(event, user, settings)
        except Exception:
            logger.exception("Failed to delete event from providers")
        await db.delete(event)

    await db.delete(task)
    await db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
# CALENDAR EVENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════


@calendar_router.get("/events")
async def get_events(
    start: Optional[str] = None,
    end: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get events within a date range, merged with tasks that have due dates."""
    stmt = select(CalendarEvent).where(CalendarEvent.user_id == workspace_user_id(user))
    if start:
        stmt = stmt.where(CalendarEvent.start_datetime >= datetime.fromisoformat(start))
    if end:
        stmt = stmt.where(CalendarEvent.end_datetime <= datetime.fromisoformat(end))
    stmt = stmt.order_by(CalendarEvent.start_datetime.asc())

    result = await db.execute(stmt)
    events = [_serialize_event(e) for e in result.scalars().all()]

    # Also include tasks with due dates that don't have linked events
    task_stmt = select(Task).where(
        Task.user_id == workspace_user_id(user),
        Task.due_date.isnot(None),
        Task.status.notin_(["completed", "cancelled"]),
    )
    if start:
        task_stmt = task_stmt.where(Task.due_date >= datetime.fromisoformat(start))
    if end:
        task_stmt = task_stmt.where(Task.due_date <= datetime.fromisoformat(end))

    task_result = await db.execute(task_stmt)
    tasks_with_dates = task_result.scalars().all()

    # Get task IDs that already have events
    event_task_ids = {e["task_id"] for e in events if e.get("task_id")}

    for t in tasks_with_dates:
        if t.id not in event_task_ids:
            events.append({
                "id": f"task-{t.id}",
                "title": t.title,
                "description": t.description,
                "event_type": "task",
                "start_datetime": t.due_date.isoformat() if t.due_date else None,
                "end_datetime": (t.due_date + timedelta(hours=1)).isoformat() if t.due_date else None,
                "all_day": False,
                "location": None,
                "contact_id": t.contact_id,
                "deal_id": t.deal_id,
                "task_id": t.id,
                "is_recurring": t.is_recurring,
                "reminder_minutes": t.reminder_minutes,
                "last_synced_at": None,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            })

    return {"events": events}


@calendar_router.post("/events")
async def create_event(
    body: CreateEventBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a calendar event and sync to providers."""
    event = CalendarEvent(
        user_id=workspace_user_id(user),
        title=body.title,
        description=body.description,
        event_type=body.event_type,
        start_datetime=datetime.fromisoformat(body.start_datetime),
        end_datetime=datetime.fromisoformat(body.end_datetime),
        all_day=body.all_day,
        location=body.location,
        contact_id=body.contact_id,
        deal_id=body.deal_id,
        reminder_minutes=body.reminder_minutes,
        is_recurring=body.is_recurring,
        recurrence_rule=body.recurrence_rule,
    )
    db.add(event)
    await db.flush()

    try:
        await sync_event_to_all_providers(event, user, settings)
    except Exception:
        logger.exception("Failed to sync new event")

    await db.commit()
    return _serialize_event(event)


@calendar_router.patch("/events/{event_id}")
async def update_event(
    event_id: str,
    body: UpdateEventBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update event and re-sync to providers."""
    result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.id == event_id, CalendarEvent.user_id == workspace_user_id(user)
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    updates = body.model_dump(exclude_none=True)
    for field, value in updates.items():
        if field in ("start_datetime", "end_datetime") and value:
            setattr(event, field, datetime.fromisoformat(value))
        else:
            setattr(event, field, value)
    event.updated_at = datetime.utcnow()

    try:
        await sync_event_to_all_providers(event, user, settings)
    except Exception:
        logger.exception("Failed to sync updated event")

    await db.commit()
    return _serialize_event(event)


@calendar_router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete event from REI Hub and all providers."""
    result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.id == event_id, CalendarEvent.user_id == workspace_user_id(user)
        )
    )
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    try:
        await delete_event_from_all_providers(event, user, settings)
    except Exception:
        logger.exception("Failed to delete event from providers")

    await db.delete(event)
    await db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
# GOOGLE CALENDAR
# ═══════════════════════════════════════════════════════════════


@calendar_router.get("/google/auth-url")
async def get_google_auth_url(user: User = Depends(get_current_user)):
    """Return Google OAuth consent URL."""
    if not settings.google_client_id:
        raise HTTPException(status_code=503, detail="Google Calendar not configured")
    return {"auth_url": google_get_auth_url(settings)}


@calendar_router.post("/google/callback")
async def google_callback(
    body: GoogleCallbackBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange Google auth code and save tokens."""
    try:
        tokens = await google_exchange_code(body.code, settings)
    except Exception as e:
        logger.exception("Google token exchange failed")
        raise HTTPException(status_code=400, detail="Failed to connect Google Calendar") from e

    user.google_calendar_token = json.dumps(tokens)
    user.google_calendar_sync = True
    await db.commit()
    return {"connected": True}


@calendar_router.post("/google/sync")
async def sync_google(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full bidirectional sync with Google Calendar."""
    if not user.google_calendar_sync or not user.google_calendar_token:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")

    token_data = json.loads(user.google_calendar_token)
    try:
        access_token = await google_refresh_token(
            token_data.get("refresh_token", ""), settings
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to refresh Google token") from e

    now = datetime.utcnow()
    time_min = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    time_max = (now + timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Push local events to Google
    local_result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.user_id == workspace_user_id(user),
            CalendarEvent.start_datetime >= now - timedelta(days=30),
        )
    )
    local_events = local_result.scalars().all()
    pushed = 0
    for ev in local_events:
        try:
            await sync_event_to_all_providers(ev, user, settings)
            pushed += 1
        except Exception:
            logger.exception("Failed to push event %s to Google", ev.id)

    # Pull Google events
    pulled = 0
    try:
        google_events = await google_list_events(access_token, time_min, time_max)
        existing_google_ids = {
            ev.google_event_id for ev in local_events if ev.google_event_id
        }
        for gev in google_events:
            if gev["id"] not in existing_google_ids:
                start = gev.get("start", {})
                end = gev.get("end", {})
                start_dt = datetime.fromisoformat(
                    start.get("dateTime", start.get("date", now.isoformat())).replace("Z", "+00:00")
                ).replace(tzinfo=None)
                end_dt = datetime.fromisoformat(
                    end.get("dateTime", end.get("date", now.isoformat())).replace("Z", "+00:00")
                ).replace(tzinfo=None)
                new_event = CalendarEvent(
                    user_id=workspace_user_id(user),
                    title=gev.get("summary", "Google Event"),
                    description=gev.get("description", ""),
                    event_type="appointment",
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    all_day="date" in start,
                    location=gev.get("location", ""),
                    google_event_id=gev["id"],
                    last_synced_at=now,
                )
                db.add(new_event)
                pulled += 1
    except Exception:
        logger.exception("Failed to pull events from Google")

    await db.commit()
    return {"pushed": pushed, "pulled": pulled}


@calendar_router.delete("/google/disconnect")
async def disconnect_google(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Google Calendar."""
    user.google_calendar_token = None
    user.google_calendar_id = None
    user.google_calendar_sync = False
    await db.commit()
    return {"disconnected": True}


# ═══════════════════════════════════════════════════════════════
# MICROSOFT OUTLOOK
# ═══════════════════════════════════════════════════════════════


@calendar_router.get("/outlook/auth-url")
async def get_outlook_auth_url(user: User = Depends(get_current_user)):
    """Return Microsoft OAuth consent URL."""
    if not settings.outlook_client_id:
        raise HTTPException(status_code=503, detail="Outlook Calendar not configured")
    return {"auth_url": outlook_get_auth_url(settings)}


@calendar_router.post("/outlook/callback")
async def outlook_callback(
    body: OutlookCallbackBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange Outlook auth code and save tokens."""
    try:
        tokens = await outlook_exchange_code(body.code, settings)
    except Exception as e:
        logger.exception("Outlook token exchange failed")
        raise HTTPException(status_code=400, detail="Failed to connect Outlook Calendar") from e

    user.outlook_calendar_token = json.dumps(tokens)
    user.outlook_calendar_sync = True
    await db.commit()
    return {"connected": True}


@calendar_router.post("/outlook/sync")
async def sync_outlook(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full bidirectional sync with Outlook Calendar."""
    if not user.outlook_calendar_sync or not user.outlook_calendar_token:
        raise HTTPException(status_code=400, detail="Outlook Calendar not connected")

    token_data = json.loads(user.outlook_calendar_token)
    try:
        access_token = await outlook_refresh_token(
            token_data.get("refresh_token", ""), settings
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to refresh Outlook token") from e

    now = datetime.utcnow()
    start = (now - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")
    end = (now + timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%S")

    # Push local events
    local_result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.user_id == workspace_user_id(user),
            CalendarEvent.start_datetime >= now - timedelta(days=30),
        )
    )
    local_events = local_result.scalars().all()
    pushed = 0
    for ev in local_events:
        try:
            await sync_event_to_all_providers(ev, user, settings)
            pushed += 1
        except Exception:
            logger.exception("Failed to push event %s to Outlook", ev.id)

    # Pull Outlook events
    pulled = 0
    try:
        outlook_events = await outlook_list_events(access_token, start, end)
        existing_outlook_ids = {
            ev.outlook_event_id for ev in local_events if ev.outlook_event_id
        }
        for oev in outlook_events:
            if oev["id"] not in existing_outlook_ids:
                ostart = oev.get("start", {})
                oend = oev.get("end", {})
                start_dt = datetime.fromisoformat(ostart.get("dateTime", now.isoformat()))
                end_dt = datetime.fromisoformat(oend.get("dateTime", now.isoformat()))
                new_event = CalendarEvent(
                    user_id=workspace_user_id(user),
                    title=oev.get("subject", "Outlook Event"),
                    description=oev.get("body", {}).get("content", ""),
                    event_type="appointment",
                    start_datetime=start_dt,
                    end_datetime=end_dt,
                    all_day=oev.get("isAllDay", False),
                    location=oev.get("location", {}).get("displayName", ""),
                    outlook_event_id=oev["id"],
                    last_synced_at=now,
                )
                db.add(new_event)
                pulled += 1
    except Exception:
        logger.exception("Failed to pull events from Outlook")

    await db.commit()
    return {"pushed": pushed, "pulled": pulled}


@calendar_router.delete("/outlook/disconnect")
async def disconnect_outlook(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Outlook Calendar."""
    user.outlook_calendar_token = None
    user.outlook_calendar_id = None
    user.outlook_calendar_sync = False
    await db.commit()
    return {"disconnected": True}


# ═══════════════════════════════════════════════════════════════
# APPLE iCAL (CalDAV)
# ═══════════════════════════════════════════════════════════════


@calendar_router.post("/caldav/connect")
async def connect_caldav(
    body: CaldavConnectBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Connect Apple iCloud calendar via CalDAV."""
    try:
        result = await caldav_test_connection(
            body.username, body.password, body.calendar_url
        )
    except Exception as e:
        raise HTTPException(
            status_code=400, detail="Failed to connect to CalDAV server"
        ) from e

    if not result["connected"]:
        raise HTTPException(status_code=400, detail="CalDAV connection failed")

    user.caldav_username = body.username
    user.caldav_password_encrypted = _aes_encrypt(body.password, settings.jwt_secret)
    user.caldav_calendar_url = body.calendar_url
    user.caldav_sync = True
    await db.commit()
    return {"connected": True, "calendar_name": result["calendar_name"]}


@calendar_router.post("/caldav/sync")
async def sync_caldav(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sync upcoming events to iCloud."""
    if not user.caldav_sync:
        raise HTTPException(status_code=400, detail="CalDAV not connected")

    now = datetime.utcnow()
    result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.user_id == workspace_user_id(user),
            CalendarEvent.start_datetime >= now,
        )
    )
    events = result.scalars().all()

    synced = 0
    for ev in events:
        try:
            await sync_event_to_all_providers(ev, user, settings)
            synced += 1
        except Exception:
            logger.exception("Failed to sync event %s to CalDAV", ev.id)

    await db.commit()
    return {"synced": synced}


@calendar_router.delete("/caldav/disconnect")
async def disconnect_caldav(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Apple iCloud Calendar."""
    user.caldav_username = None
    user.caldav_password_encrypted = None
    user.caldav_calendar_url = None
    user.caldav_sync = False
    await db.commit()
    return {"disconnected": True}


# ═══════════════════════════════════════════════════════════════
# UNIVERSAL iCAL FEED (no auth)
# ═══════════════════════════════════════════════════════════════


@calendar_router.get("/feed/{ical_feed_token}.ics")
async def get_ical_feed(
    ical_feed_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Public .ics feed — token in URL is the auth."""
    result = await db.execute(
        select(User).where(User.ical_feed_token == ical_feed_token)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Feed not found")

    now = datetime.utcnow()
    events_result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.user_id == workspace_user_id(user),
            CalendarEvent.start_datetime >= now - timedelta(days=30),
        )
    )
    events = events_result.scalars().all()

    tasks_result = await db.execute(
        select(Task).where(
            Task.user_id == workspace_user_id(user),
            Task.status.notin_(["completed", "cancelled"]),
        )
    )
    tasks = tasks_result.scalars().all()

    ics_content = generate_ical_feed(events, tasks, user)
    return Response(
        content=ics_content,
        media_type="text/calendar",
        headers={
            "Content-Disposition": 'attachment; filename="reihub-calendar.ics"',
        },
    )


# ═══════════════════════════════════════════════════════════════
# TODAY SUMMARY
# ═══════════════════════════════════════════════════════════════


@calendar_router.get("/today")
async def get_today_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return today's tasks, events, and upcoming items."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    week_end = today_start + timedelta(days=7)

    # Tasks due today
    today_tasks_result = await db.execute(
        select(Task).where(
            Task.user_id == workspace_user_id(user),
            Task.status.notin_(["completed", "cancelled"]),
            Task.due_date >= today_start,
            Task.due_date < today_end,
        )
    )
    tasks_due_today = [_serialize_task(t) for t in today_tasks_result.scalars().all()]

    # Overdue tasks
    overdue_result = await db.execute(
        select(Task).where(
            Task.user_id == workspace_user_id(user),
            Task.status.notin_(["completed", "cancelled"]),
            Task.due_date < today_start,
            Task.due_date.isnot(None),
        )
    )
    tasks_overdue = [_serialize_task(t) for t in overdue_result.scalars().all()]

    # Events today
    today_events_result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.user_id == workspace_user_id(user),
            CalendarEvent.start_datetime >= today_start,
            CalendarEvent.start_datetime < today_end,
        )
    )
    events_today = [_serialize_event(e) for e in today_events_result.scalars().all()]

    # Upcoming closings (7 days)
    closing_result = await db.execute(
        select(CalendarEvent).where(
            CalendarEvent.user_id == workspace_user_id(user),
            CalendarEvent.event_type == "closing",
            CalendarEvent.start_datetime >= today_start,
            CalendarEvent.start_datetime < week_end,
        )
    )
    upcoming_closings = [_serialize_event(e) for e in closing_result.scalars().all()]

    # Expiring POF (tasks with pof_expiry type in next 24 hours)
    pof_result = await db.execute(
        select(Task).where(
            Task.user_id == workspace_user_id(user),
            Task.task_type == "pof_expiry",
            Task.status.notin_(["completed", "cancelled"]),
            Task.due_date >= today_start,
            Task.due_date < today_end,
        )
    )
    expiring_pof = [_serialize_task(t) for t in pof_result.scalars().all()]

    # Callbacks scheduled
    callback_result = await db.execute(
        select(Task).where(
            Task.user_id == workspace_user_id(user),
            Task.task_type == "callback",
            Task.status.notin_(["completed", "cancelled"]),
            Task.due_date >= today_start,
            Task.due_date < today_end,
        )
    )
    callbacks_scheduled = [_serialize_task(t) for t in callback_result.scalars().all()]

    return {
        "tasks_due_today": tasks_due_today,
        "tasks_overdue": tasks_overdue,
        "events_today": events_today,
        "upcoming_closings": upcoming_closings,
        "expiring_pof": expiring_pof,
        "callbacks_scheduled": callbacks_scheduled,
    }


# ═══════════════════════════════════════════════════════════════
# AUTO-TASK FUNCTIONS (importable, not routes)
# ═══════════════════════════════════════════════════════════════


async def auto_callback_task(
    db: AsyncSession,
    user_id: int,
    contact_id: str,
    call_log_id: str,
    scheduled_datetime: datetime,
    notes: Optional[str] = None,
) -> Task:
    """Create a callback task linked to a call log."""
    task = Task(
        user_id=user_id,
        title="Callback scheduled",
        description=notes or "Follow up on previous call",
        priority="high",
        due_date=scheduled_datetime,
        contact_id=contact_id,
        call_log_id=call_log_id,
        task_type="callback",
        reminder_minutes=30,
    )
    db.add(task)

    event = CalendarEvent(
        user_id=user_id,
        title="Callback",
        description=notes or "Follow up on previous call",
        event_type="callback",
        start_datetime=scheduled_datetime,
        end_datetime=scheduled_datetime + timedelta(minutes=30),
        contact_id=contact_id,
        task_id=task.id,
        reminder_minutes=30,
    )
    db.add(event)
    return task


async def auto_closing_task(
    db: AsyncSession,
    user_id: int,
    deal_id: str,
    contact_id: Optional[str],
    closing_date: datetime,
) -> Task:
    """Create a closing task linked to a deal."""
    task = Task(
        user_id=user_id,
        title="Closing date",
        description="Deal closing date",
        priority="urgent",
        due_date=closing_date,
        contact_id=contact_id,
        deal_id=deal_id,
        task_type="closing",
        reminder_minutes=1440,  # 24 hours
    )
    db.add(task)

    event = CalendarEvent(
        user_id=user_id,
        title="Closing",
        description="Deal closing date",
        event_type="closing",
        start_datetime=closing_date,
        end_datetime=closing_date + timedelta(hours=2),
        contact_id=contact_id,
        deal_id=deal_id,
        task_id=task.id,
        reminder_minutes=1440,
    )
    db.add(event)
    return task


async def auto_pof_expiry_task(
    db: AsyncSession,
    user_id: int,
    contact_id: Optional[str],
    deal_id: Optional[str],
    expires_at: datetime,
) -> Task:
    """Create a POF expiry reminder task."""
    task = Task(
        user_id=user_id,
        title="POF certificate expiring",
        description="Proof of Funds certificate is about to expire",
        priority="high",
        due_date=expires_at - timedelta(days=1),
        contact_id=contact_id,
        deal_id=deal_id,
        task_type="pof_expiry",
        reminder_minutes=1440,  # 24 hours
    )
    db.add(task)
    return task
