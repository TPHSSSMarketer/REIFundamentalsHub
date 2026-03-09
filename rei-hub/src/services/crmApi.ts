// CRM API — talks to the real FastAPI backend with demo fallback
// Replaces localStorage (db.ts) with server-persisted data

import type { Contact, Deal, PortfolioProperty } from '@/types'
import { mockContacts, mockDeals } from '@/data/mockData'
import { getAuthHeader } from '@/services/auth'
import { apiFetchWithAuth } from '@/services/fetchWithAuth'

// ── Configuration ─────────────────────────────────────────

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

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  return apiFetchWithAuth<T>(path, options)
}

// ── Demo Portfolio Data ────────────────────────────────────

const DEMO_PORTFOLIO: PortfolioProperty[] = [
  {
    id: 'prop-1',
    address: '1842 Ridgewood Dr',
    city: 'San Antonio',
    state: 'TX',
    zip: '78201',
    propertyType: 'single_family',
    units: 1,
    purchaseDate: new Date(Date.now() - 365 * 86400000).toISOString(),
    purchasePrice: 185000,
    rehabCost: 22000,
    currentValue: 235000,
    loanBalance: 148000,
    monthlyMortgage: 1100,
    monthlyRent: 1750,
    notes: 'Section 8 approved. Long-term tenant in place.',
    latitude: 29.4241,
    longitude: -98.4936,
    createdAt: new Date(Date.now() - 365 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prop-2',
    address: '504 Oak Street',
    city: 'Birmingham',
    state: 'AL',
    zip: '35201',
    propertyType: 'single_family',
    units: 1,
    purchaseDate: new Date(Date.now() - 180 * 86400000).toISOString(),
    purchasePrice: 132000,
    rehabCost: 18000,
    currentValue: 175000,
    loanBalance: 108000,
    monthlyMortgage: 820,
    monthlyRent: 1350,
    notes: 'Month-to-month lease. Considering refinance.',
    latitude: 33.3186,
    longitude: -86.8104,
    createdAt: new Date(Date.now() - 180 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

// ============ CONTACTS ============

export async function getContacts(_userId?: string): Promise<Contact[]> {
  return withDemoFallback(
    () => apiFetch<Contact[]>('/api/crm/contacts'),
    mockContacts,
  )
}

export async function getContact(id: string): Promise<Contact | null> {
  return withDemoFallback(
    () => apiFetch<Contact>(`/api/crm/contacts/${id}`),
    mockContacts.find((c) => c.id === id) || null,
  )
}

export async function createContact(_userId: string, data: Partial<Contact>): Promise<Contact> {
  return withDemoFallback(
    () =>
      apiFetch<Contact>('/api/crm/contacts', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    { id: `contact-${Date.now()}`, name: '', interactionCount: 0, dateAdded: new Date().toISOString(), ...data } as Contact,
  )
}

export async function updateContact(id: string, data: Partial<Contact>): Promise<Contact> {
  return withDemoFallback(
    () =>
      apiFetch<Contact>(`/api/crm/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    { id, name: '', interactionCount: 0, dateAdded: new Date().toISOString(), ...data } as Contact,
  )
}

export async function deleteContact(id: string): Promise<void> {
  return withDemoFallback(
    () =>
      apiFetch<void>(`/api/crm/contacts/${id}`, {
        method: 'DELETE',
      }),
    undefined,
  )
}

// ============ DEALS ============

export async function getDeals(_userId?: string): Promise<Deal[]> {
  return withDemoFallback(
    () => apiFetch<Deal[]>('/api/crm/deals'),
    mockDeals,
  )
}

export async function getDeal(id: string): Promise<Deal | null> {
  return withDemoFallback(
    () => apiFetch<Deal>(`/api/crm/deals/${id}`),
    mockDeals.find((d) => d.id === id) || null,
  )
}

export async function createDeal(_userId: string, data: Partial<Deal>): Promise<Deal> {
  return withDemoFallback(
    () =>
      apiFetch<Deal>('/api/crm/deals', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    {
      id: `deal-${Date.now()}`,
      title: '',
      address: '',
      stage: 'lead',
      isUrgent: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    } as Deal,
  )
}

export async function updateDeal(id: string, data: Partial<Deal>): Promise<Deal> {
  return withDemoFallback(
    () =>
      apiFetch<Deal>(`/api/crm/deals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    {
      id,
      title: '',
      address: '',
      stage: 'lead',
      isUrgent: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    } as Deal,
  )
}

export async function updateDealStage(id: string, stage: string): Promise<void> {
  return withDemoFallback(
    () =>
      apiFetch<void>(`/api/crm/deals/${id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ stage }),
      }),
    undefined,
  )
}

export async function deleteDeal(id: string): Promise<void> {
  return withDemoFallback(
    () =>
      apiFetch<void>(`/api/crm/deals/${id}`, {
        method: 'DELETE',
      }),
    undefined,
  )
}

// ============ PORTFOLIO ============

export async function getPortfolioProperties(): Promise<PortfolioProperty[]> {
  return withDemoFallback(
    () => apiFetch<PortfolioProperty[]>('/api/crm/portfolio'),
    DEMO_PORTFOLIO,
  )
}

export async function getPortfolioProperty(id: string): Promise<PortfolioProperty | null> {
  return withDemoFallback(
    () => apiFetch<PortfolioProperty>(`/api/crm/portfolio/${id}`),
    DEMO_PORTFOLIO.find((p) => p.id === id) || null,
  )
}

export async function createPortfolioProperty(
  data: Omit<PortfolioProperty, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PortfolioProperty> {
  return withDemoFallback(
    () =>
      apiFetch<PortfolioProperty>('/api/crm/portfolio', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    } as PortfolioProperty,
  )
}

export async function updatePortfolioProperty(
  id: string,
  data: Partial<PortfolioProperty>,
): Promise<PortfolioProperty> {
  return withDemoFallback(
    () =>
      apiFetch<PortfolioProperty>(`/api/crm/portfolio/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    {
      id,
      address: '',
      propertyType: 'single_family',
      units: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    } as PortfolioProperty,
  )
}

export async function deletePortfolioProperty(id: string): Promise<void> {
  return withDemoFallback(
    () =>
      apiFetch<void>(`/api/crm/portfolio/${id}`, {
        method: 'DELETE',
      }),
    undefined,
  )
}

// ── Property Lookup (ATTOM) ─────────────────────────────────
export async function lookupProperty(
  address: string,
  city: string,
  state: string,
  zip: string,
): Promise<Record<string, string>> {
  try {
    return await apiFetch<Record<string, string>>('/api/property/lookup', {
      method: 'POST',
      body: JSON.stringify({ address, city, state, zip }),
    })
  } catch {
    return {}
  }
}
