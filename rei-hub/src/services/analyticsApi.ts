/**
 * Analytics API service
 */

import { getCSRFHeaders } from '@/services/authApi'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function authHeaders() {
  return {}
}

async function handleResponse<T>(res: Response, fallbackMsg: string): Promise<T> {
  if (res.ok) return res.json()

  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment before trying again.')
  }
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Your session has expired. Please log in again.')
  }
  if (res.status === 403) {
    throw new Error("You don't have permission to perform this action.")
  }

  const body = await res.json().catch(() => ({}))
  if (res.status === 422) {
    const detail = body.detail
    if (Array.isArray(detail)) {
      throw new Error(detail.map((d: any) => d.msg).join(', '))
    }
    throw new Error(detail ?? 'Validation error')
  }
  throw new Error(body.detail ?? fallbackMsg)
}

// ── Demo Mode Helpers ──────────────────────────────────────────────

function isDemoMode(): boolean {
  try {
    const stored = localStorage.getItem('rei-hub-demo-mode')
    if (!stored) return false
    const parsed = JSON.parse(stored)
    return parsed?.state?.isDemoMode === true
  } catch {
    return false
  }
}

async function withDemoFallback<T>(
  realApiFn: () => Promise<T>,
  demoData: T
): Promise<T> {
  if (!isDemoMode()) {
    return realApiFn()
  }
  try {
    return await realApiFn()
  } catch {
    return demoData
  }
}

// ── Pipeline ──────────────────────────────────────────────────────

const pipelineOverviewDemo = {
  total_deals: 12,
  active_deals: 6,
  closed_won: 4,
  closed_lost: 2,
  total_value: 2105000,
  avg_deal_size: 175417,
  conversion_rate: 66.7,
  avg_days_to_close: 32,
  deals_by_stage: {
    lead: 1,
    analysis: 1,
    offer: 1,
    under_contract: 1,
    due_diligence: 1,
    closing: 1,
    closed_won: 4,
    closed_lost: 2,
  },
  deals_by_source: {
    'Direct Mail': 4,
    'Facebook Ads': 3,
    'Referral': 2,
    'Driving for Dollars': 2,
    'Cold Call': 1,
  },
}

const pipelineTrendDemo = [
  {
    month: 'Sep 2025',
    deals_created: 2,
    deals_closed: 1,
    revenue: 175000,
  },
  {
    month: 'Oct 2025',
    deals_created: 3,
    deals_closed: 1,
    revenue: 185000,
  },
  {
    month: 'Nov 2025',
    deals_created: 2,
    deals_closed: 2,
    revenue: 360000,
  },
  {
    month: 'Dec 2025',
    deals_created: 1,
    deals_closed: 0,
    revenue: 0,
  },
  {
    month: 'Jan 2026',
    deals_created: 2,
    deals_closed: 1,
    revenue: 195000,
  },
  {
    month: 'Feb 2026',
    deals_created: 2,
    deals_closed: 1,
    revenue: 190000,
  },
]

const pipelineFunnelDemo = [
  { stage: 'Lead', count: 1, conversion_rate: 100 },
  { stage: 'Analysis', count: 1, conversion_rate: 100 },
  { stage: 'Offer', count: 1, conversion_rate: 100 },
  { stage: 'Under Contract', count: 1, conversion_rate: 100 },
  { stage: 'Due Diligence', count: 1, conversion_rate: 100 },
  { stage: 'Closing', count: 1, conversion_rate: 100 },
  { stage: 'Closed Won', count: 4, conversion_rate: 66.7 },
]

export async function getPipelineOverview(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/pipeline/overview?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch pipeline overview')
    },
    pipelineOverviewDemo
  )
}

export async function getPipelineTrend(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/pipeline/trend?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch pipeline trend')
    },
    pipelineTrendDemo
  )
}

export async function getPipelineFunnel(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/pipeline/funnel?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch pipeline funnel')
    },
    pipelineFunnelDemo
  )
}

// ── Portfolio ─────────────────────────────────────────────────────

