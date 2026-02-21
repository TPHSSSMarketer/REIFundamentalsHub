import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

export async function getLinkToken(): Promise<{ link_token: string }> {
  const res = await fetch(`${BASE_URL}/api/plaid/link-token`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  })
  return handleResponse(res)
}

export async function exchangeToken(
  publicToken: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/api/plaid/exchange-token`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token: publicToken }),
  })
  return handleResponse(res)
}

export async function getBalance(): Promise<{ accounts: Array<{
  account_id: string
  name: string
  type: string
  subtype: string
  available_display: string
}> }> {
  const res = await fetch(`${BASE_URL}/api/plaid/balance`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

export async function verifyFunds(
  amount: number,
  address: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/api/plaid/verify-funds`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ required_amount: amount, property_address: address }),
  })
  return handleResponse(res)
}

export async function getCertificates(): Promise<{
  certificates: Array<Record<string, unknown>>
}> {
  const res = await fetch(`${BASE_URL}/api/plaid/certificates`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

export async function getCertificate(
  id: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/api/plaid/certificates/${id}`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

export async function disconnectBank(): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/api/plaid/disconnect`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
  })
  return handleResponse(res)
}

// ── POF Requests (authenticated) ─────────────────────────────

export async function requestPof(data: {
  buyer_email: string
  buyer_name: string
  property_address: string
  required_amount: number
  notes?: string
}): Promise<{ request_id: string; request_token: string; expires_at: string }> {
  const res = await fetch(`${BASE_URL}/api/plaid/request-pof`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse(res)
}

export async function getRequests(): Promise<{
  requests: Array<Record<string, unknown>>
}> {
  const res = await fetch(`${BASE_URL}/api/plaid/requests`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

export async function getRequest(
  id: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/api/plaid/requests/${id}`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

export async function cancelRequest(
  id: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/api/plaid/requests/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

// ── POF Requests (public — no auth) ──────────────────────────

export async function getPublicRequest(
  requestToken: string
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${BASE_URL}/api/plaid/public/request/${requestToken}`
  )
  return handleResponse(res)
}

export async function getPublicLinkToken(
  requestToken: string
): Promise<{ link_token: string }> {
  const res = await fetch(
    `${BASE_URL}/api/plaid/public/link-token/${requestToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }
  )
  return handleResponse(res)
}

export async function submitPublicVerification(
  requestToken: string,
  publicToken: string
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `${BASE_URL}/api/plaid/public/verify/${requestToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token: publicToken }),
    }
  )
  return handleResponse(res)
}
