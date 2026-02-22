const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

export async function getOnboardingStatus(token: string) {
  const res = await fetch(`${BASE_URL}/api/onboarding/status`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{
    completed: boolean
    current_step: number
    user: {
      company_name: string | null
      company_address: string | null
      company_city: string | null
      company_state: string | null
      company_zip: string | null
      company_phone: string | null
      company_website: string | null
      investing_experience: string | null
      deal_types: string | null
      primary_market: string | null
      storage_provider: string | null
      email: string
      full_name: string | null
    }
  }>(res)
}

export async function saveStep(
  stepNumber: number,
  data: Record<string, unknown>,
  token: string
) {
  const res = await fetch(`${BASE_URL}/api/onboarding/step/${stepNumber}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  return handleResponse<{
    success: boolean
    next_step: number
    number_purchased?: string
    friendly_number?: string
    dns_records?: Array<{ type: string; host: string; value: string }>
  }>(res)
}

export async function completeOnboarding(token: string) {
  const res = await fetch(`${BASE_URL}/api/onboarding/complete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ success: boolean; redirect: string }>(res)
}

export async function skipOnboarding(token: string) {
  const res = await fetch(`${BASE_URL}/api/onboarding/skip`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return handleResponse<{ success: boolean }>(res)
}
