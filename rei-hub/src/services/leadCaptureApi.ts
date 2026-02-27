// localStorage-based Lead Capture API with REI demo data
// All functions are async to match page component expectations

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

// ── Types ─────────────────────────────────────────────────

export interface LeadCaptureTemplate {
  id: string
  name: string
  description: string
  category: 'seller' | 'buyer' | 'evaluation' | 'wholesale'
  previewColor: string
  generateHtml: (config: WebsiteConfig) => string
}

export interface WebsiteConfig {
  templateId: string
  company_name: string
  headline: string
  description: string
  phone: string
  email: string
  primary_color: string
  form_fields: string[] // ['name', 'phone', 'email', 'address', 'message']
  webhook_url?: string
}

export interface PublishedWebsite {
  id: string
  name: string
  templateId: string
  config: WebsiteConfig
  html: string
  status: 'draft' | 'published'
  createdAt: string
  updatedAt: string
  leadCount: number
}

export interface CapturedLead {
  id: string
  websiteId: string
  websiteName: string
  name?: string
  email?: string
  phone?: string
  address?: string
  message?: string
  capturedAt: string
}

// ── Demo Data ──────────────────────────────────────────────

const DEMO_WEBSITES: PublishedWebsite[] = [
  {
    id: 'web-1',
    name: 'San Antonio Cash Buyers',
    templateId: 'motivated-seller',
    status: 'published',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    leadCount: 18,
    config: {
      templateId: 'motivated-seller',
      company_name: 'San Antonio Property Solutions',
      headline: 'Sell Your House Fast for Cash',
      description: 'Get a fair cash offer for your home in 24 hours. No repairs needed, no waiting.',
      phone: '(210) 555-0143',
      email: 'offers@sanantonioproperty.com',
      primary_color: '#2563eb',
      form_fields: ['name', 'phone', 'email', 'address', 'message'],
      webhook_url: 'https://example.com/webhooks/leads',
    },
    html: '<html>...</html>',
  },
  {
    id: 'web-2',
    name: 'Birmingham Motivated Sellers',
    templateId: 'cash-buyer',
    status: 'published',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    leadCount: 12,
    config: {
      templateId: 'cash-buyer',
      company_name: 'Birmingham Investment Group',
      headline: 'Find Off-Market Deals',
      description: 'Get instant notifications for the best wholesale opportunities in your market.',
      phone: '(205) 555-0198',
      email: 'deals@bhamgroup.com',
      primary_color: '#1e293b',
      form_fields: ['name', 'phone', 'email', 'address'],
      webhook_url: 'https://example.com/webhooks/leads',
    },
    html: '<html>...</html>',
  },
]

