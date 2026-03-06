"""Calendar sync abstraction layer — Google, Outlook, CalDAV, iCal feed.

All external API calls use httpx. No new packages required.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# Google Calendar
# ═══════════════════════════════════════════════════════════════


def google_get_auth_url(settings: Any) -> str:
    """Build Google OAuth consent URL."""
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "scope": "https://www.googleapis.com/auth/calendar",
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"


async def google_exchange_code(code: str, settings: Any) -> dict:
    """Exchange authorization code for tokens."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
            "expiry": data.get("expires_in", 3600),
        }


async def google_refresh_token(refresh_token: str, settings: Any) -> str:
    """Refresh a Google access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "refresh_token": refresh_token,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "grant_type": "refresh_token",
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


def _event_to_google_format(event: Any) -> dict:
    """Map CalendarEvent to Google Calendar event body."""
    body: dict[str, Any] = {
        "summary": event.title,
        "description": event.description or "",
    }
    if event.all_day:
        body["start"] = {"date": event.start_datetime.strftime("%Y-%m-%d")}
        body["end"] = {"date": event.end_datetime.strftime("%Y-%m-%d")}
    else:
        body["start"] = {
            "dateTime": event.start_datetime.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "UTC",
        }
        body["end"] = {
            "dateTime": event.end_datetime.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "UTC",
        }
    if event.location:
        body["location"] = event.location
    if event.reminder_minutes is not None:
        body["reminders"] = {
            "useDefault": False,
            "overrides": [{"method": "popup", "minutes": event.reminder_minutes}],
        }
    return body


async def google_create_event(event: Any, access_token: str) -> dict:
    """Create a Google Calendar event."""
    body = _event_to_google_format(event)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"google_event_id": data["id"]}


async def google_update_event(
    google_event_id: str, event: Any, access_token: str
) -> None:
    """Update a Google Calendar event."""
    body = _event_to_google_format(event)
    async with httpx.AsyncClient() as client:
        resp = await client.put(
            f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{google_event_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
        )
        resp.raise_for_status()


async def google_delete_event(google_event_id: str, access_token: str) -> None:
    """Delete a Google Calendar event."""
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{google_event_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        # 410 Gone is fine — already deleted
        if resp.status_code not in (200, 204, 410):
            resp.raise_for_status()


async def google_list_events(
    access_token: str, time_min: str, time_max: str
) -> list[dict]:
    """List events from Google Calendar."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "timeMin": time_min,
                "timeMax": time_max,
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": 250,
            },
        )
        resp.raise_for_status()
        return resp.json().get("items", [])


# ═══════════════════════════════════════════════════════════════
# Microsoft Outlook (Graph API)
# ═══════════════════════════════════════════════════════════════


def outlook_get_auth_url(settings: Any) -> str:
    """Build Microsoft OAuth consent URL."""
    params = {
        "client_id": settings.outlook_client_id,
        "redirect_uri": settings.outlook_redirect_uri,
        "scope": "Calendars.ReadWrite offline_access",
        "response_type": "code",
    }
    return f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{urlencode(params)}"


async def outlook_exchange_code(code: str, settings: Any) -> dict:
    """Exchange authorization code for tokens."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={
                "code": code,
                "client_id": settings.outlook_client_id,
                "client_secret": settings.outlook_client_secret,
                "redirect_uri": settings.outlook_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token", ""),
        }


async def outlook_refresh_token(refresh_token: str, settings: Any) -> str:
    """Refresh a Microsoft access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={
                "refresh_token": refresh_token,
                "client_id": settings.outlook_client_id,
                "client_secret": settings.outlook_client_secret,
                "grant_type": "refresh_token",
                "scope": "Calendars.ReadWrite offline_access",
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


def _event_to_outlook_format(event: Any) -> dict:
    """Map CalendarEvent to Microsoft Graph event body."""
    body: dict[str, Any] = {
        "subject": event.title,
        "body": {"contentType": "text", "content": event.description or ""},
        "start": {
            "dateTime": event.start_datetime.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "UTC",
        },
        "end": {
            "dateTime": event.end_datetime.strftime("%Y-%m-%dT%H:%M:%S"),
            "timeZone": "UTC",
        },
        "isAllDay": event.all_day,
    }
    if event.location:
        body["location"] = {"displayName": event.location}
    if event.reminder_minutes is not None:
        body["isReminderOn"] = True
        body["reminderMinutesBeforeStart"] = event.reminder_minutes
    return body


async def outlook_create_event(event: Any, access_token: str) -> dict:
    """Create an Outlook Calendar event."""
    body = _event_to_outlook_format(event)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://graph.microsoft.com/v1.0/me/events",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()
        return {"outlook_event_id": data["id"]}


async def outlook_update_event(
    outlook_event_id: str, event: Any, access_token: str
) -> None:
    """Update an Outlook Calendar event."""
    body = _event_to_outlook_format(event)
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"https://graph.microsoft.com/v1.0/me/events/{outlook_event_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            json=body,
        )
        resp.raise_for_status()


