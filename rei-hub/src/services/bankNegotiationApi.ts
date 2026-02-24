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

// ── Negotiations ─────────────────────────────────────────────────

export async function getNegotiations(token: string, filters?: Record<string, string>) {
  const params = new URLSearchParams(filters || {})
  const res = await fetch(`${BASE_URL}/api/negotiations?${params}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch negotiations')
  return res.json()
}

export async function getNegotiation(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch negotiation')
  return res.json()
}

export async function createNegotiation(data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create negotiation')
  return res.json()
}

export async function updateNegotiation(negId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update negotiation')
  return res.json()
}

// ── Recipients ───────────────────────────────────────────────────

export async function getRecipients(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/recipients`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch recipients')
  return res.json()
}

export async function updateRecipient(negId: string, recId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/recipients/${recId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update recipient')
  return res.json()
}

export async function refreshRecipient(negId: string, recId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/recipients/${recId}/refresh`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to refresh recipient')
  return res.json()
}

// ── Documents ────────────────────────────────────────────────────

export async function getDocuments(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/documents`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch documents')
  return res.json()
}

export async function createDocument(negId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/documents`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create document')
  return res.json()
}

// ── Correspondence ───────────────────────────────────────────────

export async function getCorrespondence(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/correspondence`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch correspondence')
  return res.json()
}

export async function sendToAll(negId: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/send`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to send to all')
  return res.json()
}

export async function updateTracking(negId: string, corrId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/correspondence/${corrId}/update-tracking`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to update tracking')
  return res.json()
}

// ── Tracking ─────────────────────────────────────────────────────

export async function getTrackingSummary(negId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/${negId}/tracking-summary`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch tracking summary')
  return res.json()
}

export async function refreshAllTracking(token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/tracking/refresh-all`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to refresh all tracking')
  return res.json()
}

// ── Follow-ups ───────────────────────────────────────────────────

export async function getPendingFollowups(token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/followups/pending`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch pending follow-ups')
  return res.json()
}

export async function completeFollowup(id: string, data: Record<string, any>, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/followups/${id}/complete`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to complete follow-up')
  return res.json()
}

// ── Admin ────────────────────────────────────────────────────────

export async function getAllNegotiations(token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/admin/all`, {
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to fetch all negotiations')
  return res.json()
}

export async function enableBankNegotiation(userId: string, token: string) {
  const res = await fetch(`${BASE_URL}/api/negotiations/admin/enable/${userId}`, {
    method: 'POST',
    headers: authHeaders(token),
  })
  if (!res.ok) throw new Error('Failed to enable bank negotiation')
  return res.json()
}
