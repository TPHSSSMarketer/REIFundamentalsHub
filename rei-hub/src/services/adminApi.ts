import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

export interface Subscriber {
  user_id: number
  email: string
  plan: string | null
  billing_interval: string | null
  subscription_status: string | null
  trial_ends_at: string | null
  helm_addon_active: boolean
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
  helm_addon_count: number
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

export async function getSubscribers(filters: {
  status?: string
  plan?: string
  page?: number
  per_page?: number
} = {}): Promise<SubscribersResponse> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.plan) params.set('plan', filters.plan)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.per_page) params.set('per_page', String(filters.per_page))

  const qs = params.toString()
  const res = await fetch(`${BASE_URL}/api/admin/subscribers${qs ? `?${qs}` : ''}`, {
    headers: { ...getAuthHeader() },
  })
  return handleResponse<SubscribersResponse>(res)
}

export async function getSubscriber(userId: string): Promise<Subscriber> {
  const res = await fetch(`${BASE_URL}/api/admin/subscribers/${userId}`, {
    headers: { ...getAuthHeader() },
  })
  return handleResponse<Subscriber>(res)
}

export async function adjustPlan(
  userId: string,
  data: {
    plan?: string
    billing_interval?: string
    subscription_status?: string
    helm_addon_active?: boolean
  }
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE_URL}/api/admin/subscribers/${userId}/adjust-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  })
  return handleResponse<{ ok: boolean }>(res)
}

export async function cancelSubscriber(userId: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE_URL}/api/admin/subscribers/${userId}/cancel`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
  })
  return handleResponse<{ ok: boolean }>(res)
}

export async function getStats(): Promise<AdminStats> {
  const res = await fetch(`${BASE_URL}/api/admin/stats`, {
    headers: { ...getAuthHeader() },
  })
  return handleResponse<AdminStats>(res)
}
