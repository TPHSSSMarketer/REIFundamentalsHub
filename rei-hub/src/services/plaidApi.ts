import { getAuthHeader } from './auth'

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

const DEMO_BALANCE_RESPONSE = {
  accounts: [
    { account_id: 'acc-001', name: 'Checking Account', type: 'depository', subtype: 'checking', available_display: '$125,432.50' },
    { account_id: 'acc-002', name: 'Business Savings', type: 'depository', subtype: 'savings', available_display: '$350,000.00' },
  ],
}

const DEMO_CERTIFICATES = [
  {
    certificate_id: 'cert-001',
    verified: true,
    buyer_name: 'Demo User',
    buyer_email: 'demo@example.com',
    required_amount: 50000,
    available_balance: '$125,432.50',
    property_address: '123 Main St, San Antonio, TX 78201',
    issued_at: '2024-02-20T10:00:00Z',
    expires_at: '2025-03-20T10:00:00Z',
    issuer: 'REIFundamentals Hub',
  },
]

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

export async function getLinkToken(): Promise<{ link_token: string }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/link-token`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    { link_token: 'link_token_demo_123456' }
  )
}

export async function exchangeToken(
  publicToken: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/exchange-token`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_token: publicToken }),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    { success: true }
  )
}

export async function getBalance(): Promise<{ accounts: Array<{
  account_id: string
  name: string
  type: string
  subtype: string
  available_display: string
}> }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/balance`, {
        headers: getAuthHeader(),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    DEMO_BALANCE_RESPONSE
  )
}

export async function verifyFunds(
  amount: number,
  address: string
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/verify-funds`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ required_amount: amount, property_address: address }),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    { verified: true, available_balance: 475432.50, required_amount: amount, property_address: address }
  )
}

export async function getCertificates(): Promise<{
  certificates: Array<Record<string, unknown>>
}> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/certificates`, {
        headers: getAuthHeader(),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    { certificates: DEMO_CERTIFICATES }
  )
}

export async function getCertificate(
  id: string
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/certificates/${id}`, {
        headers: getAuthHeader(),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    DEMO_CERTIFICATES[0]
  )
}

export async function disconnectBank(): Promise<{ success: boolean }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/disconnect`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    { success: true }
  )
}

// ── POF Requests (authenticated) ─────────────────────────────

export async function requestPof(data: {
  buyer_email: string
  buyer_name: string
  property_address: string
  required_amount: number
  notes?: string
  deal_id?: string
}): Promise<{ request_id: string; request_token: string; expires_at: string }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/request-pof`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    {
      request_id: 'req-' + crypto.randomUUID(),
      request_token: 'token-' + crypto.randomUUID(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
  )
}

export async function getRequests(): Promise<{
  requests: Array<Record<string, unknown>>
}> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/requests`, {
        headers: getAuthHeader(),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    {
      requests: [
        {
          id: 'req-001',
          buyer_name: 'John Buyer',
          buyer_email: 'john@example.com',
          property_address: '123 Main St, San Antonio, TX',
          required_amount: 200000,
          status: 'pending',
          request_token: 'demo-token-001',
          expires_at: '2025-03-20T10:00:00Z',
          completed_at: null,
          certificate_id: null,
          notes: null,
          created_at: '2024-02-20T10:00:00Z',
        },
      ],
    }
  )
}

export async function getRequest(
  id: string
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/requests/${id}`, {
        headers: getAuthHeader(),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    { id, buyer_name: 'John Buyer', property_address: '123 Main St', required_amount: 200000, status: 'pending' }
  )
}

export async function cancelRequest(
  id: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/plaid/requests/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    { success: true }
  )
}

// ── POF Requests (public — no auth) ──────────────────────────

export async function getPublicRequest(
  requestToken: string
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () =>
      fetch(
        `${BASE_URL}/api/plaid/public/request/${requestToken}`
      ).then((res) => handleResponse(res)),
    { request_id: 'req-001', property_address: '123 Main St', required_amount: 200000, buyer_name: 'John Buyer' }
  )
}

export async function getPublicLinkToken(
  requestToken: string
): Promise<{ link_token: string }> {
  return withDemoFallback(
    () =>
      fetch(
        `${BASE_URL}/api/plaid/public/link-token/${requestToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      ).then((res) => handleResponse(res)),
    { link_token: 'public_link_token_demo_123456' }
  )
}

export async function submitPublicVerification(
  requestToken: string,
  publicToken: string
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () =>
      fetch(
        `${BASE_URL}/api/plaid/public/verify/${requestToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public_token: publicToken }),
        }
      ).then((res) => handleResponse(res)),
    { success: true, verified: true, timestamp: new Date().toISOString() }
  )
}
