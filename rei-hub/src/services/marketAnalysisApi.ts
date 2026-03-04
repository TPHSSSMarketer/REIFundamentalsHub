/**
 * Market Analysis API Service
 *
 * Fetches combined market analysis data: demographics, crime,
 * jobs/employment, and weather for a saved market.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────────

export interface WeatherData {
  temperature_f: number | null
  feels_like_f: number | null
  description: string | null
  icon: string | null
  humidity: number | null
  wind_speed_mph: number | null
}

export interface DemographicsData {
  population: number | null
  median_household_income: number | null
  median_home_value: number | null
  total_housing_units: number | null
  owner_occupied_percent: number | null
  poverty_rate: number | null
  median_age: number | null
  source: string | null
}

export interface CrimeData {
  violent_crime: number | null
  property_crime: number | null
  murder: number | null
  robbery: number | null
  aggravated_assault: number | null
  burglary: number | null
  larceny: number | null
  motor_vehicle_theft: number | null
  violent_crime_rate: number | null
  property_crime_rate: number | null
  year: number | null
  source: string | null
}

export interface JobsData {
  total_jobs: number | null
  average_salary: number | null
  salary_min: number | null
  salary_max: number | null
  top_categories: string[] | null
  sample_jobs: Array<{
    title: string
    company: string
    salary_min: number | null
    salary_max: number | null
    location: string
  }> | null
  source: string | null
}

export interface MarketAnalysis {
  market_id: string
  city: string
  state: string
  weather: WeatherData | null
  demographics: DemographicsData | null
  crime: CrimeData | null
  jobs: JobsData | null
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

/** Get full market analysis (demographics, crime, jobs, weather) in one call. */
export async function getMarketAnalysis(marketId: string): Promise<MarketAnalysis> {
  const res = await fetch(`${BASE_URL}/api/market-analysis/${marketId}`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get just weather data for a market (for mini-widget on cards). */
export async function getMarketWeather(
  marketId: string,
): Promise<{ weather: WeatherData | null }> {
  const res = await fetch(`${BASE_URL}/api/market-analysis/${marketId}/weather`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get just demographics data. */
export async function getMarketDemographics(
  marketId: string,
): Promise<{ demographics: DemographicsData | null }> {
  const res = await fetch(`${BASE_URL}/api/market-analysis/${marketId}/demographics`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get just crime statistics. */
export async function getMarketCrime(
  marketId: string,
): Promise<{ crime: CrimeData | null }> {
  const res = await fetch(`${BASE_URL}/api/market-analysis/${marketId}/crime`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

/** Get just jobs/employment data. */
export async function getMarketJobs(
  marketId: string,
): Promise<{ jobs: JobsData | null }> {
  const res = await fetch(`${BASE_URL}/api/market-analysis/${marketId}/jobs`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}
