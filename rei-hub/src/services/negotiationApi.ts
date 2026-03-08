/**
 * Negotiation API service — two-sided negotiation workflow
 *
 * Handles: DealLien CRUD, NegotiationRequest submission,
 * NegotiationCase management, Activity journal, Chat messages
 */

import { getCSRFHeaders } from '@/services/authApi'
import type {
  DealLien,
  NegotiationRequest,
  NegotiationCase,
  NegotiationActivity,
  NegotiationMessage,
  NegotiationRecipient,
} from '@/types'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function headers() {
  return {
    'Content-Type': 'application/json',
    ...getCSRFHeaders(),
  }
}

async function handleResponse<T>(res: Response, fallbackMsg: string): Promise<T> {
  if (res.ok) return res.json()
  let detail = fallbackMsg
  try {
    const err = await res.json()
    detail = err.detail || fallbackMsg
  } catch { /* ignore */ }
  throw new Error(detail)
}


// ═══════════════════════════════════════════════
// Deal Liens
// ═══════════════════════════════════════════════

export async function listLiens(dealId: string): Promise<DealLien[]> {
  const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/liens`, {
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to load liens')
}

export async function createLien(dealId: string, data: Partial<DealLien>): Promise<DealLien> {
  const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/liens`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to create lien')
}

export async function updateLien(dealId: string, lienId: string, data: Partial<DealLien>): Promise<DealLien> {
  const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/liens/${lienId}`, {
    method: 'PATCH',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update lien')
}

export async function deleteLien(dealId: string, lienId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/crm/deals/${dealId}/liens/${lienId}`, {
    method: 'DELETE',
    headers: headers(),
    credentials: 'include',
  })
  if (!res.ok) throw new Error('Failed to delete lien')
}


// ═══════════════════════════════════════════════
// Negotiation Requests
// ═══════════════════════════════════════════════

export async function submitNegotiationRequest(data: {
  dealId: string
  lienIds: string[]
  serviceTypes: string[]
  message?: string
}): Promise<NegotiationRequest> {
  const res = await fetch(`${BASE_URL}/api/negotiations/requests`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to submit negotiation request')
}

export async function listNegotiationRequests(): Promise<NegotiationRequest[]> {
  const res = await fetch(`${BASE_URL}/api/negotiations/requests`, {
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to load negotiation requests')
}

export async function acceptRequest(requestId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/negotiations/requests/${requestId}/accept`, {
    method: 'PATCH',
    headers: headers(),
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to accept request')
}

export async function requestMoreInfo(requestId: string, message?: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/negotiations/requests/${requestId}/request-info`, {
    method: 'PATCH',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify({ message }),
  })
  return handleResponse(res, 'Failed to request info')
}

export async function respondToInfoRequest(requestId: string, message: string): Promise<NegotiationRequest> {
  const res = await fetch(`${BASE_URL}/api/negotiations/requests/${requestId}/respond`, {
    method: 'PATCH',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify({ message }),
  })
  return handleResponse(res, 'Failed to send response')
}

export async function declineRequest(requestId: string): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/negotiations/requests/${requestId}/decline`, {
    method: 'PATCH',
    headers: headers(),
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to decline request')
}


// ═══════════════════════════════════════════════
// Negotiation Cases
// ═══════════════════════════════════════════════

export async function listCases(params?: {
  status?: string
  serviceType?: string
}): Promise<NegotiationCase[]> {
  const url = new URL(`${BASE_URL}/api/negotiations/cases`)
  if (params?.status) url.searchParams.set('status', params.status)
  if (params?.serviceType) url.searchParams.set('service_type', params.serviceType)
  const res = await fetch(url.toString(), { credentials: 'include' })
  return handleResponse(res, 'Failed to load cases')
}

export async function getCase(caseId: string): Promise<{
  case: NegotiationCase
  activities: NegotiationActivity[]
  unreadMessages: number
  deal?: Record<string, unknown> | null
  liens?: Record<string, unknown>[]
}> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}`, {
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to load case')
}

export async function updateCase(caseId: string, data: {
  status?: string
  priority?: string
}): Promise<NegotiationCase> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}`, {
    method: 'PATCH',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update case')
}

export async function triggerResearch(caseId: string): Promise<{ detail: string }> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/research`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to start research')
}

