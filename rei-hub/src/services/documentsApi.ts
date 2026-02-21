import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Request failed')
  }
  return res.json()
}

// ── Templates ───────────────────────────────────────────────────

export async function getTemplates(): Promise<{
  templates: Array<{
    id: string
    name: string
    category: string
    file_name: string
    is_default: boolean
    merge_fields: string[]
    created_at: string
    updated_at: string
  }>
}> {
  const res = await fetch(`${BASE_URL}/api/documents/templates`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

export async function uploadTemplate(formData: FormData): Promise<Record<string, unknown>> {
  const headers = getAuthHeader()
  // Don't set Content-Type — browser sets multipart boundary automatically
  const res = await fetch(`${BASE_URL}/api/documents/templates`, {
    method: 'POST',
    headers,
    body: formData,
  })
  return handleResponse(res)
}

export async function downloadTemplate(
  id: string
): Promise<{ file_name: string; file_content: string }> {
  const res = await fetch(`${BASE_URL}/api/documents/templates/${id}/download`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

export async function deleteTemplate(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/api/documents/templates/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

// ── Contracts ───────────────────────────────────────────────────

export async function generateContract(data: {
  template_id: string
  homeowner_name: string
  buying_entity: string
  property_address?: string
  purchase_price?: number
  closing_date?: string
  emd_amount?: number
  additional_clauses?: string
  custom_fields?: Record<string, string>
  storage_provider: string
  deal_id?: string
}): Promise<{ contract_id: string; file_name: string; storage_url: string }> {
  const res = await fetch(`${BASE_URL}/api/documents/generate`, {
    method: 'POST',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse(res)
}

export async function getContracts(): Promise<{
  contracts: Array<Record<string, unknown>>
}> {
  const res = await fetch(`${BASE_URL}/api/documents/contracts`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

export async function getContract(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/api/documents/contracts/${id}`, {
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

export async function deleteContract(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/api/documents/contracts/${id}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
  })
  return handleResponse(res)
}

// ── Settings ────────────────────────────────────────────────────

export async function updateSettings(
  companyName: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE_URL}/api/documents/settings`, {
    method: 'PATCH',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_name: companyName }),
  })
  return handleResponse(res)
}
