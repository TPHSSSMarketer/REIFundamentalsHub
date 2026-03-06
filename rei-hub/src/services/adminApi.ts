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

const DEMO_ADMIN_STATS: AdminStats = {
  total_subscribers: 145,
  active: 98,
  trialing: 32,
  past_due: 8,
  canceled: 7,
  mrr_cents: 287500,
  by_plan: {
    starter: 45,
    pro: 72,
    team: 18,
  },
}

const DEMO_SUBSCRIBERS_RESPONSE: SubscribersResponse = {
  subscribers: [
    {
      user_id: 1,
      email: 'alex.chen@realestate.com',
      plan: 'pro',
      billing_interval: 'monthly',
      subscription_status: 'active',
      trial_ends_at: null,
    },
    {
      user_id: 2,
      email: 'sarah.martinez@investmentgroup.com',
      plan: 'team',
      billing_interval: 'annual',
      subscription_status: 'active',
      trial_ends_at: null,
    },
    {
      user_id: 3,
      email: 'john.wilson@deals.com',
      plan: 'starter',
      billing_interval: 'monthly',
      subscription_status: 'trialing',
      trial_ends_at: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  total: 145,
  page: 1,
  per_page: 50,
}

export interface Subscriber {
  user_id: number
  email: string
  plan: string | null
  billing_interval: string | null
  subscription_status: string | null
  trial_ends_at: string | null
  is_complimentary?: boolean
  is_superadmin?: boolean
  loan_servicing_enabled?: boolean
  bank_negotiation_enabled?: boolean
}

export interface SubscribersResponse {
  subscribers: Subscriber[]
  total: number
  page: number
  per_page: number
}

export interface AdminStats {
  total_subscribers: number
  active: number
  trialing: number
  past_due: number
  canceled: number
  mrr_cents: number
  by_plan: Record<string, number>
}

async function handleResponse<T>(res: Response): Promise<T> {
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
  throw new Error(body.detail ?? 'Request failed')
}

export async function getSubscribers(filters: {
  status?: string
  plan?: string
  page?: number
  per_page?: number
} = {}): Promise<SubscribersResponse> {
  return withDemoFallback(
    () => {
      const params = new URLSearchParams()
      if (filters.status) params.set('status', filters.status)
      if (filters.plan) params.set('plan', filters.plan)
      if (filters.page) params.set('page', String(filters.page))
      if (filters.per_page) params.set('per_page', String(filters.per_page))

      const qs = params.toString()
      return fetch(`${BASE_URL}/api/admin/subscribers${qs ? `?${qs}` : ''}`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      }).then((res) => handleResponse<SubscribersResponse>(res))
    },
    DEMO_SUBSCRIBERS_RESPONSE
  )
}

export async function getSubscriber(userId: string): Promise<Subscriber> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/admin/subscribers/${userId}`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      }).then((res) => handleResponse<Subscriber>(res)),
    DEMO_SUBSCRIBERS_RESPONSE.subscribers[0]
  )
}

export async function adjustPlan(
  userId: string,
  data: {
    plan?: string
    billing_interval?: string
    subscription_status?: string
    is_complimentary?: boolean
    loan_servicing_enabled?: boolean
    bank_negotiation_enabled?: boolean
  }
): Promise<{ ok: boolean }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/admin/subscribers/${userId}/adjust-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
        credentials: 'include',
      }).then((res) => handleResponse<{ ok: boolean }>(res)),
    { ok: true }
  )
}

export async function cancelSubscriber(userId: string): Promise<{ ok: boolean }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/admin/subscribers/${userId}/cancel`, {
        method: 'POST',
        headers: { ...getAuthHeader() },
        credentials: 'include',
      }).then((res) => handleResponse<{ ok: boolean }>(res)),
    { ok: true }
  )
}

export async function getStats(): Promise<AdminStats> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/admin/stats`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      }).then((res) => handleResponse<AdminStats>(res)),
    DEMO_ADMIN_STATS
  )
}
