/**
 * Currency Conversion API Service
 *
 * Uses the Frankfurter API (free, no key required) via our backend.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────────

export interface ConversionResult {
  amount: number
  from: string
  to: string
  converted: number
  rate: number
  date: string
  source: string
}

export interface RatesResult {
  base: string
  date: string
  rates: Record<string, number>
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

/** Convert an amount between currencies. */
export async function convertCurrency(
  amount: number,
  fromCurrency: string = 'USD',
  toCurrency: string = 'EUR',
): Promise<ConversionResult> {
  const params = new URLSearchParams({
    amount: amount.toString(),
    from: fromCurrency,
    to: toCurrency,
  })
  const res = await fetch(`${BASE_URL}/api/currency/convert?${params}`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get latest exchange rates for a base currency. */
export async function getLatestRates(
  baseCurrency: string = 'USD',
): Promise<RatesResult> {
  const res = await fetch(`${BASE_URL}/api/currency/rates?base=${baseCurrency}`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get list of available currencies. */
export async function getAvailableCurrencies(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE_URL}/api/currency/currencies`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}
