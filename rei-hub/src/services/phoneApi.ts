import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

/* ── Helper: check if demo mode is active ───────────────────── */
function isDemoMode(): boolean {
  try {
    const stored = localStorage.getItem('rei-hub-demo-mode')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed?.state?.isDemoMode === true
    }
  } catch { /* ignore */ }
  return false
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

/** Tries real API, falls back to demo data if demo mode on */
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

/* ══════════════════════════════════════════════════════════════
   DEMO DATA
   ══════════════════════════════════════════════════════════════ */

const DEMO_NUMBERS = [
  {
    id: 'num-1',
    number: '+12105551234',
    friendly_name: 'Main Business Line',
    is_primary: true,
    monthly_cost: 0,
    capabilities: ['voice', 'sms', 'fax'],
    forward_to: '+12105559876',
    use_softphone: false,
  },
  {
    id: 'num-2',
    number: '+12105555678',
    friendly_name: 'Marketing Line',
    is_primary: false,
    monthly_cost: 2.0,
    capabilities: ['voice', 'sms'],
    forward_to: '',
    use_softphone: true,
  },
]

const DEMO_CONVERSATIONS = [
  {
    contact_id: 'contact-1',
    contact_name: 'John Smith',
    contact_number: '+15551234567',
    last_message: 'Yes, I am still interested in selling. Can we meet Thursday?',
    unread_count: 2,
    last_at: '2026-02-26T14:30:00Z',
  },
  {
    contact_id: 'contact-2',
    contact_name: 'Sarah Johnson',
    contact_number: '+15559876543',
    last_message: 'Thanks for the offer. Let me think about it.',
    unread_count: 0,
    last_at: '2026-02-25T10:15:00Z',
  },
  {
    contact_id: 'contact-3',
    contact_name: 'Mike Williams',
    contact_number: '+15555551212',
    last_message: 'What is your best cash offer?',
    unread_count: 1,
    last_at: '2026-02-24T16:45:00Z',
  },
  {
    contact_id: 'contact-4',
    contact_name: 'Emily Davis',
    contact_number: '+15558675309',
    last_message: 'I got the contract. Will sign tonight.',
    unread_count: 0,
    last_at: '2026-02-23T09:00:00Z',
  },
]

const DEMO_THREADS: Record<string, any[]> = {
  'contact-1': [
    { id: 'm1', direction: 'outbound', body: 'Hi John, this is Chris from REI Fundamentals. We noticed your property at 123 Main St may be available. Are you interested in selling?', sent_at: '2026-02-24T10:00:00Z' },
    { id: 'm2', direction: 'inbound', body: 'Hi Chris, yes we have been thinking about it. What kind of offer?', sent_at: '2026-02-24T10:15:00Z' },
    { id: 'm3', direction: 'outbound', body: 'We can do a cash offer with a 14-day close. No repairs needed on your end. Would you be open to a quick walkthrough?', sent_at: '2026-02-24T10:20:00Z' },
    { id: 'm4', direction: 'inbound', body: 'That sounds fair. When works for you?', sent_at: '2026-02-25T08:30:00Z' },
    { id: 'm5', direction: 'outbound', body: 'How about Thursday at 2pm? I can come by the property.', sent_at: '2026-02-25T09:00:00Z' },
    { id: 'm6', direction: 'inbound', body: 'Yes, I am still interested in selling. Can we meet Thursday?', sent_at: '2026-02-26T14:30:00Z' },
  ],
  'contact-2': [
    { id: 'm7', direction: 'outbound', body: 'Hi Sarah, following up on the property at 456 Oak Ave. We can offer $225,000 cash, close in 21 days.', sent_at: '2026-02-23T14:00:00Z' },
    { id: 'm8', direction: 'inbound', body: 'Thanks for the offer. Let me think about it.', sent_at: '2026-02-25T10:15:00Z' },
  ],
  'contact-3': [
    { id: 'm9', direction: 'inbound', body: 'Hey I saw your ad about buying houses. I have a property on Pine Rd.', sent_at: '2026-02-22T11:00:00Z' },
    { id: 'm10', direction: 'outbound', body: 'Hi Mike! Thanks for reaching out. Can you tell me a bit about the property? Beds/baths, condition, any repairs needed?', sent_at: '2026-02-22T11:15:00Z' },
    { id: 'm11', direction: 'inbound', body: '3 bed 2 bath, needs a new roof and some cosmetic work. What is your best cash offer?', sent_at: '2026-02-24T16:45:00Z' },
  ],
  'contact-4': [
    { id: 'm12', direction: 'outbound', body: 'Hi Emily, the purchase agreement for 320 Elm Court is attached. Please sign and return at your earliest convenience.', sent_at: '2026-02-20T15:00:00Z' },
    { id: 'm13', direction: 'inbound', body: 'I got the contract. Will sign tonight.', sent_at: '2026-02-23T09:00:00Z' },
  ],
}

