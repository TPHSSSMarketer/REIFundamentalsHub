/**
 * Bank Negotiation API service
 */

import { getCSRFHeaders } from '@/services/authApi'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Demo Mode Helpers ──────────────────────────────────────

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

// ── Demo Data ──────────────────────────────────────────────

const DEMO_NEGOTIATIONS = [
  {
    id: 'neg-001',
    property_address: '123 Oak Street, Austin, TX',
    bank_name: 'Wells Fargo',
    loan_balance: 250000,
    property_value: 180000,
    negotiation_type: 'short_sale',
    status: 'in_progress',
    current_offer: 165000,
    bank_response: 'Under review',
    created_at: '2024-02-10T10:30:00Z',
    updated_at: '2024-02-20T14:15:00Z',
  },
  {
    id: 'neg-002',
    property_address: '456 Maple Drive, Denver, CO',
    bank_name: 'Chase Bank',
    loan_balance: 320000,
    property_value: 275000,
    negotiation_type: 'loan_modification',
    status: 'completed',
    current_offer: null,
    bank_response: 'Approved',
    created_at: '2024-01-28T09:00:00Z',
    updated_at: '2024-02-15T16:45:00Z',
  },
]

function headers() {
  return {
    'Content-Type': 'application/json',
    ...getCSRFHeaders(),
  }
}

function authHeaders() {
  return {}
}

async function handleResponse<T>(res: Response, fallbackMsg: string): Promise<T> {
  if (res.ok) return res.json()

  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment before trying again.')
  }
  if (res.status === 401) {
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

export async function getNegotiations(filters?: Record<string, string>) {
  return withDemoFallback(
    () => {
      const params = new URLSearchParams(filters || {})
      return fetch(`${BASE_URL}/api/negotiations?${params}`, {
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to fetch negotiations'))
    },
    DEMO_NEGOTIATIONS
  )
}

export async function getNegotiation(negId: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}`, {
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to fetch negotiation')),
    DEMO_NEGOTIATIONS[0]
  )
}

export async function createNegotiation(data: Record<string, any>) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations`, {
        method: 'POST',
        headers: headers(),
        credentials: 'include',
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to create negotiation')),
    { id: crypto.randomUUID(), ...data, status: 'pending', created_at: new Date().toISOString() }
  )
}

export async function updateNegotiation(negId: string, data: Record<string, any>) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}`, {
        method: 'PATCH',
        headers: headers(),
        credentials: 'include',
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to update negotiation')),
    { id: negId, ...data, updated_at: new Date().toISOString() }
  )
}

// ── Recipients ───────────────────────────────────────────────────

export async function getRecipients(negId: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}/recipients`, {
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to fetch recipients')),
    [
      { id: 'rec-001', negotiation_id: negId, bank_contact: 'John Smith', email: 'john.smith@wellsfargo.com', title: 'Loan Officer' },
      { id: 'rec-002', negotiation_id: negId, bank_contact: 'Maria Garcia', email: 'maria.garcia@wellsfargo.com', title: 'Loss Mitigation Specialist' },
    ]
  )
}

export async function updateRecipient(negId: string, recId: string, data: Record<string, any>) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}/recipients/${recId}`, {
        method: 'PATCH',
        headers: headers(),
        credentials: 'include',
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to update recipient')),
    { id: recId, negotiation_id: negId, ...data }
  )
}

export async function refreshRecipient(negId: string, recId: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}/recipients/${recId}/refresh`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to refresh recipient')),
    { id: recId, refreshed_at: new Date().toISOString(), status: 'active' }
  )
}

// ── Documents ────────────────────────────────────────────────────

export async function getDocuments(negId: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}/documents`, {
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to fetch documents')),
    [
      { id: 'doc-001', negotiation_id: negId, type: 'hardship_letter', filename: 'hardship_letter.pdf', uploaded_at: '2024-02-12T10:00:00Z' },
      { id: 'doc-002', negotiation_id: negId, type: 'financial_statement', filename: 'financial_statement.pdf', uploaded_at: '2024-02-12T10:05:00Z' },
    ]
  )
}

export async function createDocument(negId: string, data: Record<string, any>) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}/documents`, {
        method: 'POST',
        headers: headers(),
        credentials: 'include',
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to create document')),
    { id: crypto.randomUUID(), negotiation_id: negId, ...data, uploaded_at: new Date().toISOString() }
  )
}

