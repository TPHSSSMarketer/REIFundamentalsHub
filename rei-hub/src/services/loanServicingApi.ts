/**
 * Loan Servicing API service
 */

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Demo Mode Helpers ──────────────────────────────────────

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

async function withDemoFallback<T>(apiFn: () => Promise<T>, demoData: T): Promise<T> {
  if (isDemoMode()) {
    try {
      return await apiFn()
    } catch {
      return demoData
    }
  }
  return apiFn()
}

// ── Demo Data ──────────────────────────────────────────────

const DEMO_PROPERTIES = [
  {
    id: 'prop-001',
    trust_name: 'Oak Street Trust',
    address: '123 Oak Street, Austin, TX 78701',
    purchase_price: 180000,
    closing_date: '2023-11-15T00:00:00Z',
    status: 'active',
  },
  {
    id: 'prop-002',
    trust_name: 'Maple Drive Trust',
    address: '456 Maple Drive, Denver, CO 80202',
    purchase_price: 275000,
    closing_date: '2024-01-20T00:00:00Z',
    status: 'active',
  },
]

const DEMO_CFDS = [
  {
    id: 'cfd-001',
    property_id: 'prop-001',
    principal_amount: 165000,
    interest_rate: 8.5,
    loan_term_months: 24,
    monthly_payment: 7234,
    status: 'active',
    originated_at: '2023-11-15T00:00:00Z',
  },
]

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
  return withDemoFallback(
    () => {
      const params = new URLSearchParams(filters || {})
      return fetch(`${BASE_URL}/api/loans/properties?${params}`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch properties'))
    },
    DEMO_PROPERTIES
  )
}

export async function getProperty(trustId: string, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/properties/${trustId}`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch property')),
    DEMO_PROPERTIES[0]
  )
}

export async function createProperty(data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/properties`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to create property')),
    { id: crypto.randomUUID(), ...data, status: 'active' }
  )
}

export async function updateProperty(trustId: string, data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/properties/${trustId}`, {
        method: 'PATCH',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to update property')),
    { id: trustId, ...data }
  )
}

export async function getStateLaws(trustId: string, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/properties/${trustId}/state-laws`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch state laws')),
    {
      state: 'TX',
      usury_limit: '18%',
      foreclosure_timeline: '120 days',
      redemption_period: 'None',
    }
  )
}

// ── CFDs ──────────────────────────────────────────────────────────

export async function getCfds(token: string, filters?: Record<string, string>) {
  return withDemoFallback(
    () => {
      const params = new URLSearchParams(filters || {})
      return fetch(`${BASE_URL}/api/loans/cfds?${params}`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch CFDs'))
    },
    DEMO_CFDS
  )
}

export async function getCfd(cfdId: string, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/cfds/${cfdId}`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch CFD')),
    DEMO_CFDS[0]
  )
}

export async function createCfd(data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/cfds`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to create CFD')),
    { id: crypto.randomUUID(), ...data, status: 'active', originated_at: new Date().toISOString() }
  )
}

export async function updateCfd(cfdId: string, data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/cfds/${cfdId}`, {
        method: 'PATCH',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to update CFD')),
    { id: cfdId, ...data }
  )
}

export async function getAmortization(cfdId: string, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/cfds/${cfdId}/amortization`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch amortization')),
    {
      total_payments: 24,
      paid_payments: 3,
      remaining_balance: 149502,
      schedule: [
        { month: 1, payment: 7234, principal: 6859, interest: 375, balance: 158141 },
        { month: 2, payment: 7234, principal: 6872, interest: 362, balance: 151269 },
      ],
    }
  )
}

// ── Payments ──────────────────────────────────────────────────────

export async function getPayments(token: string, filters?: Record<string, string>) {
  return withDemoFallback(
    () => {
      const params = new URLSearchParams(filters || {})
      return fetch(`${BASE_URL}/api/loans/payments?${params}`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch payments'))
    },
    [
      { id: 'pay-001', cfd_id: 'cfd-001', amount: 7234, paid_date: '2023-12-15T00:00:00Z', status: 'completed' },
      { id: 'pay-002', cfd_id: 'cfd-001', amount: 7234, paid_date: '2024-01-15T00:00:00Z', status: 'completed' },
      { id: 'pay-003', cfd_id: 'cfd-001', amount: 7234, paid_date: '2024-02-15T00:00:00Z', status: 'completed' },
    ]
  )
}

export async function recordPayment(data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/payments/record`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to record payment')),
    { id: crypto.randomUUID(), ...data, status: 'completed', recorded_at: new Date().toISOString() }
  )
}

export async function createStripeIntent(data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/payments/stripe/create-intent`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to create Stripe intent')),
    { client_secret: 'pi_test_secret_123456', amount: data.amount || 7234, currency: 'usd' }
  )
}