const DEMO_CAMPAIGNS = [
  {
    id: 'camp-1',
    name: 'Absentee Owner Outreach',
    status: 'sent',
    total_sent: 150,
    total_delivered: 142,
    total_replied: 18,
    cost: 3.0,
    created_at: '2026-02-15T10:00:00Z',
  },
  {
    id: 'camp-2',
    name: 'Expired Listing Follow-up',
    status: 'draft',
    total_sent: 0,
    total_delivered: 0,
    total_replied: 0,
    cost: 0,
    created_at: '2026-02-24T08:00:00Z',
  },
]

const DEMO_DROPS = [
  {
    id: 'drop-1',
    name: 'Motivated Seller Intro',
    drop_type: 'recorded',
    audio_url: '#demo',
    script_template: '',
    created_at: '2026-02-10T10:00:00Z',
  },
  {
    id: 'drop-2',
    name: 'Follow-up After Offer',
    drop_type: 'ai_personalized',
    audio_url: '#demo',
    script_template: 'Hi {{first_name}}, this is Chris following up on our conversation about {{property_address}}. I wanted to see if you had any questions about the offer we discussed. Feel free to call me back anytime.',
    created_at: '2026-02-18T14:00:00Z',
  },
  {
    id: 'drop-3',
    name: 'Just Listed Neighbor Alert',
    drop_type: 'uploaded',
    audio_url: '#demo',
    script_template: '',
    created_at: '2026-02-22T09:00:00Z',
  },
]

const DEMO_VOICES = [
  { voice_id: 'voice-1', name: 'Rachel (Natural)', labels: { accent: 'american', gender: 'female' } },
  { voice_id: 'voice-2', name: 'Josh (Deep)', labels: { accent: 'american', gender: 'male' } },
  { voice_id: 'voice-3', name: 'Bella (Friendly)', labels: { accent: 'american', gender: 'female' } },
]

const DEMO_FAXES = [
  {
    id: 'fax-1',
    direction: 'outbound',
    to_number: '+12105559999',
    from_number: '+12105551234',
    status: 'delivered',
    pages: 3,
    sent_at: '2026-02-20T11:00:00Z',
    description: 'Purchase Agreement — 789 Pine Rd',
  },
  {
    id: 'fax-2',
    direction: 'inbound',
    to_number: '+12105551234',
    from_number: '+12105558888',
    status: 'received',
    pages: 2,
    sent_at: '2026-02-22T15:30:00Z',
    description: 'Signed Contract Return',
  },
]

const DEMO_CREDITS = {
  credits_cents: 4250,
  credits_dollars: 42.50,
  credits_never_expire: false,
  minutes_used: 87,
  minutes_limit: 500,
  sms_used: 234,
  sms_limit: 1000,
  resets_at: '2026-03-01T00:00:00Z',
}

