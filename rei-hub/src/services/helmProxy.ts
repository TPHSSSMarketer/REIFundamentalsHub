const HELM_HUB_URL = import.meta.env.VITE_HELM_HUB_URL || 'http://localhost:8000'

export class HelmProxyError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

export type HelmChatMessage = { role: 'user' | 'assistant'; content: string }

export type HelmChatResponse = {
  content: string
  model: string
  usage: { input_tokens: number; output_tokens: number }
}

export type HelmDealAnalysisRequest = {
  address: string
  arv?: number
  asking_price?: number
  repair_estimate?: number
  notes?: string
}

export type HelmDealAnalysisResponse = { analysis: string; model: string }

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 403) {
    throw new HelmProxyError(403, 'REI plugin subscription required')
  }
  if (res.status === 502) {
    throw new HelmProxyError(502, 'AI service temporarily unavailable')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new HelmProxyError(res.status, data.detail || 'Unknown error')
  }
  return res.json() as Promise<T>
}

export async function helmChat(
  messages: HelmChatMessage[],
  system?: string,
): Promise<HelmChatResponse> {
  const res = await fetch(`${HELM_HUB_URL}/api/plugins/rei/hub/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, system }),
  })
  return handleResponse<HelmChatResponse>(res)
}

export async function helmAnalyzeDeal(
  deal: HelmDealAnalysisRequest,
): Promise<HelmDealAnalysisResponse> {
  const res = await fetch(`${HELM_HUB_URL}/api/plugins/rei/hub/ai/analyze-deal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(deal),
  })
  return handleResponse<HelmDealAnalysisResponse>(res)
}

export type ContentWaterfallRequest = {
  source_text: string
  topic?: string
  investor_name?: string
}

export type ContentWaterfallOutput = {
  facebook: string
  instagram: string
  linkedin: string
  youtube_script: string
  youtube_short: string
  blog_post: string
}

export type ContentWaterfallResponse = {
  content: ContentWaterfallOutput
  topic: string
  model: string
}

export type ImagePromptsResponse = {
  prompts: [string, string, string]
  platform: string
}

export type ScrapeUrlResponse = {
  text: string
  url: string
  char_count: number
}

export async function helmGenerateWaterfall(
  req: ContentWaterfallRequest,
): Promise<ContentWaterfallResponse> {
  const res = await fetch(`${HELM_HUB_URL}/api/plugins/rei/hub/ai/content-waterfall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  return handleResponse<ContentWaterfallResponse>(res)
}

export async function helmGenerateImagePrompts(
  topic: string,
  platform: string,
): Promise<ImagePromptsResponse> {
  const res = await fetch(`${HELM_HUB_URL}/api/plugins/rei/hub/ai/image-prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, platform }),
  })
  return handleResponse<ImagePromptsResponse>(res)
}

export async function helmScrapeUrl(url: string): Promise<ScrapeUrlResponse> {
  const res = await fetch(`${HELM_HUB_URL}/api/plugins/rei/hub/ai/scrape-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  return handleResponse<ScrapeUrlResponse>(res)
}
