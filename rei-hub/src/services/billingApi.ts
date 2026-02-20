const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

export interface BillingStatus {
  plan: string | null
  status: string | null
  trial_ends_at: string | null
  current_period_end: string | null
  helm_addon: boolean
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

export async function getBillingStatus(token: string): Promise<BillingStatus> {
  const res = await fetch(`${BASE_URL}/api/billing/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<BillingStatus>(res)
}

export async function createStripeSubscription(
  token: string,
  plan: string,
  interval: 'month' | 'year'
): Promise<{ client_secret: string }> {
  const res = await fetch(`${BASE_URL}/api/billing/stripe/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan, interval }),
  })
  return handleResponse<{ client_secret: string }>(res)
}

export async function createPayPalSubscription(
  token: string,
  plan: string,
  interval: 'month' | 'year'
): Promise<{ approval_url: string }> {
  const res = await fetch(`${BASE_URL}/api/billing/paypal/subscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan, interval }),
  })
  return handleResponse<{ approval_url: string }>(res)
}

export async function cancelSubscription(
  token: string
): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/api/billing/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ message: string }>(res)
}

export async function addHelmAddon(
  token: string,
  interval: 'month' | 'year'
): Promise<{ client_secret: string }> {
  const res = await fetch(`${BASE_URL}/api/billing/stripe/addon/helm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ interval }),
  })
  return handleResponse<{ client_secret: string }>(res)
}
