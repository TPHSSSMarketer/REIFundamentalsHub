import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

// ── Domains ──────────────────────────────────────────────────

export async function getDomains() {
  const res = await fetch(`${BASE_URL}/api/email/domains`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{
    domains: Array<Record<string, unknown>>
    current_provider: string
  }>(res)
}

export async function addDomain(data: {
  domain: string
  from_name: string
  from_email: string
}) {
  const res = await fetch(`${BASE_URL}/api/email/domains`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function verifyDomain(domainId: string) {
  const res = await fetch(`${BASE_URL}/api/email/domains/${domainId}/verify`, {
    method: 'POST',
    headers: getAuthHeader(),
  })
  return handleResponse<{ verified: boolean; message: string }>(res)
}

export async function deleteDomain(domainId: string) {
  const res = await fetch(`${BASE_URL}/api/email/domains/${domainId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse<{ success: boolean }>(res)
}

// ── Lists ────────────────────────────────────────────────────

export async function getLists() {
  const res = await fetch(`${BASE_URL}/api/email/lists`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{
    lists: Array<{
      id: string
      name: string
      description: string | null
      subscriber_count: number
      created_at: string
    }>
  }>(res)
}

export async function createList(data: { name: string; description?: string }) {
  const res = await fetch(`${BASE_URL}/api/email/lists`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function deleteList(listId: string) {
  const res = await fetch(`${BASE_URL}/api/email/lists/${listId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse<{ success: boolean }>(res)
}

// ── Subscribers ──────────────────────────────────────────────

export async function getSubscribers(listId: string, page = 1, perPage = 50) {
  const res = await fetch(
    `${BASE_URL}/api/email/lists/${listId}/subscribers?page=${page}&per_page=${perPage}`,
    { headers: getAuthHeader() }
  )
  return handleResponse<{
    subscribers: Array<Record<string, unknown>>
    total: number
    page: number
    per_page: number
  }>(res)
}

export async function addSubscriber(
  listId: string,
  data: {
    email: string
    first_name?: string
    last_name?: string
    phone?: string
  }
) {
  const res = await fetch(`${BASE_URL}/api/email/lists/${listId}/subscribers`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function importSubscribers(
  listId: string,
  subscribers: Array<Record<string, string>>
) {
  const res = await fetch(`${BASE_URL}/api/email/lists/${listId}/import`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscribers }),
  })
  return handleResponse<{ added: number; skipped: number; errors: number }>(res)
}

export async function deleteSubscriber(listId: string, subId: string) {
  const res = await fetch(
    `${BASE_URL}/api/email/lists/${listId}/subscribers/${subId}`,
    { method: 'DELETE', headers: getAuthHeader() }
  )
  return handleResponse<{ success: boolean }>(res)
}

// ── Templates ────────────────────────────────────────────────

export async function getTemplates() {
  const res = await fetch(`${BASE_URL}/api/email/templates`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ templates: Array<Record<string, unknown>> }>(res)
}

export async function createTemplate(data: {
  name: string
  subject: string
  preview_text?: string
  html_content: string
  plain_text?: string
  category?: string
}) {
  const res = await fetch(`${BASE_URL}/api/email/templates`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function updateTemplate(
  templateId: string,
  data: Record<string, unknown>
) {
  const res = await fetch(`${BASE_URL}/api/email/templates/${templateId}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<{ success: boolean }>(res)
}

export async function deleteTemplate(templateId: string) {
  const res = await fetch(`${BASE_URL}/api/email/templates/${templateId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse<{ success: boolean }>(res)
}

// ── Campaigns ────────────────────────────────────────────────

export async function getCampaigns() {
  const res = await fetch(`${BASE_URL}/api/email/campaigns`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ campaigns: Array<Record<string, unknown>> }>(res)
}

export async function createCampaign(data: {
  name: string
  subject: string
  preview_text?: string
  html_content: string
  plain_text?: string
  from_domain_id: string
  list_id: string
}) {
  const res = await fetch(`${BASE_URL}/api/email/campaigns`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function sendCampaign(campaignId: string) {
  const res = await fetch(`${BASE_URL}/api/email/campaigns/${campaignId}/send`, {
    method: 'POST',
    headers: getAuthHeader(),
  })
  return handleResponse<{ queued: number }>(res)
}

export async function scheduleCampaign(
  campaignId: string,
  scheduledAt: string
) {
  const res = await fetch(
    `${BASE_URL}/api/email/campaigns/${campaignId}/schedule`,
    {
      method: 'POST',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    }
  )
  return handleResponse<{ scheduled: boolean; scheduled_at: string }>(res)
}

export async function getCampaignStats(campaignId: string) {
  const res = await fetch(
    `${BASE_URL}/api/email/campaigns/${campaignId}/stats`,
    { headers: getAuthHeader() }
  )
  return handleResponse<Record<string, unknown>>(res)
}

export async function deleteCampaign(campaignId: string) {
  const res = await fetch(`${BASE_URL}/api/email/campaigns/${campaignId}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse<{ success: boolean }>(res)
}

// ── Sequences ────────────────────────────────────────────────

export async function getSequences() {
  const res = await fetch(`${BASE_URL}/api/email/sequences`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{ sequences: Array<Record<string, unknown>> }>(res)
}

export async function createSequence(data: {
  name: string
  list_id: string
  from_domain_id: string
}) {
  const res = await fetch(`${BASE_URL}/api/email/sequences`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Record<string, unknown>>(res)
}

export async function addSequenceStep(
  sequenceId: string,
  data: {
    step_number: number
    delay_days: number
    subject: string
    html_content: string
    plain_text?: string
  }
) {
  const res = await fetch(
    `${BASE_URL}/api/email/sequences/${sequenceId}/steps`,
    {
      method: 'POST',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
  return handleResponse<Record<string, unknown>>(res)
}

export async function activateSequence(sequenceId: string) {
  const res = await fetch(
    `${BASE_URL}/api/email/sequences/${sequenceId}/activate`,
    { method: 'POST', headers: getAuthHeader() }
  )
  return handleResponse<{ is_active: boolean }>(res)
}

export async function enrollSubscriber(
  sequenceId: string,
  subscriberId: string
) {
  const res = await fetch(
    `${BASE_URL}/api/email/sequences/${sequenceId}/enroll`,
    {
      method: 'POST',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriber_id: subscriberId }),
    }
  )
  return handleResponse<Record<string, unknown>>(res)
}

// ── Usage ────────────────────────────────────────────────────

export async function getUsage() {
  const res = await fetch(`${BASE_URL}/api/email/usage`, {
    headers: getAuthHeader(),
  })
  return handleResponse<{
    plan: string
    limit: number
    used: number
    remaining: number
    resets_at: string | null
    overage_rate: string
    current_provider: string
  }>(res)
}
