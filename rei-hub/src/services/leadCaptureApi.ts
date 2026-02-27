// Lead Capture API — talks to the real FastAPI backend with demo fallback
// All functions are async to match page component expectations

// ── Configuration ─────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

function getAuthHeader(): Record<string, string> {
  try {
    const stored = localStorage.getItem('rei-hub-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      const token = parsed?.state?.token
      if (token) return { Authorization: `Bearer ${token}` }
    }
  } catch {
    /* ignore */
  }
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
  totalViews: number
  slug?: string
  company_slug?: string
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
  crmContactId?: string
  crmDealId?: string
}

// ── Helper: map backend response → PublishedWebsite ──────

function mapSiteResponse(s: Record<string, unknown>): PublishedWebsite {
  const config = (s.config ?? {}) as WebsiteConfig
  return {
    id: String(s.id),
    name: (s.name as string) || config.company_name || '',
    templateId: (s.template_type as string) || config.templateId || '',
    config,
    html: '', // HTML is rendered client-side; backend stores it in published_html
    status: (s.status as 'draft' | 'published') || 'draft',
    createdAt: (s.created_at as string) || new Date().toISOString(),
    updatedAt: (s.updated_at as string) || new Date().toISOString(),
    leadCount: (s.submission_count as number) || 0,
    totalViews: (s.total_views as number) || 0,
    slug: s.slug as string | undefined,
    company_slug: s.company_slug as string | undefined,
  }
}

function mapSubmissionResponse(s: Record<string, unknown>, siteName: string): CapturedLead {
  const formData = (s.form_data ?? {}) as Record<string, string>
  return {
    id: String(s.id),
    websiteId: String(s.site_id),
    websiteName: siteName,
    name: (s.lead_name as string) || formData.name || undefined,
    email: (s.lead_email as string) || formData.email || undefined,
    phone: (s.lead_phone as string) || formData.phone || undefined,
    address: (s.lead_address as string) || formData.address || undefined,
    message: formData.message || undefined,
    capturedAt: (s.submitted_at as string) || new Date().toISOString(),
    crmContactId: (s.crm_contact_id as string) || undefined,
    crmDealId: (s.crm_deal_id as string) || undefined,
  }
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

// ── API Functions ──────────────────────────────────────────

export async function getTemplates(): Promise<LeadCaptureTemplate[]> {
  // Templates are imported directly in the component — this is a no-op
  return []
}

export async function getWebsites(): Promise<PublishedWebsite[]> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/lead-capture/sites`, {
      headers: getAuthHeader(),
    })
    if (!res.ok) throw new Error(`Failed to fetch sites: ${res.status}`)
    const data = await res.json()
    return (data as Record<string, unknown>[]).map(mapSiteResponse)
  }, DEMO_WEBSITES)
}

export async function createWebsite(config: WebsiteConfig): Promise<PublishedWebsite> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/lead-capture/sites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        name: config.company_name,
        template_type: config.templateId,
        config,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as Record<string, string>).detail || `Create failed: ${res.status}`)
    }
    const data = await res.json()
    return mapSiteResponse(data as Record<string, unknown>)
  }, {} as PublishedWebsite)
}

export async function updateWebsite(id: string, config: WebsiteConfig): Promise<PublishedWebsite> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/lead-capture/sites/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        name: config.company_name,
        config,
      }),
    })
    if (!res.ok) throw new Error(`Update failed: ${res.status}`)
    const data = await res.json()
    return mapSiteResponse(data as Record<string, unknown>)
  }, {} as PublishedWebsite)
}

export async function publishWebsite(
  id: string,
  generateHtml: (config: WebsiteConfig) => string
): Promise<PublishedWebsite> {
  return withDemoFallback(async () => {
    // First get the latest site config from the server
    const siteRes = await fetch(`${BASE_URL}/api/lead-capture/sites`, {
      headers: getAuthHeader(),
    })
    if (!siteRes.ok) throw new Error(`Failed to fetch sites: ${siteRes.status}`)
    const sites = (await siteRes.json()) as Record<string, unknown>[]
    const site = sites.find((s) => String(s.id) === id)
    if (!site) throw new Error('Site not found')

    const config = site.config as WebsiteConfig
    const html = generateHtml(config)

    // Send the generated HTML to the publish endpoint
    const res = await fetch(`${BASE_URL}/api/lead-capture/sites/${id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ html }),
    })
    if (!res.ok) throw new Error(`Publish failed: ${res.status}`)
    const data = await res.json()
    return mapSiteResponse(data as Record<string, unknown>)
  }, {} as PublishedWebsite)
}

