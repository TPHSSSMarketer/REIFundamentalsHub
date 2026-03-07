/**
 * aiService.ts
 *
 * AI service — provides typed wrappers around REI Hub's /api/ai/ endpoints.
 * Chat is fully wired; remaining features will be connected in future phases.
 */

import { chatWithAi, chatWithAiAndContact, extractContactData, generateContentImages, generateContentWaterfall, scrapeUrl } from './aiApi'
import type { ContentImagesResponse } from './aiApi'

export class AiServiceError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

/** @deprecated Use AiServiceError — alias kept for existing imports */
export const HelmProxyError = AiServiceError

export type AiChatMessage = { role: 'user' | 'assistant'; content: string }
/** @deprecated Use AiChatMessage */
export type HelmChatMessage = AiChatMessage

export type AiChatResponse = {
  content: string
  model: string
  usage: { input_tokens: number; output_tokens: number }
}
/** @deprecated Use AiChatResponse */
export type HelmChatResponse = AiChatResponse

export type DealAnalysisRequest = {
  address: string
  arv?: number
  asking_price?: number
  repair_estimate?: number
  notes?: string
}
/** @deprecated Use DealAnalysisRequest */
export type HelmDealAnalysisRequest = DealAnalysisRequest

export type DealAnalysisResponse = { analysis: string; model: string }
/** @deprecated Use DealAnalysisResponse */
export type HelmDealAnalysisResponse = DealAnalysisResponse

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
  content_entry_id?: string
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
  throw new AiServiceError(
    503,
    `${feature} is being upgraded to native AI. Check back soon!`,
  )
}

export type AiTaskType = 'chat' | 'sms_draft' | 'opener'

export async function aiChat(
  messages: AiChatMessage[],
  system?: string,
  taskType?: AiTaskType,
  contactId?: string,
): Promise<AiChatResponse> {
  if (contactId) {
    return chatWithAiAndContact(messages, system, taskType, contactId)
  }
  return chatWithAi(messages, system, taskType)
}

export { extractContactData }
/** @deprecated Use aiChat */
export const helmChat = aiChat

export async function aiAnalyzeDeal(
  _deal: DealAnalysisRequest,
): Promise<DealAnalysisResponse> {
  comingSoon('AI Deal Analysis')
}
/** @deprecated Use aiAnalyzeDeal */
export const helmAnalyzeDeal = aiAnalyzeDeal

export async function aiGenerateWaterfall(
  req: ContentWaterfallRequest,
): Promise<ContentWaterfallResponse> {
  const result = await generateContentWaterfall(req.source_text, req.topic)
  return {
    content: result.content as unknown as ContentWaterfallOutput,
    topic: result.topic,
    model: result.model,
    content_entry_id: result.content_entry_id,
  }
}
/** @deprecated Use aiGenerateWaterfall */
export const helmGenerateWaterfall = aiGenerateWaterfall

export async function aiGenerateImagePrompts(
  topic: string,
  platforms?: string[],
): Promise<ContentImagesResponse> {
  return generateContentImages(topic, platforms)
}
/** @deprecated Use aiGenerateImagePrompts */
export const helmGenerateImagePrompts = aiGenerateImagePrompts

export async function aiScrapeUrl(url: string): Promise<ScrapeUrlResponse> {
  return scrapeUrl(url)
}
/** @deprecated Use aiScrapeUrl */
export const helmScrapeUrl = aiScrapeUrl

export async function aiSaveContentToCloud(
  _filename: string,
  _content: string,
  _mimeType: string = 'text/markdown',
): Promise<{ google_drive: unknown; dropbox: unknown; errors: string[] }> {
  comingSoon('Cloud Storage Save')
}
/** @deprecated Use aiSaveContentToCloud */
export const helmSaveContentToCloud = aiSaveContentToCloud
