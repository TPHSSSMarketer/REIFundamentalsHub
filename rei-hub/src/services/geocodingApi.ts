/**
 * Geocoding API Service
 *
 * Handles geocoding requests to convert addresses to lat/lng coordinates.
 * Used by Maps, Pipeline, Portfolio, and Markets pages.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────────

export interface GeocodeResult {
  latitude: number | null
  longitude: number | null
  source: string | null
  success: boolean
}

export interface BatchGeocodeResult {
  total: number
  geocoded: number
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

/** Geocode any address to lat/lng. */
export async function geocodeAddress(
  address: string = '',
  city: string = '',
  state: string = '',
  zipCode: string = '',
): Promise<GeocodeResult> {
  const res = await fetch(`${BASE_URL}/api/geocoding/geocode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ address, city, state, zip_code: zipCode }),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Auto-geocode a saved market by its city + state. */
export async function geocodeMarket(
  marketId: string,
): Promise<{ id: string; latitude: number | null; longitude: number | null; source: string | null }> {
  const res = await fetch(`${BASE_URL}/api/geocoding/market/${marketId}`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Auto-geocode a deal by its address. */
export async function geocodeDeal(
  dealId: string,
): Promise<{ id: string; latitude: number | null; longitude: number | null; source: string | null }> {
  const res = await fetch(`${BASE_URL}/api/geocoding/deal/${dealId}`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Auto-geocode a portfolio property by its address. */
export async function geocodeProperty(
  propertyId: string,
): Promise<{ id: string; latitude: number | null; longitude: number | null; source: string | null }> {
  const res = await fetch(`${BASE_URL}/api/geocoding/property/${propertyId}`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Batch geocode all markets that don't have coordinates. */
export async function batchGeocodeMarkets(): Promise<BatchGeocodeResult> {
  const res = await fetch(`${BASE_URL}/api/geocoding/batch/markets`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Fetch the Google Maps API key (if configured). */
export async function getMapsConfig(): Promise<{ google_maps_api_key: string; enabled: boolean }> {
  try {
    const res = await fetch(`${BASE_URL}/api/geocoding/maps-config`, {
      headers: getAuthHeader(),
      credentials: 'include',
    })
    return handleResponse(res)
  } catch {
    return { google_maps_api_key: '', enabled: false }
  }
}
