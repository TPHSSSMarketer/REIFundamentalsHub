import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ────────────────────────────────────────────────────────────

export interface AiProvider {
  id: string
  display_name: string
  models: string[]
  default_model: string
}

export interface AiUserConfig {
  active_provider: string
  active_model: string
  available_providers: AiProvider[]
  can_override: boolean
  can_bring_own_key: boolean
  has_own_keys: boolean
  override_enabled: boolean
  own_anthropic_configured: boolean
  own_nvidia_configured: boolean
}

export interface AiAdminConfig {
  id: string
  active_provider: string
  active_model: string
  anthropic_api_key: string
  anthropic_configured: boolean
  nvidia_api_key: string
  nvidia_configured: boolean
  allow_user_override: boolean
  user_can_bring_own_key: boolean
  total_requests: number
  total_tokens: number
  created_at: string | null
  updated_at: string | null
}

export interface AiTestResponse {
  response: string
  provider: string
  model: string
  tokens_used: number
  latency_ms: number
}

export interface AiUsage {
  total_requests: number
  total_tokens: number
  per_user: Array<{
    user_id: number
    email: string
    provider: string
    model: string
    requests: number
    tokens: number
  }>
}

export interface AiUserSetting {
  user_id: number
  email: string
  full_name: string | null
  ai_provider_override: string | null
  ai_model_override: string | null
  ai_override_enabled: boolean
  effective_provider: string
  effective_model: string
}

// ── Helpers ──────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

// ── User endpoints ──────────────────────────────────────────────────

export async function getAiConfig(): Promise<AiUserConfig> {
  const res = await fetch(`${BASE_URL}/api/ai/config`, {
    headers: { ...getAuthHeader() },
  })
  return handleResponse<AiUserConfig>(res)
}

export async function updateAiConfig(data: {
  ai_provider_override?: string
  ai_model_override?: string
  ai_own_anthropic_key?: string
  ai_own_nvidia_key?: string
}): Promise<{ active_provider: string; active_model: string; override_enabled: boolean }> {
  const res = await fetch(`${BASE_URL}/api/ai/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  })
  return handleResponse(res)
}

export async function testAiProvider(message: string): Promise<AiTestResponse> {
  const res = await fetch(`${BASE_URL}/api/ai/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ message }),
  })
  return handleResponse<AiTestResponse>(res)
}

export async function runResearch(
  query: string,
  context?: string
): Promise<{ content: string; provider: string; model: string }> {
  const res = await fetch(`${BASE_URL}/api/ai/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ query, context: context ?? '' }),
  })
  return handleResponse(res)
}

// ── Admin endpoints ─────────────────────────────────────────────────

export async function getAdminAiConfig(): Promise<AiAdminConfig> {
  const res = await fetch(`${BASE_URL}/api/ai/admin/config`, {
    headers: { ...getAuthHeader() },
  })
  return handleResponse<AiAdminConfig>(res)
}

export async function updateAdminAiConfig(data: {
  active_provider?: string
  active_model?: string
  anthropic_api_key?: string
  nvidia_api_key?: string
  allow_user_override?: boolean
  user_can_bring_own_key?: boolean
}): Promise<AiAdminConfig> {
  const res = await fetch(`${BASE_URL}/api/ai/admin/config`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  })
  return handleResponse<AiAdminConfig>(res)
}

export async function getAiUsage(): Promise<AiUsage> {
  const res = await fetch(`${BASE_URL}/api/ai/admin/usage`, {
    headers: { ...getAuthHeader() },
  })
  return handleResponse<AiUsage>(res)
}

export async function getAllUsersAiSettings(): Promise<AiUserSetting[]> {
  const res = await fetch(`${BASE_URL}/api/ai/admin/users`, {
    headers: { ...getAuthHeader() },
  })
  return handleResponse<AiUserSetting[]>(res)
}

export async function updateUserAiSettings(
  userId: number,
  data: {
    ai_provider_override?: string
    ai_model_override?: string
    ai_override_enabled?: boolean
  }
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE_URL}/api/ai/admin/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
  })
  return handleResponse<{ ok: boolean }>(res)
}
