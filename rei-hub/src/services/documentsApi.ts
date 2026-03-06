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

const DEMO_TEMPLATES = [
  {
    id: 'template-1',
    name: 'Texas TREC 1-4 Family Contract',
    category: 'purchase_agreement',
    file_name: 'texas_trec_1_4_family.docx',
    is_default: true,
    merge_fields: ['buyer_name', 'seller_name', 'property_address', 'purchase_price', 'closing_date', 'emd_amount'],
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  },
  {
    id: 'template-2',
    name: 'Assignment of Contract',
    category: 'assignment',
    file_name: 'assignment_of_contract.docx',
    is_default: false,
    merge_fields: ['assignor_name', 'assignee_name', 'property_address', 'assignment_fee'],
    created_at: '2026-01-20T14:30:00Z',
    updated_at: '2026-01-20T14:30:00Z',
  },
  {
    id: 'template-3',
    name: 'Wholesale Purchase Agreement',
    category: 'purchase_agreement',
    file_name: 'wholesale_purchase_agreement.docx',
    is_default: false,
    merge_fields: ['buyer_name', 'seller_name', 'property_address', 'purchase_price', 'inspection_period', 'closing_date'],
    created_at: '2026-02-01T09:00:00Z',
    updated_at: '2026-02-01T09:00:00Z',
  },
  {
    id: 'template-4',
    name: 'Proof of Funds Letter Template',
    category: 'proof_of_funds',
    file_name: 'proof_of_funds_letter.docx',
    is_default: false,
    merge_fields: ['buyer_name', 'bank_name', 'account_balance', 'date'],
    created_at: '2026-02-05T11:15:00Z',
    updated_at: '2026-02-05T11:15:00Z',
  },
]

const DEMO_CONTRACTS = [
  {
    id: 'contract-1',
    name: 'PA — 123 Main St',
    deal_id: 'deal-1',
    template_id: 'template-1',
    file_name: 'PA_123_Main_St.pdf',
    status: 'signed',
    created_at: '2026-02-10T08:00:00Z',
    updated_at: '2026-02-10T08:00:00Z',
    storage_url: '#demo-storage-1',
    merged_fields: {
      buyer_name: 'Chris Investment Group',
      seller_name: 'John Smith',
      property_address: '123 Main St, San Antonio, TX 78201',
      purchase_price: '185000',
      closing_date: '2026-03-10',
      emd_amount: '5000',
    },
  },
  {
    id: 'contract-2',
    name: 'PA — 320 Elm Court',
    deal_id: 'deal-5',
    template_id: 'template-1',
    file_name: 'PA_320_Elm_Court.pdf',
    status: 'pending_signature',
    created_at: '2026-02-20T13:30:00Z',
    updated_at: '2026-02-20T13:30:00Z',
    storage_url: '#demo-storage-2',
    merged_fields: {
      buyer_name: 'Chris Investment Group',
      seller_name: 'Emily Davis',
      property_address: '320 Elm Court, San Antonio, TX 78202',
      purchase_price: '225000',
      closing_date: '2026-03-21',
      emd_amount: '7500',
    },
  },
]

const DEMO_CHECKLIST_TEMPLATES = [
  {
    id: 'checklist-template-1',
    name: 'Standard Purchase',
    deal_type: 'purchase',
    items: [
      {
        id: 'item-1',
        name: 'Purchase Agreement',
        description: 'Signed and executed purchase agreement',
        order: 1,
      },
      {
        id: 'item-2',
        name: 'Earnest Money Deposit',
        description: 'Earnest money deposit submitted and received by escrow',
        order: 2,
      },
      {
        id: 'item-3',
        name: 'Home Inspection',
        description: 'Home inspection completed and reviewed',
        order: 3,
      },
      {
        id: 'item-4',
        name: 'Title Search',
        description: 'Title search completed and title commitment received',
        order: 4,
      },
      {
        id: 'item-5',
        name: 'Proof of Funds',
        description: 'Proof of funds letter from lender or cash reserves',
        order: 5,
      },
      {
        id: 'item-6',
        name: 'Final Walk-through',
        description: 'Final walk-through completed before closing',
        order: 6,
      },
      {
        id: 'item-7',
        name: 'Closing Disclosure',
        description: 'Closing disclosure reviewed and signed',
        order: 7,
      },
      {
        id: 'item-8',
        name: 'Closing Statement',
        description: 'Closing statement received and reviewed',
        order: 8,
      },
    ],
    created_at: '2026-01-10T10:00:00Z',
    updated_at: '2026-01-10T10:00:00Z',
  },
]

/* ══════════════════════════════════════════════════════════════
   API FUNCTIONS (with demo fallbacks)
   ══════════════════════════════════════════════════════════════ */

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
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/templates`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { templates: DEMO_TEMPLATES as any }
  )
}

export async function uploadTemplate(formData: FormData): Promise<Record<string, unknown>> {
  return withDemoFallback(
    async () => {
      const headers = getAuthHeader()
      // Don't set Content-Type — browser sets multipart boundary automatically
      const res = await fetch(`${BASE_URL}/api/documents/templates`, {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { ok: true, id: `template-${Date.now()}` }
  )
}

export async function downloadTemplate(
  id: string
): Promise<{ file_name: string; file_content: string }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/templates/${id}/download`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { file_name: 'template.docx', file_content: 'demo-content' }
  )
}