export async function deleteWebsite(id: string): Promise<void> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/lead-capture/sites/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    })
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
  }, undefined)
}

export async function getLeads(websiteId?: string): Promise<CapturedLead[]> {
  return withDemoFallback(async () => {
    // If a specific website is requested, fetch submissions for it
    if (websiteId) {
      const res = await fetch(`${BASE_URL}/api/lead-capture/sites/${websiteId}/submissions`, {
        headers: getAuthHeader(),
      })
      if (!res.ok) throw new Error(`Failed to fetch submissions: ${res.status}`)
      const data = (await res.json()) as Record<string, unknown>[]
      // We need the site name — fetch sites list
      const sitesRes = await fetch(`${BASE_URL}/api/lead-capture/sites`, {
        headers: getAuthHeader(),
      })
      const sites = sitesRes.ok ? ((await sitesRes.json()) as Record<string, unknown>[]) : []
      const site = sites.find((s) => String(s.id) === websiteId)
      const siteName = (site?.name as string) || 'Unknown Site'
      return data.map((s) => mapSubmissionResponse(s, siteName))
    }

    // No specific site — fetch submissions for ALL sites
    const sitesRes = await fetch(`${BASE_URL}/api/lead-capture/sites`, {
      headers: getAuthHeader(),
    })
    if (!sitesRes.ok) throw new Error(`Failed to fetch sites: ${sitesRes.status}`)
    const sites = (await sitesRes.json()) as Record<string, unknown>[]

    const allLeads: CapturedLead[] = []
    for (const site of sites) {
      try {
        const res = await fetch(
          `${BASE_URL}/api/lead-capture/sites/${site.id}/submissions`,
          { headers: getAuthHeader() }
        )
        if (res.ok) {
          const subs = (await res.json()) as Record<string, unknown>[]
          const siteName = (site.name as string) || 'Unknown Site'
          allLeads.push(...subs.map((s) => mapSubmissionResponse(s, siteName)))
        }
      } catch {
        // Skip failed site fetches
      }
    }
    return allLeads.sort(
      (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime()
    )
  }, websiteId ? DEMO_LEADS.filter((l) => l.websiteId === websiteId) : DEMO_LEADS)
}

export async function addLead(
  websiteId: string,
  leadData: Omit<CapturedLead, 'id' | 'capturedAt'>
): Promise<CapturedLead> {
  // Leads are created through the public form submission endpoint, not the API
  // This is kept for demo mode compatibility
  return {
    ...leadData,
    id: `lead-${Date.now()}`,
    capturedAt: new Date().toISOString(),
  }
}

export async function deleteLead(id: string): Promise<void> {
  // Lead deletion not yet implemented in the backend
  // This is a no-op for now
  return
}

export async function downloadWebsiteHTML(id: string): Promise<string> {
  return withDemoFallback(async () => {
    // Fetch the site, get its slug, then fetch the published HTML
    const sitesRes = await fetch(`${BASE_URL}/api/lead-capture/sites`, {
      headers: getAuthHeader(),
    })
    if (!sitesRes.ok) throw new Error('Failed to fetch sites')
    const sites = (await sitesRes.json()) as Record<string, unknown>[]
    const site = sites.find((s) => String(s.id) === id)
    if (!site) throw new Error('Site not found')

    // Fetch the published HTML via the public endpoint
    const slug = site.slug as string
    if (!slug) throw new Error('Site has no slug')

    const companySlug = site.company_slug as string
    const url = companySlug
      ? `${BASE_URL}/${companySlug}/sites/${slug}`
      : `${BASE_URL}/sites/${slug}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Failed to fetch published HTML')
    return res.text()
  }, '')
}

export async function exportLeadsToCSV(websiteId?: string): Promise<string> {
  const leads = await getLeads(websiteId)

  if (leads.length === 0) return ''

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
  const embedId = `rei-form-${websiteId}`
  const webhookUrl = config.webhook_url || `${BASE_URL}/sites/${config.slug}/submit`

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

  const wrapper = document.createElement('div');
  wrapper.id = containerId + '-wrapper';
  wrapper.style.cssText = 'max-width: 400px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';

  const form = document.createElement('form');
  form.id = containerId + '-form';
  form.style.cssText = 'background: white; padding: 24px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';

  const title = document.createElement('h3');
  title.textContent = 'Get in Touch';
  title.style.cssText = 'margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #111827;';
  form.appendChild(title);

  form.innerHTML += \`${formFields}\`;

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
    formData.forEach((value, key) => { data[key] = value; });

    if (webhookUrl) {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).catch(() => {});
    }

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
}

export async function generateEmbedPopupCode(websiteId: string, config: WebsiteConfig): Promise<string> {
  const embedId = `rei-popup-${websiteId}`
  const webhookUrl = config.webhook_url || `${BASE_URL}/sites/${config.slug}/submit`

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

  const buttonContainer = document.getElementById(buttonId);
  if (!buttonContainer) return;

  const button = document.createElement('button');
  button.textContent = 'Contact Us';
  button.style.cssText = \`background-color: \${primaryColor}; color: white; border: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit;\`;
  button.onmouseover = function() { this.style.opacity = '0.9'; };
  button.onmouseout = function() { this.style.opacity = '1'; };

  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';

  const modalContent = document.createElement('div');
  modalContent.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; border-radius: 8px; box-shadow: 0 20px 25px rgba(0,0,0,0.15); max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;';

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '&times;';
  closeBtn.style.cssText = 'position: absolute; top: 12px; right: 12px; background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;';
  closeBtn.onclick = () => { modal.style.display = 'none'; };

  const form = document.createElement('form');
  form.id = modalId + '-form';
  form.style.cssText = 'padding: 32px;';

  const title = document.createElement('h2');
  title.textContent = 'Get in Touch';
  title.style.cssText = 'margin: 0 0 24px 0; font-size: 20px; font-weight: 600; color: #111827;';
  form.appendChild(title);

  form.innerHTML += \`${formFields}\`;

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
    formData.forEach((value, key) => { data[key] = value; });

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
}

export async function updateCustomDomain(websiteId: string, domain: string): Promise<void> {
  return withDemoFallback(async () => {
    // Update the config with the custom domain
    const sitesRes = await fetch(`${BASE_URL}/api/lead-capture/sites`, {
      headers: getAuthHeader(),
    })
    if (!sitesRes.ok) throw new Error('Failed to fetch sites')
    const sites = (await sitesRes.json()) as Record<string, unknown>[]
    const site = sites.find((s) => String(s.id) === websiteId)
    if (!site) throw new Error('Site not found')

    const config = { ...(site.config as WebsiteConfig), custom_domain: domain }
    await fetch(`${BASE_URL}/api/lead-capture/sites/${websiteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ config }),
    })
  }, undefined)
}

