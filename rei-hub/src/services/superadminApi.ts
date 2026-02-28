/**
 * SuperAdmin Credentials API — localStorage implementation.
 *
 * Mirrors the backend superadmin_routes.py endpoints. Uses localStorage
 * so the UI works in demo mode without a running backend.
 * Swap to real fetch() calls when the backend is deployed.
 */

const STORAGE_KEY = 'rei-superadmin-credentials'

// ── Provider definitions (matches backend KNOWN_PROVIDERS) ──────────────

export interface CredentialField {
  name: string
  label: string
  type: 'secret' | 'text'
}

export interface CredentialStatus {
  provider_name: string
  display_name: string
  category: string
  icon: string
  configured: boolean
  last_updated: string | null
  fields: CredentialField[]
  configured_fields: Record<string, boolean>
}

export interface TestResult {
  status: 'connected' | 'error'
  message: string
}

// Provider metadata — display names, categories, icons
const PROVIDER_META: Record<
  string,
  { display_name: string; category: string; icon: string }
> = {
  stripe: { display_name: 'Stripe', category: 'Payment', icon: '💳' },
  paypal: { display_name: 'PayPal', category: 'Payment', icon: '🅿️' },
  plaid: { display_name: 'Plaid', category: 'Banking', icon: '🏦' },
  twilio: { display_name: 'Twilio', category: 'Communication', icon: '📞' },
  elevenlabs: {
    display_name: 'ElevenLabs',
    category: 'Communication',
    icon: '🎙️',
  },
  sendgrid: { display_name: 'SendGrid', category: 'Email', icon: '✉️' },
  resend: { display_name: 'Resend', category: 'Email', icon: '📧' },
  google_calendar: {
    display_name: 'Google Calendar',
    category: 'Calendar',
    icon: '📅',
  },
  google_login: {
    display_name: 'Google OAuth Login',
    category: 'Authentication',
    icon: '🔐',
  },
  google_drive_oauth: {
    display_name: 'Google Drive',
    category: 'Cloud Storage',
    icon: '💾',
  },
  dropbox_oauth: {
    display_name: 'Dropbox',
    category: 'Cloud Storage',
    icon: '☁️',
  },
  outlook: {
    display_name: 'Microsoft Outlook',
    category: 'Calendar',
    icon: '📆',
  },
  usps: { display_name: 'USPS', category: 'Shipping', icon: '📦' },
  anthropic: { display_name: 'Anthropic (Claude)', category: 'AI', icon: '🤖' },
  openai: { display_name: 'OpenAI', category: 'AI', icon: '🧠' },
  nvidia: { display_name: 'NVIDIA', category: 'AI', icon: '🎮' },
  attom: {
    display_name: 'ATTOM Data',
    category: 'Property Data',
    icon: '🏠',
  },
  telegram: {
    display_name: 'Telegram',
    category: 'Communication',
    icon: '✈️',
  },
}

// Field definitions per provider
const PROVIDER_FIELDS: Record<string, CredentialField[]> = {
  stripe: [
    { name: 'stripe_secret_key', label: 'Secret Key', type: 'secret' },
    {
      name: 'stripe_webhook_secret',
      label: 'Webhook Secret',
      type: 'secret',
    },
    {
      name: 'stripe_publishable_key',
      label: 'Publishable Key',
      type: 'text',
    },
  ],
  paypal: [
    { name: 'paypal_client_id', label: 'Client ID', type: 'text' },
    {
      name: 'paypal_client_secret',
      label: 'Client Secret',
      type: 'secret',
    },
    {
      name: 'paypal_mode',
      label: 'Mode (sandbox/production)',
      type: 'text',
    },
  ],
  plaid: [
    { name: 'plaid_client_id', label: 'Client ID', type: 'text' },
    { name: 'plaid_secret', label: 'Secret', type: 'secret' },
    {
      name: 'plaid_env',
      label: 'Environment (sandbox/development/production)',
      type: 'text',
    },
  ],
  twilio: [
    { name: 'twilio_account_sid', label: 'Account SID', type: 'text' },
    { name: 'twilio_auth_token', label: 'Auth Token', type: 'secret' },
    { name: 'twilio_api_key_sid', label: 'API Key SID', type: 'text' },
    {
      name: 'twilio_api_key_secret',
      label: 'API Key Secret',
      type: 'secret',
    },
    {
      name: 'twilio_twiml_app_sid',
      label: 'TwiML App SID',
      type: 'text',
    },
  ],
  elevenlabs: [
    { name: 'elevenlabs_api_key', label: 'API Key', type: 'secret' },
  ],
  sendgrid: [
    { name: 'sendgrid_api_key', label: 'API Key', type: 'secret' },
    {
      name: 'sendgrid_webhook_secret',
      label: 'Webhook Secret',
      type: 'secret',
    },
  ],
  resend: [
    { name: 'resend_api_key', label: 'API Key', type: 'secret' },
  ],
  google_calendar: [
    { name: 'google_client_id', label: 'Client ID', type: 'text' },
    {
      name: 'google_client_secret',
      label: 'Client Secret',
      type: 'secret',
    },
    { name: 'google_redirect_uri', label: 'Redirect URI', type: 'text' },
  ],
  google_login: [
    { name: 'google_login_client_id', label: 'Client ID', type: 'text' },
    {
      name: 'google_login_client_secret',
      label: 'Client Secret',
      type: 'secret',
    },
    { name: 'google_login_redirect_uri', label: 'Redirect URI', type: 'text' },
  ],
  google_drive_oauth: [
    { name: 'google_drive_client_id', label: 'Client ID', type: 'text' },
    {
      name: 'google_drive_client_secret',
      label: 'Client Secret',
      type: 'secret',
    },
    { name: 'google_drive_redirect_uri', label: 'Redirect URI', type: 'text' },
  ],
  dropbox_oauth: [
    { name: 'dropbox_app_key', label: 'App Key', type: 'text' },
    {
      name: 'dropbox_app_secret',
      label: 'App Secret',
      type: 'secret',
    },
    { name: 'dropbox_redirect_uri', label: 'Redirect URI', type: 'text' },
  ],
  outlook: [
    { name: 'outlook_client_id', label: 'Client ID', type: 'text' },
    {
      name: 'outlook_client_secret',
      label: 'Client Secret',
      type: 'secret',
    },
    {
      name: 'outlook_redirect_uri',
      label: 'Redirect URI',
      type: 'text',
    },
  ],
  usps: [{ name: 'usps_user_id', label: 'User ID', type: 'text' }],
  anthropic: [
    { name: 'anthropic_api_key', label: 'API Key', type: 'secret' },
  ],
  openai: [
    { name: 'openai_api_key', label: 'API Key', type: 'secret' },
  ],
  nvidia: [
    { name: 'nvidia_api_key', label: 'API Key', type: 'secret' },
  ],
  attom: [
    { name: 'attom_api_key', label: 'API Key', type: 'secret' },
  ],
  telegram: [
    { name: 'telegram_bot_token', label: 'Bot Token', type: 'secret' },
    { name: 'telegram_chat_id', label: 'Chat ID', type: 'text' },
  ],
}