const DEMO_SEARCH_NUMBERS = [
  { phone_number: '+12105550001', friendly_name: '', locality: 'San Antonio', region: 'TX', capabilities: { voice: true, sms: true, fax: true } },
  { phone_number: '+12105550002', friendly_name: '', locality: 'San Antonio', region: 'TX', capabilities: { voice: true, sms: true, fax: false } },
  { phone_number: '+12105550003', friendly_name: '', locality: 'San Antonio', region: 'TX', capabilities: { voice: true, sms: true, fax: true } },
  { phone_number: '+12105550004', friendly_name: '', locality: 'New Braunfels', region: 'TX', capabilities: { voice: true, sms: true, fax: false } },
  { phone_number: '+12105550005', friendly_name: '', locality: 'San Antonio', region: 'TX', capabilities: { voice: true, sms: true, fax: true } },
  { phone_number: '+12105550006', friendly_name: '', locality: 'Boerne', region: 'TX', capabilities: { voice: true, sms: true, fax: false } },
]

/* ══════════════════════════════════════════════════════════════
   API FUNCTIONS (with demo fallbacks)
   ══════════════════════════════════════════════════════════════ */

// ── Numbers ──────────────────────────────────────────────────

export async function getNumbers() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/numbers`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ numbers: Array<Record<string, unknown>> }>(res)
    },
    { numbers: DEMO_NUMBERS as any }
  )
}

export async function searchNumbers(areaCode: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/numbers/search?area_code=${areaCode}`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ numbers: Array<Record<string, unknown>> }>(res)
    },
    { numbers: DEMO_SEARCH_NUMBERS.map((n) => ({ ...n, phone_number: n.phone_number.replace('210', areaCode.padEnd(3, '0')) })) as any }
  )
}

export async function purchaseNumber(data: {
  phone_number: string
  friendly_name: string
  number_type: string
}) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/numbers/purchase`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<Record<string, unknown>>(res)
    },
    { ok: true, id: `num-${Date.now()}` }
  )
}

export async function releaseNumber(id: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/numbers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse<{ ok: boolean }>(res)
    },
    { ok: true }
  )
}

export async function updateNumber(
  id: string,
  data: { friendly_name?: string; forward_to?: string; use_softphone?: boolean }
) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/numbers/${id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<{ ok: boolean }>(res)
    },
    { ok: true }
  )
}

// ── Softphone Token ──────────────────────────────────────────

export async function getSoftphoneToken() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/token`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ token: string; identity: string }>(res)
    },
    { token: 'demo-token', identity: 'demo-user' }
  )
}

// ── Dialer ───────────────────────────────────────────────────

export async function dial(data: {
  to_number: string
  phone_number_id: string
  contact_id?: string
}) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/dial`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<{ call_sid: string; call_log_id: string }>(res)
    },
    { call_sid: `demo-call-${Date.now()}`, call_log_id: `demo-log-${Date.now()}` }
  )
}

export async function startDialerCampaign(data: {
  contact_ids: string[]
  phone_number_id: string
  auto_connect: boolean
}) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/dialer/campaign`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<{ session_id: string; total_contacts: number }>(res)
    },
    { session_id: `demo-session-${Date.now()}`, total_contacts: data.contact_ids.length }
  )
}

export async function dialerNext(sessionId: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/dialer/${sessionId}/next`, {
        method: 'POST',
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse<Record<string, unknown>>(res)
    },
    { contact_name: 'Demo Contact', phone: '+15551234567', status: 'ringing' }
  )
}

export async function saveDisposition(
  sessionId: string,
  data: { disposition: string; notes?: string; call_log_id: string }
) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/dialer/${sessionId}/disposition`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<Record<string, unknown>>(res)
    },
    { ok: true }
  )
}

// ── Call Logs ────────────────────────────────────────────────

