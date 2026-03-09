/**
 * Shared authenticated fetch wrapper with automatic token refresh.
 *
 * When a request gets a 401 Unauthorized, this automatically tries to
 * refresh the access token and retry the request once. If refresh also
 * fails, the user is redirected to the login page.
 *
 * Usage:
 *   import { fetchWithAuth } from '@/services/fetchWithAuth'
 *   const data = await fetchWithAuth<MyType>('/api/something')
 */

import { getCSRFHeaders, refreshToken } from './authApi'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// Deduplicate concurrent refresh calls so multiple 401s don't trigger
// multiple refresh requests simultaneously.
let _refreshPromise: Promise<unknown> | null = null

/**
 * Make an authenticated API request. Automatically handles:
 * - Sending cookies (credentials: 'include')
 * - CSRF headers for state-changing requests
 * - Token refresh on 401
 * - Redirect to login when session is truly expired
 */
export async function fetchWithAuth<T>(
  path: string,
  options: RequestInit = {},
  _retried = false,
): Promise<Response> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...getCSRFHeaders(),
      ...(options.headers || {}),
    },
  })

  // On 401, try refreshing the token once, then retry
  if (res.status === 401 && !_retried) {
    try {
      if (!_refreshPromise) {
        _refreshPromise = refreshToken().finally(() => {
          _refreshPromise = null
        })
      }
      await _refreshPromise
      return fetchWithAuth<T>(path, options, true)
    } catch {
      // Refresh failed — session truly expired, go to login
      window.location.href = '/login'
      throw new Error('Session expired. Please log in again.')
    }
  }

  return res
}

/**
 * Convenience: fetchWithAuth + parse JSON + throw on error.
 * Mirrors the common apiFetch pattern used across services.
 */
export async function apiFetchWithAuth<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetchWithAuth<T>(path, options)

  if (!res.ok) {
    let detail = `API error ${res.status}: ${res.statusText}`
    try {
      const body = await res.json()
      if (body.detail) detail = body.detail
    } catch { /* ignore */ }
    throw new Error(detail)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}
