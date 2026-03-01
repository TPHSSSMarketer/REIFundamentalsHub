import { getCSRFHeaders } from '@/services/authApi'

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

/* ── Demo Mode Helpers ──────────────────────────────────────── */

function isDemoMode(): boolean {
  try {
    const stored = localStorage.getItem('rei-hub-demo-mode')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed?.state?.isDemoMode === true
    }
  } catch { /* ignore */ }
  return false
}

async function withDemoFallback<T>(apiFn: () => Promise<T>, demoData: T): Promise<T> {
  if (isDemoMode()) {
    try { return await apiFn() } catch { return demoData }
  }
  return apiFn()
}

/* ── Demo Data ──────────────────────────────────────────────── */

const DEMO_PLANS: PlansResponse = {
  trial_days: 7,
  plans: {
    starter: {
      name: 'Starter',
      monthly_price_cents: 4900,
      annual_price_cents: 49000,
      features: ['dashboard', 'pipeline', 'contacts', 'markets', 'portfolio', 'csv_export'],
      max_seats: 1,
      helm_addon_monthly_cents: 2900,
      helm_addon_annual_cents: 29000,
    },
    pro: {
      name: 'Pro',
      monthly_price_cents: 9900,
      annual_price_cents: 99000,
      features: [
        'dashboard', 'pipeline', 'contacts', 'markets', 'portfolio',
        'content_hub', 'wordpress_publish', 'cloud_sync', 'csv_export',
        'priority_support',
      ],
      max_seats: 3,
      helm_addon_monthly_cents: 4900,
      helm_addon_annual_cents: 49000,
    },
    team: {
      name: 'Team',
      monthly_price_cents: 19900,
      annual_price_cents: 199000,
      features: [
        'dashboard', 'pipeline', 'contacts', 'markets', 'portfolio',
        'content_hub', 'wordpress_publish', 'cloud_sync', 'assistant_hub',
        'csv_export', 'priority_support', 'helm_hub',
      ],
      max_seats: 999,
      helm_addon_monthly_cents: 0,
      helm_addon_annual_cents: 0,
    },
  },
}

const DEMO_BILLING_STATUS: BillingStatus = {
  plan: 'pro',
  billing_interval: 'monthly',
  subscription_status: 'trialing',
  trial_ends_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  subscription_ends_at: null,
  helm_addon_active: false,
  seats_used: 1,
  is_trial_active: true,
  days_remaining_in_trial: 5,
  features: [
    'dashboard', 'pipeline', 'contacts', 'markets', 'portfolio',
    'content_hub', 'wordpress_publish', 'cloud_sync', 'csv_export',
    'priority_support',
  ],
  can_access: {
    dashboard: true,
    pipeline: true,
    contacts: true,
    markets: true,
    portfolio: true,
    content_hub: true,
    wordpress_publish: true,
    cloud_sync: true,
    csv_export: true,
    priority_support: true,
    assistant_hub: false,
    helm_hub: false,
  },
}

/* ── API Helpers ─────────────────────────────────────────────── */

async function handleResponse<T>(res: Response): Promise<T> {
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
  throw new Error(body.detail ?? 'Request failed')
}

/* ── Exported API Functions ──────────────────────────────────── */

export async function getPlans(): Promise<PlansResponse> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/billing/plans`)
    return handleResponse<PlansResponse>(res)
  }, DEMO_PLANS)
}

export async function getBillingStatus(): Promise<BillingStatus> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/billing/status`, {
      credentials: 'include',
    })
    return handleResponse<BillingStatus>(res)
  }, DEMO_BILLING_STATUS)
}

export async function createCheckout(
  plan: string,
  interval: 'monthly' | 'annual',
  paymentMethod: 'stripe' | 'paypal',
  helmAddon: boolean = false
): Promise<{ client_secret?: string | null; checkout_url?: string | null; message: string }> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/billing/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getCSRFHeaders(),
      },
      credentials: 'include',
      body: JSON.stringify({
        plan,
        interval,
        payment_method: paymentMethod,
        helm_addon: helmAddon,
      }),
    })
    return handleResponse<{ client_secret?: string | null; checkout_url?: string | null; message: string }>(res)
  }, { client_secret: null, checkout_url: null, message: 'Demo mode — billing not connected' })
}

export async function openBillingPortal(): Promise<{ portal_url: string | null }> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/billing/portal`, {
      method: 'POST',
      headers: getCSRFHeaders(),
      credentials: 'include',
    })
    return handleResponse<{ portal_url: string | null }>(res)
  }, { portal_url: null })
}

export async function cancelSubscription(): Promise<{ message: string }> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/billing/cancel`, {
      method: 'POST',
      headers: getCSRFHeaders(),
      credentials: 'include',
    })
    return handleResponse<{ message: string }>(res)
  }, { message: 'Demo mode — subscription unchanged' })
}
