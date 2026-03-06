import type { Deal, Contact, PortfolioProperty } from '@/types'
import { mockDeals, mockContacts } from '@/data/mockData'

const DEALS_KEY = 'rei_deals'
const CONTACTS_KEY = 'rei_contacts'

// ============ DEALS ============

export async function getDeals(_userId: string): Promise<Deal[]> {
  const raw = localStorage.getItem(DEALS_KEY)
  if (raw) {
    const existing = JSON.parse(raw) as Deal[]
    // Reseed if mockData has grown (new deals added in an update)
    if (existing.length < mockDeals.length) {
      const existingIds = new Set(existing.map((d) => d.id))
      const merged = [...existing, ...mockDeals.filter((d) => !existingIds.has(d.id))]
      localStorage.setItem(DEALS_KEY, JSON.stringify(merged))
      return merged
    }
    return existing
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
    // Pricing & Valuation
    listPrice: deal.listPrice,
    offerPrice: deal.offerPrice,
    purchasePrice: deal.purchasePrice,
    arv: deal.arv,
    // Acquisition Costs
    earnestMoney: deal.earnestMoney,
    downPayment: deal.downPayment,
    closingCostsBuyer: deal.closingCostsBuyer,
    loanOriginationFee: deal.loanOriginationFee,
    appraisalFee: deal.appraisalFee,
    inspectionFee: deal.inspectionFee,
    titleInsurance: deal.titleInsurance,
    attorneyFee: deal.attorneyFee,
    surveyFee: deal.surveyFee,
    otherAcquisitionCosts: deal.otherAcquisitionCosts,
    // Rehab
    rehabEstimate: deal.rehabEstimate,
    rehabActual: deal.rehabActual,
    permitFees: deal.permitFees,
    architectFees: deal.architectFees,
    holdingCostsDuringRehab: deal.holdingCostsDuringRehab,
    // Financing
    loanAmount: deal.loanAmount,
    interestRate: deal.interestRate,
    loanTermMonths: deal.loanTermMonths,
    monthlyMortgagePI: deal.monthlyMortgagePI,
    pmiMonthly: deal.pmiMonthly,
    // Monthly Expenses
    propertyTaxAnnual: deal.propertyTaxAnnual,
    insuranceAnnual: deal.insuranceAnnual,
    propertyMgmtPercent: deal.propertyMgmtPercent,
    propertyMgmtFlat: deal.propertyMgmtFlat,
    vacancyPercent: deal.vacancyPercent,
    maintenancePercent: deal.maintenancePercent,
    hoaMonthly: deal.hoaMonthly,
    utilitiesMonthly: deal.utilitiesMonthly,
    otherExpensesMonthly: deal.otherExpensesMonthly,
    // Income
    monthlyRent: deal.monthlyRent,
    otherMonthlyIncome: deal.otherMonthlyIncome,
    // Computed / Summary
    allInCost: deal.allInCost,
    totalMonthlyExpenses: deal.totalMonthlyExpenses,
    monthlyCashFlow: deal.monthlyCashFlow,
    annualCashFlow: deal.annualCashFlow,
    cashOnCash: deal.cashOnCash,
    capRate: deal.capRate,
    roiPercent: deal.roiPercent,
    debtServiceCoverageRatio: deal.debtServiceCoverageRatio,
    // Deal Info
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

// ============ PORTFOLIO ============

const PORTFOLIO_KEY = 'rei_portfolio'

const PORTFOLIO_SEED: PortfolioProperty[] = [
  {
    id: 'prop-1',
    address: '1842 Ridgewood Dr',
    city: 'San Antonio',
    state: 'TX',
    zip: '78201',
    propertyType: 'single_family',
    units: 1,
    purchaseDate: new Date(Date.now() - 86400000 * 365).toISOString(),
    purchasePrice: 185000,
    rehabCost: 22000,
    currentValue: 235000,
    loanBalance: 148000,
    monthlyMortgage: 1100,
    monthlyRent: 1750,
    notes: 'Section 8 approved. Long-term tenant in place.',
    createdAt: new Date(Date.now() - 86400000 * 365).toISOString(),
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
    purchaseDate: new Date(Date.now() - 86400000 * 180).toISOString(),
    purchasePrice: 132000,
    rehabCost: 18000,
    currentValue: 175000,
    loanBalance: 108000,
    monthlyMortgage: 820,
    monthlyRent: 1350,
    notes: 'Month-to-month lease. Considering refinance.',
    createdAt: new Date(Date.now() - 86400000 * 180).toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

export async function getPortfolioProperties(): Promise<PortfolioProperty[]> {
  const stored = localStorage.getItem(PORTFOLIO_KEY)
  if (stored) return JSON.parse(stored)
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(PORTFOLIO_SEED))
  return PORTFOLIO_SEED
}

export async function createPortfolioProperty(
  data: Omit<PortfolioProperty, 'id' | 'createdAt' | 'updatedAt'>
): Promise<PortfolioProperty> {
  const properties = await getPortfolioProperties()
  const newProp: PortfolioProperty = {
    ...data,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  const updated = [newProp, ...properties]
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(updated))
  return newProp
}

export async function updatePortfolioProperty(
  id: string,
  updates: Partial<PortfolioProperty>
): Promise<PortfolioProperty> {
  const properties = await getPortfolioProperties()
  const updated = properties.map(p =>
    p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
  )
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(updated))
  return updated.find(p => p.id === id)!
}

export async function deletePortfolioProperty(id: string): Promise<void> {
  const properties = await getPortfolioProperties()
  const updated = properties.filter(p => p.id !== id)
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(updated))
}