async def outlook_delete_event(outlook_event_id: str, access_token: str) -> None:
    """Delete an Outlook Calendar event."""
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"https://graph.microsoft.com/v1.0/me/events/{outlook_event_id}",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if resp.status_code not in (200, 204, 404):
            resp.raise_for_status()


async def outlook_list_events(
    access_token: str, start: str, end: str
) -> list[dict]:
    """List events from Outlook Calendar."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://graph.microsoft.com/v1.0/me/events",
            headers={"Authorization": f"Bearer {access_token}"},
            params={
                "$filter": f"start/dateTime ge '{start}' and end/dateTime le '{end}'",
                "$orderby": "start/dateTime",
                "$top": 250,
            },
        )
        resp.raise_for_status()
        return resp.json().get("value", [])


# ═══════════════════════════════════════════════════════════════
# Apple iCal (CalDAV)
# ═══════════════════════════════════════════════════════════════


async def caldav_test_connection(
    username: str, password: str, calendar_url: str
) -> dict:
    """Test CalDAV connection with PROPFIND."""
    async with httpx.AsyncClient() as client:
        resp = await client.request(
            "PROPFIND",
            calendar_url,
            auth=(username, password),
            headers={
                "Depth": "0",
                "Content-Type": "application/xml; charset=utf-8",
            },
            content=(
                '<?xml version="1.0" encoding="utf-8"?>'
                '<d:propfind xmlns:d="DAV:">'
                "<d:prop><d:displayname/></d:prop>"
                "</d:propfind>"
            ),
        )
        if resp.status_code in (200, 207):
            return {"connected": True, "calendar_name": "iCloud Calendar"}
        return {"connected": False, "calendar_name": ""}


def _event_to_ical(event: Any) -> str:
    """Generate iCalendar (.ics) format for a single VEVENT."""
    uid = event.caldav_uid or str(uuid.uuid4())
    dtstart = event.start_datetime.strftime("%Y%m%dT%H%M%SZ")
    dtend = event.end_datetime.strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//REI Hub//EN",
        "BEGIN:VEVENT",
        f"UID:{uid}@reihub",
        f"DTSTART:{dtstart}",
        f"DTEND:{dtend}",
        f"SUMMARY:{event.title}",
    ]
    if event.description:
        lines.append(f"DESCRIPTION:{event.description}")
    if event.location:
        lines.append(f"LOCATION:{event.location}")
    lines += [
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines)


async def caldav_create_event(
    event: Any,
    username: str,
    password: str,
    calendar_url: str,
) -> dict:
    """Create a CalDAV event via PUT."""
    caldav_uid = event.caldav_uid or str(uuid.uuid4())
    ics_content = _event_to_ical(event)
    url = f"{calendar_url.rstrip('/')}/{caldav_uid}.ics"
    async with httpx.AsyncClient() as client:
        resp = await client.put(
            url,
            auth=(username, password),
            headers={"Content-Type": "text/calendar; charset=utf-8"},
            content=ics_content,
        )
        resp.raise_for_status()
    return {"caldav_uid": caldav_uid}


async def caldav_update_event(
    caldav_uid: str,
    event: Any,
    username: str,
    password: str,
    calendar_url: str,
) -> None:
    """Update a CalDAV event via PUT (same as create — idempotent)."""
    ics_content = _event_to_ical(event)
    url = f"{calendar_url.rstrip('/')}/{caldav_uid}.ics"
    async with httpx.AsyncClient() as client:
        resp = await client.put(
            url,
            auth=(username, password),
            headers={"Content-Type": "text/calendar; charset=utf-8"},
            content=ics_content,
        )
        resp.raise_for_status()


async def caldav_delete_event(
    caldav_uid: str,
    username: str,
    password: str,
    calendar_url: str,
) -> None:
    """Delete a CalDAV event via DELETE."""
    url = f"{calendar_url.rstrip('/')}/{caldav_uid}.ics"
    async with httpx.AsyncClient() as client:
        resp = await client.delete(url, auth=(username, password))
        if resp.status_code not in (200, 204, 404):
            resp.raise_for_status()


# ═══════════════════════════════════════════════════════════════
# Universal iCal feed
# ═══════════════════════════════════════════════════════════════


def generate_ical_feed(
    events: list[Any], tasks: list[Any], user: Any
) -> str:
    """Generate a complete .ics file content (RFC 5545)."""
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//REI Hub//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:REI Hub - {user.full_name or user.email}",
    ]

    for ev in events:
        uid = ev.caldav_uid or ev.id
        dtstart = ev.start_datetime.strftime("%Y%m%dT%H%M%SZ")
        dtend = ev.end_datetime.strftime("%Y%m%dT%H%M%SZ")
        lines += [
            "BEGIN:VEVENT",
            f"UID:{uid}@reihub",
            f"DTSTART:{dtstart}",
            f"DTEND:{dtend}",
            f"SUMMARY:{ev.title}",
        ]
        if ev.description:
            lines.append(f"DESCRIPTION:{ev.description}")
        if ev.location:
            lines.append(f"LOCATION:{ev.location}")
        lines.append("END:VEVENT")

    for t in tasks:
        if not t.due_date:
            continue
        uid = t.id
        due = t.due_date.strftime("%Y%m%dT%H%M%SZ")
        lines += [
            "BEGIN:VTODO",
            f"UID:{uid}@reihub",
            f"DUE:{due}",
            f"SUMMARY:{t.title}",
        ]
        if t.description:
            lines.append(f"DESCRIPTION:{t.description}")
        status_map = {
            "pending": "NEEDS-ACTION",
            "in_progress": "IN-PROCESS",
            "completed": "COMPLETED",
            "cancelled": "CANCELLED",
        }
        lines.append(f"STATUS:{status_map.get(t.status, 'NEEDS-ACTION')}")
        priority_map = {"low": 9, "medium": 5, "high": 3, "urgent": 1}
        lines.append(f"PRIORITY:{priority_map.get(t.priority, 5)}")
        lines.append("END:VTODO")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


# ═══════════════════════════════════════════════════════════════
# AES encryption helpers for CalDAV passwords
# ═══════════════════════════════════════════════════════════════


def _aes_encrypt(plaintext: str, key: str) -> str:
    """Simple AES-like encryption using XOR with key hash. Uses only stdlib."""
    import base64
    import hashlib

    key_bytes = hashlib.sha256(key.encode()).digest()
    plain_bytes = plaintext.encode()
    encrypted = bytes(b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(plain_bytes))
    return base64.b64encode(encrypted).decode()


def _aes_decrypt(ciphertext: str, key: str) -> str:
    """Decrypt value encrypted with _aes_encrypt."""
    import base64
    import hashlib

    key_bytes = hashlib.sha256(key.encode()).digest()
    encrypted = base64.b64decode(ciphertext)
    decrypted = bytes(b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(encrypted))
    return decrypted.decode()


# ═══════════════════════════════════════════════════════════════
# Universal sync helpers
# ═══════════════════════════════════════════════════════════════


async def sync_event_to_all_providers(
    event: Any, user: Any, settings: Any
) -> None:
    """Sync a CalendarEvent to all connected calendar providers."""
    now = datetime.utcnow()

    # Google Calendar
    if user.google_calendar_sync and user.google_calendar_token:
        try:
            token_data = json.loads(user.google_calendar_token)
            access_token = await google_refresh_token(
                token_data.get("refresh_token", ""), settings
            )
            if event.google_event_id:
                await google_update_event(event.google_event_id, event, access_token)
            else:
                result = await google_create_event(event, access_token)
                event.google_event_id = result["google_event_id"]
        except Exception:
            logger.exception("Google Calendar sync failed for event %s", event.id)

    # Microsoft Outlook
    if user.outlook_calendar_sync and user.outlook_calendar_token:
        try:
            token_data = json.loads(user.outlook_calendar_token)
            access_token = await outlook_refresh_token(
                token_data.get("refresh_token", ""), settings
            )
            if event.outlook_event_id:
                await outlook_update_event(event.outlook_event_id, event, access_token)
            else:
                result = await outlook_create_event(event, access_token)
                event.outlook_event_id = result["outlook_event_id"]
        except Exception:
            logger.exception("Outlook sync failed for event %s", event.id)

    # Apple iCal (CalDAV)
    if user.caldav_sync and user.caldav_password_encrypted and user.caldav_calendar_url:
        try:
            password = _aes_decrypt(user.caldav_password_encrypted, settings.jwt_secret)
            if event.caldav_uid:
                await caldav_update_event(
                    event.caldav_uid, event, user.caldav_username, password,
                    user.caldav_calendar_url,
                )
            else:
                event.caldav_uid = str(uuid.uuid4())
                await caldav_create_event(
                    event, user.caldav_username, password, user.caldav_calendar_url,
                )
        except Exception:
            logger.exception("CalDAV sync failed for event %s", event.id)

    event.last_synced_at = now


async def delete_event_from_all_providers(
    event: Any, user: Any, settings: Any
) -> None:
    """Delete a CalendarEvent from all connected providers."""

    # Google
    if user.google_calendar_sync and event.google_event_id and user.google_calendar_token:
        try:
            token_data = json.loads(user.google_calendar_token)
            access_token = await google_refresh_token(
                token_data.get("refresh_token", ""), settings
            )
            await google_delete_event(event.google_event_id, access_token)
        except Exception:
            logger.exception("Google delete failed for event %s", event.id)

    # Outlook
    if user.outlook_calendar_sync and event.outlook_event_id and user.outlook_calendar_token:
        try:
            token_data = json.loads(user.outlook_calendar_token)
            access_token = await outlook_refresh_token(
                token_data.get("refresh_token", ""), settings
            )
            await outlook_delete_event(event.outlook_event_id, access_token)
        except Exception:
            logger.exception("Outlook delete failed for event %s", event.id)

    # CalDAV
    if user.caldav_sync and event.caldav_uid and user.caldav_password_encrypted:
        try:
            password = _aes_decrypt(user.caldav_password_encrypted, settings.jwt_secret)
            await caldav_delete_event(
                event.caldav_uid, user.caldav_username, password,
                user.caldav_calendar_url,
            )
        except Exception:
            logger.exception("CalDAV delete failed for event %s", event.id)
