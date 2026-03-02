/**
 * helmProxy.ts
 *
 * AI service proxy — currently stubbed while migrating from Helm Hub
 * to native AI integration. All functions throw a friendly "coming soon"
 * error so the UI can display appropriate messages.
 *
 * Phase 3 will replace these stubs with direct OpenAI/Anthropic calls
 * via REI Hub's own /api/ai/ endpoints.
 */

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

// ── Stubbed functions — will be replaced with native AI calls ──

function comingSoon(feature: string): never {
  throw new HelmProxyError(
    503,
    `${feature} is being upgraded to native AI. Check back soon!`,
  )
}

export async function helmChat(
  _messages: HelmChatMessage[],
  _system?: string,
): Promise<HelmChatResponse> {
  comingSoon('AI Chat')
}

export async function helmAnalyzeDeal(
  _deal: HelmDealAnalysisRequest,
): Promise<HelmDealAnalysisResponse> {
  comingSoon('AI Deal Analysis')
}

export async function helmGenerateWaterfall(
  _req: ContentWaterfallRequest,
): Promise<ContentWaterfallResponse> {
  comingSoon('AI Content Generation')
}

export async function helmGenerateImagePrompts(
  _topic: string,
  _platform: string,
): Promise<ImagePromptsResponse> {
  comingSoon('AI Image Prompts')
}

export async function helmScrapeUrl(_url: string): Promise<ScrapeUrlResponse> {
  comingSoon('URL Scraping')
}

export async function helmSaveContentToCloud(
  _filename: string,
  _content: string,
  _mimeType: string = 'text/markdown',
): Promise<{ google_drive: unknown; dropbox: unknown; errors: string[] }> {
  comingSoon('Cloud Storage Save')
}
