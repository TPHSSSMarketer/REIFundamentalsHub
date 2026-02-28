/**
 * Markets API Service
 *
 * Handles all frontend communication with the markets backend endpoints.
 * Uses the same auth pattern as ticketApi.ts and phoneApi.ts.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────────

export interface SavedMarket {
  id: string
  city: string
  state: string
  median_home_price: number
  median_rent: number
  avg_days_on_market: number
  inventory_count: number
  price_change_pct: number
  notes?: string | null
  rent_to_price_ratio: number
  created_at: string
  updated_at?: string | null
}

export interface CreateMarketPayload {
  city: string
  state: string
  median_home_price?: number
  median_rent?: number
  avg_days_on_market?: number
  inventory_count?: number
  price_change_pct?: number
  notes?: string
}

export interface UpdateMarketPayload {
  city?: string
  state?: string
  median_home_price?: number
  median_rent?: number
  avg_days_on_market?: number
  inventory_count?: number
  price_change_pct?: number
  notes?: string | null
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

/** List all saved markets for the current user. */
export async function getMarkets(): Promise<SavedMarket[]> {
  const res = await fetch(`${BASE_URL}/api/markets`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

/** Create a new saved market. */
export async function createMarket(payload: CreateMarketPayload): Promise<SavedMarket> {
  const res = await fetch(`${BASE_URL}/api/markets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  })
  return handleResponse(res)
}

/** Get details of a specific market. */
export async function getMarket(marketId: string): Promise<SavedMarket> {
  const res = await fetch(`${BASE_URL}/api/markets/${marketId}`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

/** Update market data. */
export async function updateMarket(
  marketId: string,
  updates: UpdateMarketPayload,
): Promise<SavedMarket> {
  const res = await fetch(`${BASE_URL}/api/markets/${marketId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(updates),
  })
  return handleResponse(res)
}

/** Delete a saved market. */
export async function deleteMarket(marketId: string): Promise<{ id: string; message: string }> {
  const res = await fetch(`${BASE_URL}/api/markets/${marketId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}
