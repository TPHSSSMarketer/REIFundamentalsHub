import { getCSRFHeaders } from '@/services/authApi'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

/* ── Types ─────────────────────────────────────────────────────── */

export interface TeamMember {
  id: number
  email: string
  full_name: string | null
  joined_at: string
}

export interface SeatInfo {
  plan: string
  max_seats: number
  seats_used: number
  seats_remaining: number
}

export interface PendingInvite {
  id: number
  email: string
  status: string
  created_at: string
  expires_at: string
}

export interface InviteValidation {
  valid: boolean
  email: string
  owner_email: string
  owner_name: string | null
  expires_at: string
}

/* ── Helpers ───────────────────────────────────────────────────── */

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json()

  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment before trying again.')
  }
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Your session has expired. Please log in again.')
  }
  if (res.status === 403) {
    throw new Error("You don't have permission to perform this action.")
  }

  const body = await res.json().catch(() => ({}))
  if (res.status === 422) {
    const detail = body.detail
    if (Array.isArray(detail)) {
      throw new Error(detail.map((d: any) => d.msg).join(', '))
    }
    throw new Error(detail ?? 'Validation error')
  }
  throw new Error(body.detail ?? 'Request failed')
}

/* ── API Functions ─────────────────────────────────────────────── */

/** List team members (owner only) */
export async function getTeamMembers(): Promise<{ members: TeamMember[]; seats: SeatInfo }> {
  const res = await fetch(`${BASE_URL}/api/team/members`, {
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get seat capacity info */
export async function getSeatInfo(): Promise<SeatInfo> {
  const res = await fetch(`${BASE_URL}/api/team/seats`, {
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Send an invite email */
export async function sendInvite(email: string): Promise<{ message: string; invitation_id: number }> {
  const res = await fetch(`${BASE_URL}/api/team/invite`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getCSRFHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })
  return handleResponse(res)
}

/** Validate an invite token (public — no auth needed) */
export async function validateInvite(token: string): Promise<InviteValidation> {
  const res = await fetch(`${BASE_URL}/api/team/invite/${token}`)
  return handleResponse(res)
}

/** Accept an invite and create account (public — no auth needed) */
export async function acceptInvite(
  token: string,
  email: string,
  full_name: string,
  password: string
): Promise<{ message: string; user_id: number; email: string }> {
  const res = await fetch(`${BASE_URL}/api/team/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ token, email, full_name, password }),
  })
  return handleResponse(res)
}

/** Remove a team member (owner only) */
export async function removeMember(memberId: number): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/api/team/members/${memberId}`, {
    method: 'DELETE',
    headers: getCSRFHeaders(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** List pending invitations (owner only) */
export async function getPendingInvites(): Promise<{ invitations: PendingInvite[] }> {
  const res = await fetch(`${BASE_URL}/api/team/pending`, {
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Cancel a pending invitation (owner only) */
export async function cancelInvite(invitationId: number): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/api/team/invite/${invitationId}`, {
    method: 'DELETE',
    headers: getCSRFHeaders(),
    credentials: 'include',
  })
  return handleResponse(res)
}
