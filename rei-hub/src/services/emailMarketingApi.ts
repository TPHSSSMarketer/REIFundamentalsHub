// localStorage-based Email Marketing API with REI demo data
// All functions are async to match the page component's expectations

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

interface Domain {
  id: string
  domain: string
  from_name: string
  from_email: string
  status: string
  provider: string
  dns_records: Record<string, Record<string, string>> | null
  verified_at: string | null
  created_at: string
}

interface EmailListItem {
  id: string
  name: string
  description: string | null
  subscriber_count: number
  created_at: string
}

interface Subscriber {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  status: string
  subscribed_at: string
}

interface Template {
  id: string
  name: string
  subject: string
  preview_text: string | null
  html_content: string
  plain_text: string | null
  category: string
  is_default: boolean
  created_at: string
  updated_at: string
}

interface Campaign {
  id: string
  name: string
  subject: string
  status: string
  from_domain_id: string
  list_id: string
  provider_used: string | null
  scheduled_at: string | null
  sent_at: string | null
  total_sent: number
  total_delivered: number
  total_opened: number
  total_clicked: number
  total_bounced: number
  total_unsubscribed: number
  created_at: string
}

interface Sequence {
  id: string
  name: string
  list_id: string
  from_domain_id: string
  is_active: boolean
  step_count: number
  enrollment_count: number
  created_at: string
}

interface SequenceStep {
  id: string
  sequence_id: string
  step_number: number
  delay_days: number
  subject: string
  html_content: string
  plain_text: string | null
  created_at: string
}

// ── Storage Keys ──────────────────────────────────────────

const DOMAINS_KEY = 'rei-email-domains'
const LISTS_KEY = 'rei-email-lists'
const TEMPLATES_KEY = 'rei-email-templates'
const CAMPAIGNS_KEY = 'rei-email-campaigns'
const SEQUENCES_KEY = 'rei-email-sequences'
const SEQUENCE_STEPS_KEY = 'rei-email-sequence-steps'
const USAGE_KEY = 'rei-email-usage'
const INITIALIZED_KEY = 'rei-email-initialized'

// ── Mock Data Generators ──────────────────────────────────

function getMockDomains(): Domain[] {
  return [
    {
      id: 'domain-001',
      domain: 'reifundamentalshub.com',
      from_name: 'REI Fundamentals',
      from_email: 'noreply@reifundamentalshub.com',
      status: 'verified',
      provider: 'resend',
      dns_records: {
        CNAME: {
          name: 'bounce.reifundamentalshub.com',
          value: 'bounce.resend.dev',
        },
      },
      verified_at: '2024-01-15T10:30:00Z',
      created_at: '2024-01-10T08:00:00Z',
    },
  ]
}

function getMockLists(): EmailListItem[] {
  return [
    {
      id: 'list-001',
      name: 'Motivated Sellers',
      description: 'Homeowners in pre-foreclosure or absentee situations',
      subscriber_count: 0, // Will be calculated dynamically
      created_at: '2024-01-12T09:15:00Z',
    },
    {
      id: 'list-002',
      name: 'Cash Buyers',
      description: 'Active cash buyers looking for deals',
      subscriber_count: 0, // Will be calculated dynamically
      created_at: '2024-01-20T14:22:00Z',
    },
    {
      id: 'list-003',
      name: 'Agent Partners',
      description: 'Real estate agents who send us referrals',
      subscriber_count: 0, // Will be calculated dynamically
      created_at: '2024-02-01T11:45:00Z',
    },
    {
      id: 'list-004',
      name: 'Past Clients',
      description: 'Previous transaction partners',
      subscriber_count: 0, // Will be calculated dynamically
      created_at: '2024-02-05T16:30:00Z',
    },
  ]
}

