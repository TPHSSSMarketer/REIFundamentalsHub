import { getAuthHeader } from './auth'
import type { AiChatMessage, AiChatResponse, AiTaskType } from './aiService'

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

const DEMO_AI_USER_CONFIG: AiUserConfig = {
  active_provider: 'anthropic',
  active_model: 'claude-3-5-sonnet',
  available_providers: [
    { id: 'anthropic', display_name: 'Claude (Anthropic)', models: ['claude-3-5-sonnet', 'claude-3-opus'] },
    { id: 'openai', display_name: 'OpenAI', models: ['gpt-4-turbo', 'gpt-4'] },
  ],
  can_override: true,
  can_bring_own_key: true,
  has_own_keys: false,
  override_enabled: false,
  own_anthropic_configured: false,
  own_nvidia_configured: false,
}

const DEMO_AI_TEST_RESPONSE: AiTestResponse = {
  response: 'This is a demo response. In production, Claude would analyze your real estate market data and provide investment insights.',
  provider: 'anthropic',
  model: 'claude-3-5-sonnet',
  tokens_used: 145,
  latency_ms: 289,
}

// ── Types ────────────────────────────────────────────────────────────

export interface AiProvider {
  id: string
  display_name: string
  models: string[]
  default_model?: string
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
  own_openai_configured?: boolean
}

