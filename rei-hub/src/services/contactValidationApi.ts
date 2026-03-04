/**
 * Contact Validation API Service
 *
 * Email validation (Abstract API) and phone validation (NumVerify).
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────────

export interface EmailValidationResult {
  email: string
  is_valid: boolean
  is_deliverable: boolean | null
  is_free_email: boolean | null
  is_disposable: boolean | null
  suggestion: string | null
  mx_found: boolean | null
  quality_score: number | null
  source: string
}

export interface PhoneValidationResult {
  phone: string
  is_valid: boolean
  phone_type: string | null
  carrier: string | null
  country_code: string | null
  country_name: string | null
  location: string | null
  source: string
}

// ── Helpers ────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

// ── Endpoints ──────────────────────────────────────────────────────────

/** Validate an email address. */
export async function validateEmail(
  email: string,
): Promise<EmailValidationResult> {
  const res = await fetch(`${BASE_URL}/api/crm/contacts/validate-email`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email }),
  })
  return handleResponse(res)
}

/** Validate a phone number. */
export async function validatePhone(
  phone: string,
  countryCode: string = 'US',
): Promise<PhoneValidationResult> {
  const res = await fetch(`${BASE_URL}/api/crm/contacts/validate-phone`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ phone, country_code: countryCode }),
  })
  return handleResponse(res)
}