function getMockSubscribers(listId: string): Subscriber[] {
  const baseDate = new Date('2024-01-15T00:00:00Z')
  const subscribersMap: Record<string, Subscriber[]> = {
    'list-001': [
      {
        id: 'sub-001',
        email: 'maria.garcia@email.com',
        first_name: 'Maria',
        last_name: 'Garcia',
        phone: '(555) 123-4567',
        status: 'subscribed',
        subscribed_at: new Date(baseDate.getTime() + 0).toISOString(),
      },
      {
        id: 'sub-002',
        email: 'david.thompson@email.com',
        first_name: 'David',
        last_name: 'Thompson',
        phone: '(555) 234-5678',
        status: 'subscribed',
        subscribed_at: new Date(baseDate.getTime() + 86400000).toISOString(),
      },
      {
        id: 'sub-003',
        email: 'jennifer.lee@email.com',
        first_name: 'Jennifer',
        last_name: 'Lee',
        phone: '(555) 345-6789',
        status: 'subscribed',
        subscribed_at: new Date(baseDate.getTime() + 172800000).toISOString(),
      },
      {
        id: 'sub-004',
        email: 'robert.martinez@email.com',
        first_name: 'Robert',
        last_name: 'Martinez',
        phone: '(555) 456-7890',
        status: 'subscribed',
        subscribed_at: new Date(baseDate.getTime() + 259200000).toISOString(),
      },
      {
        id: 'sub-005',
        email: 'sarah.johnson@email.com',
        first_name: 'Sarah',
        last_name: 'Johnson',
        phone: '(555) 567-8901',
        status: 'subscribed',
        subscribed_at: new Date(baseDate.getTime() + 345600000).toISOString(),
      },
      {
        id: 'sub-006',
        email: 'james.wilson@email.com',
        first_name: 'James',
        last_name: 'Wilson',
        phone: '(555) 678-9012',
        status: 'subscribed',
        subscribed_at: new Date(baseDate.getTime() + 432000000).toISOString(),
      },
      {
        id: 'sub-007',
        email: 'michael.chen@email.com',
        first_name: 'Michael',
        last_name: 'Chen',
        phone: '(555) 789-0123',
        status: 'subscribed',
        subscribed_at: new Date(baseDate.getTime() + 518400000).toISOString(),
      },
      {
        id: 'sub-008',
        email: 'lisa.anderson@email.com',
        first_name: 'Lisa',
        last_name: 'Anderson',
        phone: '(555) 890-1234',
        status: 'unsubscribed',
        subscribed_at: new Date(baseDate.getTime() + 604800000).toISOString(),
      },
    ],
    'list-002': [
      {
        id: 'sub-101',
        email: 'thomas.brown@email.com',
        first_name: 'Thomas',
        last_name: 'Brown',
        phone: '(555) 111-2222',
        status: 'subscribed',
        subscribed_at: new Date(baseDate.getTime() + 691200000).toISOString(),
      },
      {
        id: 'sub-102',
        email: 'patricia.davis@email.com',
        first_name: 'Patricia',
        last_name: 'Davis',
        phone: '(555) 222-3333',
        status: 'subscribed',
        subscribed_at: new Date(baseDate.getTime() + 777600000).toISOString(),
      },
    ],
    'list-003': [],
    'list-004': [],
  }
  return subscribersMap[listId] || []
}

