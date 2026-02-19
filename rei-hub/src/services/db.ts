import type { Deal, Contact } from '@/types'
import { mockDeals, mockContacts } from '@/data/mockData'

const DEALS_KEY = 'rei_deals'
const CONTACTS_KEY = 'rei_contacts'

// ============ DEALS ============

export async function getDeals(_userId: string): Promise<Deal[]> {
  const raw = localStorage.getItem(DEALS_KEY)
  if (raw) {
    return JSON.parse(raw) as Deal[]
  }
  // Seed from mockData on first access
  localStorage.setItem(DEALS_KEY, JSON.stringify(mockDeals))
  return [...mockDeals]
}

export async function getDeal(id: string): Promise<Deal | null> {
  const deals = await getDeals('local-user')
  return deals.find((d) => d.id === id) ?? null
}

export async function createDeal(_userId: string, deal: Partial<Deal>): Promise<Deal> {
  const deals = await getDeals(_userId)
  const now = new Date().toISOString()
  const newDeal: Deal = {
    id: `deal-${Date.now()}`,
    title: deal.title || deal.address || 'New Deal',
    address: deal.address || deal.title || '',
    city: deal.city,
    state: deal.state,
    zip: deal.zip,
    stage: deal.stage || 'lead',
    listPrice: deal.listPrice,
    purchasePrice: deal.purchasePrice,
    arv: deal.arv,
    rehabEstimate: deal.rehabEstimate,
    allInCost: deal.allInCost,
    monthlyRent: deal.monthlyRent,
    cashOnCash: deal.cashOnCash,
    capRate: deal.capRate,
    contactId: deal.contactId,
    contactName: deal.contactName,
    offerExpiresAt: deal.offerExpiresAt,
    inspectionDeadline: deal.inspectionDeadline,
    closingDate: deal.closingDate,
    source: deal.source,
    notes: deal.notes,
    isUrgent: deal.isUrgent ?? false,
    passedReason: deal.passedReason,
    createdAt: now,
    updatedAt: now,
  }
  deals.unshift(newDeal)
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals))
  return newDeal
}

export async function updateDeal(id: string, updates: Partial<Deal>): Promise<Deal> {
  const deals = await getDeals('local-user')
  const index = deals.findIndex((d) => d.id === id)
  if (index === -1) throw new Error('Deal not found')
  deals[index] = { ...deals[index], ...updates, updatedAt: new Date().toISOString() }
  localStorage.setItem(DEALS_KEY, JSON.stringify(deals))
  return deals[index]
}

export async function deleteDeal(id: string): Promise<void> {
  const deals = await getDeals('local-user')
  const filtered = deals.filter((d) => d.id !== id)
  localStorage.setItem(DEALS_KEY, JSON.stringify(filtered))
}

// ============ CONTACTS ============

export async function getContacts(_userId: string): Promise<Contact[]> {
  const raw = localStorage.getItem(CONTACTS_KEY)
  if (raw) {
    return JSON.parse(raw) as Contact[]
  }
  // Seed from mockData on first access
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(mockContacts))
  return [...mockContacts]
}

export async function getContact(id: string): Promise<Contact | null> {
  const contacts = await getContacts('local-user')
  return contacts.find((c) => c.id === id) ?? null
}

export async function createContact(_userId: string, contact: Partial<Contact>): Promise<Contact> {
  const contacts = await getContacts(_userId)
  const now = new Date().toISOString()
  const newContact: Contact = {
    id: `contact-${Date.now()}`,
    name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'New Contact',
    firstName: contact.firstName,
    lastName: contact.lastName,
    role: contact.role || 'seller',
    company: contact.company,
    phone: contact.phone,
    email: contact.email,
    tags: contact.tags || [],
    source: contact.source,
    preferredChannel: contact.preferredChannel,
    markets: contact.markets,
    notes: contact.notes,
    rating: contact.rating,
    interactionCount: 0,
    dateAdded: now,
    lastActivity: now,
  }
  contacts.unshift(newContact)
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts))
  return newContact
}

export async function updateContact(id: string, updates: Partial<Contact>): Promise<Contact> {
  const contacts = await getContacts('local-user')
  const index = contacts.findIndex((c) => c.id === id)
  if (index === -1) throw new Error('Contact not found')
  contacts[index] = { ...contacts[index], ...updates, lastActivity: new Date().toISOString() }
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts))
  return contacts[index]
}

export async function deleteContact(id: string): Promise<void> {
  const contacts = await getContacts('local-user')
  const filtered = contacts.filter((c) => c.id !== id)
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(filtered))
}
