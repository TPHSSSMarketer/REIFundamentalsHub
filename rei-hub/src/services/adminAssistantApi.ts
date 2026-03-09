import { getAuthHeader } from './auth'
import type {
  AdminSession,
  AdminMessage,
  AdminActionLog,
  AdminTrustSetting,
  AdminSkill,
  AdminScheduledTask,
} from '../types'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Demo Mode Helper ──────────────────────────────────────────

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

// ── Error Handling ─────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json()

  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment before trying again.')
  }
  if (res.status === 401) {
    localStorage.removeItem('rei_token')
    window.location.href = '/login'
    throw new Error('Your session has expired. Please log in again.')
  }
  if (res.status === 403) {
    throw new Error("You don't have permission to perform this action.")
  }

  const body = await res.json().catch(() => ({}))
  if (res.status === 422) {
    const detail = body.detail
    if (Array.isArray(detail)) {
      throw new Error(detail.map((d: any) => d.msg).join(', '))
    }
    throw new Error(detail ?? 'Validation error')
  }
  throw new Error(body.detail ?? 'Request failed')
}

// ── Chat Sessions ──────────────────────────────────────────────

export async function createSession(title?: string): Promise<AdminSession> {
  if (isDemoMode()) {
    const id = `demo-${Date.now()}`
    return { id, user_id: 0, title: title || 'New Conversation', is_active: true, created_at: new Date().toISOString(), last_message_at: new Date().toISOString(), message_count: 0 } as AdminSession
  }
  const body = title ? { title } : {}
  return fetch(`${BASE_URL}/api/assistant/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
    credentials: 'include',
  }).then((res) => handleResponse<AdminSession>(res))
}

export async function listSessions(): Promise<AdminSession[]> {
  if (isDemoMode()) return []
  return fetch(`${BASE_URL}/api/assistant/sessions`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse<AdminSession[]>(res))
}

export async function getSessionMessages(sessionId: string): Promise<AdminMessage[]> {
  if (isDemoMode()) return []
  return fetch(`${BASE_URL}/api/assistant/sessions/${sessionId}/messages`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse<AdminMessage[]>(res))
}

export async function sendMessage(
  sessionId: string,
  content: string
): Promise<{ response: string; tool_results: any[]; pending_actions: any[]; suggestions: any[] }> {
  if (isDemoMode()) {
    return { response: 'The AI Assistant is not available in Demo Mode. Please upgrade to a paid plan to use this feature.', tool_results: [], pending_actions: [], suggestions: [] }
  }
  return fetch(`${BASE_URL}/api/assistant/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ content }),
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

// ── Actions ────────────────────────────────────────────────────

export async function getActionLog(params?: {
  limit?: number
  offset?: number
  status?: string
}): Promise<AdminActionLog[]> {
  if (isDemoMode()) return []
  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))
  if (params?.status) searchParams.set('status', params.status)

  const qs = searchParams.toString()
  return fetch(`${BASE_URL}/api/assistant/actions${qs ? `?${qs}` : ''}`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse<AdminActionLog[]>(res))
}

export async function approveAction(actionId: string, message?: string): Promise<any> {
  const body = message ? { message } : {}
  return fetch(`${BASE_URL}/api/assistant/actions/${actionId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

export async function rejectAction(actionId: string, reason?: string): Promise<any> {
  const body = reason ? { reason } : {}
  return fetch(`${BASE_URL}/api/assistant/actions/${actionId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

// ── Trust Settings ─────────────────────────────────────────────

export async function getTrustSettings(): Promise<AdminTrustSetting[]> {
  if (isDemoMode()) return []
  return fetch(`${BASE_URL}/api/assistant/trust-settings`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse<AdminTrustSetting[]>(res))
}

export async function updateTrustSetting(
  actionType: string,
  trustLevel: string
): Promise<any> {
  return fetch(`${BASE_URL}/api/assistant/trust-settings/${actionType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ trust_level: trustLevel }),
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

export async function setAllAutomatic(enabled: boolean): Promise<any> {
  return fetch(`${BASE_URL}/api/assistant/trust-settings/all/set-automatic`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ enabled }),
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

export async function resetTrustDefaults(): Promise<any> {
  return fetch(`${BASE_URL}/api/assistant/trust-settings/reset`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

// ── Skills ─────────────────────────────────────────────────────

export async function getSkillLibrary(): Promise<AdminSkill[]> {
  if (isDemoMode()) return []
  return fetch(`${BASE_URL}/api/assistant/skills`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse<AdminSkill[]>(res))
}

export async function createSkill(skill: {
  name: string
  description: string
  category: string
  action_steps: any[]
  icon?: string
}): Promise<AdminSkill> {
  return fetch(`${BASE_URL}/api/assistant/skills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(skill),
    credentials: 'include',
  }).then((res) => handleResponse<AdminSkill>(res))
}

export async function updateSkill(skillId: string, updates: Partial<AdminSkill>): Promise<any> {
  return fetch(`${BASE_URL}/api/assistant/skills/${skillId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(updates),
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

export async function deleteSkill(skillId: string): Promise<any> {
  return fetch(`${BASE_URL}/api/assistant/skills/${skillId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

export async function executeSkill(skillId: string): Promise<any> {
  return fetch(`${BASE_URL}/api/assistant/skills/${skillId}/execute`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

// ── Scheduled Tasks ────────────────────────────────────────────

export async function getScheduledTasks(): Promise<AdminScheduledTask[]> {
  if (isDemoMode()) return []
  return fetch(`${BASE_URL}/api/assistant/scheduled-tasks`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse<AdminScheduledTask[]>(res))
}

export async function createScheduledTask(task: {
  skill_id: string
  name: string
  cron_expression: string
  timezone?: string
  description?: string
}): Promise<AdminScheduledTask> {
  return fetch(`${BASE_URL}/api/assistant/scheduled-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(task),
    credentials: 'include',
  }).then((res) => handleResponse<AdminScheduledTask>(res))
}

export async function updateScheduledTask(
  taskId: string,
  updates: Partial<AdminScheduledTask>
): Promise<any> {
  return fetch(`${BASE_URL}/api/assistant/scheduled-tasks/${taskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(updates),
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

export async function deleteScheduledTask(taskId: string): Promise<any> {
  return fetch(`${BASE_URL}/api/assistant/scheduled-tasks/${taskId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

export async function runTaskNow(taskId: string): Promise<any> {
  return fetch(`${BASE_URL}/api/assistant/scheduled-tasks/${taskId}/run-now`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
    credentials: 'include',
  }).then((res) => handleResponse(res))
}

// ── WebSocket Helper ───────────────────────────────────────────

export function connectAssistantWebSocket(
  sessionId: string,
  onMessage: (data: any) => void
): WebSocket {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProtocol}//${BASE_URL.replace(/^https?:\/\//, '')}/api/assistant/ws/${sessionId}`

  const ws = new WebSocket(wsUrl)
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onMessage(data)
    } catch {
      onMessage(event.data)
    }
  }

  return ws
}