function getMockTemplates(): Template[] {
  return [
    {
      id: 'template-001',
      name: 'Initial Seller Outreach',
      subject: "We're Interested in Your Property",
      preview_text: 'Quick question about your property...',
      html_content: `<html>
        <body>
          <h2>Hello {{first_name}},</h2>
          <p>We specialize in buying properties just like yours. Whether you're facing foreclosure, dealing with inherited property, or simply want a quick sale, we're here to help.</p>
          <p>We can make you a fair cash offer with no obligations.</p>
          <p>Let's talk!</p>
          <p>Best regards,<br>REI Fundamentals Team</p>
        </body>
      </html>`,
      plain_text:
        'We are interested in purchasing your property for cash. No commission. No inspections. Fast closing.',
      category: 'motivated_seller',
      is_default: false,
      created_at: '2024-01-18T10:00:00Z',
      updated_at: '2024-01-18T10:00:00Z',
    },
    {
      id: 'template-002',
      name: 'Cash Buyer Deal Alert',
      subject: 'New Deal Available: {{property_address}}',
      preview_text: 'Check out this investment opportunity...',
      html_content: `<html>
        <body>
          <h2>New Deal Alert!</h2>
          <p>A new off-market deal has come available in your target area.</p>
          <p><strong>Property:</strong> {{property_address}}</p>
          <p><strong>Purchase Price:</strong> {{purchase_price}}</p>
          <p><strong>After Repair Value:</strong> {{arv}}</p>
          <p>If interested, reply immediately as these deals move fast.</p>
          <p>REI Fundamentals Team</p>
        </body>
      </html>`,
      plain_text: 'New off-market deal available. Cash deal. Contact us for details.',
      category: 'cash_buyer',
      is_default: false,
      created_at: '2024-01-25T14:30:00Z',
      updated_at: '2024-01-25T14:30:00Z',
    },
    {
      id: 'template-003',
      name: 'Follow-Up #1 — Still Interested?',
      subject: "Just Checking In: {{property_address}}",
      preview_text: 'Are you still interested in selling?',
      html_content: `<html>
        <body>
          <h2>Hi {{first_name}},</h2>
          <p>I wanted to follow up on our previous conversation about your property.</p>
          <p>If you're still interested in exploring a quick sale, I'd love to hear from you.</p>
          <p>Our offer still stands and we can close quickly with no hassle.</p>
          <p>Looking forward to hearing from you!</p>
          <p>Best,<br>REI Fundamentals</p>
        </body>
      </html>`,
      plain_text: 'Following up on our previous conversation. Still interested?',
      category: 'follow_up',
      is_default: false,
      created_at: '2024-02-01T09:00:00Z',
      updated_at: '2024-02-01T09:00:00Z',
    },
    {
      id: 'template-004',
      name: 'Market Update Newsletter',
      subject: 'February Market Update: Opportunities in Your Area',
      preview_text: 'Market insights and deals this month...',
      html_content: `<html>
        <body>
          <h2>February Market Update</h2>
          <p>The real estate market continues to present opportunities for savvy investors.</p>
          <h3>This Month's Highlights:</h3>
          <ul>
            <li>Foreclosure rates up 12% in target counties</li>
            <li>Average days on market decreased to 45 days</li>
            <li>Cash buyer demand remains strong</li>
          </ul>
          <p>Ready to invest? Let's find your next deal.</p>
          <p>REI Fundamentals Team</p>
        </body>
      </html>`,
      plain_text: 'Monthly market update with investment opportunities and insights.',
      category: 'newsletter',
      is_default: false,
      created_at: '2024-02-10T10:00:00Z',
      updated_at: '2024-02-10T10:00:00Z',
    },
  ]
}

function getMockCampaigns(): Campaign[] {
  return [
    {
      id: 'campaign-001',
      name: 'February Seller Outreach',
      subject: "We're Interested in Your Property",
      status: 'sent',
      from_domain_id: 'domain-001',
      list_id: 'list-001',
      provider_used: 'resend',
      scheduled_at: '2024-02-01T09:00:00Z',
      sent_at: '2024-02-01T09:15:00Z',
      total_sent: 47,
      total_delivered: 47,
      total_opened: 21,
      total_clicked: 5,
      total_bounced: 1,
      total_unsubscribed: 0,
      created_at: '2024-02-01T08:00:00Z',
    },
    {
      id: 'campaign-002',
      name: 'New Deal Alert — 123 Main St',
      subject: 'Quick Opportunity: 123 Main St',
      status: 'draft',
      from_domain_id: 'domain-001',
      list_id: 'list-002',
      provider_used: null,
      scheduled_at: null,
      sent_at: null,
      total_sent: 0,
      total_delivered: 0,
      total_opened: 0,
      total_clicked: 0,
      total_bounced: 0,
      total_unsubscribed: 0,
      created_at: '2024-02-15T13:45:00Z',
    },
  ]
}

function getMockSequences(): Sequence[] {
  return [
    {
      id: 'sequence-001',
      name: 'New Lead Nurture',
      list_id: 'list-001',
      from_domain_id: 'domain-001',
      is_active: true,
      step_count: 3,
      enrollment_count: 5,
      created_at: '2024-01-20T11:00:00Z',
    },
  ]
}

function getMockSequenceSteps(): SequenceStep[] {
  return [
    {
      id: 'step-001',
      sequence_id: 'sequence-001',
      step_number: 1,
      delay_days: 0,
      subject: 'Initial Seller Outreach',
      html_content: `<html><body><h2>Hi {{first_name}},</h2><p>We buy properties like yours for cash.</p></body></html>`,
      plain_text: 'We buy properties for cash.',
      created_at: '2024-01-20T11:00:00Z',
    },
    {
      id: 'step-002',
      sequence_id: 'sequence-001',
      step_number: 2,
      delay_days: 3,
      subject: 'Following Up — Quick Question',
      html_content: `<html><body><h2>Hi {{first_name}},</h2><p>Just wanted to follow up.</p></body></html>`,
      plain_text: 'Following up on our previous message.',
      created_at: '2024-01-20T11:05:00Z',
    },
    {
      id: 'step-003',
      sequence_id: 'sequence-001',
      step_number: 3,
      delay_days: 7,
      subject: 'Last Chance — 123 Main St Deal',
      html_content: `<html><body><h2>Hi {{first_name}},</h2><p>One more message before we move on.</p></body></html>`,
      plain_text: 'This is our final follow-up message.',
      created_at: '2024-01-20T11:10:00Z',
    },
  ]
}

