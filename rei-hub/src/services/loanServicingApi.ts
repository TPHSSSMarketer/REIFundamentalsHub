/**
 * Loan Servicing API service
 */

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

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

// ── Properties ────────────────────────────────────────────────────

export async function getProperties(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/loans/properties?${params}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch properties')
}

export async function getProperty(trustId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/properties/${trustId}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch property')
}

export async function createProperty(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/properties`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to create property')
}

export async function updateProperty(trustId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/properties/${trustId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update property')
}

export async function getStateLaws(trustId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/properties/${trustId}/state-laws`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch state laws')
}

// ── CFDs ──────────────────────────────────────────────────────────

export async function getCfds(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/loans/cfds?${params}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch CFDs')
}

export async function getCfd(cfdId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/cfds/${cfdId}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch CFD')
}

export async function createCfd(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/cfds`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to create CFD')
}

export async function updateCfd(cfdId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/cfds/${cfdId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update CFD')
}

export async function getAmortization(cfdId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/cfds/${cfdId}/amortization`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch amortization')
}

// ── Payments ──────────────────────────────────────────────────────

export async function getPayments(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/loans/payments?${params}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch payments')
}

export async function recordPayment(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/payments/record`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to record payment')
}

export async function createStripeIntent(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/payments/stripe/create-intent`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to create Stripe intent')
}

// ── Defaults ──────────────────────────────────────────────────────

export async function getDefaults(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/loans/defaults?${params}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch defaults')
}

export async function createDefault(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/defaults`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to create default')
}

export async function updateDefault(id: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/defaults/${id}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update default')
}

// ── Investors ─────────────────────────────────────────────────────

export async function getInvestors(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/investors`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch investors')
}

export async function createInvestor(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/investors`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to create investor')
}

export async function updateInvestor(id: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/investors/${id}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update investor')
}

export async function deactivateInvestor(id: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/investors/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to deactivate investor')
}

// ── Distributions ─────────────────────────────────────────────────

export async function getDistributions(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/distributions`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch distributions')
}

export async function generateDistribution(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/distributions/generate`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to generate distribution')
}

export async function finalizeDistribution(id: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/distributions/${id}/finalize`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to finalize distribution')
}

export async function getDistributionPdf(id: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/distributions/${id}/pdf`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch distribution PDF')
}

// ── Stripe Connect ────────────────────────────────────────────────

export async function getStripeConnectStatus(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/stripe-connect/status`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch Stripe Connect status')
}

export async function getStripeConnectOnboardUrl(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/stripe-connect/onboard`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to get Stripe Connect onboard URL')
}

// ── Admin ─────────────────────────────────────────────────────────

export async function getAllProperties(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/admin/all-properties`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch all properties')
}

export async function getAllCfds(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/admin/all-cfds`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch all CFDs')
}

export async function enableLoanServicing(userId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/admin/enable/${userId}`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to enable loan servicing')
}

// ── Tenant Config ────────────────────────────────────────────────

export async function getTenantConfig(userId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/admin/tenant-config/${userId}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch tenant config')
}

export async function updateTenantConfig(userId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/admin/tenant-config/${userId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update tenant config')
}

// ── Portal Config (public) ───────────────────────────────────────

export async function getPortalConfig(userId: string) {
  const res = await fetch(`${BASE_URL}/api/portal/config/${userId}`)
  return res.json()
}