export async function testResearch(caseId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/research-test`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to test research')
}

export async function listRecipients(caseId: string): Promise<NegotiationRecipient[]> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/recipients`, {
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to load recipients')
}


// ═══════════════════════════════════════════════
// Activities (Admin Journal)
// ═══════════════════════════════════════════════

export async function listActivities(caseId: string): Promise<NegotiationActivity[]> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/activities`, {
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to load activities')
}

export async function createActivity(caseId: string, data: {
  activityType: string
  adminNote: string
  sendMethod?: string
  uspsTrackingNumber?: string
  uspsSignatureTrackingNumber?: string
  attachments?: { fileName: string; fileType: string; dealFileId: string }[]
}): Promise<NegotiationActivity> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/activities`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to create activity')
}

export async function updateTracking(activityId: string, data: {
  uspsTrackingNumber?: string
  uspsSignatureTrackingNumber?: string
  trackingStatus?: string
}): Promise<NegotiationActivity> {
  const res = await fetch(`${BASE_URL}/api/negotiations/activities/${activityId}/tracking`, {
    method: 'PATCH',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify(data),
  })
  return handleResponse(res, 'Failed to update tracking')
}


// ═══════════════════════════════════════════════
// Messages (Chat Thread)
// ═══════════════════════════════════════════════

export async function listMessages(caseId: string): Promise<NegotiationMessage[]> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/messages`, {
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to load messages')
}

export async function sendMessage(caseId: string, content: string): Promise<NegotiationMessage> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/messages`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
    body: JSON.stringify({ content }),
  })
  return handleResponse(res, 'Failed to send message')
}

export async function markMessageRead(messageId: string): Promise<NegotiationMessage> {
  const res = await fetch(`${BASE_URL}/api/negotiations/messages/${messageId}/read`, {
    method: 'PATCH',
    headers: headers(),
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to mark message as read')
}


// ═══════════════════════════════════════════════
// USPS Tracking
// ═══════════════════════════════════════════════

export async function checkTrackingNow(activityId: string): Promise<{
  activity: NegotiationActivity
  trackingDetail: {
    status: string
    location?: string
    lastEvent?: string
    deliveredDate?: string
    signedBy?: string
    error?: string
  }
}> {
  const res = await fetch(`${BASE_URL}/api/negotiations/activities/${activityId}/check-tracking`, {
    method: 'POST',
    headers: headers(),
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to check tracking')
}


// ═══════════════════════════════════════════════
// Case Files (admin view of deal files)
// ═══════════════════════════════════════════════

export interface CaseFile {
  id: string
  dealId: string
  fileType: string
  category: string
  fileName: string
  mimeType?: string
  fileSize?: number
  notes?: string
  transactionPhase?: string
  adminOnly?: boolean
  hasThumbnail?: boolean
  createdAt?: string
}

export async function listCaseFiles(caseId: string): Promise<CaseFile[]> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/files`, {
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to load case files')
}

export async function uploadCaseFile(
  caseId: string,
  file: File,
  category: string = 'other',
  notes?: string,
): Promise<CaseFile> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', category)
  if (notes) formData.append('notes', notes)

  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/files`, {
    method: 'POST',
    headers: getCSRFHeaders(), // No Content-Type — browser sets multipart boundary
    credentials: 'include',
    body: formData,
  })
  return handleResponse(res, 'Failed to upload file')
}

export async function getCaseFile(caseId: string, fileId: string): Promise<{
  id: string
  fileName: string
  mimeType?: string
  fileType: string
  category: string
  fileContent: string
  thumbnail?: string
  notes?: string
  createdAt?: string
}> {
  const res = await fetch(`${BASE_URL}/api/negotiations/cases/${caseId}/files/${fileId}`, {
    credentials: 'include',
  })
  return handleResponse(res, 'Failed to load file')
}
