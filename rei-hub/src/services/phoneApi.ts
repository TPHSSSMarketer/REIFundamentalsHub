import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

// ── Numbers ──────────────────────────────────────────────────

export async function getNumbers() {
  const res = await fetch(`${BASE_URL}/api/phone/numbers`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ numbers: Array<Record<string, unknown>> }>(res)
}

export async function searchNumbers(areaCode: string) {
  const res = await fetch(`${BASE_URL}/api/phone/numbers/search?area_code=${areaCode}`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ numbers: Array<Record<string, unknown>> }>(res)
}

export async function purchaseNumber(data: {
  phone_number: string
  friendly_name: string
  number_type: string
}) {
  const res = await fetch(`${BASE_URL}/api/phone/numbers/purchase`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function releaseNumber(id: string) {
  const res = await fetch(`${BASE_URL}/api/phone/numbers/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse<{ ok: boolean }>(res)
}

export async function updateNumber(
  id: string,
  data: { friendly_name?: string; forward_to?: string; use_softphone?: boolean }
) {
  const res = await fetch(`${BASE_URL}/api/phone/numbers/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<{ ok: boolean }>(res)
}

// ── Softphone Token ──────────────────────────────────────────

export async function getSoftphoneToken() {
  const res = await fetch(`${BASE_URL}/api/phone/token`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ token: string; identity: string }>(res)
}

// ── Dialer ───────────────────────────────────────────────────

export async function dial(data: {
  to_number: string
  phone_number_id: string
  contact_id?: string
}) {
  const res = await fetch(`${BASE_URL}/api/phone/dial`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<{ call_sid: string; call_log_id: string }>(res)
}

export async function startDialerCampaign(data: {
  contact_ids: string[]
  phone_number_id: string
  auto_connect: boolean
}) {
  const res = await fetch(`${BASE_URL}/api/phone/dialer/campaign`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<{ session_id: string; total_contacts: number }>(res)
}

export async function dialerNext(sessionId: string) {
  const res = await fetch(`${BASE_URL}/api/phone/dialer/${sessionId}/next`, {
    method: 'POST',
    headers: getAuthHeader(),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function saveDisposition(
  sessionId: string,
  data: { disposition: string; notes?: string; call_log_id: string }
) {
  const res = await fetch(`${BASE_URL}/api/phone/dialer/${sessionId}/disposition`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

// ── Call Logs ────────────────────────────────────────────────

export async function getCalls(contactId?: string) {
  const params = contactId ? `?contact_id=${contactId}` : ''
  const res = await fetch(`${BASE_URL}/api/phone/calls${params}`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ calls: Array<Record<string, unknown>> }>(res)
}

export async function updateCall(
  id: string,
  data: { disposition?: string; notes?: string }
) {
  const res = await fetch(`${BASE_URL}/api/phone/calls/${id}`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<{ ok: boolean }>(res)
}

// ── SMS ──────────────────────────────────────────────────────

export async function getSmsConversations() {
  const res = await fetch(`${BASE_URL}/api/phone/sms/conversations`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ conversations: Array<Record<string, unknown>> }>(res)
}

export async function getSmsThread(contactId: string) {
  const res = await fetch(`${BASE_URL}/api/phone/sms/conversations/${contactId}`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ messages: Array<Record<string, unknown>> }>(res)
}

export async function sendSms(data: {
  to_number: string
  body: string
  phone_number_id: string
  contact_id?: string
}) {
  const res = await fetch(`${BASE_URL}/api/phone/sms/send`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<{ message_sid: string }>(res)
}

export async function getSmsCampaigns() {
  const res = await fetch(`${BASE_URL}/api/phone/sms/campaigns`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ campaigns: Array<Record<string, unknown>> }>(res)
}

export async function createSmsCampaign(data: {
  name: string
  message_template: string
  phone_number_id: string
  list_id?: string
  scheduled_at?: string
}) {
  const res = await fetch(`${BASE_URL}/api/phone/sms/campaigns`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function sendSmsCampaign(id: string) {
  const res = await fetch(`${BASE_URL}/api/phone/sms/campaigns/${id}/send`, {
    method: 'POST',
    headers: getAuthHeader(),
  })
  return handleResponse<Record<string, unknown>>(res)
}

// ── Voicemail Drops ──────────────────────────────────────────

export async function getVoicemailDrops() {
  const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ drops: Array<Record<string, unknown>> }>(res)
}

export async function createVoicemailDrop(data: {
  name: string
  drop_type: string
  script_template?: string
  elevenlabs_voice_id?: string
  audio_url?: string
}) {
  const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function deleteVoicemailDrop(id: string) {
  const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse<{ ok: boolean }>(res)
}

export async function getVoices() {
  const res = await fetch(`${BASE_URL}/api/phone/voices`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ voices: Array<Record<string, unknown>> }>(res)
}

export async function previewDrop(id: string, data: { contact_id?: string }) {
  const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops/${id}/preview`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function sendVoicemailCampaign(data: {
  name: string
  voicemail_drop_id: string
  phone_number_id: string
  contact_ids: string[]
}) {
  const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops/campaign`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

// ── Fax ──────────────────────────────────────────────────────

export async function getFaxHistory() {
  const res = await fetch(`${BASE_URL}/api/phone/fax`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ faxes: Array<Record<string, unknown>> }>(res)
}

export async function sendFax(data: {
  to_number: string
  from_number_id: string
  media_url: string
  contact_id?: string
}) {
  const res = await fetch(`${BASE_URL}/api/phone/fax/send`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<{ fax_sid: string }>(res)
}

// ── Credits ──────────────────────────────────────────────────

export async function getCredits() {
  const res = await fetch(`${BASE_URL}/api/phone/credits`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{
    credits_cents: number
    credits_dollars: number
    credits_never_expire: boolean
    minutes_used: number
    minutes_limit: number
    sms_used: number
    sms_limit: number
    resets_at: string | null
  }>(res)
}

export async function purchaseCredits(bundle: string) {
  const res = await fetch(`${BASE_URL}/api/phone/credits/purchase`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ bundle }),
  })
  return handleResponse<{ checkout_url: string }>(res)
}