const DEMO_LEADS: CapturedLead[] = [
  {
    id: 'lead-1',
    websiteId: 'web-1',
    websiteName: 'San Antonio Cash Buyers',
    name: 'John Martinez',
    email: 'john.martinez@email.com',
    phone: '(210) 555-0123',
    address: '1524 Oak Ridge Drive, San Antonio, TX 78228',
    message: 'Need to sell quickly due to job relocation',
    capturedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'lead-2',
    websiteId: 'web-1',
    websiteName: 'San Antonio Cash Buyers',
    name: 'Sarah Johnson',
    email: 'sarah.j@email.com',
    phone: '(210) 555-0145',
    address: '3847 Cypress Lane, San Antonio, TX 78217',
    message: 'Property needs significant repairs',
    capturedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'lead-3',
    websiteId: 'web-2',
    websiteName: 'Birmingham Motivated Sellers',
    name: 'Michael Chen',
    email: 'mchen@email.com',
    phone: '(205) 555-0167',
    address: 'Birmingham, AL',
    message: 'Looking for investment properties up to $250k',
    capturedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'lead-4',
    websiteId: 'web-1',
    websiteName: 'San Antonio Cash Buyers',
    name: 'Maria Rodriguez',
    email: 'maria.r@email.com',
    phone: '(210) 555-0189',
    address: '2156 Maple Street, San Antonio, TX 78204',
    capturedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'lead-5',
    websiteId: 'web-2',
    websiteName: 'Birmingham Motivated Sellers',
    name: 'David Thompson',
    email: 'dthompson@email.com',
    phone: '(205) 555-0134',
    message: 'Experienced investor, buy 3-5 deals per year',
    capturedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

// ── localStorage Helpers ───────────────────────────────────

const WEBSITES_KEY = 'rei_lead_capture_websites'
const LEADS_KEY = 'rei_lead_capture_leads'

function getStoredWebsites(): PublishedWebsite[] {
  try {
    const stored = localStorage.getItem(WEBSITES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function setStoredWebsites(websites: PublishedWebsite[]): void {
  localStorage.setItem(WEBSITES_KEY, JSON.stringify(websites))
}

function getStoredLeads(): CapturedLead[] {
  try {
    const stored = localStorage.getItem(LEADS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function setStoredLeads(leads: CapturedLead[]): void {
  localStorage.setItem(LEADS_KEY, JSON.stringify(leads))
}

// ── API Functions ──────────────────────────────────────────

export async function getTemplates(): Promise<LeadCaptureTemplate[]> {
  return withDemoFallback(async () => {
    // In a real app, this would fetch from the server
    // For now, templates are imported directly in the component
    return []
  }, [])
}

export async function getWebsites(): Promise<PublishedWebsite[]> {
  return withDemoFallback(
    async () => {
      const stored = getStoredWebsites()
      return stored.length > 0 ? stored : DEMO_WEBSITES
    },
    DEMO_WEBSITES
  )
}

export async function createWebsite(config: WebsiteConfig): Promise<PublishedWebsite> {
  return withDemoFallback(async () => {
    const websites = getStoredWebsites()
    const id = `web-${Date.now()}`
    const now = new Date().toISOString()

    const website: PublishedWebsite = {
      id,
      name: config.company_name,
      templateId: config.templateId,
      config,
      html: '<html>...</html>', // Will be generated on publish
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      leadCount: 0,
    }

    websites.push(website)
    setStoredWebsites(websites)
    return website
  }, {} as PublishedWebsite)
}

export async function updateWebsite(id: string, config: WebsiteConfig): Promise<PublishedWebsite> {
  return withDemoFallback(async () => {
    const websites = getStoredWebsites()
    const index = websites.findIndex((w) => w.id === id)

    if (index === -1) throw new Error('Website not found')

    const website = websites[index]
    website.config = config
    website.updatedAt = new Date().toISOString()

    websites[index] = website
    setStoredWebsites(websites)
    return website
  }, {} as PublishedWebsite)
}

export async function publishWebsite(
  id: string,
  generateHtml: (config: WebsiteConfig) => string
): Promise<PublishedWebsite> {
  return withDemoFallback(async () => {
    const websites = getStoredWebsites()
    const index = websites.findIndex((w) => w.id === id)

    if (index === -1) throw new Error('Website not found')

    const website = websites[index]
    let html = generateHtml(website.config)

    // Replace all placeholders in HTML
    html = html
      .replace(/{{HEADLINE}}/g, website.config.headline)
      .replace(/{{DESCRIPTION}}/g, website.config.description)
      .replace(/{{COMPANY_NAME}}/g, website.config.company_name)
      .replace(/{{PHONE}}/g, website.config.phone)
      .replace(/{{EMAIL}}/g, website.config.email)
      .replace(/{{PRIMARY_COLOR}}/g, website.config.primary_color)
      .replace(/{{WEBHOOK_URL}}/g, website.config.webhook_url || 'https://example.com/webhooks/leads')

    website.html = html
    website.status = 'published'
    website.updatedAt = new Date().toISOString()

    websites[index] = website
    setStoredWebsites(websites)
    return website
  }, {} as PublishedWebsite)
}

export async function deleteWebsite(id: string): Promise<void> {
  return withDemoFallback(async () => {
    let websites = getStoredWebsites()
    websites = websites.filter((w) => w.id !== id)
    setStoredWebsites(websites)

    // Also delete associated leads
    let leads = getStoredLeads()
    leads = leads.filter((l) => l.websiteId !== id)
    setStoredLeads(leads)
  }, undefined)
}

export async function getLeads(websiteId?: string): Promise<CapturedLead[]> {
  return withDemoFallback(
    async () => {
      const stored = getStoredLeads()
      const leads = stored.length > 0 ? stored : DEMO_LEADS

      if (websiteId) {
        return leads.filter((l) => l.websiteId === websiteId)
      }
      return leads
    },
    websiteId ? DEMO_LEADS.filter((l) => l.websiteId === websiteId) : DEMO_LEADS
  )
}

export async function addLead(websiteId: string, leadData: Omit<CapturedLead, 'id' | 'capturedAt'>): Promise<CapturedLead> {
  return withDemoFallback(async () => {
    const leads = getStoredLeads()
    const id = `lead-${Date.now()}`
    const now = new Date().toISOString()

    const lead: CapturedLead = {
      ...leadData,
      id,
      capturedAt: now,
    }

    leads.push(lead)
    setStoredLeads(leads)

    // Update website lead count
    const websites = getStoredWebsites()
    const website = websites.find((w) => w.id === websiteId)
    if (website) {
      website.leadCount += 1
      setStoredWebsites(websites)
    }

    return lead
  }, {} as CapturedLead)
}

export async function deleteLead(id: string): Promise<void> {
  return withDemoFallback(async () => {
    let leads = getStoredLeads()
    const lead = leads.find((l) => l.id === id)

    leads = leads.filter((l) => l.id !== id)
    setStoredLeads(leads)

    // Update website lead count
    if (lead) {
      const websites = getStoredWebsites()
      const website = websites.find((w) => w.id === lead.websiteId)
      if (website && website.leadCount > 0) {
        website.leadCount -= 1
        setStoredWebsites(websites)
      }
    }
  }, undefined)
}

export async function downloadWebsiteHTML(id: string): Promise<string> {
  return withDemoFallback(async () => {
    const websites = getStoredWebsites()
    const website = websites.find((w) => w.id === id)

    if (!website) throw new Error('Website not found')
    return website.html
  }, '')
}

export async function exportLeadsToCSV(websiteId?: string): Promise<string> {
  const leads = await getLeads(websiteId)

  if (leads.length === 0) return ''

  // Get all unique field names
  const fields = new Set<string>()
  leads.forEach((lead) => {
    Object.keys(lead).forEach((key) => {
      if (key !== 'id' && key !== 'capturedAt') fields.add(key)
    })
  })

  const headers = ['Date', ...Array.from(fields)]
  const rows = leads.map((lead) => [
    new Date(lead.capturedAt).toLocaleString(),
    ...Array.from(fields).map((field) => lead[field as keyof CapturedLead] || ''),
  ])

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')

  return csv
}
