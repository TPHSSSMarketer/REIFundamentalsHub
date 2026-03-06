/**
 * SuperAdmin Credentials API — connected to the FastAPI backend.
 *
 * Calls /api/superadmin/* endpoints for encrypted credential management.
 * Provider metadata (display names, icons, categories, instructions) is
 * maintained here on the frontend since the backend only stores raw config.
 */

import { getAuthHeader } from './auth'

const BASE_URL = import.meta.env.VITE_REI_SERVER_URL ?? 'http://localhost:8001'

// ── Provider definitions (matches backend KNOWN_PROVIDERS) ──────────────

export interface CredentialField {
  name: string
  label: string
  type: 'secret' | 'text'
  help?: string // Setup instruction shown below the field
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
  instructions?: string // Setup instructions for this provider
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
  stripe_connect: {
    display_name: 'Stripe Connect',
    category: 'Payment',
    icon: '🔗',
  },
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
  google_maps: {
    display_name: 'Google Maps',
    category: 'Maps',
    icon: '🗺️',
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
  hud_pdr: {
    display_name: 'HUD PD&R',
    category: 'Property Data',
    icon: '🏛️',
  },
  telegram: {
    display_name: 'Telegram',
    category: 'Communication',
    icon: '✈️',
  },
  // ── Free API Integrations ──────────────────────────────────────────
  openweathermap: {
    display_name: 'OpenWeatherMap',
    category: 'Market Data',
    icon: '🌤️',
  },
  census_bureau: {
    display_name: 'US Census Bureau',
    category: 'Market Data',
    icon: '📊',
  },
  fbi_crime_data: {
    display_name: 'FBI Crime Data',
    category: 'Market Data',
    icon: '🚨',
  },
  adzuna: {
    display_name: 'Adzuna Jobs',
    category: 'Market Data',
    icon: '💼',
  },
  abstract_email: {
    display_name: 'Abstract Email Validation',
    category: 'Data Validation',
    icon: '✉️',
  },
  numverify: {
    display_name: 'NumVerify Phone',
    category: 'Data Validation',
    icon: '📱',
  },
  square: {
    display_name: 'Square Payments',
    category: 'Payment',
    icon: '⬜',
  },
  frankfurter: {
    display_name: 'Frankfurter Currency',
    category: 'Currency',
    icon: '💱',
  },
  facebook_oauth: {
    display_name: 'Facebook Pages',
    category: 'Social Media',
    icon: '📘',
  },
  linkedin_oauth: {
    display_name: 'LinkedIn',
    category: 'Social Media',
    icon: '💼',
  },
  x_twitter_oauth: {
    display_name: 'X (Twitter)',
    category: 'Social Media',
    icon: '🐦',
  },
  instagram_oauth: {
    display_name: 'Instagram',
    category: 'Social Media',
    icon: '📸',
  },
}

// Setup instructions shown at the top of each provider panel
const PROVIDER_INSTRUCTIONS: Record<string, string> = {
  stripe:
    'Go to dashboard.stripe.com > Developers > API Keys for your Secret and Publishable keys. For the Webhook Secret, go to Developers > Webhooks, create an endpoint pointing to your API server /api/billing/webhook/stripe, and copy the signing secret. Price IDs are found under Products > Pricing for each plan.',
  stripe_connect:
    'Used for the TPHS payment portal. Go to dashboard.stripe.com > Connect > Settings. The Platform Account ID is your main Stripe account ID (starts with "acct_"). The Connect Secret Key and Account ID are from your connected account.',
  paypal:
    'Go to developer.paypal.com > My Apps & Credentials. Create or select your app to get the Client ID and Secret. For the Webhook ID, go to your app > Webhooks, add an endpoint pointing to /api/billing/webhook/paypal, then copy the Webhook ID shown. Plan IDs are created under Subscriptions > Plans.',
  plaid:
    'Go to dashboard.plaid.com > Team Settings > Keys. Copy your Client ID and Secret. Set Environment to "sandbox" for testing, "development" for development, or "production" for live.',
  twilio:
    'Go to console.twilio.com. Your Account SID and Auth Token are on the dashboard. For API Key SID and Secret, go to Account > API Keys & Tokens > Create API Key. For TwiML App SID, go to Voice > TwiML > TwiML Apps and create an app.',
  elevenlabs:
    'Go to elevenlabs.io > Profile Settings > API Keys. Generate a new API key and paste it here. Used for AI voicemail greetings and voice synthesis.',
  sendgrid:
    'Go to app.sendgrid.com > Settings > API Keys > Create API Key (Full Access). For the Webhook Secret, go to Settings > Mail Settings > Event Webhook and copy the verification key.',
  resend:
    'Go to resend.com/api-keys and create a new API key. Resend is the default email provider for transactional emails (welcome, billing, notifications).',
  google_calendar:
    'Go to console.cloud.google.com > APIs & Services > Credentials > Create OAuth 2.0 Client ID. Enable the Google Calendar API. Set the Redirect URI to your backend callback URL (e.g., https://api.reifundamentalshub.com/api/calendar/google/callback).',
  google_login:
    'Go to console.cloud.google.com > APIs & Services > Credentials > Create OAuth 2.0 Client ID (Web Application). Set the Redirect URI to your backend callback (e.g., https://api.reifundamentalshub.com/api/auth/google/callback). This is separate from Google Calendar.',
  google_maps:
    'Go to console.cloud.google.com > APIs & Services > Credentials > Create API Key. Restrict it to Maps JavaScript API, Places API, and Geocoding API. Under Website restrictions, add hub.reifundamentalshub.com/*. Free tier: ~28,000 map loads/month, ~40,000 geocode requests/month.',
  google_drive_oauth:
    'Go to console.cloud.google.com > APIs & Services > Credentials > Create OAuth 2.0 Client ID. Enable the Google Drive API. Set the Redirect URI to your backend callback URL for Drive.',
  dropbox_oauth:
    'Go to dropbox.com/developers/apps > Create App. Choose "Scoped access" and "Full Dropbox". Copy the App Key and App Secret. Set the Redirect URI to your backend callback URL.',
  outlook:
    'Go to portal.azure.com > Azure Active Directory > App Registrations > New Registration. Under Authentication, add a redirect URI. Under Certificates & Secrets, create a new client secret. Copy the Application (Client) ID and secret value.',
  usps:
    'Register at reg.usps.com/entrancePostal.do for a free Web Tools API account. After registration, your User ID will be emailed to you. Used for certified mail tracking in Bank Negotiations.',
  anthropic:
    'Go to console.anthropic.com > API Keys > Create Key. Used for the AI Admin Assistant and other AI-powered features.',
  openai:
    'Go to platform.openai.com/api-keys > Create New Secret Key. Used as an alternative AI provider.',
  nvidia:
    'Go to build.nvidia.com > Settings > API Keys. Used for NVIDIA-hosted AI models (Kimi, etc.).',
  attom:
    'Register at api.gateway.attomdata.com to get your API key. Used for real-time property data lookups during AI calls and property analysis.',
  hud_pdr:
    'Register at huduser.gov/hudapi/public/register to get your API key (JWT). Used for HUD housing and fair market rent data lookups.',
  telegram:
    'Message @BotFather on Telegram to create a new bot and get your Bot Token. To find your Chat ID, message your bot then visit https://api.telegram.org/bot<TOKEN>/getUpdates and look for the chat.id field. Used for admin notifications.',
  openweathermap:
    'Go to openweathermap.org/appid and sign up for a free account. Your API key will be emailed and also visible on your account page. Free tier: 1,000 calls/day. Used for weather data on market cards.',
  census_bureau:
    'Go to api.census.gov/data/key_signup.html and request a free API key. It will be emailed to you instantly. Used for demographic data (population, income, housing) in Market Analysis.',
  fbi_crime_data:
    'Go to api.data.gov/signup/ and request a free API key. Used for crime statistics by state in Market Analysis. Data comes from the FBI Uniform Crime Reporting (UCR) program.',
  adzuna:
    'Go to developer.adzuna.com and create a free account. Your Application ID and API Key are on the dashboard. Used for job market data (employment, salaries) in Market Analysis.',
  abstract_email:
    'Go to abstractapi.com/api/email-verification-validation-api and sign up for a free account (100 validations/month). Copy your API key from the dashboard. Used to validate contact email addresses.',
  numverify:
    'Go to numverify.com and sign up for a free account (100 lookups/month). Copy your API key from the dashboard. Used to validate contact phone numbers and identify mobile vs landline.',
  square:
    'Go to developer.squareup.com and create a free developer account. Create an application to get your Access Token and Application ID. Find your Location ID under Locations in the dashboard. Used as an alternative payment processor for collecting rent, deposits, and earnest money.',
  frankfurter:
    'No API key needed! Frankfurter is 100% free with no authentication. Provides real-time currency exchange rates from the European Central Bank. Used for the currency converter in Settings and Deal Analyzer.',
  facebook_oauth:
    'Go to developers.facebook.com > My Apps > Create App. Choose "Business" type. Under Settings > Basic, copy your App ID and App Secret. Add the Facebook Login product, then set the Redirect URI under Facebook Login > Settings > Valid OAuth Redirect URIs. Required permissions: pages_manage_posts, pages_read_engagement. Your app needs to pass Meta App Review for these permissions.',
  linkedin_oauth:
    'Go to linkedin.com/developers > My Apps > Create App. Link it to a LinkedIn Company Page. Under Auth, copy Client ID and Client Secret. Add your Redirect URI under OAuth 2.0 settings. Enable the "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect" products. Required scopes: openid, profile, w_member_social.',
  x_twitter_oauth:
    'Go to developer.x.com > Developer Portal > Projects & Apps. Create a project and app (free tier allows 1,500 tweets/month). Under User Authentication Settings, enable OAuth 2.0 with "Read and Write" permissions and set your Redirect URI. Copy the Client ID and Client Secret. Uses OAuth 2.0 with PKCE.',
  instagram_oauth:
    'Instagram posting uses the same Facebook app — no extra credentials needed here. Make sure your Facebook app (above) has the instagram_content_publish permission. Users must have an Instagram Business account linked to a Facebook Page. Only JPEG images are supported.',
}

// Field definitions per provider
const PROVIDER_FIELDS: Record<string, CredentialField[]> = {
  stripe: [
    { name: 'stripe_secret_key', label: 'Secret Key', type: 'secret', help: 'Starts with "sk_live_" or "sk_test_"' },
    { name: 'stripe_webhook_secret', label: 'Webhook Secret', type: 'secret', help: 'Starts with "whsec_" — from Developers > Webhooks' },
    { name: 'stripe_publishable_key', label: 'Publishable Key', type: 'text', help: 'Starts with "pk_live_" or "pk_test_"' },
    { name: 'stripe_starter_monthly_price_id', label: 'Starter Monthly Price ID', type: 'text', help: 'Starts with "price_" — from Products > Starter plan' },
    { name: 'stripe_starter_annual_price_id', label: 'Starter Annual Price ID', type: 'text' },
    { name: 'stripe_pro_monthly_price_id', label: 'Pro Monthly Price ID', type: 'text' },
    { name: 'stripe_pro_annual_price_id', label: 'Pro Annual Price ID', type: 'text' },
    { name: 'stripe_team_monthly_price_id', label: 'Team Monthly Price ID', type: 'text' },
    { name: 'stripe_team_annual_price_id', label: 'Team Annual Price ID', type: 'text' },
  ],
  stripe_connect: [
    { name: 'stripe_connect_secret_key', label: 'Connect Secret Key', type: 'secret', help: 'Secret key for the connected Stripe account' },
    { name: 'stripe_connect_account_id', label: 'Connect Account ID', type: 'text', help: 'Starts with "acct_"' },
    { name: 'stripe_connect_publishable_key', label: 'Connect Publishable Key', type: 'text' },
    { name: 'stripe_platform_account_id', label: 'Platform Account ID', type: 'text', help: 'Your main REI Hub Stripe account ID (receives servicing fees)' },
    { name: 'tphs_admin_email', label: 'TPHS Admin Email', type: 'text', help: 'Email for payment portal admin notifications' },
  ],
  paypal: [
    { name: 'paypal_client_id', label: 'Client ID', type: 'text', help: 'From developer.paypal.com > My Apps > Your App' },
    { name: 'paypal_client_secret', label: 'Client Secret', type: 'secret' },
    { name: 'paypal_webhook_id', label: 'Webhook ID', type: 'text', help: 'From your app > Webhooks — needed for signature verification' },
    { name: 'paypal_mode', label: 'Mode', type: 'text', help: 'Enter "sandbox" for testing or "live" for production' },
    { name: 'paypal_starter_monthly_plan_id', label: 'Starter Monthly Plan ID', type: 'text', help: 'Starts with "P-" — from Subscriptions > Plans' },
    { name: 'paypal_starter_annual_plan_id', label: 'Starter Annual Plan ID', type: 'text' },
    { name: 'paypal_pro_monthly_plan_id', label: 'Pro Monthly Plan ID', type: 'text' },
    { name: 'paypal_pro_annual_plan_id', label: 'Pro Annual Plan ID', type: 'text' },
    { name: 'paypal_team_monthly_plan_id', label: 'Team Monthly Plan ID', type: 'text' },
    { name: 'paypal_team_annual_plan_id', label: 'Team Annual Plan ID', type: 'text' },
  ],
  plaid: [
    { name: 'plaid_client_id', label: 'Client ID', type: 'text', help: 'From dashboard.plaid.com > Team Settings > Keys' },
    { name: 'plaid_secret', label: 'Secret', type: 'secret' },
    { name: 'plaid_env', label: 'Environment', type: 'text', help: 'Enter "sandbox", "development", or "production"' },
  ],
  twilio: [
    { name: 'twilio_account_sid', label: 'Account SID', type: 'text', help: 'Starts with "AC" — from console.twilio.com dashboard' },
    { name: 'twilio_auth_token', label: 'Auth Token', type: 'secret', help: 'Found next to Account SID on the dashboard' },
    { name: 'twilio_api_key_sid', label: 'API Key SID', type: 'text', help: 'Starts with "SK" — from Account > API Keys' },
    { name: 'twilio_api_key_secret', label: 'API Key Secret', type: 'secret', help: 'Shown once when the API key is created' },
    { name: 'twilio_twiml_app_sid', label: 'TwiML App SID', type: 'text', help: 'Starts with "AP" — from Voice > TwiML Apps' },
  ],
  elevenlabs: [
    { name: 'elevenlabs_api_key', label: 'API Key', type: 'secret', help: 'From elevenlabs.io > Profile Settings > API Keys' },
  ],
  sendgrid: [
    { name: 'sendgrid_api_key', label: 'API Key', type: 'secret', help: 'Starts with "SG." — from Settings > API Keys' },
    { name: 'sendgrid_webhook_secret', label: 'Webhook Verification Key', type: 'secret', help: 'From Settings > Mail Settings > Event Webhook' },
  ],
  resend: [
    { name: 'resend_api_key', label: 'API Key', type: 'secret', help: 'Starts with "re_" — from resend.com/api-keys' },
  ],
  google_calendar: [
    { name: 'google_client_id', label: 'Client ID', type: 'text', help: 'Ends in ".apps.googleusercontent.com"' },
    { name: 'google_client_secret', label: 'Client Secret', type: 'secret' },
    { name: 'google_redirect_uri', label: 'Redirect URI', type: 'text', help: 'e.g., https://api.reifundamentalshub.com/api/calendar/google/callback' },
  ],
  google_login: [
    { name: 'google_login_client_id', label: 'Client ID', type: 'text', help: 'Separate OAuth app from Calendar — ends in ".apps.googleusercontent.com"' },
    { name: 'google_login_client_secret', label: 'Client Secret', type: 'secret' },
    { name: 'google_login_redirect_uri', label: 'Redirect URI', type: 'text', help: 'e.g., https://api.reifundamentalshub.com/api/auth/google/callback' },
  ],
  google_maps: [
    { name: 'google_maps_api_key', label: 'API Key', type: 'secret', help: 'From console.cloud.google.com > Credentials > API Key. Restrict to Maps JS, Places, and Geocoding APIs.' },
  ],
  google_drive_oauth: [
    { name: 'google_drive_client_id', label: 'Client ID', type: 'text', help: 'Separate OAuth app — enable Google Drive API' },
    { name: 'google_drive_client_secret', label: 'Client Secret', type: 'secret' },
    { name: 'google_drive_redirect_uri', label: 'Redirect URI', type: 'text' },
  ],
  dropbox_oauth: [
    { name: 'dropbox_app_key', label: 'App Key', type: 'text', help: 'From dropbox.com/developers/apps > Your App > Settings' },
    { name: 'dropbox_app_secret', label: 'App Secret', type: 'secret' },
    { name: 'dropbox_redirect_uri', label: 'Redirect URI', type: 'text' },
  ],
  outlook: [
    { name: 'outlook_client_id', label: 'Application (Client) ID', type: 'text', help: 'From Azure Portal > App Registrations > Your App > Overview' },
    { name: 'outlook_client_secret', label: 'Client Secret', type: 'secret', help: 'From Certificates & Secrets > New Client Secret' },
    { name: 'outlook_redirect_uri', label: 'Redirect URI', type: 'text', help: 'Must match what you entered in Azure under Authentication' },
  ],
  usps: [
    { name: 'usps_user_id', label: 'User ID', type: 'text', help: 'Emailed to you after registering at reg.usps.com/entrancePostal.do' },
    { name: 'usps_api_url', label: 'API URL', type: 'text', help: 'Default: https://secure.shippingapis.com/ShippingAPI.dll — only change if USPS provides a different URL' },
  ],
  anthropic: [
    { name: 'anthropic_api_key', label: 'API Key', type: 'secret', help: 'Starts with "sk-ant-" — from console.anthropic.com > API Keys' },
  ],
  openai: [
    { name: 'openai_api_key', label: 'API Key', type: 'secret', help: 'Starts with "sk-" — from platform.openai.com/api-keys' },
  ],
  nvidia: [
    { name: 'nvidia_api_key', label: 'API Key', type: 'secret', help: 'From build.nvidia.com > Settings > API Keys' },
  ],
  attom: [
    { name: 'attom_api_key', label: 'API Key', type: 'secret', help: 'From api.gateway.attomdata.com after registration' },
  ],
  hud_pdr: [
    { name: 'hud_api_key', label: 'API Key (JWT)', type: 'secret', help: 'From huduser.gov/hudapi/public/register' },
  ],
  telegram: [
    { name: 'telegram_bot_token', label: 'Bot Token', type: 'secret', help: 'From @BotFather on Telegram — looks like "123456:ABC-DEF..."' },
    { name: 'telegram_chat_id', label: 'Chat ID', type: 'text', help: 'Your personal chat ID — get it from the /getUpdates API after messaging your bot' },
  ],
  // ── Free API Integrations ──────────────────────────────────────────
  openweathermap: [
    { name: 'openweathermap_api_key', label: 'API Key', type: 'secret', help: 'From openweathermap.org > My API Keys — free tier: 1,000 calls/day' },
  ],
  census_bureau: [
    { name: 'census_bureau_api_key', label: 'API Key', type: 'secret', help: 'From api.census.gov/data/key_signup.html — free, instant email delivery' },
  ],
  fbi_crime_data: [
    { name: 'fbi_crime_api_key', label: 'API Key', type: 'secret', help: 'From api.data.gov/signup/ — free data.gov key, works for all federal APIs' },
  ],
  adzuna: [
    { name: 'adzuna_app_id', label: 'Application ID', type: 'text', help: 'From developer.adzuna.com dashboard' },
    { name: 'adzuna_api_key', label: 'API Key', type: 'secret', help: 'From developer.adzuna.com dashboard — free tier with generous limits' },
  ],
  abstract_email: [
    { name: 'abstract_email_api_key', label: 'API Key', type: 'secret', help: 'From abstractapi.com dashboard — free: 100 validations/month' },
  ],
  numverify: [
    { name: 'numverify_api_key', label: 'API Key', type: 'secret', help: 'From numverify.com dashboard — free: 100 lookups/month' },
  ],
  square: [
    { name: 'square_access_token', label: 'Access Token', type: 'secret', help: 'From developer.squareup.com > Your App > Credentials' },
    { name: 'square_application_id', label: 'Application ID', type: 'text', help: 'Starts with "sq0idp-" — from app credentials page' },
    { name: 'square_location_id', label: 'Location ID', type: 'text', help: 'From Locations in the Square Developer dashboard' },
  ],
  frankfurter: [],
  facebook_oauth: [
    { name: 'facebook_app_id', label: 'App ID', type: 'text', help: 'From developers.facebook.com > Your App > Settings > Basic' },
    { name: 'facebook_app_secret', label: 'App Secret', type: 'secret', help: 'From Settings > Basic — click "Show" to reveal' },
    { name: 'facebook_redirect_uri', label: 'Redirect URI', type: 'text', help: 'e.g. https://hub.reifundamentalshub.com/settings?facebook_code=CALLBACK' },
  ],
  linkedin_oauth: [
    { name: 'linkedin_client_id', label: 'Client ID', type: 'text', help: 'From linkedin.com/developers > Your App > Auth tab' },
    { name: 'linkedin_client_secret', label: 'Client Secret', type: 'secret', help: 'From Auth tab — regenerate if needed' },
    { name: 'linkedin_redirect_uri', label: 'Redirect URI', type: 'text', help: 'e.g. https://hub.reifundamentalshub.com/settings?linkedin_code=CALLBACK' },
  ],
  x_twitter_oauth: [
    { name: 'x_twitter_client_id', label: 'Client ID', type: 'text', help: 'From developer.x.com > Your App > Keys and Tokens > OAuth 2.0' },
    { name: 'x_twitter_client_secret', label: 'Client Secret', type: 'secret', help: 'From Keys and Tokens > OAuth 2.0 Client ID and Secret' },
    { name: 'x_twitter_redirect_uri', label: 'Redirect URI', type: 'text', help: 'e.g. https://hub.reifundamentalshub.com/settings?x_code=CALLBACK' },
  ],
  instagram_oauth: [],
}

// ── API functions — real backend calls ───────────────────────────────────

/** Get status of all providers — never returns actual credential values. */
export async function getCredentialStatuses(): Promise<CredentialStatus[]> {
  const res = await fetch(`${BASE_URL}/api/superadmin/credentials`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })

