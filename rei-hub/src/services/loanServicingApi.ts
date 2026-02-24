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

// ── Properties ────────────────────────────────────────────────────

export async function getProperties(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/loans/properties?${params}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch properties')
  return res.json()
}

export async function getProperty(trustId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/properties/${trustId}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch property')
  return res.json()
}

export async function createProperty(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/properties`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create property')
  return res.json()
}

export async function updateProperty(trustId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/properties/${trustId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update property')
  return res.json()
}

export async function getStateLaws(trustId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/properties/${trustId}/state-laws`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch state laws')
  return res.json()
}

// ── CFDs ──────────────────────────────────────────────────────────

export async function getCfds(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/loans/cfds?${params}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch CFDs')
  return res.json()
}

export async function getCfd(cfdId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/cfds/${cfdId}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch CFD')
  return res.json()
}

export async function createCfd(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/cfds`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create CFD')
  return res.json()
}

export async function updateCfd(cfdId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/cfds/${cfdId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update CFD')
  return res.json()
}

export async function getAmortization(cfdId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/cfds/${cfdId}/amortization`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch amortization')
  return res.json()
}

// ── Payments ──────────────────────────────────────────────────────

export async function getPayments(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/loans/payments?${params}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch payments')
  return res.json()
}

export async function recordPayment(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/payments/record`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to record payment')
  return res.json()
}

export async function createStripeIntent(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/payments/stripe/create-intent`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create Stripe intent')
  return res.json()
}

// ── Defaults ──────────────────────────────────────────────────────

export async function getDefaults(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/loans/defaults?${params}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch defaults')
  return res.json()
}

export async function createDefault(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/defaults`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create default')
  return res.json()
}

export async function updateDefault(id: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/defaults/${id}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update default')
  return res.json()
}

// ── Investors ─────────────────────────────────────────────────────

export async function getInvestors(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/investors`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch investors')
  return res.json()
}

export async function createInvestor(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/investors`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create investor')
  return res.json()
}

export async function updateInvestor(id: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/investors/${id}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update investor')
  return res.json()
}

export async function deactivateInvestor(id: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/investors/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to deactivate investor')
  return res.json()
}

// ── Distributions ─────────────────────────────────────────────────

export async function getDistributions(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/distributions`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch distributions')
  return res.json()
}

export async function generateDistribution(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/distributions/generate`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to generate distribution')
  return res.json()
}

export async function finalizeDistribution(id: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/distributions/${id}/finalize`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to finalize distribution')
  return res.json()
}

export async function getDistributionPdf(id: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/distributions/${id}/pdf`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch distribution PDF')
  return res.json()
}

// ── Stripe Connect ────────────────────────────────────────────────

export async function getStripeConnectStatus(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/stripe-connect/status`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch Stripe Connect status')
  return res.json()
}

export async function getStripeConnectOnboardUrl(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/stripe-connect/onboard`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to get Stripe Connect onboard URL')
  return res.json()
}

// ── Admin ─────────────────────────────────────────────────────────

export async function getAllProperties(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/admin/all-properties`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch all properties')
  return res.json()
}

export async function getAllCfds(token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/admin/all-cfds`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch all CFDs')
  return res.json()
}

export async function enableLoanServicing(userId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/loans/admin/enable/${userId}`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to enable loan servicing')
  return res.json()
}
