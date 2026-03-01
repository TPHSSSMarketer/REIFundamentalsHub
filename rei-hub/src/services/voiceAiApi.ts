/**
 * Voice AI API Service
 *
 * Frontend service for all Voice AI backend endpoints:
 * Agents, Knowledge Base, Conversations, Callbacks, Campaigns.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Types ──────────────────────────────────────────────────────────────

export interface AiAgent {
  id: string
  name: string
  role: string
  personality?: string
  elevenlabs_voice_id?: string
  elevenlabs_agent_id?: string
  system_prompt?: string
  first_message?: string
  is_active: boolean
  created_at: string
}

export interface UpdateAgentPayload {
  name?: string
  personality?: string
  elevenlabs_voice_id?: string
  system_prompt?: string
  first_message?: string
  is_active?: boolean
}

export interface ElevenLabsVoice {
  voice_id: string
  name: string
  preview_url?: string
  labels?: Record<string, string>
}

export interface KnowledgeEntry {
  id: string
  name: string
  entry_type: 'account_data' | 'custom_script' | 'objection_handler'
  content: string
  is_platform: boolean
  is_active: boolean
  created_at: string
}

export interface CreateKnowledgePayload {
  name: string
  entry_type: 'account_data' | 'custom_script' | 'objection_handler'
  content: string
}

export interface UpdateKnowledgePayload {
  name?: string
  content?: string
  is_active?: boolean
}

export interface ConversationLog {
  id: string
  call_log_id?: string
  agent_id?: string
  agent_name?: string
  caller_phone?: string
  caller_mood?: string
  deal_eagerness?: string
  outcome?: string
  summary?: string
  status?: string
  started_at?: string
  ended_at?: string
  extracted_data?: Record<string, any>
  transcript?: Array<{ role: string; content: string; timestamp?: string }>
}

export interface ScheduledCallback {
  id: string
  contact_name?: string
  contact_phone: string
  contact_email?: string
  property_address?: string
  scheduled_at: string
  timezone?: string
  callback_type: 'ai' | 'human'
  agent_id?: string
  phone_number_id?: string
  status: string
  attempt_count: number
  max_attempts: number
  notes?: string
  created_at: string
}

export interface CreateCallbackPayload {
  contact_phone: string
  contact_name?: string
  contact_email?: string
  property_address?: string
  scheduled_at: string
  timezone?: string
  callback_type: 'ai' | 'human'
  agent_id?: string
  phone_number_id?: string
  notes?: string
}

export interface CallCampaign {
  id: string
  name: string
  agent_id?: string
  phone_number_id?: string
  status: string
  total_contacts: number
  calls_made: number
  calls_answered: number
  calls_no_answer: number
  calls_failed: number
  leads_qualified: number
  appointments_set: number
  calling_window_start?: string
  calling_window_end?: string
  calling_days?: string[]
  timezone?: string
  seconds_between_calls?: number
  created_at: string
}

export interface CreateCampaignPayload {
  name: string
  agent_id?: string
  phone_number_id?: string
  calling_window_start?: string
  calling_window_end?: string
  calling_days?: string[]
  timezone?: string
  seconds_between_calls?: number
}

export interface CampaignContact {
  id: string
  contact_name?: string
  contact_phone: string
  contact_email?: string
  property_address?: string
  status: string
  attempt_count: number
  outcome?: string
  deal_eagerness?: string
  called_at?: string
  context_notes?: string
}

export interface AddContactPayload {
  contact_name?: string
  contact_phone: string
  contact_email?: string
  property_address?: string
  context_notes?: string
}

// ── Helpers ────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

// ══════════════════════════════════════════════════════════════
//  AGENTS
// ══════════════════════════════════════════════════════════════

export async function getAgents(): Promise<AiAgent[]> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/agents`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function updateAgent(agentId: string, data: UpdateAgentPayload): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function provisionAgent(agentId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/agents/${agentId}/provision`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function getVoices(): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/voices`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

// ══════════════════════════════════════════════════════════════
//  KNOWLEDGE BASE
// ══════════════════════════════════════════════════════════════

export async function getKnowledgeBase(): Promise<KnowledgeEntry[]> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/knowledge-base`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function createKnowledgeEntry(data: CreateKnowledgePayload): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/knowledge-base`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function updateKnowledgeEntry(entryId: string, data: UpdateKnowledgePayload): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/knowledge-base/${entryId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function deleteKnowledgeEntry(entryId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/knowledge-base/${entryId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

// ══════════════════════════════════════════════════════════════
//  CONVERSATIONS
// ══════════════════════════════════════════════════════════════

export async function getConversations(params?: {
  limit?: number
  offset?: number
  outcome?: string
}): Promise<ConversationLog[]> {
  const url = new URL(`${BASE_URL}/api/voice-ai/conversations`)
  if (params?.limit) url.searchParams.set('limit', String(params.limit))
  if (params?.offset) url.searchParams.set('offset', String(params.offset))
  if (params?.outcome) url.searchParams.set('outcome', params.outcome)
  const res = await fetch(url.toString(), { headers: getAuthHeader(), credentials: 'include' })
  return handleResponse(res)
}

export async function getConversation(conversationId: string): Promise<ConversationLog> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/conversations/${conversationId}`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

// ══════════════════════════════════════════════════════════════
//  CALLBACKS
// ══════════════════════════════════════════════════════════════

export async function getCallbacks(status?: string): Promise<ScheduledCallback[]> {
  const url = new URL(`${BASE_URL}/api/voice-ai/callbacks`)
  if (status) url.searchParams.set('status', status)
  const res = await fetch(url.toString(), { headers: getAuthHeader(), credentials: 'include' })
  return handleResponse(res)
}

export async function createCallback(data: CreateCallbackPayload): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/callbacks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function updateCallback(callbackId: string, data: {
  status?: string
  scheduled_at?: string
  notes?: string
}): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/callbacks/${callbackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function cancelCallback(callbackId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/callbacks/${callbackId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

// ══════════════════════════════════════════════════════════════
//  CAMPAIGNS
// ══════════════════════════════════════════════════════════════

export async function getCampaigns(status?: string): Promise<CallCampaign[]> {
  const url = new URL(`${BASE_URL}/api/voice-ai/campaigns`)
  if (status) url.searchParams.set('status', status)
  const res = await fetch(url.toString(), { headers: getAuthHeader(), credentials: 'include' })
  return handleResponse(res)
}

export async function createCampaign(data: CreateCampaignPayload): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/campaigns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function addCampaignContacts(
  campaignId: string,
  contacts: AddContactPayload[],
): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/campaigns/${campaignId}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ contacts }),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function getCampaignContacts(
  campaignId: string,
  status?: string,
): Promise<CampaignContact[]> {
  const url = new URL(`${BASE_URL}/api/voice-ai/campaigns/${campaignId}/contacts`)
  if (status) url.searchParams.set('status', status)
  const res = await fetch(url.toString(), { headers: getAuthHeader(), credentials: 'include' })
  return handleResponse(res)
}

export async function startCampaign(campaignId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/campaigns/${campaignId}/start`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function pauseCampaign(campaignId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/campaigns/${campaignId}/pause`, {
    method: 'POST',
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}

export async function getCampaignStats(campaignId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/voice-ai/campaigns/${campaignId}/stats`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })
  return handleResponse(res)
}
