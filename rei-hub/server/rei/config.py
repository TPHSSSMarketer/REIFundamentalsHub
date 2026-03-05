"""Application settings — reads from .env with REI_ prefix."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./rei_hub.db"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 1440
    cors_origins: str = "http://localhost:3000"

    # ── HttpOnly Cookie Auth ──────────────────────────────────────
    access_token_expire_minutes: int = 15       # Short-lived access token
    refresh_token_expire_days: int = 7          # Long-lived refresh token
    cookie_secure: bool = False                 # True in production (requires HTTPS)
    cookie_same_site: str = "lax"               # "lax" allows OAuth redirects
    cookie_domain: str = ""                     # ".reifundamentalshub.com" in prod
    csrf_header_name: str = "X-CSRF-Token"      # Header name for CSRF validation
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_starter_monthly_price_id: str = ""
    stripe_starter_annual_price_id: str = ""
    stripe_pro_monthly_price_id: str = ""
    stripe_pro_annual_price_id: str = ""
    stripe_team_monthly_price_id: str = ""
    stripe_team_annual_price_id: str = ""
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_mode: str = "sandbox"
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    paypal_webhook_id: str = ""  # PayPal webhook ID for signature verification
    paypal_starter_monthly_plan_id: str = ""
    paypal_starter_annual_plan_id: str = ""
    paypal_pro_monthly_plan_id: str = ""
    paypal_pro_annual_plan_id: str = ""
    paypal_team_monthly_plan_id: str = ""
    paypal_team_annual_plan_id: str = ""
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_env: str = "sandbox"  # sandbox, development, production
    plaid_products: str = "auth,identity,balance"
    plaid_country_codes: str = "US"
    plugin_shared_secret: str = "change-me-in-production"
    hub_url: str = "http://localhost:5173"
    google_drive_access_token: str = ""
    dropbox_access_token: str = ""
    sendgrid_api_key: str = ""
    sendgrid_webhook_secret: str = ""
    email_from: str = "noreply@reifundamentalshub.com"
    email_from_name: str = "REIFundamentals Hub"

    # ── Email Marketing provider ──────────────────────────────────
    email_provider: str = "resend"  # "resend" to start, "sendgrid" when scaling
    resend_api_key: str = ""

    # ── Twilio (Phone System) ──────────────────────────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_api_key_sid: str = ""
    twilio_api_key_secret: str = ""
    twilio_twiml_app_sid: str = ""

    # ── ElevenLabs (AI Voicemail + Voice AI) ─────────────────────────
    elevenlabs_api_key: str = ""

    # ── ATTOM Data (Property Data) ────────────────────────────────────
    attom_api_key: str = ""
    # Register at: api.gateway.attomdata.com
    # Used for real-time property lookups during AI calls

    # ── AI Provider defaults ─────────────────────────────────────────
    default_ai_provider: str = "nvidia_kimi"
    default_ai_model: str = "moonshotai/kimi-k2.5-instruct"
    ai_encryption_key: str = ""
    # Used for encrypting stored API keys
    # Should be 32 chars — set in .env

    # ── Telegram (Admin Notifications) ──────────────────────────────────
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    # To find your chat_id: message your bot, then visit
    # https://api.telegram.org/bot<TOKEN>/getUpdates

    # ── Voice AI (CallCommander) ──────────────────────────────────────
    api_base_url: str = ""
    # The public URL for your Railway backend (e.g. https://api.reifundamentalshub.com)
    # Used for Twilio webhook callbacks during AI calls

    # ── TPHS Payment Portal (Stripe Connect) ────────────────────────
    stripe_connect_secret_key: str = ""
    stripe_connect_account_id: str = ""
    stripe_connect_publishable_key: str = ""
    tphs_admin_email: str = ""

    # REI Hub platform Stripe account
    # (receives servicing fees from all tenants)
    stripe_platform_account_id: str = ""

    # ── HUD PD&R (Housing Data) ────────────────────────────────────────
    hud_api_key: str = ""
    # Register at: huduser.gov/hudapi/public/register
    # Used for HUD housing and fair market rent data lookups

    # ── Free API Integrations ─────────────────────────────────────────
    # OpenWeatherMap (1,000 calls/day free)
    openweathermap_api_key: str = ""
    # US Census Bureau API (free with key)
    census_bureau_api_key: str = ""
    # FBI Crime Data API (free via data.gov)
    fbi_crime_api_key: str = ""
    # Adzuna Jobs API (free tier)
    adzuna_app_id: str = ""
    adzuna_api_key: str = ""
    # Abstract Email Validation (100 free/month)
    abstract_email_api_key: str = ""
    # NumVerify Phone Validation (100 free/month)
    numverify_api_key: str = ""
    # Square Payments (free dev access, 2.6% + $0.15 per tx)
    square_access_token: str = ""
    square_application_id: str = ""
    square_location_id: str = ""
    # Nominatim geocoding (no key needed, just a user agent)
    nominatim_user_agent: str = "reifundamentalshub/1.0"

    # ── Social Media OAuth (developer app credentials) ────────────
    facebook_app_id: str = ""
    facebook_app_secret: str = ""
    facebook_redirect_uri: str = ""
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_redirect_uri: str = ""
    x_twitter_client_id: str = ""
    x_twitter_client_secret: str = ""
    x_twitter_redirect_uri: str = ""

    # ── SuperAdmin Bootstrap ────────────────────────────────────────
    superadmin_bootstrap_key: str = ""
    superadmin_bootstrap_email: str = ""
    # One-time promotion: set both env vars, deploy, and the user
    # is auto-promoted to SuperAdmin on app startup. Also available
    # via POST /api/superadmin/bootstrap. Remove both vars after use.

    # ── USPS Web Tools API ──────────────────────────────────────────
    usps_user_id: str = ""
    # Register at: reg.usps.com/entrancePostal.do
    # Free account — get User ID after registration
    usps_api_url: str = "https://secure.shippingapis.com/ShippingAPI.dll"

    # ── Google Calendar ─────────────────────────────────────────────
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""

    # ── Google OAuth Login ──────────────────────────────────────
    google_login_client_id: str = ""
    google_login_client_secret: str = ""
    google_login_redirect_uri: str = ""

    # ── Google Drive (per-user OAuth) ───────────────────────────
    google_drive_client_id: str = ""
    google_drive_client_secret: str = ""
    google_drive_redirect_uri: str = ""

    # ── Dropbox (per-user OAuth) ────────────────────────────────
    dropbox_app_key: str = ""
    dropbox_app_secret: str = ""
    dropbox_redirect_uri: str = ""

    # ── Microsoft Outlook Calendar ──────────────────────────────────
    outlook_client_id: str = ""
    outlook_client_secret: str = ""
    outlook_redirect_uri: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="REI_")


@lru_cache
def get_settings() -> Settings:
    return Settings()


# ── Plan catalog (module-level constant, not a settings field) ─────────
PLANS: dict[str, dict] = {
    "starter": {
        "name": "Starter",
        "monthly_price_cents": 9900,
        "annual_price_cents": 99000,
        "stripe_monthly_price_id": "",
        "stripe_annual_price_id": "",
        "paypal_monthly_plan_id": "",
        "paypal_annual_plan_id": "",
        "max_seats": 1,
        "features": ["dashboard", "pipeline", "contacts", "markets", "portfolio"],
    },
    "pro": {
        "name": "Pro",
        "monthly_price_cents": 17900,
        "annual_price_cents": 179000,
        "stripe_monthly_price_id": "",
        "stripe_annual_price_id": "",
        "paypal_monthly_plan_id": "",
        "paypal_annual_plan_id": "",
        "max_seats": 3,
        "features": [
            "dashboard", "pipeline", "contacts", "markets", "portfolio",
            "content_hub", "wordpress_publish", "cloud_sync",
            "assistant", "assistant_hub", "csv_export",
        ],
    },
    "team": {
        "name": "Team",
        "monthly_price_cents": 29900,
        "annual_price_cents": 299000,
        "stripe_monthly_price_id": "",
        "stripe_annual_price_id": "",
        "paypal_monthly_plan_id": "",
        "paypal_annual_plan_id": "",
        "max_seats": 999,
        "features": [
            "dashboard", "pipeline", "contacts", "markets", "portfolio",
            "content_hub", "wordpress_publish", "cloud_sync",
            "assistant", "assistant_hub", "csv_export", "priority_support",
        ],
    },
}

TRIAL_DAYS = 7

# ── Email Marketing plan limits ────────────────────────────────────────
EMAIL_PLAN_LIMITS: dict[str, int] = {
    "starter": 5000,
    "pro": 25000,
    "team": 100000,
}

OVERAGE_RATE_PER_THOUSAND = 1.50

# ── Universal Credit Markup ───────────────────────────────────────────
# When users purchase credits and spend them (after exhausting their plan
# allowance), every deduction is marked up 30% over our raw cost.
CREDIT_MARKUP: float = 1.30

# ── Phone System pricing ──────────────────────────────────────────────
PHONE_PRICING: dict[str, float] = {
    # ── Standard rates (markup over Twilio/provider cost) ──────
    "outbound_per_min": 0.03,
    "inbound_per_min": 0.025,
    "voicemail_drop": 0.05,
    "outbound_sms": 0.02,
    "inbound_sms": 0.00,            # Free — platform perk
    "fax_sent_per_page": 0.04,
    "fax_received_per_page": 0.04,
    "additional_number_per_month": 2.00,
    # AI voicemail drop (ElevenLabs TTS generation)
    "ai_voicemail_drop": 0.25,
    # ── AI Voice Call pricing (ElevenLabs + Claude + Twilio) ──────
    # These are higher than regular calls because of LLM + voice AI costs
    "ai_call_inbound_per_min": 0.20,   # AI answers an inbound call
    "ai_call_outbound_per_min": 0.20,  # AI makes an outbound call (campaign/callback)
    "ai_property_lookup": 0.02,        # ATTOM property data lookup (per lookup)
}

PHONE_PLAN_LIMITS: dict[str, dict[str, int]] = {
    "starter": {"minutes": 100, "sms": 500},
    "pro": {"minutes": 500, "sms": 2000},
    "team": {"minutes": 2000, "sms": 5000},
}

CREDIT_BUNDLES: dict[str, dict[str, int]] = {
    "starter": {"price_cents": 2500, "credits_cents": 2500},       # no bonus
    "growth": {"price_cents": 5000, "credits_cents": 5500},        # 10% bonus
    "power": {"price_cents": 10000, "credits_cents": 11500},       # 15% bonus
}

# Pro and Team plans UNLOCK ACCESS to AI voicemail drops.
# AI drops are always billed per-use from credits at $0.25/drop — never included in any plan.
# Starter plan cannot use AI voicemail drops at all.
AI_VOICEMAIL_PLANS: list[str] = ["pro", "team"]

# ── AI Token Pricing (cost per 1 million tokens) ────────────────────────
# Used to calculate real dollar costs for each AI call.
AI_TOKEN_PRICING: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6":          {"input_per_1m": 3.00,  "output_per_1m": 15.00},
    "claude-haiku-4-5-20251001":  {"input_per_1m": 0.80,  "output_per_1m": 4.00},
    "claude-opus-4-6":            {"input_per_1m": 15.00, "output_per_1m": 75.00},
    # NVIDIA NIM models — free tier
    "moonshotai/kimi-k2.5-instruct":           {"input_per_1m": 0.00, "output_per_1m": 0.00},
    "minimax/minimax-text-01":                  {"input_per_1m": 0.00, "output_per_1m": 0.00},
    "nvidia/llama-3.3-nemotron-super-49b-v1":   {"input_per_1m": 0.00, "output_per_1m": 0.00},
}

# ── AI Plan Allowances (monthly free AI usage in cents) ─────────────────
# When a user hits their allowance, they must use their own API key or upgrade.
AI_PLAN_ALLOWANCES: dict[str, dict[str, int]] = {
    "starter": {"monthly_allowance_cents": 500},    # $5.00/month
    "pro":     {"monthly_allowance_cents": 2000},   # $20.00/month
    "team":    {"monthly_allowance_cents": 5000},    # $50.00/month
}


# ── Helpers to resolve Stripe price IDs from settings ──────────────────


def get_plan_price_id(plan: str, interval: str, settings: Settings) -> str:
    """Return the Stripe price ID for a given plan + interval."""
    key = f"stripe_{plan}_{interval}_price_id"
    return getattr(settings, key, "")


# ── Helpers to resolve PayPal plan IDs from settings ───────────────────


def get_paypal_plan_id(plan: str, interval: str, settings: Settings) -> str:
    """Return the PayPal plan ID for a given plan + interval."""
    key = f"paypal_{plan}_{interval}_plan_id"
    return getattr(settings, key, "")


