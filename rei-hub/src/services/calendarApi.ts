/**
 * Calendar & Task Management API service
 */

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

// ── Tasks ────────────────────────────────────────────────────────

export async function getTasks(
  filters?: Record<string, string>,
  token?: string
) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/calendar/tasks?${params}`, {
    headers: authHeaders(token || ''),
  })
  if (!res.ok) throw new Error('Failed to fetch tasks')
  return res.json()
}

export async function createTask(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/tasks`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create task')
  return res.json()
}

export async function updateTask(
  id: string,
  data: Record<string, any>,
  token: string
) {
  const res = await fetch(`${BASE_URL}/api/calendar/tasks/${id}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update task')
  return res.json()
}

export async function completeTask(id: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/tasks/${id}/complete`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to complete task')
  return res.json()
}

export async function deleteTask(id: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/tasks/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to delete task')
  return res.json()
}

// ── Events ───────────────────────────────────────────────────────

export async function getEvents(start: string, end: string, token: string) {
  const params = new URLSearchParams({ start, end })
  const res = await fetch(`${BASE_URL}/api/calendar/events?${params}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch events')
  return res.json()
}

export async function createEvent(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/events`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create event')
  return res.json()
}

export async function updateEvent(
  id: string,
  data: Record<string, any>,
  token: string
) {
  const res = await fetch(`${BASE_URL}/api/calendar/events/${id}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update event')
  return res.json()
}

export async function deleteEvent(id: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/events/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to delete event')
  return res.json()
}

// ── Google Calendar ──────────────────────────────────────────────

export async function getGoogleAuthUrl(token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/google/auth-url`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to get Google auth URL')
  return res.json()
}

export async function connectGoogle(code: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/google/callback`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ code }),
  })
  if (!res.ok) throw new Error('Failed to connect Google Calendar')
  return res.json()
}

export async function syncGoogle(token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/google/sync`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to sync Google Calendar')
  return res.json()
}

export async function disconnectGoogle(token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/google/disconnect`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to disconnect Google Calendar')
  return res.json()
}

// ── Microsoft Outlook ────────────────────────────────────────────

export async function getOutlookAuthUrl(token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/outlook/auth-url`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to get Outlook auth URL')
  return res.json()
}

export async function connectOutlook(code: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/outlook/callback`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ code }),
  })
  if (!res.ok) throw new Error('Failed to connect Outlook Calendar')
  return res.json()
}

export async function syncOutlook(token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/outlook/sync`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to sync Outlook Calendar')
  return res.json()
}

export async function disconnectOutlook(token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/outlook/disconnect`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to disconnect Outlook Calendar')
  return res.json()
}

// ── Apple iCal (CalDAV) ──────────────────────────────────────────

export async function connectCaldav(
  data: { username: string; password: string; calendar_url?: string },
  token: string
) {
  const res = await fetch(`${BASE_URL}/api/calendar/caldav/connect`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to connect Apple Calendar')
  return res.json()
}

export async function syncCaldav(token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/caldav/sync`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to sync Apple Calendar')
  return res.json()
}

export async function disconnectCaldav(token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/caldav/disconnect`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to disconnect Apple Calendar')
  return res.json()
}

// ── iCal Feed ────────────────────────────────────────────────────

export function getIcalFeedUrl(feedToken: string) {
  return `${BASE_URL}/api/calendar/feed/${feedToken}.ics`
}

// ── Today Summary ────────────────────────────────────────────────

export async function getTodaySummary(token: string) {
  const res = await fetch(`${BASE_URL}/api/calendar/today`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch today summary')
  return res.json()
}