function getMockUsage() {
  return {
    plan: 'Pro',
    limit: 5000,
    used: 234,
    remaining: 4766,
    resets_at: '2024-03-01T00:00:00Z',
    overage_rate: '$0.50 per 1000 emails',
    current_provider: 'resend',
  }
}

// ── Initialization ────────────────────────────────────────

function ensureInitialized(): void {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(INITIALIZED_KEY)) return

  // Initialize all storage keys with mock data
  localStorage.setItem(DOMAINS_KEY, JSON.stringify(getMockDomains()))
  localStorage.setItem(LISTS_KEY, JSON.stringify(getMockLists()))
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(getMockTemplates()))
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(getMockCampaigns()))
  localStorage.setItem(SEQUENCES_KEY, JSON.stringify(getMockSequences()))
  localStorage.setItem(SEQUENCE_STEPS_KEY, JSON.stringify(getMockSequenceSteps()))
  localStorage.setItem(USAGE_KEY, JSON.stringify(getMockUsage()))

  // Seed subscribers for each list
  const mockLists = getMockLists()
  for (const list of mockLists) {
    const subs = getMockSubscribers(list.id)
    localStorage.setItem(`rei-email-subs-${list.id}`, JSON.stringify(subs))
  }

  localStorage.setItem(INITIALIZED_KEY, 'true')
}

// ── Utility Functions ─────────────────────────────────────

function getOrInit<T>(key: string, defaultValue: T): T {
  ensureInitialized()
  const raw = localStorage.getItem(key)
  if (!raw) return defaultValue
  try {
    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

function setData<T>(key: string, data: T): void {
  localStorage.setItem(key, JSON.stringify(data))
}

function getSubscriberCount(listId: string): number {
  const subs = getOrInit<Subscriber[]>(`rei-email-subs-${listId}`, [])
  return subs.length
}

// ── Domains ──────────────────────────────────────────────

export async function getDomains(): Promise<{
  domains: Domain[]
  current_provider: string
}> {
  return withDemoFallback(
    () => {
      const domains = getOrInit<Domain[]>(DOMAINS_KEY, getMockDomains())
      return Promise.resolve({
        domains,
        current_provider: 'resend',
      })
    },
    {
      domains: getMockDomains(),
      current_provider: 'resend',
    }
  )
}

export async function addDomain(data: {
  domain: string
  from_name: string
  from_email: string
}): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () => {
      const domains = getOrInit<Domain[]>(DOMAINS_KEY, getMockDomains())
      const newDomain: Domain = {
        id: crypto.randomUUID(),
        domain: data.domain,
        from_name: data.from_name,
        from_email: data.from_email,
        status: 'pending',
        provider: 'resend',
        dns_records: null,
        verified_at: null,
        created_at: new Date().toISOString(),
      }
      domains.push(newDomain)
      setData(DOMAINS_KEY, domains)
      return Promise.resolve(newDomain)
    },
    {
      id: crypto.randomUUID(),
      domain: data.domain,
      from_name: data.from_name,
      from_email: data.from_email,
      status: 'pending',
      provider: 'resend',
      dns_records: null,
      verified_at: null,
      created_at: new Date().toISOString(),
    }
  )
}

export async function verifyDomain(
  domainId: string
): Promise<{ verified: boolean; message: string }> {
  return withDemoFallback(
    () => {
      const domains = getOrInit<Domain[]>(DOMAINS_KEY, getMockDomains())
      const domain = domains.find((d) => d.id === domainId)
      if (!domain) {
        return Promise.reject(new Error('Domain not found'))
      }
      domain.status = 'verified'
      domain.verified_at = new Date().toISOString()
      setData(DOMAINS_KEY, domains)
      return Promise.resolve({
        verified: true,
        message: 'Domain verified successfully',
      })
    },
    {
      verified: true,
      message: 'Domain verified successfully',
    }
  )
}

export async function deleteDomain(
  domainId: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    () => {
      const domains = getOrInit<Domain[]>(DOMAINS_KEY, getMockDomains())
      const filtered = domains.filter((d) => d.id !== domainId)
      setData(DOMAINS_KEY, filtered)
      return Promise.resolve({ success: true })
    },
    { success: true }
  )
}

