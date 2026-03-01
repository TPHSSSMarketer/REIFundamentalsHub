/**
 * Calendar & Task Management API service
 */

import { getCSRFHeaders } from '@/services/authApi'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function headers() {
  return {
    ...getCSRFHeaders(),
    'Content-Type': 'application/json',
  }
}

/* ── Demo mode helper ──────────────────────────────────────── */

function isDemoMode(): boolean {
  try {
    const stored = localStorage.getItem('rei-hub-demo-mode')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed?.state?.isDemoMode === true
    }
  } catch { /* ignore */ }
  return false
}

async function withDemoFallback<T>(apiFn: () => Promise<T>, demoData: T): Promise<T> {
  if (isDemoMode()) {
    try { return await apiFn() } catch { return demoData }
  }
  return apiFn()
}

/* ── Demo data generators ──────────────────────────────────── */

function demoDate(dayOffset: number, hour = 10, min = 0) {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, min, 0, 0)
  return d.toISOString()
}

function demoDueDate(dayOffset: number) {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  return d.toISOString().slice(0, 10)
}

const DEMO_TASKS = [
  { id: 'task-1', title: 'Call John Smith re: 123 Main St offer', description: 'Follow up on verbal offer, confirm price and timeline', status: 'pending', priority: 'urgent', due_date: demoDueDate(0), due_time: '10:00', contact_id: 'contact-1', deal_id: 'deal-1', task_type: 'call', is_recurring: false, reminder_minutes: 30 },
  { id: 'task-2', title: 'Schedule inspection — 456 Oak Ave', description: 'Home inspection before due diligence expires', status: 'pending', priority: 'high', due_date: demoDueDate(1), due_time: '14:00', contact_id: 'contact-2', deal_id: 'deal-2', task_type: 'inspection', is_recurring: false, reminder_minutes: 60 },
  { id: 'task-3', title: 'Send proof of funds to listing agent', description: 'Agent requested POF letter for 789 Pine Rd offer', status: 'pending', priority: 'high', due_date: demoDueDate(0), due_time: '15:00', deal_id: 'deal-3', task_type: 'document', is_recurring: false, reminder_minutes: 15 },
  { id: 'task-4', title: 'Review title report — 320 Elm Court', description: 'Title company sent preliminary report', status: 'in_progress', priority: 'medium', due_date: demoDueDate(2), due_time: '09:00', deal_id: 'deal-5', task_type: 'review', is_recurring: false, reminder_minutes: 60 },
  { id: 'task-5', title: 'Mail direct mail batch #14', description: 'Print and mail 200 yellow letters to absentee owners in 78201', status: 'pending', priority: 'medium', due_date: demoDueDate(3), due_time: '11:00', task_type: 'marketing', is_recurring: false },
  { id: 'task-6', title: 'Weekly pipeline review', description: 'Review all active deals, update stages, follow up on stale leads', status: 'pending', priority: 'low', due_date: demoDueDate(5), due_time: '08:00', task_type: 'admin', is_recurring: true, reminder_minutes: 15 },
  { id: 'task-7', title: 'Drive for dollars — Southside route', description: 'Drive through target neighborhood, log distressed properties', status: 'completed', priority: 'medium', due_date: demoDueDate(-1), due_time: '09:00', task_type: 'prospecting', is_recurring: false },
  { id: 'task-8', title: 'Submit insurance quote request', description: 'Get landlord policy quotes for 1842 Ridgewood Dr', status: 'completed', priority: 'high', due_date: demoDueDate(-2), due_time: '10:00', deal_id: 'deal-7', task_type: 'document', is_recurring: false },
]

const DEMO_EVENTS = [
  { id: 'evt-1', title: 'Property Walkthrough — 123 Main St', description: 'Meet John Smith at property', event_type: 'appointment', start_datetime: demoDate(0, 10, 0), end_datetime: demoDate(0, 11, 0), all_day: false, location: '123 Main St, San Antonio, TX', contact_id: 'contact-1', deal_id: 'deal-1' },
  { id: 'evt-2', title: 'Closing — 1842 Ridgewood Dr', description: 'Title company closing', event_type: 'closing', start_datetime: demoDate(1, 14, 0), end_datetime: demoDate(1, 15, 30), all_day: false, location: 'Alamo Title Company', deal_id: 'deal-7' },
  { id: 'evt-3', title: 'Follow up: Sarah Johnson', description: 'She asked for time to think about offer', event_type: 'follow_up', start_datetime: demoDate(2, 9, 0), end_datetime: demoDate(2, 9, 30), all_day: false, contact_id: 'contact-2' },
  { id: 'evt-4', title: 'Contractor walkthrough — rehab estimate', description: 'Get bids for 88 Magnolia Blvd renovation', event_type: 'appointment', start_datetime: demoDate(3, 11, 0), end_datetime: demoDate(3, 12, 0), all_day: false, location: '88 Magnolia Blvd, Jackson, MS', deal_id: 'deal-6' },
  { id: 'evt-5', title: 'REI Meetup — San Antonio Investors', description: 'Monthly networking event', event_type: 'reminder', start_datetime: demoDate(4, 18, 30), end_datetime: demoDate(4, 20, 30), all_day: false, location: 'Downtown Conference Center' },
  { id: 'evt-6', title: 'Inspection deadline — 456 Oak Ave', description: 'Option period expires', event_type: 'callback', start_datetime: demoDate(5, 0, 0), end_datetime: demoDate(5, 23, 59), all_day: true, deal_id: 'deal-2' },
  { id: 'evt-7', title: 'Bank meeting — negotiate note purchase', description: 'Meeting with community bank about NPL portfolio', event_type: 'appointment', start_datetime: demoDate(-1, 13, 0), end_datetime: demoDate(-1, 14, 0), all_day: false, location: 'First Community Bank' },
  { id: 'evt-8', title: 'Callback: Mike Williams', description: 'He wants a cash offer for Pine Rd property', event_type: 'callback', start_datetime: demoDate(0, 15, 0), end_datetime: demoDate(0, 15, 30), all_day: false, contact_id: 'contact-3', deal_id: 'deal-3' },
]

