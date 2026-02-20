/**
 * Authentication service — real JWT auth against FastAPI backend.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001'
const TOKEN_KEY = 'rei_token'

// ── Auth API calls ─────────────────────────────────────────────

export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { success: false, error: body.detail ?? 'Login failed' }
    }
    const data = await res.json()
    localStorage.setItem(TOKEN_KEY, data.access_token)
    return { success: true }
  } catch {
    return { success: false, error: 'Network error — please try again' }
  }
}

export async function register(
  email: string,
  password: string,
  name?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: name || null }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { success: false, error: body.detail ?? 'Registration failed' }
    }
    const data = await res.json()
    localStorage.setItem(TOKEN_KEY, data.access_token)
    return { success: true }
  } catch {
    return { success: false, error: 'Network error — please try again' }
  }
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
  window.location.href = '/login'
}

// ── Token utilities ────────────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function isAuthenticated(): boolean {
  const token = getToken()
  if (!token) return false

  try {
    // Decode JWT payload (base64url → JSON)
    const parts = token.split('.')
    if (parts.length !== 3) return false

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    )

    // Check expiration
    if (typeof payload.exp === 'number') {
      return payload.exp > Date.now() / 1000
    }

    // No exp claim — treat as valid
    return true
  } catch {
    return false
  }
}

export function getAuthHeader(): Record<string, string> {
  const token = getToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// ── Config utilities (kept for Settings/ConnectionTest) ────────

export function isApiKeyConfigured(): boolean {
  return !!import.meta.env.VITE_API_KEY
}

export function isLocationConfigured(): boolean {
  return !!import.meta.env.VITE_API_LOCATION_ID
}

export function getConfigStatus(): {
  hasApiKey: boolean
  hasLocationId: boolean
  isFullyConfigured: boolean
} {
  const hasApiKey = isApiKeyConfigured()
  const hasLocationId = isLocationConfigured()

  return {
    hasApiKey,
    hasLocationId,
    isFullyConfigured: hasApiKey && hasLocationId,
  }
}

export function setStoredLocationId(locationId: string): void {
  localStorage.setItem('rei_location_id', locationId)
}

export function getStoredLocationId(): string | null {
  return localStorage.getItem('rei_location_id')
}

export function clearStoredLocationId(): void {
  localStorage.removeItem('rei_location_id')
}
