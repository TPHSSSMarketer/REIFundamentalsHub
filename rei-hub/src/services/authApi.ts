/**
 * Auth API service — low-level HTTP calls to the REI Hub backend.
 *
 * All requests include `credentials: 'include'` so the browser automatically
 * sends and receives HttpOnly cookies (access_token, refresh_token).
 *
 * The CSRF token lives in a non-HttpOnly cookie so JS can read it.
 * State-changing requests (POST, PUT, DELETE, PATCH) must include an
 * X-CSRF-Token header whose value matches the csrf_token cookie.
 */

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string
  token_type: string
  user_id: number
  email: string
  plan: string | null
}

interface UserResponse {
  id: number
  email: string
  full_name: string | null
  is_active: boolean
  is_verified: boolean
  plan: string | null
  is_superadmin?: boolean
  loan_servicing_enabled?: boolean
  loan_servicing_onboarding_complete?: boolean
  bank_negotiation_enabled?: boolean
  company_name?: string | null
  plaid_linked_at?: string | null
}

// ── Cookie helper ────────────────────────────────────────────────

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() ?? null
  return null
}

/**
 * Read the CSRF token from the csrf_token cookie and return it as a header object.
 * Called automatically before state-changing requests.
 */
export function getCSRFHeaders(): Record<string, string> {
  const csrfToken = getCookie('csrf_token')
  if (!csrfToken) return {}
  return { 'X-CSRF-Token': csrfToken }
}

// ── Response handler ─────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json()

  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment before trying again.')
  }
  if (res.status === 401) {
    // Session expired — redirect to login (cookies will be cleared by backend on next refresh attempt)
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

// ── Auth API calls ───────────────────────────────────────────────

export async function register(
  email: string,
  password: string,
  fullName?: string
): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: fullName || null }),
    credentials: 'include',
  })
  return handleResponse<TokenResponse>(res)
}

export async function login(email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  })
  return handleResponse<TokenResponse>(res)
}

export async function getMe(): Promise<UserResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    credentials: 'include',
  })
  return handleResponse<UserResponse>(res)
}

export async function refreshToken(): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  })
  return handleResponse<TokenResponse>(res)
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { ...getCSRFHeaders() },
      credentials: 'include',
    })
  } catch (error) {
    console.warn('Logout request failed:', error)
  }
}