// ── Lists ────────────────────────────────────────────────

export async function getLists(): Promise<{
  lists: EmailListItem[]
}> {
  return withDemoFallback(
    () => {
      const lists = getOrInit<EmailListItem[]>(LISTS_KEY, getMockLists())
      // Dynamically update subscriber counts
      const listsWithCounts = lists.map((list) => ({
        ...list,
        subscriber_count: getSubscriberCount(list.id),
      }))
      return Promise.resolve({ lists: listsWithCounts })
    },
    {
      lists: getMockLists().map((list) => ({
        ...list,
        subscriber_count: getMockSubscribers(list.id).length,
      })),
    }
  )
}

export async function createList(data: {
  name: string
  description?: string
}): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () => {
      const lists = getOrInit<EmailListItem[]>(LISTS_KEY, getMockLists())
      const newList: EmailListItem = {
        id: crypto.randomUUID(),
        name: data.name,
        description: data.description || null,
        subscriber_count: 0,
        created_at: new Date().toISOString(),
      }
      lists.push(newList)
      setData(LISTS_KEY, lists)
      localStorage.setItem(`rei-email-subs-${newList.id}`, JSON.stringify([]))
      return Promise.resolve(newList)
    },
    {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description || null,
      subscriber_count: 0,
      created_at: new Date().toISOString(),
    }
  )
}

export async function deleteList(
  listId: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    () => {
      const lists = getOrInit<EmailListItem[]>(LISTS_KEY, getMockLists())
      const filtered = lists.filter((l) => l.id !== listId)
      setData(LISTS_KEY, filtered)
      localStorage.removeItem(`rei-email-subs-${listId}`)
      return Promise.resolve({ success: true })
    },
    { success: true }
  )
}

// ── Subscribers ──────────────────────────────────────────

export async function getSubscribers(
  listId: string,
  page = 1,
  perPage = 50
): Promise<{
  subscribers: Subscriber[]
  total: number
  page: number
  per_page: number
}> {
  return withDemoFallback(
    () => {
      const subscribers = getOrInit<Subscriber[]>(
        `rei-email-subs-${listId}`,
        getMockSubscribers(listId)
      )
      const total = subscribers.length
      const start = (page - 1) * perPage
      const end = start + perPage
      const paginated = subscribers.slice(start, end)
      return Promise.resolve({
        subscribers: paginated,
        total,
        page,
        per_page: perPage,
      })
    },
    (() => {
      const subscribers = getMockSubscribers(listId)
      const total = subscribers.length
      const start = (page - 1) * perPage
      const end = start + perPage
      const paginated = subscribers.slice(start, end)
      return {
        subscribers: paginated,
        total,
        page,
        per_page: perPage,
      }
    })()
  )
}

export async function addSubscriber(
  listId: string,
  data: {
    email: string
    first_name?: string
    last_name?: string
    phone?: string
  }
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () => {
      const subscribers = getOrInit<Subscriber[]>(
        `rei-email-subs-${listId}`,
        getMockSubscribers(listId)
      )
      const newSubscriber: Subscriber = {
        id: crypto.randomUUID(),
        email: data.email,
        first_name: data.first_name || null,
        last_name: data.last_name || null,
        phone: data.phone || null,
        status: 'subscribed',
        subscribed_at: new Date().toISOString(),
      }
      subscribers.push(newSubscriber)
      setData(`rei-email-subs-${listId}`, subscribers)
      return Promise.resolve(newSubscriber)
    },
    {
      id: crypto.randomUUID(),
      email: data.email,
      first_name: data.first_name || null,
      last_name: data.last_name || null,
      phone: data.phone || null,
      status: 'subscribed',
      subscribed_at: new Date().toISOString(),
    }
  )
}

