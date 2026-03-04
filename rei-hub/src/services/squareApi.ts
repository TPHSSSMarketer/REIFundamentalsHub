/**
 * Square Payments API Service
 *
 * Handles payment processing via Square.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────────

export interface SquarePayment {
  payment_id: string
  status: string
  amount_cents: number
  amount_dollars: number
  description?: string
  receipt_url?: string | null
  created_at: string
}

export interface PaymentsListResult {
  payments: SquarePayment[]
  total: number
  source: string
}

export interface SquareLocation {
  id: string
  name: string
  address: string
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

/** Create a payment via Square. */
export async function createSquarePayment(
  amountCents: number,
  sourceId: string,
  description: string = '',
): Promise<SquarePayment> {
  const res = await fetch(`${BASE_URL}/api/square/payments`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      amount_cents: amountCents,
      source_id: sourceId,
      description,
    }),
  })
  return handleResponse(res)
}

/** List recent Square payments. */
export async function listSquarePayments(
  limit: number = 20,
): Promise<PaymentsListResult> {
  const res = await fetch(`${BASE_URL}/api/square/payments?limit=${limit}`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get available Square locations. */
export async function getSquareLocations(): Promise<SquareLocation[]> {
  const res = await fetch(`${BASE_URL}/api/square/locations`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}