export async function deleteTemplate(id: string): Promise<{ success: boolean }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/templates/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { success: true }
  )
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
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/generate`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { contract_id: `contract-${Date.now()}`, file_name: 'contract.pdf', storage_url: '#demo-storage' }
  )
}

export async function getContracts(): Promise<{
  contracts: Array<Record<string, unknown>>
}> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/contracts`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { contracts: DEMO_CONTRACTS as any }
  )
}

export async function getContract(id: string): Promise<Record<string, unknown>> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/contracts/${id}`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    DEMO_CONTRACTS.find((c) => c.id === id) || { id, status: 'not_found' }
  )
}

export async function deleteContract(id: string): Promise<{ success: boolean }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/contracts/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { success: true }
  )
}

// ── Settings ────────────────────────────────────────────────────

export async function updateSettings(
  companyName: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/settings`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName }),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { success: true }
  )
}

// ── Checklist Templates ─────────────────────────────────────────

export async function getChecklistTemplates(
  dealType?: string
): Promise<{ templates: Record<string, Array<Record<string, unknown>>> }> {
  return withDemoFallback(
    async () => {
      const params = dealType ? `?deal_type=${dealType}` : ''
      const res = await fetch(`${BASE_URL}/api/documents/checklist/templates${params}`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    {
      templates: {
        purchase: DEMO_CHECKLIST_TEMPLATES as any,
      },
    }
  )
}

export async function createChecklistTemplate(
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/checklist/templates`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { ok: true, id: `checklist-template-${Date.now()}` }
  )
}

export async function updateChecklistTemplate(
  id: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/checklist/templates/${id}`, {
        method: 'PUT',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { ok: true }
  )
}

export async function deleteChecklistTemplate(
  id: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/checklist/templates/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { success: true }
  )
}

// ── Deal Checklists ─────────────────────────────────────────────

export async function getDealChecklist(
  dealId: string,
  dealType?: string
): Promise<{ items: Array<Record<string, unknown>> }> {
  return withDemoFallback(
    async () => {
      const params = dealType ? `?deal_type=${dealType}` : ''
      const res = await fetch(`${BASE_URL}/api/documents/checklist/${dealId}${params}`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { items: [] }
  )
}

export async function addChecklistItem(
  dealId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/checklist/${dealId}/items`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { ok: true, id: `item-${Date.now()}` }
  )
}

export async function updateChecklistItem(
  itemId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/checklist/items/${itemId}`, {
        method: 'PATCH',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { ok: true }
  )
}

export async function uploadSignedCopy(
  itemId: string,
  file: File
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    async () => {
      const formData = new FormData()
      formData.append('signed_file', file)
      const res = await fetch(`${BASE_URL}/api/documents/checklist/items/${itemId}/sign`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData,
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { ok: true, signed_url: '#demo-signed' }
  )
}

export async function deleteChecklistItem(
  itemId: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/checklist/items/${itemId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { success: true }
  )
}

export async function generateFromChecklist(
  itemId: string,
  data: Record<string, unknown>
): Promise<{ contract_id: string; storage_url: string }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/checklist/items/${itemId}/generate`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { contract_id: `contract-${Date.now()}`, storage_url: '#demo-storage' }
  )
}

export async function matchTemplate(
  state: string,
  dealType: string
): Promise<{ template_id: string | null; source: string | null }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(
        `${BASE_URL}/api/documents/templates/match?state=${state}&deal_type=${dealType}`,
        { headers: getAuthHeader(), credentials: 'include' }
      )
      return handleResponse(res)
    },
    { template_id: 'template-1', source: 'default' }
  )
}

// ── Letter of Intent ────────────────────────────────────────────

export async function generateLoi(
  data: Record<string, unknown>
): Promise<{ loi_id: string; file_name: string; storage_url: string }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/loi/generate`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { loi_id: `loi-${Date.now()}`, file_name: 'loi.pdf', storage_url: '#demo-loi' }
  )
}

export async function getDealLois(
  dealId: string
): Promise<{ lois: Array<Record<string, unknown>> }> {
  return withDemoFallback(
    async () => {
      const res = await fetch(`${BASE_URL}/api/documents/loi/${dealId}`, {
        headers: getAuthHeader(),
        credentials: 'include',
      })
      return handleResponse(res)
    },
    { lois: [] }
  )
}


// ── Deal Document Helpers ────────────────────────────────────────

export async function generateContractFromDeal(
  dealId: string,
  templateId: string,
  transactionPhase: 'buying' | 'selling' | 'holding',
  customFields?: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/api/documents/generate-from-deal/${dealId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({
      template_id: templateId,
      transaction_phase: transactionPhase,
      custom_fields: customFields,
    }),
    credentials: 'include',
  })
  return handleResponse(res)
}