export async function importSubscribers(
  listId: string,
  rows: Array<Record<string, string>>
): Promise<{ added: number; skipped: number; errors: number }> {
  return withDemoFallback(
    () => {
      const subscribers = getOrInit<Subscriber[]>(
        `rei-email-subs-${listId}`,
        getMockSubscribers(listId)
      )
      let added = 0
      let skipped = 0
      let errors = 0

      for (const row of rows) {
        try {
          const email = row.email || row.Email
          if (!email) {
            errors++
            continue
          }
          // Check if email already exists
          if (subscribers.some((s) => s.email === email)) {
            skipped++
            continue
          }
          const newSubscriber: Subscriber = {
            id: crypto.randomUUID(),
            email,
            first_name: row.first_name || row.firstName || null,
            last_name: row.last_name || row.lastName || null,
            phone: row.phone || row.Phone || null,
            status: 'subscribed',
            subscribed_at: new Date().toISOString(),
          }
          subscribers.push(newSubscriber)
          added++
        } catch {
          errors++
        }
      }

      setData(`rei-email-subs-${listId}`, subscribers)
      return Promise.resolve({ added, skipped, errors })
    },
    { added: rows.length, skipped: 0, errors: 0 }
  )
}

export async function deleteSubscriber(
  listId: string,
  subId: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    () => {
      const subscribers = getOrInit<Subscriber[]>(
        `rei-email-subs-${listId}`,
        getMockSubscribers(listId)
      )
      const filtered = subscribers.filter((s) => s.id !== subId)
      setData(`rei-email-subs-${listId}`, filtered)
      return Promise.resolve({ success: true })
    },
    { success: true }
  )
}

// ── Templates ────────────────────────────────────────────

export async function getTemplates(): Promise<{
  templates: Template[]
}> {
  return withDemoFallback(
    () => {
      const templates = getOrInit<Template[]>(TEMPLATES_KEY, getMockTemplates())
      return Promise.resolve({ templates })
    },
    { templates: getMockTemplates() }
  )
}

export async function createTemplate(data: {
  name: string
  subject: string
  preview_text?: string
  html_content: string
  plain_text?: string
  category?: string
}): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () => {
      const templates = getOrInit<Template[]>(TEMPLATES_KEY, getMockTemplates())
      const newTemplate: Template = {
        id: crypto.randomUUID(),
        name: data.name,
        subject: data.subject,
        preview_text: data.preview_text || null,
        html_content: data.html_content,
        plain_text: data.plain_text || null,
        category: data.category || 'general',
        is_default: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      templates.push(newTemplate)
      setData(TEMPLATES_KEY, templates)
      return Promise.resolve(newTemplate)
    },
    {
      id: crypto.randomUUID(),
      name: data.name,
      subject: data.subject,
      preview_text: data.preview_text || null,
      html_content: data.html_content,
      plain_text: data.plain_text || null,
      category: data.category || 'general',
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  )
}

export async function updateTemplate(
  templateId: string,
  data: Record<string, unknown>
): Promise<{ success: boolean }> {
  return withDemoFallback(
    () => {
      const templates = getOrInit<Template[]>(TEMPLATES_KEY, getMockTemplates())
      const template = templates.find((t) => t.id === templateId)
      if (!template) {
        return Promise.reject(new Error('Template not found'))
      }
      Object.assign(template, data, {
        updated_at: new Date().toISOString(),
      })
      setData(TEMPLATES_KEY, templates)
      return Promise.resolve({ success: true })
    },
    { success: true }
  )
}

export async function deleteTemplate(
  templateId: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    () => {
      const templates = getOrInit<Template[]>(TEMPLATES_KEY, getMockTemplates())
      const filtered = templates.filter((t) => t.id !== templateId)
      setData(TEMPLATES_KEY, filtered)
      return Promise.resolve({ success: true })
    },
    { success: true }
  )
}

// ── Campaigns ────────────────────────────────────────────

export async function getCampaigns(): Promise<{
  campaigns: Campaign[]
}> {
  return withDemoFallback(
    () => {
      const campaigns = getOrInit<Campaign[]>(CAMPAIGNS_KEY, getMockCampaigns())
      return Promise.resolve({ campaigns })
    },
    { campaigns: getMockCampaigns() }
  )
}

