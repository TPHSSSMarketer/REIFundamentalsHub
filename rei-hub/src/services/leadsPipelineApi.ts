/**
 * Leads Pipeline API — upload lists, manage leads, promote to CRM deals.
 */

import { getToken } from './auth'

const BASE = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

async function authFetch(path: string, init: RequestInit = {}) {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  // Don't set Content-Type for FormData (browser sets boundary automatically)
  if (!(init.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body}`)
  }
  return res.json()
}

// ── Types ────────────────────────────────────────────────

export interface LeadList {
  id: number
  list_name: string
  source: string | null
  description: string | null
  original_filename: string | null
  lead_count: number
  created_at: string | null
}

export interface Lead {
  id: string
  list_id: number | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  zip_code: string | null
  property_type: string | null
  status: string
  tags_json: string | null
  notes: string | null
  total_mailers_sent: number
  last_mailed_at: string | null
  crm_contact_id: string | null
  crm_deal_id: string | null
  created_at: string | null
}

export interface MarketingTouchItem {
  id: number
  touch_type: string
  delivery_status: string
  cost: number | null
  provider_id: string | null
  campaign_id: number | null
  sent_date: string | null
  created_at: string | null
}

export interface UploadResult {
  list_id: number
  filename: string
  headers: string[]
  suggested_mapping: Record<string, string>
  row_count: number
  preview_rows: Record<string, string>[]
}

// ── Lead Lists ───────────────────────────────────────────

export async function getLists(): Promise<LeadList[]> {
  return authFetch('/api/leads/lists')
}

export async function createList(params: {
  list_name: string
  source?: string
  description?: string
}): Promise<{ id: number; list_name: string }> {
  return authFetch('/api/leads/lists', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function deleteList(listId: number): Promise<{ status: string }> {
  return authFetch(`/api/leads/lists/${listId}`, { method: 'DELETE' })
}

// ── File Upload ──────────────────────────────────────────

export async function uploadListFile(listId: number, file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  return authFetch(`/api/leads/lists/${listId}/upload`, {
    method: 'POST',
    body: form,
  })
}

export async function confirmImport(
  listId: number,
  mapping: Record<string, string>,
  file: File,
): Promise<{ imported: number; list_id: number }> {
  const form = new FormData()
  form.append('file', file)
  form.append('mapping', JSON.stringify(mapping))
  // Note: FastAPI expects the mapping in the form body alongside the file.
  // We use a special approach — the backend expects both File and JSON body.
  // We'll send mapping as a form field that the backend parses.
  return authFetch(`/api/leads/lists/${listId}/confirm-import`, {
    method: 'POST',
    body: form,
  })
}

// ── Lead CRUD ────────────────────────────────────────────

export async function getLeads(params?: {
  list_id?: number
  status?: string
  tag?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<{ total: number; leads: Lead[] }> {
  const qs = new URLSearchParams()
  if (params?.list_id) qs.set('list_id', String(params.list_id))
  if (params?.status) qs.set('status', params.status)
  if (params?.tag) qs.set('tag', params.tag)
  if (params?.search) qs.set('search', params.search)
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.offset) qs.set('offset', String(params.offset))
  const q = qs.toString()
  return authFetch(`/api/leads${q ? `?${q}` : ''}`)
}

export async function createLead(params: {
  first_name?: string
  last_name?: string
  full_name?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  property_type?: string
  list_id?: number
  notes?: string
}): Promise<{ id: string; status: string }> {
  return authFetch('/api/leads', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function updateLead(
  leadId: string,
  updates: Partial<Lead>,
): Promise<{ id: string; status: string }> {
  return authFetch(`/api/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function deleteLead(leadId: string): Promise<{ status: string }> {
  return authFetch(`/api/leads/${leadId}`, { method: 'DELETE' })
}

// ── Promote to Deal ──────────────────────────────────────

export async function promoteToDeal(leadId: string): Promise<{
  lead_id: string
  crm_contact_id: string
  crm_deal_id: string
  status: string
}> {
  return authFetch(`/api/leads/${leadId}/promote`, { method: 'POST' })
}

// ── Marketing Touches ────────────────────────────────────

export async function getLeadTouches(leadId: string): Promise<MarketingTouchItem[]> {
  return authFetch(`/api/leads/${leadId}/touches`)
}
