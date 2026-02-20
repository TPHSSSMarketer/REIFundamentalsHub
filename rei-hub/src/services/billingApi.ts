const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

export interface BillingStatus {
  plan: string | null
  billing_interval: string | null
  subscription_status: string | null
  trial_ends_at: string | null
  subscription_ends_at: string | null
  helm_addon_active: boolean
  seats_used: number
  is_trial_active: boolean
  days_remaining_in_trial: number | null
  features: string[]
  can_access: Record<string, boolean>
}

export interface PlanInfo {
  name: string
  monthly_price_cents: number
  annual_price_cents: number
  features: string[]
  max_seats: number
  helm_addon_monthly_cents: number
  helm_addon_annual_cents: number
}

export interface PlansResponse {
  plans: Record<string, PlanInfo>
  trial_days: number
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

export async function getPlans(): Promise<PlansResponse> {
  const res = await fetch(`${BASE_URL}/api/billing/plans`)
  return handleResponse<PlansResponse>(res)
}

export async function getBillingStatus(token: string): Promise<BillingStatus> {
  const res = await fetch(`${BASE_URL}/api/billing/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<BillingStatus>(res)
}

export async function createCheckout(
  token: string,
  plan: string,
  interval: 'monthly' | 'annual',
  paymentMethod: 'stripe' | 'paypal',
  helmAddon: boolean = false
): Promise<{ checkout_url: string | null; message: string }> {
  const res = await fetch(`${BASE_URL}/api/billing/create-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      plan,
      interval,
      payment_method: paymentMethod,
      helm_addon: helmAddon,
    }),
  })
  return handleResponse<{ checkout_url: string | null; message: string }>(res)
}

export async function openBillingPortal(
  token: string
): Promise<{ portal_url: string | null }> {
  const res = await fetch(`${BASE_URL}/api/billing/portal`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ portal_url: string | null }>(res)
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
