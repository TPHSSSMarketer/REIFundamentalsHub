/**
 * Authentication service — high-level auth operations.
 *
 * Tokens are now stored in HttpOnly cookies managed by the browser.
 * JavaScript cannot read them (which is the whole point — XSS protection).
 *
 * This service handles login/register/logout and delegates to authApi.ts
 * for the actual network calls.
 */
import * as authApi from './authApi'

export { getMe } from './authApi'

// ── Auth API calls (delegate to authApi.ts) ─────────────────────

export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await authApi.login(email, password)
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
    await authApi.register(email, password, name)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Registration failed' }
  }
}

export async function logout(): Promise<void> {
  try {
    await authApi.logout()
  } finally {
    // Clean up any legacy localStorage entries from before the migration
    localStorage.removeItem('rei_token')
    localStorage.removeItem('rei_user_id')
    localStorage.removeItem('rei_user_email')
    localStorage.removeItem('rei_plan')
    window.location.href = '/login'
  }
}

// ── Token utilities ────────────────────────────────────────────

/**
 * @deprecated Token is now in an HttpOnly cookie — JS cannot read it.
 * Kept for backward compatibility with code that checks for a token.
 */
export function getToken(): string | null {
  return null
}

/**
 * Check if the user likely has an active session.
 * Since we can't read HttpOnly cookies, this returns true optimistically.
 * The actual auth check happens via the /me endpoint in useAuth.
 */
export function isAuthenticated(): boolean {
  return true
}

/**
 * Return headers needed for authenticated state-changing requests.
 * With cookies, the browser sends auth automatically — we just need CSRF.
 */
export function getAuthHeader(): Record<string, string> {
  return authApi.getCSRFHeaders()
}

// ── Current user (delegate to authApi.ts) ─────────────────────

export async function getCurrentUser() {
  try {
    return await authApi.getMe()
  } catch {
    return null
  }
}