export async function createCampaign(data: {
  name: string
  subject: string
  preview_text?: string
  html_content: string
  plain_text?: string
  from_domain_id: string
  list_id: string
}): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () => {
      const campaigns = getOrInit<Campaign[]>(CAMPAIGNS_KEY, getMockCampaigns())
      const newCampaign: Campaign = {
        id: crypto.randomUUID(),
        name: data.name,
        subject: data.subject,
        status: 'draft',
        from_domain_id: data.from_domain_id,
        list_id: data.list_id,
        provider_used: null,
        scheduled_at: null,
        sent_at: null,
        total_sent: 0,
        total_delivered: 0,
        total_opened: 0,
        total_clicked: 0,
        total_bounced: 0,
        total_unsubscribed: 0,
        created_at: new Date().toISOString(),
      }
      campaigns.push(newCampaign)
      setData(CAMPAIGNS_KEY, campaigns)
      return Promise.resolve(newCampaign)
    },
    {
      id: crypto.randomUUID(),
      name: data.name,
      subject: data.subject,
      status: 'draft',
      from_domain_id: data.from_domain_id,
      list_id: data.list_id,
      provider_used: null,
      scheduled_at: null,
      sent_at: null,
      total_sent: 0,
      total_delivered: 0,
      total_opened: 0,
      total_clicked: 0,
      total_bounced: 0,
      total_unsubscribed: 0,
      created_at: new Date().toISOString(),
    }
  )
}

export async function sendCampaign(
  campaignId: string
): Promise<{ queued: number }> {
  return withDemoFallback(
    () => {
      const campaigns = getOrInit<Campaign[]>(CAMPAIGNS_KEY, getMockCampaigns())
      const campaign = campaigns.find((c) => c.id === campaignId)
      if (!campaign) {
        return Promise.reject(new Error('Campaign not found'))
      }

      // Get subscriber count for the list
      const subs = getOrInit<Subscriber[]>(
        `rei-email-subs-${campaign.list_id}`,
        []
      )
      const queued = subs.length

      campaign.status = 'sent'
      campaign.sent_at = new Date().toISOString()
      campaign.total_sent = queued
      campaign.total_delivered = queued
      campaign.provider_used = 'resend'

      setData(CAMPAIGNS_KEY, campaigns)
      return Promise.resolve({ queued })
    },
    { queued: 8 }
  )
}

export async function scheduleCampaign(
  campaignId: string,
  scheduledAt: string
): Promise<{ scheduled: boolean; scheduled_at: string }> {
  return withDemoFallback(
    () => {
      const campaigns = getOrInit<Campaign[]>(CAMPAIGNS_KEY, getMockCampaigns())
      const campaign = campaigns.find((c) => c.id === campaignId)
      if (!campaign) {
        return Promise.reject(new Error('Campaign not found'))
      }
      campaign.status = 'scheduled'
      campaign.scheduled_at = scheduledAt
      setData(CAMPAIGNS_KEY, campaigns)
      return Promise.resolve({
        scheduled: true,
        scheduled_at: scheduledAt,
      })
    },
    {
      scheduled: true,
      scheduled_at: scheduledAt,
    }
  )
}

export async function getCampaignStats(campaignId: string): Promise<{
  total_sent: number
  total_delivered: number
  open_rate: number
  click_rate: number
  total_bounced: number
  unsubscribe_rate: number
}> {
  return withDemoFallback(
    () => {
      const campaigns = getOrInit<Campaign[]>(CAMPAIGNS_KEY, getMockCampaigns())
      const campaign = campaigns.find((c) => c.id === campaignId)
      if (!campaign) {
        return Promise.reject(new Error('Campaign not found'))
      }

      const openRate =
        campaign.total_sent > 0
          ? Math.round((campaign.total_opened / campaign.total_sent) * 100)
          : 0
      const clickRate =
        campaign.total_sent > 0
          ? Math.round((campaign.total_clicked / campaign.total_sent) * 100)
          : 0
      const unsubscribeRate =
        campaign.total_sent > 0
          ? Math.round((campaign.total_unsubscribed / campaign.total_sent) * 100)
          : 0

      return Promise.resolve({
        total_sent: campaign.total_sent,
        total_delivered: campaign.total_delivered,
        open_rate: openRate,
        click_rate: clickRate,
        total_bounced: campaign.total_bounced,
        unsubscribe_rate: unsubscribeRate,
      })
    },
    {
      total_sent: 47,
      total_delivered: 47,
      open_rate: 45,
      click_rate: 11,
      total_bounced: 1,
      unsubscribe_rate: 0,
    }
  )
}

export async function deleteCampaign(
  campaignId: string
): Promise<{ success: boolean }> {
  return withDemoFallback(
    () => {
      const campaigns = getOrInit<Campaign[]>(CAMPAIGNS_KEY, getMockCampaigns())
      const filtered = campaigns.filter((c) => c.id !== campaignId)
      setData(CAMPAIGNS_KEY, filtered)
      return Promise.resolve({ success: true })
    },
    { success: true }
  )
}

// ── Sequences ────────────────────────────────────────────

