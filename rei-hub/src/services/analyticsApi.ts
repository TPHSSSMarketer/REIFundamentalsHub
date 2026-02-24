/**
 * Analytics API service
 */

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

async function handleResponse<T>(res: Response, fallbackMsg: string): Promise<T> {
  if (res.ok) return res.json()

  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment before trying again.')
  }
  if (res.status === 401) {
    localStorage.removeItem('rei_token')
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

// ── Pipeline ──────────────────────────────────────────────────────

export async function getPipelineOverview(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/pipeline/overview?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch pipeline overview')
}

export async function getPipelineTrend(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/pipeline/trend?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch pipeline trend')
}

export async function getPipelineFunnel(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/pipeline/funnel?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch pipeline funnel')
}

// ── Portfolio ─────────────────────────────────────────────────────

export async function getPortfolioOverview(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/portfolio/overview?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch portfolio overview')
}

export async function getPortfolioProperties(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/portfolio/properties?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch portfolio properties')
}

// ── Loans ─────────────────────────────────────────────────────────

export async function getLoansOverview(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/loans/overview?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch loans overview')
}

export async function getLoanPayments(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/loans/payments?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch loan payments')
}

// ── Negotiations ──────────────────────────────────────────────────

export async function getNegotiationsOverview(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/negotiations/overview?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch negotiations overview')
}

// ── Revenue (superadmin) ──────────────────────────────────────────

export async function getRevenueOverview(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/revenue/overview?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch revenue overview')
}

export async function getRevenueSubscribers(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/revenue/subscribers?${qs}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch revenue subscribers')
}

// ── Exports ───────────────────────────────────────────────────────

export async function exportPipeline(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/export/pipeline?${qs}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    return handleResponse(res, 'Failed to export pipeline')
  }
  return res.blob()
}

export async function exportPortfolio(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/export/portfolio?${qs}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    return handleResponse(res, 'Failed to export portfolio')
  }
  return res.blob()
}

export async function exportLoans(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/export/loans?${qs}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    return handleResponse(res, 'Failed to export loans')
  }
  return res.blob()
}

export async function exportNegotiations(token: string, params?: Record<string, string>) {
  const qs = new URLSearchParams(params || {})
  const res = await fetch(`${BASE_URL}/api/analytics/export/negotiations?${qs}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) {
    return handleResponse(res, 'Failed to export negotiations')
  }
  return res.blob()
}