export async function getCalls(contactId?: string) {
  const params = contactId ? `?contact_id=${contactId}` : ''
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/calls${params}`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ calls: Array<Record<string, unknown>> }>(res)
    },
    { calls: [] }
  )
}

export async function updateCall(
  id: string,
  data: { disposition?: string; notes?: string }
) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/calls/${id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<{ ok: boolean }>(res)
    },
    { ok: true }
  )
}

// ── SMS ──────────────────────────────────────────────────────

export async function getSmsConversations() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/sms/conversations`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ conversations: Array<Record<string, unknown>> }>(res)
    },
    { conversations: DEMO_CONVERSATIONS as any }
  )
}

export async function getSmsThread(contactId: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/sms/conversations/${contactId}`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ messages: Array<Record<string, unknown>> }>(res)
    },
    { messages: (DEMO_THREADS[contactId] || []) as any }
  )
}

export async function sendSms(data: {
  to_number: string
  body: string
  phone_number_id: string
  contact_id?: string
}) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/sms/send`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<{ message_sid: string }>(res)
    },
    { message_sid: `demo-msg-${Date.now()}` }
  )
}

export async function getSmsCampaigns() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/sms/campaigns`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ campaigns: Array<Record<string, unknown>> }>(res)
    },
    { campaigns: DEMO_CAMPAIGNS as any }
  )
}

export async function createSmsCampaign(data: {
  name: string
  message_template: string
  phone_number_id: string
  list_id?: string
  contact_numbers?: string[]
  scheduled_at?: string
}) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/sms/campaigns`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<Record<string, unknown>>(res)
    },
    { ok: true, id: `camp-${Date.now()}` }
  )
}

export async function sendSmsCampaign(id: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/sms/campaigns/${id}/send`, {
        method: 'POST',
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse<Record<string, unknown>>(res)
    },
    { ok: true }
  )
}

// ── Voicemail Drops ──────────────────────────────────────────

export async function getVoicemailDrops() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ drops: Array<Record<string, unknown>> }>(res)
    },
    { drops: DEMO_DROPS as any }
  )
}

export async function createVoicemailDrop(data: {
  name: string
  drop_type: string
  script_template?: string
  elevenlabs_voice_id?: string
  audio_url?: string
}) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<Record<string, unknown>>(res)
    },
    { ok: true, id: `drop-${Date.now()}` }
  )
}

export async function deleteVoicemailDrop(id: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse<{ ok: boolean }>(res)
    },
    { ok: true }
  )
}

export async function getVoices() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/voices`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ voices: Array<Record<string, unknown>> }>(res)
    },
    { voices: DEMO_VOICES as any }
  )
}

export async function previewDrop(id: string, data: { contact_id?: string }) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops/${id}/preview`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<Record<string, unknown>>(res)
    },
    { audio_url: '#demo-preview', duration: 15 }
  )
}

export async function sendVoicemailCampaign(data: {
  name: string
  voicemail_drop_id: string
  phone_number_id: string
  contact_ids: string[]
}) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/voicemail-drops/campaign`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<Record<string, unknown>>(res)
    },
    { ok: true, campaign_id: `vc-${Date.now()}` }
  )
}

// ── Fax ──────────────────────────────────────────────────────

export async function getFaxHistory() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/fax`, { headers: getAuthHeader(), credentials: 'include' })
      return handleResponse<{ faxes: Array<Record<string, unknown>> }>(res)
    },
    { faxes: DEMO_FAXES as any }
  )
}

export async function sendFax(data: {
  to_number: string
  from_number_id: string
  media_url?: string
  contact_id?: string
  deal_id?: string
  deal_file_id?: string
}) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/fax/send`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse<{ fax_sid: string }>(res)
    },
    { fax_sid: `demo-fax-${Date.now()}` }
  )
}

// ── Credits ──────────────────────────────────────────────────

export async function getCredits() {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/credits`, { headers: getAuthHeader(), credentials: 'include' })
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
    },
    DEMO_CREDITS
  )
}

export async function purchaseCredits(bundle: string) {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/phone/credits/purchase`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle }),
        credentials: 'include',
      })
      return handleResponse<{ checkout_url: string }>(res)
    },
    { checkout_url: '#demo-checkout' }
  )
}
