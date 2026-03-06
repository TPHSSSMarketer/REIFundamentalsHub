import { getCSRFHeaders } from '@/services/authApi'

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

const DEMO_ONBOARDING_STATUS = {
  completed: true,
  current_step: 6,
  user: {
    company_name: 'REI Fundamentals LLC',
    company_address: '123 Main Street',
    company_city: 'Austin',
    company_state: 'TX',
    company_zip: '78701',
    company_phone: '(512) 555-0123',
    company_website: 'https://reifundamentalshub.com',
    investing_experience: 'intermediate',
    deal_types: 'fix_flip,rental',
    primary_market: 'Texas',
    storage_provider: 'none',
    email: 'demo@reifundamentals.com',
    full_name: 'Demo User',
  },
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

export async function getOnboardingStatus() {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/onboarding/status`, {
        credentials: 'include',
      }).then((res) =>
        handleResponse<{
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
      ),
    DEMO_ONBOARDING_STATUS
  )
}

export async function saveStep(
  stepNumber: number,
  data: Record<string, unknown>,
) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/onboarding/step/${stepNumber}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getCSRFHeaders(),
        },
        body: JSON.stringify(data),
        credentials: 'include',
      }).then((res) =>
        handleResponse<{
          success: boolean
          next_step: number
          number_purchased?: string
          friendly_number?: string
          dns_records?: Array<{ type: string; host: string; value: string }>
        }>(res)
      ),
    {
      success: true,
      next_step: stepNumber + 1,
      number_purchased: stepNumber === 2 ? '+1-512-555-0100' : undefined,
      friendly_number: stepNumber === 2 ? 'reifundamentals' : undefined,
    }
  )
}

export async function completeOnboarding() {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/onboarding/complete`, {
        method: 'POST',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      }).then((res) => handleResponse<{ success: boolean; redirect: string }>(res)),
    { success: true, redirect: '/dashboard' }
  )
}

export async function skipOnboarding() {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/onboarding/skip`, {
        method: 'POST',
        headers: { ...getCSRFHeaders() },
        credentials: 'include',
      }).then((res) => handleResponse<{ success: boolean }>(res)),
    { success: true }
  )
}