export async function getSequences(): Promise<{
  sequences: Sequence[]
}> {
  return withDemoFallback(
    () => {
      const sequences = getOrInit<Sequence[]>(SEQUENCES_KEY, getMockSequences())
      return Promise.resolve({ sequences })
    },
    { sequences: getMockSequences() }
  )
}

export async function createSequence(data: {
  name: string
  list_id: string
  from_domain_id: string
}): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () => {
      const sequences = getOrInit<Sequence[]>(SEQUENCES_KEY, getMockSequences())
      const newSequence: Sequence = {
        id: crypto.randomUUID(),
        name: data.name,
        list_id: data.list_id,
        from_domain_id: data.from_domain_id,
        is_active: false,
        step_count: 0,
        enrollment_count: 0,
        created_at: new Date().toISOString(),
      }
      sequences.push(newSequence)
      setData(SEQUENCES_KEY, sequences)
      return Promise.resolve(newSequence)
    },
    {
      id: crypto.randomUUID(),
      name: data.name,
      list_id: data.list_id,
      from_domain_id: data.from_domain_id,
      is_active: false,
      step_count: 0,
      enrollment_count: 0,
      created_at: new Date().toISOString(),
    }
  )
}

export async function addSequenceStep(
  sequenceId: string,
  data: {
    step_number: number
    delay_days: number
    subject: string
    html_content: string
    plain_text?: string
  }
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () => {
      const sequences = getOrInit<Sequence[]>(SEQUENCES_KEY, getMockSequences())
      const sequence = sequences.find((s) => s.id === sequenceId)
      if (!sequence) {
        return Promise.reject(new Error('Sequence not found'))
      }

      const steps = getOrInit<SequenceStep[]>(SEQUENCE_STEPS_KEY, getMockSequenceSteps())
      const newStep: SequenceStep = {
        id: crypto.randomUUID(),
        sequence_id: sequenceId,
        step_number: data.step_number,
        delay_days: data.delay_days,
        subject: data.subject,
        html_content: data.html_content,
        plain_text: data.plain_text || null,
        created_at: new Date().toISOString(),
      }
      steps.push(newStep)
      setData(SEQUENCE_STEPS_KEY, steps)

      sequence.step_count = steps.filter((s) => s.sequence_id === sequenceId).length
      setData(SEQUENCES_KEY, sequences)

      return Promise.resolve(newStep)
    },
    {
      id: crypto.randomUUID(),
      sequence_id: sequenceId,
      step_number: data.step_number,
      delay_days: data.delay_days,
      subject: data.subject,
      html_content: data.html_content,
      plain_text: data.plain_text || null,
      created_at: new Date().toISOString(),
    }
  )
}

export async function activateSequence(
  sequenceId: string
): Promise<{ is_active: boolean }> {
  return withDemoFallback(
    () => {
      const sequences = getOrInit<Sequence[]>(SEQUENCES_KEY, getMockSequences())
      const sequence = sequences.find((s) => s.id === sequenceId)
      if (!sequence) {
        return Promise.reject(new Error('Sequence not found'))
      }
      sequence.is_active = true
      setData(SEQUENCES_KEY, sequences)
      return Promise.resolve({ is_active: true })
    },
    { is_active: true }
  )
}

export async function enrollSubscriber(
  sequenceId: string,
  subscriberId: string
): Promise<Record<string, unknown>> {
  return withDemoFallback(
    () => {
      const sequences = getOrInit<Sequence[]>(SEQUENCES_KEY, getMockSequences())
      const sequence = sequences.find((s) => s.id === sequenceId)
      if (!sequence) {
        return Promise.reject(new Error('Sequence not found'))
      }
      sequence.enrollment_count += 1
      setData(SEQUENCES_KEY, sequences)
      return Promise.resolve({
        subscriber_id: subscriberId,
        sequence_id: sequenceId,
        enrolled_at: new Date().toISOString(),
      })
    },
    {
      subscriber_id: subscriberId,
      sequence_id: sequenceId,
      enrolled_at: new Date().toISOString(),
    }
  )
}

// ── Usage ────────────────────────────────────────────────

export async function getUsage(): Promise<{
  plan: string
  limit: number
  used: number
  remaining: number
  resets_at: string
  overage_rate: string
  current_provider: string
}> {
  return withDemoFallback(
    () => {
      const usage = getOrInit(USAGE_KEY, getMockUsage())
      return Promise.resolve(usage)
    },
    getMockUsage()
  )
}
