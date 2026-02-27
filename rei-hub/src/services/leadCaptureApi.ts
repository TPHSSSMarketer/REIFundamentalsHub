// localStorage-based Lead Capture API with REI demo data
// All functions are async to match page component expectations

// ── Configuration ─────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function getAuthHeader(): Record<string, string> {
  try {
    const stored = localStorage.getItem('rei-hub-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      const token = parsed?.state?.token
      if (token) return { 'Authorization': `Bearer ${token}` }
    }
  } catch { /* ignore */ }
  return {}
}

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
  category: 'seller' | 'buyer' | 'hybrid' | 'agent' | 'branding' | 'notes'
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
  custom_domain?: string
  market?: string
  logo_url?: string
  slug?: string
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
  slug?: string
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
    templateId: 'cash_buyers',
    slug: 'san-antonio-cash-buyers-abc12345',
    status: 'published',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    leadCount: 18,
    config: {
      templateId: 'cash_buyers',
      company_name: 'San Antonio Property Solutions',
      headline: 'Sell Your House Fast for Cash',
      description: 'Get a fair cash offer for your home in 24 hours. No repairs needed, no waiting.',
      phone: '(210) 555-0143',
      email: 'offers@sanantonioproperty.com',
      primary_color: '#2563eb',
      form_fields: ['name', 'phone', 'email', 'address', 'message'],
      webhook_url: 'https://example.com/webhooks/leads',
      slug: 'san-antonio-cash-buyers-abc12345',
    },
    html: '<html>...</html>',
  },
  {
    id: 'web-2',
    name: 'Birmingham Motivated Sellers',
    templateId: 'motivated_sellers',
    slug: 'birmingham-motivated-sellers-def67890',
    status: 'published',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    leadCount: 12,
    config: {
      templateId: 'motivated_sellers',
      company_name: 'Birmingham Investment Group',
      headline: 'Find Off-Market Deals',
      description: 'Get instant notifications for the best wholesale opportunities in your market.',
      phone: '(205) 555-0198',
      email: 'deals@bhamgroup.com',
      primary_color: '#1e293b',
      form_fields: ['name', 'phone', 'email', 'address'],
      webhook_url: 'https://example.com/webhooks/leads',
      slug: 'birmingham-motivated-sellers-def67890',
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

// ── Embed Code Generation ──────────────────────────────────────

export async function generateEmbedCode(websiteId: string, config: WebsiteConfig): Promise<string> {
  return withDemoFallback(async () => {
    const websites = getStoredWebsites()
    const website = websites.find((w) => w.id === websiteId)
    if (!website) throw new Error('Website not found')

    // Generate a unique ID for this embed instance
    const embedId = `rei-form-${websiteId}`
    const webhookUrl = config.webhook_url || 'https://example.com/webhooks/leads'

    const formFields = config.form_fields
      .map((field) => {
        switch (field) {
          case 'name':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-name" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Full Name *</label>
          <input type="text" id="${embedId}-name" name="name" required style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;">
        </div>`
          case 'phone':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-phone" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Phone Number *</label>
          <input type="tel" id="${embedId}-phone" name="phone" required style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;">
        </div>`
          case 'email':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-email" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Email Address *</label>
          <input type="email" id="${embedId}-email" name="email" required style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;">
        </div>`
          case 'address':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-address" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Property Address</label>
          <input type="text" id="${embedId}-address" name="address" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;">
        </div>`
          case 'message':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-message" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Tell Us About Your Property</label>
          <textarea id="${embedId}-message" name="message" rows="3" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;"></textarea>
        </div>`
          default:
            return ''
        }
      })
      .join('')

    return `<!-- REI Fundamentals Hub Lead Capture Form -->
<div id="${embedId}"></div>
<script>
(function() {
  const containerId = '${embedId}';
  const container = document.getElementById(containerId);
  if (!container) return;

  const primaryColor = '${config.primary_color}';
  const webhookUrl = '${webhookUrl}';

  // Create wrapper div
  const wrapper = document.createElement('div');
  wrapper.id = containerId + '-wrapper';
  wrapper.style.cssText = 'max-width: 400px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';

  // Create form
  const form = document.createElement('form');
  form.id = containerId + '-form';
  form.style.cssText = 'background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';

  // Title
  const title = document.createElement('h3');
  title.textContent = 'Get in Touch';
  title.style.cssText = 'margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #111827;';
  form.appendChild(title);

  // Form fields HTML
  form.innerHTML += \`${formFields}\`;

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Submit';
  submitBtn.style.cssText = \`width: 100%; padding: 10px; background-color: \${primaryColor}; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px;\`;
  submitBtn.onmouseover = function() { this.style.opacity = '0.9'; };
  submitBtn.onmouseout = function() { this.style.opacity = '1'; };
  form.appendChild(submitBtn);

  // Handle form submission
  form.onsubmit = function(e) {
    e.preventDefault();

    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => {
      data[key] = value;
    });

    // Try to send to webhook
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(() => {
        // Silently fail if webhook not available
      });
    }

    // Show thank you message
    form.style.display = 'none';
    const thankYou = document.createElement('div');
    thankYou.style.cssText = 'background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 24px; text-align: center; color: #166534;';
    thankYou.innerHTML = '<p style="margin: 0; font-weight: 600;">Thank you for your submission!</p><p style="margin: 8px 0 0 0; font-size: 14px;">We will be in touch soon.</p>';
    wrapper.appendChild(thankYou);
  };

  wrapper.appendChild(form);
  container.appendChild(wrapper);
})();
</script>`
  }, '')
}

export async function generateEmbedPopupCode(websiteId: string, config: WebsiteConfig): Promise<string> {
  return withDemoFallback(async () => {
    const websites = getStoredWebsites()
    const website = websites.find((w) => w.id === websiteId)
    if (!website) throw new Error('Website not found')

    const embedId = `rei-popup-${websiteId}`
    const webhookUrl = config.webhook_url || 'https://example.com/webhooks/leads'

    const formFields = config.form_fields
      .map((field) => {
        switch (field) {
          case 'name':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-name" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Full Name *</label>
          <input type="text" id="${embedId}-name" name="name" required style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;">
        </div>`
          case 'phone':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-phone" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Phone Number *</label>
          <input type="tel" id="${embedId}-phone" name="phone" required style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;">
        </div>`
          case 'email':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-email" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Email Address *</label>
          <input type="email" id="${embedId}-email" name="email" required style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;">
        </div>`
          case 'address':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-address" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Property Address</label>
          <input type="text" id="${embedId}-address" name="address" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;">
        </div>`
          case 'message':
            return `
        <div style="margin-bottom: 16px;">
          <label for="${embedId}-message" style="display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px;">Tell Us About Your Property</label>
          <textarea id="${embedId}-message" name="message" rows="3" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: inherit; box-sizing: border-box;"></textarea>
        </div>`
          default:
            return ''
        }
      })
      .join('')

    return `<!-- REI Fundamentals Hub Popup Lead Form -->
<div id="${embedId}-button"></div>
<script>
(function() {
  const buttonId = '${embedId}-button';
  const modalId = '${embedId}-modal';
  const primaryColor = '${config.primary_color}';
  const webhookUrl = '${webhookUrl}';

  // Create button
  const buttonContainer = document.getElementById(buttonId);
  if (!buttonContainer) return;

  const button = document.createElement('button');
  button.textContent = 'Contact Us';
  button.style.cssText = \`background-color: \${primaryColor}; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;\`;
  button.onmouseover = function() { this.style.opacity = '0.9'; };
  button.onmouseout = function() { this.style.opacity = '1'; };

  // Create modal
  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';

  // Modal content
  const modalContent = document.createElement('div');
  modalContent.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; box-shadow: 0 20px 25px rgba(0,0,0,0.15); max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = 'position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
  closeBtn.onclick = () => { modal.style.display = 'none'; };

  // Form
  const form = document.createElement('form');
  form.id = modalId + '-form';
  form.style.cssText = 'padding: 32px;';

  // Title
  const title = document.createElement('h2');
  title.textContent = 'Get in Touch';
  title.style.cssText = 'margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: #111827;';
  form.appendChild(title);

  // Fields
  form.innerHTML += \`${formFields}\`;

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Submit';
  submitBtn.style.cssText = \`width: 100%; padding: 10px; background-color: \${primaryColor}; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px;\`;
  submitBtn.onmouseover = function() { this.style.opacity = '0.9'; };
  submitBtn.onmouseout = function() { this.style.opacity = '1'; };
  form.appendChild(submitBtn);

  form.onsubmit = function(e) {
    e.preventDefault();

    const formData = new FormData(form);
    const data = {};
    formData.forEach((value, key) => {
      data[key] = value;
    });

    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(() => {});
    }

    form.style.display = 'none';
    const thankYou = document.createElement('div');
    thankYou.style.cssText = 'padding: 32px; text-align: center; color: #166534;';
    thankYou.innerHTML = '<p style="margin: 0; font-weight: 600; font-size: 18px;">Thank you!</p><p style="margin: 8px 0 0 0; font-size: 14px; color: #4b5563;">We will be in touch soon.</p><button onclick="document.getElementById(\\'' + modalId + '\\').style.display = \\'none\\';" style="margin-top: 16px; padding: 8px 16px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-family: inherit;">Close</button>';
    modalContent.appendChild(thankYou);
  };

  modalContent.appendChild(closeBtn);
  modalContent.appendChild(form);
  modal.appendChild(modalContent);

  button.onclick = () => { modal.style.display = 'block'; };

  buttonContainer.appendChild(button);
  document.body.appendChild(modal);
})();
</script>`
  }, '')
}

export async function updateCustomDomain(websiteId: string, domain: string): Promise<void> {
  return withDemoFallback(async () => {
    const websites = getStoredWebsites()
    const index = websites.findIndex((w) => w.id === websiteId)

    if (index === -1) throw new Error('Website not found')

    const website = websites[index]
    website.config.custom_domain = domain
    website.updatedAt = new Date().toISOString()

    websites[index] = website
    setStoredWebsites(websites)
  }, undefined)
}

export async function checkDomainStatus(domain: string): Promise<'not_configured' | 'pending' | 'active'> {
  return withDemoFallback(async () => {
    // In demo mode, always return active for demo sites
    if (isDemoMode()) return 'active'
    // In a real app, this would check DNS records
    return 'not_configured'
  }, 'active')
}