export async function checkDomainStatus(
  domain: string
): Promise<'not_configured' | 'pending' | 'active'> {
  return withDemoFallback(async () => {
    // In a real setup, this could check DNS records or a domain verification service
    // For now, return not_configured unless it's our known subdomain
    if (domain === 'sites.reifundamentalshub.com') return 'active'
    return 'not_configured'
  }, 'active')
}

// ── Analytics ──────────────────────────────────────────────────────

export interface SiteAnalytics {
  total_views: number
  total_submissions: number
  conversion_rate: number
  daily: { date: string; views: number; submissions: number; unique_visitors: number }[]
}

export async function getAnalytics(siteId: string, days = 30): Promise<SiteAnalytics> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/lead-capture/sites/${siteId}/analytics?days=${days}`, {
      headers: getAuthHeader(),
    })
    if (!res.ok) throw new Error(`Analytics fetch failed: ${res.status}`)
    return res.json()
  }, { total_views: 0, total_submissions: 0, conversion_rate: 0, daily: [] })
}

// ── CRM Sync ───────────────────────────────────────────────────────

export async function updateSubmissionCRM(
  submissionId: string,
  crmContactId: string,
  crmDealId: string
): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/lead-capture/submissions/${submissionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({
        crm_contact_id: crmContactId,
        crm_deal_id: crmDealId,
      }),
    })
  } catch {
    // Silently fail — CRM sync is best-effort
  }
}

/**
 * Sync leads to the subscriber's CRM (localStorage Contacts + Deals).
 * For each lead that doesn't have a crm_contact_id, create a Contact and Deal.
 */
export async function syncLeadsToCRM(leads: CapturedLead[]): Promise<void> {
  // Dynamic import to avoid circular dependency
  const { createContact, createDeal, getContacts } = await import('@/services/crmApi')

  const existingContacts = await getContacts('local-user')
  const existingEmails = new Set(
    existingContacts.map((c) => c.email?.toLowerCase()).filter(Boolean)
  )

  for (const lead of leads) {
    // Skip if already synced
    if (lead.crmContactId) continue

    // Skip if no identifying info
    if (!lead.email && !lead.name) continue

    // Check if contact already exists by email
    if (lead.email && existingEmails.has(lead.email.toLowerCase())) continue

    // Parse first/last name
    const nameParts = (lead.name || '').trim().split(' ')
    const firstName = nameParts[0] || ''
    const lastName = nameParts.slice(1).join(' ') || ''

    try {
      // Create Contact
      const contact = await createContact('local-user', {
        firstName,
        lastName,
        name: lead.name || `${firstName} ${lastName}`.trim(),
        email: lead.email,
        phone: lead.phone,
        role: 'seller',
        source: 'Lead Capture',
        tags: ['lead-capture'],
      })

      // Create Deal linked to contact
      const deal = await createDeal('local-user', {
        title: `${lead.name || 'Lead'} - ${lead.websiteName}`,
        address: lead.address || '',
        contactId: contact.id,
        contactName: contact.name,
        stage: 'lead',
        source: 'Lead Capture',
        notes: lead.message || '',
      })

      // Track the email so we don't duplicate
      if (lead.email) existingEmails.add(lead.email.toLowerCase())

      // Update the backend submission with CRM IDs
      if (lead.id) {
        await updateSubmissionCRM(lead.id, contact.id, deal.id)
      }
    } catch (err) {
      console.warn('Failed to sync lead to CRM:', err)
    }
  }
}

// ── Notification Settings ───────────────────────────────────

export interface NotificationSettings {
  leadEmailNotifications: boolean
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/lead-capture/notification-settings`, {
      headers: getAuthHeader(),
    })
    if (!res.ok) throw new Error('Failed to load notification settings')
    return res.json()
  }, { leadEmailNotifications: true })
}

export async function updateNotificationSettings(
  settings: NotificationSettings,
): Promise<NotificationSettings> {
  return withDemoFallback(async () => {
    const res = await fetch(`${BASE_URL}/api/lead-capture/notification-settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(settings),
    })
    if (!res.ok) throw new Error('Failed to update notification settings')
    return res.json()
  }, settings)
}