export interface AiAdminConfig {
  id: string
  active_provider: string
  active_model: string
  // API keys are now managed exclusively via Admin > Credentials (ProviderCredentials)
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
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/config`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      }).then((res) => handleResponse<AiUserConfig>(res)),
    DEMO_AI_USER_CONFIG
  )
}

export async function updateAiConfig(data: {
  ai_provider_override?: string
  ai_model_override?: string
  ai_own_anthropic_key?: string
  ai_own_nvidia_key?: string
  ai_own_openai_key?: string
}): Promise<{ active_provider: string; active_model: string; override_enabled: boolean }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    { active_provider: 'anthropic', active_model: 'claude-3-5-sonnet', override_enabled: false }
  )
}

export async function testAiProvider(message: string, taskType: string = 'general'): Promise<AiTestResponse> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ message, task_type: taskType }),
        credentials: 'include',
      }).then((res) => handleResponse<AiTestResponse>(res)),
    DEMO_AI_TEST_RESPONSE
  )
}

export async function runResearch(
  query: string,
  context?: string
): Promise<{ content: string; provider: string; model: string }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ query, context: context ?? '' }),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    {
      content: 'Real estate market analysis indicates opportunities in undervalued properties with strong appreciation potential. Consider diversifying across multiple markets and property types.',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet',
    }
  )
}

export async function chatWithAi(
  messages: AiChatMessage[],
  system?: string,
  taskType?: AiTaskType
): Promise<AiChatResponse> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ messages, system, task_type: taskType ?? 'chat' }),
        credentials: 'include',
      }).then((res) => handleResponse<AiChatResponse>(res)),
    {
      content:
        'This is a demo response. In production, Claude would help you with real estate investing questions, draft SMS messages, and more.',
      model: 'claude-3-5-sonnet',
      usage: { input_tokens: 120, output_tokens: 85 },
    }
  )
}

export async function extractContactData(
  contactId: string,
  messages: Array<{ role: string; content: string }>,
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/extract-contact-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ contact_id: contactId, messages }),
        credentials: 'include',
      }).then((res) => handleResponse<Record<string, unknown>>(res)),
    {}
  )
}

export async function chatWithAiAndContact(
  messages: AiChatMessage[],
  system?: string,
  taskType?: AiTaskType,
  contactId?: string,
): Promise<AiChatResponse> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          messages,
          system,
          task_type: taskType ?? 'chat',
          contact_id: contactId,
        }),
        credentials: 'include',
      }).then((res) => handleResponse<AiChatResponse>(res)),
    {
      content:
        'This is a demo response. In production, Claude would help you with real estate investing questions, draft SMS messages, and more.',
      model: 'claude-3-5-sonnet',
      usage: { input_tokens: 120, output_tokens: 85 },
    }
  )
}

// ── ContentHub AI endpoints ──────────────────────────────────────────

export async function generateContentWaterfall(
  sourceText: string,
  topic?: string,
): Promise<{ content: Record<string, string>; topic: string; model: string; content_entry_id?: string }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/content/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ source_text: sourceText, topic: topic ?? 'Real Estate Investing' }),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    {
      content: {
        facebook: 'Demo: Facebook post content would appear here.',
        instagram: 'Demo: Instagram caption would appear here.',
        linkedin: 'Demo: LinkedIn post would appear here.',
        youtube_script: 'Demo: YouTube script would appear here.',
        youtube_short: 'Demo: YouTube Short script would appear here.',
        blog_post: '<h1>Demo Blog Post</h1><p>Blog content would appear here.</p>',
      },
      topic: topic ?? 'Real Estate Investing',
      model: 'demo',
    }
  )
}

export async function scrapeUrl(
  url: string,
): Promise<{ text: string; url: string; char_count: number }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/content/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ url }),
        credentials: 'include',
      }).then((res) => handleResponse(res)),
    {
      text: 'Demo: Scraped content from the URL would appear here.',
      url,
      char_count: 50,
    }
  )
}

// ── ContentHub Image Generation endpoints ────────────────────────────

export interface ContentImageResult {
  id: string | null
  prompt: string
  width: number
  height: number
  url?: string
  error?: string
}

export interface ContentImagesResponse {
  images: Record<string, ContentImageResult>
  topic: string
}

export async function generateContentImages(
  topic: string,
  platforms: string[] = ['facebook', 'instagram', 'linkedin', 'youtube_thumb', 'blog', 'youtube_short'],
): Promise<ContentImagesResponse> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/content/generate-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ topic, platforms }),
        credentials: 'include',
      }).then((res) => handleResponse<ContentImagesResponse>(res)),
    {
      images: Object.fromEntries(
        platforms.map((p) => [
          p,
          {
            id: null,
            prompt: `Demo: Image prompt for ${p} would appear here.`,
            width: 1024,
            height: p === 'instagram' ? 1024 : p === 'youtube_short' ? 1024 : 576,
            error: 'Demo mode — connect to generate real images.',
          },
        ]),
      ),
      topic,
    }
  )
}

/** Build the full public URL for a content image */
export function getContentImageUrl(imageId: string): string {
  return `${BASE_URL}/api/ai/content/image/${imageId}`
}

// ── Document Intelligence endpoints ─────────────────────────────────

export interface DocumentAnalysis {
  summary: string
  key_issues: Array<{ issue: string; severity: string; detail: string }>
  extracted_data: Record<string, string>
  risk_flags: string[]
  recommendation: string
  model: string
  cost_cents: number
}

export async function analyzeDocument(
  fileId: string,
  dealId: string,
  category: string = 'general',
): Promise<DocumentAnalysis> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/documents/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ file_id: fileId, deal_id: dealId, category }),
        credentials: 'include',
      }).then((res) => handleResponse<DocumentAnalysis>(res)),
    {
      summary: 'Demo: Document analysis would appear here.',
      key_issues: [],
      extracted_data: {},
      risk_flags: [],
      recommendation: 'Demo mode — connect to see real analysis.',
      model: 'demo',
      cost_cents: 0,
    }
  )
}

// ── Photo Analysis endpoints ────────────────────────────────────────

export interface PhotoAnalysisResult {
  per_photo: Array<{
    photo_index: number
    category: string
    condition_grade: string
    issues: string[]
    repair_cost_range: string
  }>
  summary: {
    overall_grade: string
    total_estimated_repairs: number
    condition_description: string
    key_concerns: string[]
  }
  model: string
  cost_cents: number
}

export async function analyzePropertyPhotos(
  dealId: string,
  photoIds: string[] = [],
): Promise<PhotoAnalysisResult> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/photos/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ deal_id: dealId, photo_ids: photoIds }),
        credentials: 'include',
      }).then((res) => handleResponse<PhotoAnalysisResult>(res)),
    {
      per_photo: [],
      summary: {
        overall_grade: '?',
        total_estimated_repairs: 0,
        condition_description: 'Demo mode — connect to see real analysis.',
        key_concerns: [],
      },
      model: 'demo',
      cost_cents: 0,
    }
  )
}

// ── Admin endpoints ─────────────────────────────────────────────────

export async function getAdminAiConfig(): Promise<AiAdminConfig> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/admin/config`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      }).then((res) => handleResponse<AiAdminConfig>(res)),
    {
      id: 'admin-ai-config-001',
      active_provider: 'anthropic',
      active_model: 'claude-3-5-sonnet',
      allow_user_override: true,
      user_can_bring_own_key: true,
      total_requests: 342,
      total_tokens: 89234,
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-02-20T14:30:00Z',
    }
  )
}