const DEMO_TODAY_SUMMARY = {
  tasks_today: 3,
  tasks_overdue: 0,
  events_today: 2,
  next_event: DEMO_EVENTS[0],
}

// ── Tasks ────────────────────────────────────────────────────────

export async function getTasks(filters?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const params = new URLSearchParams(filters || {})
      const res = await fetch(`${BASE_URL}/api/calendar/tasks?${params}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch tasks')
      return res.json()
    },
    { tasks: DEMO_TASKS, total: DEMO_TASKS.length }
  )
}

export async function createTask(data: Record<string, any>) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/tasks`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(data),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to create task')
      return res.json()
    },
    { ...data, id: `task-${Date.now()}`, status: 'pending' }
  )
}

export async function updateTask(id: string, data: Record<string, any>) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/tasks/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(data),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to update task')
      return res.json()
    },
    { ok: true }
  )
}

export async function completeTask(id: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/tasks/${id}/complete`, {
        method: 'POST',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to complete task')
      return res.json()
    },
    { ok: true }
  )
}

export async function deleteTask(id: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/tasks/${id}`, {
        method: 'DELETE',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to delete task')
      return res.json()
    },
    { ok: true }
  )
}

// ── Events ───────────────────────────────────────────────────────

export async function getEvents(start: string, end: string) {
  return withDemoFallback(
    async () => {
      const params = new URLSearchParams({ start, end })
      const res = await fetch(`${BASE_URL}/api/calendar/events?${params}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch events')
      return res.json()
    },
    { events: DEMO_EVENTS }
  )
}

export async function createEvent(data: Record<string, any>) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/events`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(data),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to create event')
      return res.json()
    },
    { ...data, id: `evt-${Date.now()}` }
  )
}

export async function updateEvent(id: string, data: Record<string, any>) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/events/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify(data),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to update event')
      return res.json()
    },
    { ok: true }
  )
}

export async function deleteEvent(id: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/events/${id}`, {
        method: 'DELETE',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to delete event')
      return res.json()
    },
    { ok: true }
  )
}

// ── Google Calendar ──────────────────────────────────────────────

export async function getGoogleAuthUrl() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/google/auth-url`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to get Google auth URL')
      return res.json()
    },
    { url: '#demo-google-auth' }
  )
}

export async function connectGoogle(code: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/google/callback`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ code }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to connect Google Calendar')
      return res.json()
    },
    { ok: true }
  )
}

export async function syncGoogle() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/google/sync`, {
        method: 'POST',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to sync Google Calendar')
      return res.json()
    },
    { ok: true, synced: 5 }
  )
}

export async function disconnectGoogle() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/google/disconnect`, {
        method: 'DELETE',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to disconnect Google Calendar')
      return res.json()
    },
    { ok: true }
  )
}

// ── Microsoft Outlook ────────────────────────────────────────────

export async function getOutlookAuthUrl() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/outlook/auth-url`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to get Outlook auth URL')
      return res.json()
    },
    { url: '#demo-outlook-auth' }
  )
}

export async function connectOutlook(code: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/outlook/callback`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ code }),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to connect Outlook Calendar')
      return res.json()
    },
    { ok: true }
  )
}

export async function syncOutlook() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/outlook/sync`, {
        method: 'POST',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to sync Outlook Calendar')
      return res.json()
    },
    { ok: true, synced: 3 }
  )
}

export async function disconnectOutlook() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/outlook/disconnect`, {
        method: 'DELETE',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to disconnect Outlook Calendar')
      return res.json()
    },
    { ok: true }
  )
}

// ── Apple iCal (CalDAV) ──────────────────────────────────────────

export async function connectCaldav(
  data: { username: string; password: string; calendar_url?: string },
) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/caldav/connect`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(data),
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to connect Apple Calendar')
      return res.json()
    },
    { ok: true }
  )
}

export async function syncCaldav() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/caldav/sync`, {
        method: 'POST',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to sync Apple Calendar')
      return res.json()
    },
    { ok: true, synced: 2 }
  )
}

export async function disconnectCaldav() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/caldav/disconnect`, {
        method: 'DELETE',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to disconnect Apple Calendar')
      return res.json()
    },
    { ok: true }
  )
}

// ── iCal Feed ────────────────────────────────────────────────────

export function getIcalFeedUrl(feedToken: string) {
  return `${BASE_URL}/api/calendar/feed/${feedToken}.ics`
}

// ── Today Summary ────────────────────────────────────────────────

export async function getTodaySummary() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/calendar/today`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error('Failed to fetch today summary')
      return res.json()
    },
    DEMO_TODAY_SUMMARY
  )
}
