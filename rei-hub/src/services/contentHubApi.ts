/**
 * contentHubApi.ts — Typed API client for ContentHub persistent content database.
 *
 * Handles save, search, performance tracking, and publish history.
 * Uses the same fetch + getAuthHeader pattern as aiApi.ts.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ────────────────────────────────────────────────────────────────

export interface ContentEntry {
  id: string
  content_type: 'source_article' | 'waterfall' | 'inspiration'
  topic: string
  platform?: string
  source_url?: string
  tags: string[]
  content: Record<string, string>
  rating?: 'worked' | 'flopped' | 'pending' | null
  performance_notes?: string
  engagement_count: number
  similarity?: number  // Only present in search results
  created_at: string
  updated_at: string
}

export interface PublishRecord {
  id: string
  content_entry_id: string
  platform: string
  platform_post_id?: string
  status: 'success' | 'pending' | 'failed'
  error_message?: string
  likes: number
  comments: number
  shares: number
  views: number
  published_at: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text()
    throw new Error(body || `HTTP ${res.status}`)
  }
  return res.json()
}

// ── Save Functions ───────────────────────────────────────────────────────

export async function saveSourceArticle(
  sourceText: string,
  topic: string,
  sourceUrl?: string,
  tags: string[] = [],
): Promise<{ status: string; id: string }> {
  const res = await fetch(`${BASE_URL}/api/content-hub/save-source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ source_url: sourceUrl, source_text: sourceText, topic, tags }),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function saveWaterfallContent(
  topic: string,
  waterfallOutput: Record<string, string>,
  sourceArticleId?: string,
  tags: string[] = [],
): Promise<{ status: string; id: string }> {
  const res = await fetch(`${BASE_URL}/api/content-hub/save-waterfall`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({
      topic,
      waterfall_output: waterfallOutput,
      source_article_id: sourceArticleId,
      tags,
    }),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function recordPublish(params: {
  content_entry_id: string
  platform: string
  platform_post_id?: string
  status?: string
  error_message?: string
}): Promise<{ status: string; id: string }> {
  const res = await fetch(`${BASE_URL}/api/content-hub/publish-record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({
      content_entry_id: params.content_entry_id,
      platform: params.platform,
      platform_post_id: params.platform_post_id,
      status: params.status ?? 'success',
      error_message: params.error_message,
    }),
    credentials: 'include',
  })
  return handleResponse(res)
}

// ── Query Functions ──────────────────────────────────────────────────────

export async function listLibrary(
  filters?: { content_type?: string; platform?: string; tag?: string; rating?: string },
): Promise<{ entries: ContentEntry[]; count: number }> {
  const params = new URLSearchParams()
  if (filters?.content_type) params.append('content_type', filters.content_type)
  if (filters?.platform) params.append('platform', filters.platform)
  if (filters?.tag) params.append('tag', filters.tag)
  if (filters?.rating) params.append('rating', filters.rating)

  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await fetch(`${BASE_URL}/api/content-hub/library${qs}`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function searchContent(
  query: string,
): Promise<{ results: ContentEntry[]; count: number }> {
  const res = await fetch(`${BASE_URL}/api/content-hub/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ query }),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function updatePerformance(
  contentId: string,
  rating?: string,
  notes?: string,
): Promise<{ status: string; entry: ContentEntry }> {
  const res = await fetch(`${BASE_URL}/api/content-hub/content/${contentId}/performance`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ rating, notes }),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function getPublishHistory(
  contentEntryId?: string,
): Promise<{ records: PublishRecord[]; count: number }> {
  const qs = contentEntryId ? `?content_entry_id=${contentEntryId}` : ''
  const res = await fetch(`${BASE_URL}/api/content-hub/publish-history${qs}`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  })
  return handleResponse(res)
}