const portfolioOverviewDemo = {
  total_properties: 4,
  total_equity: 312000,
  monthly_cash_flow: 2850,
  avg_cap_rate: 9.2,
  avg_coc_return: 18.5,
  occupancy_rate: 92,
}

const portfolioPropertiesDemo = [
  {
    id: 1,
    address: '412 Oak Street, Memphis, TN 38103',
    purchase_price: 95000,
    current_value: 165000,
    monthly_rent: 1200,
    cap_rate: 8.5,
    coc_return: 16.2,
  },
  {
    id: 2,
    address: '327 Main Avenue, Cincinnati, OH 45202',
    purchase_price: 110000,
    current_value: 198000,
    monthly_rent: 1450,
    cap_rate: 9.8,
    coc_return: 19.3,
  },
  {
    id: 3,
    address: '1805 Elm Drive, Cleveland, OH 44114',
    purchase_price: 87000,
    current_value: 142000,
    monthly_rent: 950,
    cap_rate: 8.0,
    coc_return: 15.6,
  },
  {
    id: 4,
    address: '642 Pine Road, Indianapolis, IN 46204',
    purchase_price: 105000,
    current_value: 167000,
    monthly_rent: 1100,
    cap_rate: 11.0,
    coc_return: 22.4,
  },
]

export async function getPortfolioOverview(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/portfolio/overview?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch portfolio overview')
    },
    portfolioOverviewDemo
  )
}

export async function getPortfolioProperties(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/portfolio/properties?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch portfolio properties')
    },
    portfolioPropertiesDemo
  )
}

// ── Loans ─────────────────────────────────────────────────────────

const loansOverviewDemo = {
  total_loans: 0,
  active_loans: 0,
  total_outstanding: 0,
}

const loanPaymentsDemo = []

export async function getLoansOverview(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/loans/overview?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch loans overview')
    },
    loansOverviewDemo
  )
}

export async function getLoanPayments(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/loans/payments?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch loan payments')
    },
    loanPaymentsDemo
  )
}

// ── Negotiations ──────────────────────────────────────────────────

const negotiationsOverviewDemo = {
  active_negotiations: 0,
  total_value: 0,
}

export async function getNegotiationsOverview(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/negotiations/overview?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch negotiations overview')
    },
    negotiationsOverviewDemo
  )
}

// ── Revenue (superadmin) ──────────────────────────────────────────

const revenueOverviewDemo = {
  total_revenue: 0,
  active_users: 0,
}

const revenueSubscribersDemo = []

export async function getRevenueOverview(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/revenue/overview?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch revenue overview')
    },
    revenueOverviewDemo
  )
}

export async function getRevenueSubscribers(params?: Record<string, string>) {
  return withDemoFallback(
    async () => {
      const qs = new URLSearchParams(params || {})
      const res = await fetch(`${BASE_URL}/api/analytics/revenue/subscribers?${qs}`, {
        headers: authHeaders(),
        credentials: 'include',
      })
      return handleResponse(res, 'Failed to fetch revenue subscribers')
    },
    revenueSubscribersDemo
  )
}

// ── Exports ───────────────────────────────────────────────────────

export async function exportPipeline(params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/export/pipeline?${qs}`, {
    headers: authHeaders(),
    credentials: 'include',
  })
  if (!res.ok) {
    return handleResponse(res, 'Failed to export pipeline')
  }
  return res.blob()
}

export async function exportPortfolio(params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/export/portfolio?${qs}`, {
    headers: authHeaders(),
    credentials: 'include',
  })
  if (!res.ok) {
    return handleResponse(res, 'Failed to export portfolio')
  }
  return res.blob()
}

export async function exportLoans(params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/export/loans?${qs}`, {
    headers: authHeaders(),
    credentials: 'include',
  })
  if (!res.ok) {
    return handleResponse(res, 'Failed to export loans')
  }
  return res.blob()
}

export async function exportNegotiations(params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/export/negotiations?${qs}`, {
    headers: authHeaders(),
    credentials: 'include',
  })
  if (!res.ok) {
    return handleResponse(res, 'Failed to export negotiations')
  }
  return res.blob()
}