export async function updateAdminAiConfig(data: {
  active_provider?: string
  active_model?: string
  allow_user_override?: boolean
  user_can_bring_own_key?: boolean
}): Promise<AiAdminConfig> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/admin/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
        credentials: 'include',
      }).then((res) => handleResponse<AiAdminConfig>(res)),
    {
      id: 'admin-ai-config-001',
      active_provider: data.active_provider || 'anthropic',
      active_model: data.active_model || 'claude-3-5-sonnet',
      allow_user_override: data.allow_user_override ?? true,
      user_can_bring_own_key: data.user_can_bring_own_key ?? true,
      total_requests: 342,
      total_tokens: 89234,
      created_at: '2024-01-15T10:00:00Z',
      updated_at: new Date().toISOString(),
    }
  )
}

export async function getAiUsage(): Promise<AiUsage> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/admin/usage`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      }).then((res) => handleResponse<AiUsage>(res)),
    {
      total_requests: 342,
      total_tokens: 89234,
      per_user: [
        { user_id: 1, email: 'alex.chen@realestate.com', provider: 'anthropic', model: 'claude-3-5-sonnet', requests: 125, tokens: 32145 },
        { user_id: 2, email: 'sarah.martinez@investmentgroup.com', provider: 'anthropic', model: 'claude-3-5-sonnet', requests: 89, tokens: 28934 },
        { user_id: 3, email: 'john.wilson@deals.com', provider: 'anthropic', model: 'claude-3-5-sonnet', requests: 128, tokens: 28155 },
      ],
    }
  )
}

export async function getAllUsersAiSettings(): Promise<AiUserSetting[]> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/admin/users`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      }).then((res) => handleResponse<AiUserSetting[]>(res)),
    [
      {
        user_id: 1,
        email: 'alex.chen@realestate.com',
        full_name: 'Alex Chen',
        ai_provider_override: null,
        ai_model_override: null,
        ai_override_enabled: false,
        effective_provider: 'anthropic',
        effective_model: 'claude-3-5-sonnet',
      },
      {
        user_id: 2,
        email: 'sarah.martinez@investmentgroup.com',
        full_name: 'Sarah Martinez',
        ai_provider_override: null,
        ai_model_override: null,
        ai_override_enabled: false,
        effective_provider: 'anthropic',
        effective_model: 'claude-3-5-sonnet',
      },
    ]
  )
}

export async function updateUserAiSettings(
  userId: number,
  data: {
    ai_provider_override?: string
    ai_model_override?: string
    ai_override_enabled?: boolean
  }
): Promise<{ ok: boolean }> {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/ai/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
        credentials: 'include',
      }).then((res) => handleResponse<{ ok: boolean }>(res)),
    { ok: true }
  )
}