  if (res.status === 403) {
    throw new Error('SuperAdmin access required. You do not have permission to view credentials.')
  }
  if (!res.ok) {
    throw new Error('Failed to load credential statuses')
  }

  const data = await res.json()
  const backendStatuses: Array<{
    provider_name: string
    configured: boolean
    last_updated: string | null
    fields: CredentialField[]
    configured_fields: Record<string, boolean>
  }> = data.credentials

  // Build a lookup from backend data
  const backendMap = new Map(
    backendStatuses.map((s) => [s.provider_name, s])
  )

  // Merge backend status with frontend metadata (display names, icons, categories, instructions)
  return Object.entries(PROVIDER_FIELDS).map(([providerName, fields]) => {
    const meta = PROVIDER_META[providerName] || {
      display_name: providerName,
      category: 'Other',
      icon: '⚙️',
    }
    const backend = backendMap.get(providerName)

    return {
      provider_name: providerName,
      display_name: meta.display_name,
      category: meta.category,
      icon: meta.icon,
      configured: backend?.configured ?? false,
      last_updated: backend?.last_updated ?? null,
      fields,
      configured_fields: backend?.configured_fields ?? {},
      instructions: PROVIDER_INSTRUCTIONS[providerName],
    }
  })
}

/** Save credentials for a provider. */
export async function updateCredential(
  providerName: string,
  config: Record<string, string>
): Promise<{ configured: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/api/superadmin/credentials/${providerName}`, {
    method: 'PUT',
    headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
    credentials: 'include',
  })

  if (res.status === 403) {
    throw new Error('SuperAdmin access required.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Failed to save credentials')
  }

  return res.json()
}

/** Delete all credentials for a provider. */
export async function deleteCredential(providerName: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/superadmin/credentials/${providerName}`, {
    method: 'DELETE',
    headers: getAuthHeader(),
    credentials: 'include',
  })

  if (res.status === 403) {
    throw new Error('SuperAdmin access required.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? 'Failed to delete credentials')
  }
}

/** Test a provider connection using the backend. */
export async function testCredential(
  providerName: string
): Promise<TestResult> {
  const res = await fetch(`${BASE_URL}/api/superadmin/credentials/${providerName}/test`, {
    headers: getAuthHeader(),
    credentials: 'include',
  })

  if (res.status === 403) {
    throw new Error('SuperAdmin access required.')
  }
  if (!res.ok) {
    return {
      status: 'error',
      message: 'Connection test failed — server error.',
    }
  }

  return res.json()
}

/** Get the list of provider categories for grouping in the UI. */
export function getProviderCategories(): string[] {
  const cats = new Set<string>()
  Object.values(PROVIDER_META).forEach((m) => cats.add(m.category))
  return Array.from(cats)
}