// ── Defaults ──────────────────────────────────────────────────────

export async function getDefaults(token: string, filters?: Record<string, string>) {
  return withDemoFallback(
    () => {
      const params = new URLSearchParams(filters || {})
      return fetch(`${BASE_URL}/api/loans/defaults?${params}`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch defaults'))
    },
    []
  )
}

export async function createDefault(data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/defaults`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to create default')),
    { id: crypto.randomUUID(), ...data, status: 'reported', created_at: new Date().toISOString() }
  )
}

export async function updateDefault(id: string, data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/defaults/${id}`, {
        method: 'PATCH',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to update default')),
    { id, ...data, updated_at: new Date().toISOString() }
  )
}

// ── Investors ─────────────────────────────────────────────────────

export async function getInvestors(token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/investors`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch investors')),
    [
      { id: 'inv-001', name: 'Capital Partners LLC', email: 'contact@capitalpartners.com', active: true },
      { id: 'inv-002', name: 'Growth Ventures', email: 'info@growthventures.com', active: true },
    ]
  )
}

export async function createInvestor(data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/investors`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to create investor')),
    { id: crypto.randomUUID(), ...data, active: true, created_at: new Date().toISOString() }
  )
}

export async function updateInvestor(id: string, data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/investors/${id}`, {
        method: 'PATCH',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to update investor')),
    { id, ...data, updated_at: new Date().toISOString() }
  )
}

export async function deactivateInvestor(id: string, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/investors/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to deactivate investor')),
    { id, active: false, deactivated_at: new Date().toISOString() }
  )
}

// ── Distributions ─────────────────────────────────────────────────

export async function getDistributions(token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/distributions`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch distributions')),
    [
      { id: 'dist-001', period: '2024-Q1', status: 'finalized', total_amount: 12340, created_at: '2024-02-01T00:00:00Z' },
    ]
  )
}

export async function generateDistribution(data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/distributions/generate`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to generate distribution')),
    { id: crypto.randomUUID(), ...data, status: 'generated', created_at: new Date().toISOString() }
  )
}

export async function finalizeDistribution(id: string, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/distributions/${id}/finalize`, {
        method: 'POST',
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to finalize distribution')),
    { id, status: 'finalized', finalized_at: new Date().toISOString() }
  )
}

export async function getDistributionPdf(id: string, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/distributions/${id}/pdf`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch distribution PDF')),
    { url: `/distributions/${id}/report.pdf`, filename: 'distribution-report.pdf' }
  )
}

// ── Stripe Connect ────────────────────────────────────────────────

export async function getStripeConnectStatus(token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/stripe-connect/status`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch Stripe Connect status')),
    { connected: true, account_id: 'acct_demo_123456', email: 'payments@reicompany.com' }
  )
}

export async function getStripeConnectOnboardUrl(token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/stripe-connect/onboard`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to get Stripe Connect onboard URL')),
    { url: 'https://connect.stripe.com/onboarding/demo' }
  )
}

// ── Admin ─────────────────────────────────────────────────────────

export async function getAllProperties(token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/admin/all-properties`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch all properties')),
    DEMO_PROPERTIES
  )
}

export async function getAllCfds(token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/admin/all-cfds`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch all CFDs')),
    DEMO_CFDS
  )
}

export async function enableLoanServicing(userId: string, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/admin/enable/${userId}`, {
        method: 'POST',
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to enable loan servicing')),
    { user_id: userId, feature_enabled: true, timestamp: new Date().toISOString() }
  )
}

// ── Tenant Config ────────────────────────────────────────────────

export async function getTenantConfig(userId: string, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/admin/tenant-config/${userId}`, {
        headers: authHeaders(token),
      }).then((res) => handleResponse(res, 'Failed to fetch tenant config')),
    { user_id: userId, feature_enabled: true, max_loans: 50 }
  )
}

export async function updateTenantConfig(userId: string, data: Record<string, any>, token: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/loans/admin/tenant-config/${userId}`, {
        method: 'PATCH',
        headers: headers(token),
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to update tenant config')),
    { user_id: userId, ...data, updated_at: new Date().toISOString() }
  )
}

// ── Portal Config (public) ───────────────────────────────────────

export async function getPortalConfig(userId: string) {
  const res = await fetch(`${BASE_URL}/api/portal/config/${userId}`)
  return res.json()
}
