/**
 * WordPress integration API service
 *
 * Handles secure server-side storage and retrieval of WordPress credentials.
 * Credentials are encrypted on the backend and never stored in browser localStorage.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

export interface WordPressCredentials {
  wp_url: string
  wp_username: string
  wp_app_password: string
}

export interface WordPressStatus {
  configured: boolean
}

/**
 * Save WordPress credentials to the server (encrypted storage).
 * The credentials are encrypted on the backend and never exposed to the browser.
 */
export async function saveWordPressCredentials(
  wp_url: string,
  wp_username: string,
  wp_app_password: string,
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/integrations/wordpress`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wp_url,
      wp_username,
      wp_app_password,
    }),
    credentials: 'include',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to save WordPress credentials')
  }

  return res.json()
}

/**
 * Retrieve WordPress credentials from the server (decrypted on-demand).
 *
 * This fetches the credentials only when needed and never stores them in localStorage.
 * The credentials are only available for the duration of the current request/session.
 */
export async function getWordPressCredentials(): Promise<WordPressCredentials> {
  const res = await fetch(`${BASE_URL}/api/integrations/wordpress`, {
    method: 'GET',
    headers: getAuthHeader(),
    credentials: 'include',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    if (res.status === 404) {
      throw new Error('WordPress credentials not configured')
    }
    throw new Error(err.detail || 'Failed to retrieve WordPress credentials')
  }

  return res.json()
}

/**
 * Check if WordPress is configured for the user (returns only status, no credentials).
 * Safe to call frequently without exposing sensitive data.
 */
export async function getWordPressStatus(): Promise<WordPressStatus> {
  const res = await fetch(`${BASE_URL}/api/integrations/wordpress/status`, {
    method: 'GET',
    headers: getAuthHeader(),
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error('Failed to check WordPress status')
  }

  return res.json()
}

/**
 * Delete WordPress credentials from the server.
 */
export async function deleteWordPressCredentials(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/integrations/wordpress`, {
    method: 'DELETE',
    headers: getAuthHeader(),
    credentials: 'include',
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to delete WordPress credentials')
  }

  return res.json()
}