// ── Correspondence ───────────────────────────────────────────────

export async function getCorrespondence(negId: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}/correspondence`, {
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to fetch correspondence')),
    [
      { id: 'corr-001', negotiation_id: negId, date: '2024-02-15T09:30:00Z', type: 'email', subject: 'Loan Modification Request', body: 'Please consider our modification request...', sender: 'us' },
      { id: 'corr-002', negotiation_id: negId, date: '2024-02-17T14:00:00Z', type: 'email', subject: 'RE: Loan Modification Request', body: 'We have received your request and will review...', sender: 'bank' },
    ]
  )
}

export async function sendToAll(negId: string, data: Record<string, any>) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}/send`, {
        method: 'POST',
        headers: headers(),
        credentials: 'include',
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to send to all')),
    { success: true, sent_to: 2, timestamp: new Date().toISOString() }
  )
}

export async function updateTracking(negId: string, corrId: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}/correspondence/${corrId}/update-tracking`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to update tracking')),
    { id: corrId, tracking_updated_at: new Date().toISOString(), status: 'delivered' }
  )
}

// ── Tracking ─────────────────────────────────────────────────────

export async function getTrackingSummary(negId: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/${negId}/tracking-summary`, {
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to fetch tracking summary')),
    { negotiation_id: negId, sent: 3, delivered: 3, opened: 2, last_interaction: '2024-02-17T14:00:00Z' }
  )
}

export async function refreshAllTracking() {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/tracking/refresh-all`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to refresh all tracking')),
    { refreshed_count: 2, timestamp: new Date().toISOString() }
  )
}

// ── Follow-ups ───────────────────────────────────────────────────

export async function getPendingFollowups() {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/followups/pending`, {
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to fetch pending follow-ups')),
    [
      { id: 'followup-001', negotiation_id: 'neg-001', due_date: '2024-02-25T09:00:00Z', property: '123 Oak Street', note: 'Check on bank response' },
    ]
  )
}

export async function completeFollowup(id: string, data: Record<string, any>) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/followups/${id}/complete`, {
        method: 'PATCH',
        headers: headers(),
        credentials: 'include',
        body: JSON.stringify(data),
      }).then((res) => handleResponse(res, 'Failed to complete follow-up')),
    { id, completed_at: new Date().toISOString(), status: 'completed' }
  )
}

// ── Property-grouped & Deal views ────────────────────────────

export async function getNegotiationsByProperty(params?: Record<string, string>) {
  return withDemoFallback(
    () => {
      const query = params ? `?${new URLSearchParams(params)}` : ''
      return fetch(`${BASE_URL}/api/negotiations/by-property${query}`, {
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to fetch negotiations by property'))
    },
    {
      '123 Oak Street': DEMO_NEGOTIATIONS[0],
      '456 Maple Drive': DEMO_NEGOTIATIONS[1],
    }
  )
}

export async function getNegotiationsForDeal(property_address: string) {
  return withDemoFallback(
    () =>
      fetch(
        `${BASE_URL}/api/negotiations/for-deal?property_address=${encodeURIComponent(property_address)}`,
        { headers: authHeaders(), credentials: 'include' },
      ).then((res) => handleResponse(res, 'Failed to fetch negotiations for deal')),
    [DEMO_NEGOTIATIONS[0]]
  )
}

// ── Admin ────────────────────────────────────────────────────────

export async function getAllNegotiations() {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/admin/all`, {
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to fetch all negotiations')),
    DEMO_NEGOTIATIONS
  )
}

export async function enableBankNegotiation(userId: string) {
  return withDemoFallback(
    () =>
      fetch(`${BASE_URL}/api/negotiations/admin/enable/${userId}`, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
      }).then((res) => handleResponse(res, 'Failed to enable bank negotiation')),
    { user_id: userId, feature_enabled: true, timestamp: new Date().toISOString() }
  )
}
