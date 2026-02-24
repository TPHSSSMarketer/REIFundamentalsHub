/**
 * Bank Negotiation API service
 */

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

async function handleResponse<T>(res: Response, fallbackMsg: string): Promise<T> {
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
  throw new Error(body.detail ?? fallbackMsg)
}

// ── Negotiations ─────────────────────────────────────────────────

export async function getNegotiations(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/negotiations?${params}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch negotiations')
}

export async function getNegotiation(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch negotiation')
}

export async function createNegotiation(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to create negotiation')
}

export async function updateNegotiation(negId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update negotiation')
}

// ── Recipients ───────────────────────────────────────────────────

export async function getRecipients(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/recipients`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch recipients')
}

export async function updateRecipient(negId: string, recId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/recipients/${recId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update recipient')
}

export async function refreshRecipient(negId: string, recId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/recipients/${recId}/refresh`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to refresh recipient')
}

// ── Documents ────────────────────────────────────────────────────

export async function getDocuments(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/documents`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch documents')
}

export async function createDocument(negId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/documents`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to create document')
}

// ── Correspondence ───────────────────────────────────────────────

export async function getCorrespondence(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/correspondence`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch correspondence')
}

export async function sendToAll(negId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/send`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to send to all')
}

export async function updateTracking(negId: string, corrId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/correspondence/${corrId}/update-tracking`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to update tracking')
}

// ── Tracking ─────────────────────────────────────────────────────

export async function getTrackingSummary(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/tracking-summary`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch tracking summary')
}

export async function refreshAllTracking(token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/tracking/refresh-all`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to refresh all tracking')
}

// ── Follow-ups ───────────────────────────────────────────────────

export async function getPendingFollowups(token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/followups/pending`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch pending follow-ups')
}

export async function completeFollowup(id: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/followups/${id}/complete`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to complete follow-up')
}

// ── Property-grouped & Deal views ────────────────────────────

export async function getNegotiationsByProperty(token: string, params?: Record<string, string>) {
  const query = params ? `?${new URLSearchParams(params)}` : ''
  const res = await fetch(`${BASE_URL}/api/negotiations/by-property${query}`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch negotiations by property')
}

export async function getNegotiationsForDeal(token: string, property_address: string) {
  const res = await fetch(
    `${BASE_URL}/api/negotiations/for-deal?property_address=${encodeURIComponent(property_address)}`,
    { headers: authHeaders(token) },
  )
  return handleResponse(res, 'Failed to fetch negotiations for deal')
}

// ── Admin ────────────────────────────────────────────────────────

export async function getAllNegotiations(token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/admin/all`, {
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to fetch all negotiations')
}

export async function enableBankNegotiation(userId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/admin/enable/${userId}`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  return handleResponse(res, 'Failed to enable bank negotiation')
}
