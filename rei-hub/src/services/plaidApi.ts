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
