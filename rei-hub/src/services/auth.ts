// NOTE: authApi.ts is the canonical API service.
// This file wraps it for backward compatibility.

/**
 * Authentication service — delegates to authApi.ts for network calls.
 */
import * as authApi from './authApi'

export { getMe } from './authApi'

// Note: Using localStorage for token persistence across browser tabs.
// For higher-security environments, consider switching to sessionStorage (single tab only).
// Current choice allows seamless multi-tab experience for CRM workflows.
const TOKEN_KEY = 'rei_token'

// ── Auth API calls (delegate to authApi.ts) ─────────────────────

export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await authApi.login(email, password)
    localStorage.setItem(TOKEN_KEY, data.access_token)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Login failed' }
  }
}

export async function register(
  email: string,
  password: string,
  name?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await authApi.register(email, password, name)
    localStorage.setItem(TOKEN_KEY, data.access_token)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Registration failed' }
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
    const parts = token.split('.')
    if (parts.length !== 3) return false

    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    )

    if (typeof payload.exp === 'number') {
      return payload.exp > Date.now() / 1000
    }
    return true
  } catch {
    return false
  }
}

/**
 * Check if the current JWT token is expired or about to expire.
 * If within 5 minutes of expiry, attempt a background refresh.
 * If already expired and refresh fails, clear auth state and redirect.
 */
let _refreshing: Promise<void> | null = null
const REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutes before expiry

function checkTokenExpiry(): void {
  const token = getToken()
  if (!token) return

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    )
    if (typeof payload.exp !== 'number') return

    const expiresAtMs = payload.exp * 1000
    const now = Date.now()

    if (expiresAtMs < now) {
      // Token already expired — try refresh, fallback to logout
      if (!_refreshing) {
        _refreshing = tryRefreshToken(token).finally(() => { _refreshing = null })
      }
    } else if (expiresAtMs - now < REFRESH_BUFFER_MS) {
      // Token expiring soon — proactively refresh in background
      if (!_refreshing) {
        _refreshing = tryRefreshToken(token).finally(() => { _refreshing = null })
      }
    }
  } catch {
    // Malformed token — don't redirect mid-session, let API call handle it
  }
}

async function tryRefreshToken(currentToken: string): Promise<void> {
  try {
    const data = await authApi.refreshToken(currentToken)
    localStorage.setItem(TOKEN_KEY, data.access_token)
  } catch {
    // Refresh failed — force logout
    localStorage.removeItem(TOKEN_KEY)
    window.location.href = '/login'
  }
}

export function getAuthHeader(): Record<string, string> {
  checkTokenExpiry()
  const token = getToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// ── Current user (delegate to authApi.ts) ─────────────────────

export async function getCurrentUser(): Promise<Record<string, unknown> | null> {
  const token = getToken()
  if (!token) return null
  try {
    return await authApi.getMe(token)
  } catch {
    return null
  }
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
