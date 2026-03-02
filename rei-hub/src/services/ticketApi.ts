/**
 * Help Ticket API Service
 *
 * Handles all frontend communication with the help ticket backend endpoints.
 * Uses the same auth pattern as phoneApi.ts / voiceAiApi.ts.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────────

export interface Ticket {
  id: string
  subject: string
  description?: string
  category: string
  priority: string
  status: string
  admin_notes?: string | null
  related_resource_type?: string | null
  related_resource_id?: string | null
  user_id?: number
  user_name?: string
  user_email?: string
  resolved_at?: string | null
  created_at: string
  updated_at?: string | null
}

export interface CreateTicketPayload {
  subject: string
  description: string
  category: string
  priority: string
  related_resource_type?: string
  related_resource_id?: string
}

export interface TicketStats {
  open: number
  in_progress: number
  waiting_on_user: number
  resolved: number
  closed: number
  total: number
}

// ── Helpers ────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

// ── User Endpoints ─────────────────────────────────────────────────────

/** Submit a new help ticket. */
export async function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  const res = await fetch(`${BASE_URL}/api/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** List the current user's tickets. */
export async function listMyTickets(status?: string): Promise<Ticket[]> {
  const url = new URL(`${BASE_URL}/api/tickets`)
  if (status) url.searchParams.set('status', status)
  const res = await fetch(url.toString(), {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get full details of a specific ticket. */
export async function getTicket(ticketId: string): Promise<Ticket> {
  const res = await fetch(`${BASE_URL}/api/tickets/${ticketId}`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

// ── Admin Endpoints ────────────────────────────────────────────────────

/** List ALL tickets across all users (admin only). */
export async function listAllTickets(
  status?: string,
  priority?: string,
): Promise<Ticket[]> {
  const url = new URL(`${BASE_URL}/api/tickets/admin/all`)
  if (status) url.searchParams.set('status', status)
  if (priority) url.searchParams.set('priority', priority)
  const res = await fetch(url.toString(), {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get ticket stats (admin only). */
export async function getTicketStats(): Promise<TicketStats> {
  const res = await fetch(`${BASE_URL}/api/tickets/admin/stats`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Update a ticket (admin only). */
export async function adminUpdateTicket(
  ticketId: string,
  updates: { status?: string; priority?: string; admin_notes?: string },
): Promise<Ticket> {
  const res = await fetch(`${BASE_URL}/api/tickets/admin/${ticketId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(updates),
    credentials: 'include',
  })
  return handleResponse(res)
}
