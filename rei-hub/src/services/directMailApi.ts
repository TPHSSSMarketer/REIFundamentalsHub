/**
 * Direct Mail API — templates, campaigns, AI copy, send via Thanks.io.
 */

import { getToken } from './auth'

const BASE = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

async function authFetch(path: string, init: RequestInit = {}) {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json()
}

// ── Types ────────────────────────────────────────────────

export interface MailTemplate {
  id: number
  name: string
  mail_type: string
  front_html: string | null
  back_copy_template: string | null
  letter_html_template: string | null
  front_image_b64: string | null
  is_default: boolean
  created_at: string | null
}

export interface Campaign {
  id: number
  name: string
  mail_type: string
  status: string
  total_recipients: number
  sent_count: number
  failed_count: number
  total_cost: number
  front_image_b64: string | null
  created_at: string | null
  sent_at: string | null
}

export interface CampaignDetail extends Campaign {
  copy_text: string | null
  touches: {
    lead_id: string
    status: string
    cost: number | null
    provider_id: string | null
    sent_date: string | null
  }[]
  front_image_b64: string | null
}

// ── Templates ────────────────────────────────────────────

export async function getTemplates(): Promise<MailTemplate[]> {
  return authFetch('/api/direct-mail/templates')
}

export async function createTemplate(params: {
  name: string
  mail_type: string
  front_html?: string
  back_copy_template?: string
  letter_html_template?: string
  front_image_b64?: string
}): Promise<{ id: number; name: string }> {
  return authFetch('/api/direct-mail/templates', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function deleteTemplate(templateId: number): Promise<{ status: string }> {
  return authFetch(`/api/direct-mail/templates/${templateId}`, { method: 'DELETE' })
}

// ── AI Copy Generation ───────────────────────────────────

export async function generateCopy(params: {
  lead_id: string
  mail_type: string
  campaign_type?: string
  custom_instructions?: string
}): Promise<{ copy_text: string; lead_id: string }> {
  return authFetch('/api/direct-mail/generate-copy', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function generateFrontImage(params: {
  campaign_type: string
  custom_prompt?: string
}): Promise<{ image_b64: string }> {
  return authFetch('/api/direct-mail/generate-front-image', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// ── Campaigns ────────────────────────────────────────────

export async function getCampaigns(): Promise<Campaign[]> {
  return authFetch('/api/direct-mail/campaigns')
}

export async function createCampaign(params: {
  name: string
  mail_type: string
  template_id?: number
  copy_text?: string
  lead_ids?: string[]
  list_id?: number
  status_filter?: string
  tag_filter?: string
  front_image_b64?: string
}): Promise<{
  id: number
  name: string
  total_recipients: number
  estimated_cost: number
  status: string
}> {
  return authFetch('/api/direct-mail/campaigns', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function sendCampaign(campaignId: number): Promise<{
  campaign_id: number
  status: string
  sent: number
  failed: number
  total_cost: number
}> {
  return authFetch(`/api/direct-mail/campaigns/${campaignId}/send`, {
    method: 'POST',
  })
}

export async function getCampaignDetail(campaignId: number): Promise<CampaignDetail> {
  return authFetch(`/api/direct-mail/campaigns/${campaignId}`)
}