// ── localStorage helpers ────────────────────────────────────────────────

function getStoredCredentials(): Record<
  string,
  { config: Record<string, string>; last_updated: string }
> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveStoredCredentials(
  data: Record<
    string,
    { config: Record<string, string>; last_updated: string }
  >
): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// ── API functions ───────────────────────────────────────────────────────

/** Get status of all providers — never returns actual credential values. */
export async function getCredentialStatuses(): Promise<CredentialStatus[]> {
  const stored = getStoredCredentials()

  return Object.entries(PROVIDER_FIELDS).map(([providerName, fields]) => {
    const meta = PROVIDER_META[providerName] || {
      display_name: providerName,
      category: 'Other',
      icon: '⚙️',
    }
    const storedProvider = stored[providerName]

    const configured_fields: Record<string, boolean> = {}
    fields.forEach((f) => {
      configured_fields[f.name] = !!(
        storedProvider?.config?.[f.name] &&
        storedProvider.config[f.name].length > 0
      )
    })

    const configured = Object.values(configured_fields).some(Boolean)

    return {
      provider_name: providerName,
      display_name: meta.display_name,
      category: meta.category,
      icon: meta.icon,
      configured,
      last_updated: storedProvider?.last_updated || null,
      fields,
      configured_fields,
    }
  })
}

/** Save credentials for a provider. */
export async function updateCredential(
  providerName: string,
  config: Record<string, string>
): Promise<{ configured: boolean; message: string }> {
  const stored = getStoredCredentials()

  // Merge with existing — only overwrite provided fields
  const existing = stored[providerName]?.config || {}
  const merged = { ...existing, ...config }

  stored[providerName] = {
    config: merged,
    last_updated: new Date().toISOString(),
  }

  saveStoredCredentials(stored)

  return {
    configured: true,
    message: `Credentials for ${providerName} saved successfully.`,
  }
}

/** Delete all credentials for a provider. */
export async function deleteCredential(providerName: string): Promise<void> {
  const stored = getStoredCredentials()
  delete stored[providerName]
  saveStoredCredentials(stored)
}

/** Test a provider connection (placeholder). */
export async function testCredential(
  providerName: string
): Promise<TestResult> {
  const stored = getStoredCredentials()
  const provider = stored[providerName]

  if (!provider || !provider.config) {
    return {
      status: 'error',
      message: `No credentials configured for ${providerName}.`,
    }
  }

  // Check if at least one field has a value
  const hasValues = Object.values(provider.config).some(
    (v) => v && v.length > 0
  )

  if (!hasValues) {
    return {
      status: 'error',
      message: 'No credential values found.',
    }
  }

  // Placeholder — real test would call backend
  return {
    status: 'connected',
    message: `Credentials saved for ${
      PROVIDER_META[providerName]?.display_name || providerName
    }. Live connection test available when backend is deployed.`,
  }
}

/** Get the list of provider categories for grouping in the UI. */
export function getProviderCategories(): string[] {
  const cats = new Set<string>()
  Object.values(PROVIDER_META).forEach((m) => cats.add(m.category))
  return Array.from(cats)
}
