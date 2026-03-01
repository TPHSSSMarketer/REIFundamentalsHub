"""Application configuration loaded from environment variables."""

from __future__ import annotations

import logging
from functools import lru_cache

from pydantic_settings import BaseSettings

_config_logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Central configuration for the Helm application."""

    # ── App ──────────────────────────────────────────────────────────────
    app_name: str = "Helm"
    app_env: str = "development"
    app_debug: bool = False  # SECURITY: default off; override via APP_DEBUG=true in .env
    app_host: str = "127.0.0.1"  # SECURITY: localhost only; override to 0.0.0.0 in Docker/.env
    app_port: int = 8000
    secret_key: str = ""  # SECURITY: MUST be set via environment variable

    # ── AI ───────────────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5-20250929"
    anthropic_model_opus: str = "claude-opus-4-6"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # ── OpenRouter (multi-model gateway + Perplexity research) ─────────
    openrouter_api_key: str = ""

    # ── AI Backend ──────────────────────────────────────────────────────
    ai_backend: str = "nvidia"  # "nvidia", "anthropic", "openrouter", or "claude_cli"
    openrouter_model: str = "anthropic/claude-sonnet-4-5-20250929"
    openrouter_model_opus: str = "anthropic/claude-opus-4-6"
    claude_cli_timeout: int = 120  # Seconds before CLI subprocess times out

    # ── NVIDIA NIM (OpenAI-compatible API) ────────────────────────────
    nvidia_api_key: str = ""
    nvidia_model: str = "moonshotai/kimi-k2.5-instruct"
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"

    # ── Database ─────────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./helm.db"

    # ── REIFundamentals Hub ──────────────────────────────────────────────
    reifundamentals_api_url: str = "https://api.reifundamentals.com/v1"
    reifundamentals_api_key: str = ""
    reifundamentals_webhook_secret: str = ""
    rei_hub_url: str = "http://localhost:8001"
    rei_plugin_secret: str = ""  # SECURITY: MUST be set via environment variable

    # ── Auth ─────────────────────────────────────────────────────────────
    jwt_secret_key: str = ""  # SECURITY: MUST be set via environment variable
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 240  # SECURITY: 4 hours (was 24h); implement refresh tokens for shorter TTL
    api_keys: str = ""  # Comma-separated list of valid API keys
    admin_password: str = ""  # bcrypt-hashed admin password

    # ── Telegram ─────────────────────────────────────────────────────────
    telegram_bot_token: str = ""
    telegram_webhook_url: str = ""  # e.g. https://yourdomain.com/api/telegram/webhook
    telegram_webhook_secret: str = ""  # SECURITY: set via setWebhook secret_token param

    # ── WhatsApp (Meta Business Cloud API) ───────────────────────────────
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    whatsapp_verify_token: str = "helm-whatsapp-verify"
    whatsapp_app_secret: str = ""  # SECURITY: for X-Hub-Signature-256 HMAC verification
    whatsapp_api_version: str = "v21.0"

    # ── Voice ────────────────────────────────────────────────────────────
    openai_api_key_voice: str = ""  # For Whisper STT & TTS (uses OpenAI key if blank)
    voice_stt_model: str = "whisper-1"
    voice_tts_model: str = "tts-1"
    voice_tts_voice: str = "onyx"  # alloy, echo, fable, onyx, nova, shimmer

    # ── GoHighLevel (optional CRM) ──────────────────────────────────────
    ghl_client_id: str = ""
    ghl_client_secret: str = ""
    ghl_redirect_uri: str = ""
    ghl_access_token: str = ""
    ghl_refresh_token: str = ""
    ghl_location_id: str = ""

    # ── Supabase (optional persistent memory) ───────────────────────────
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # ── Google Drive (cloud file management) ─────────────────────────────
    google_drive_client_id: str = ""
    google_drive_client_secret: str = ""
    google_drive_redirect_uri: str = ""
    google_drive_access_token: str = ""
    google_drive_refresh_token: str = ""

    # ── Dropbox (cloud file management) ────────────────────────────────
    dropbox_app_key: str = ""
    dropbox_app_secret: str = ""
    dropbox_redirect_uri: str = "http://localhost:8000/auth/dropbox/callback"

    # ── Virtual Workspace ──────────────────────────────────────────────────
    workspace_enabled: bool = True
    workspace_max_size_mb: int = 500   # Per-tenant limit

    # ── ElevenLabs (premium voice) ────────────────────────────────────────
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""       # Your preferred voice
    elevenlabs_agent_id: str = ""       # Conversational AI agent ID

    # ── Slack ──────────────────────────────────────────────────────────
    slack_bot_token: str = ""
    slack_signing_secret: str = ""

    # ── Microsoft Teams ────────────────────────────────────────────────
    teams_app_id: str = ""
    teams_app_password: str = ""

    # ── Google Chat ────────────────────────────────────────────────────
    google_chat_service_account_key: str = ""

    # ── Discord ───────────────────────────────────────────────────────
    discord_bot_token: str = ""

    # ── WordPress ─────────────────────────────────────────────────────
    wordpress_url: str = ""

    # ── Smart Check-ins ─────────────────────────────────────────────────
    checkin_enabled: bool = False
    checkin_interval_minutes: int = 30
    checkin_quiet_hours_start: int = 22   # 10pm
    checkin_quiet_hours_end: int = 7      # 7am

    # ── Admin ─────────────────────────────────────────────────────────────
    admin_tenant_id: str = ""           # Your personal tenant ID
    telegram_admin_user_id: str = ""    # Telegram user ID whitelist

    # ── Stripe (legacy base/REI plugin) ────────────────────────────────────
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""   # whsec_... from Stripe Dashboard
    stripe_base_plan_price_id: str = ""  # price_... for the Helm base subscription
    stripe_rei_plugin_price_id: str = ""  # price_... for the REI plugin add-on

    # ── Stripe (standalone Helm Hub plans: Solo / Pro) ───────────────────
    helm_stripe_secret_key: str = ""
    helm_stripe_webhook_secret: str = ""
    helm_stripe_solo_monthly_price_id: str = ""
    helm_stripe_solo_annual_price_id: str = ""
    helm_stripe_pro_monthly_price_id: str = ""
    helm_stripe_pro_annual_price_id: str = ""
    helm_hub_url: str = "http://localhost:8000"

    # ── PayPal ────────────────────────────────────────────────────────────
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_webhook_id: str = ""       # Webhook ID from PayPal Dashboard
    paypal_base_plan_id: str = ""     # Plan ID for the Helm base subscription
    paypal_rei_plugin_plan_id: str = ""  # Plan ID for the REI plugin add-on
    paypal_mode: str = "sandbox"      # "sandbox" or "live"

    # ── Billing ──────────────────────────────────────────────────────────
    billing_success_url: str = "https://your-domain.com/billing/success"
    billing_cancel_url: str = "https://your-domain.com/billing/cancel"

    # ── CORS ──────────────────────────────────────────────────────────────
    cors_origins: str = ""  # Comma-separated origins (e.g. "https://hub.reifundamentals.com,http://localhost:5173")

    # ── Logging ──────────────────────────────────────────────────────────
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    def model_post_init(self, __context) -> None:
        """Validate critical settings on startup — refuse to run with insecure defaults."""
        _dangerous_defaults = {"change-me", "change-me-in-production", ""}

        if self.app_env != "development":
            # ── SECURITY FIX #1: Require real secrets in production ──
            if self.secret_key in _dangerous_defaults:
                raise ValueError(
                    "FATAL: SECRET_KEY is not set. Refusing to start in production "
                    "with an empty or default secret key. Set SECRET_KEY in your .env file."
                )
            if self.jwt_secret_key in _dangerous_defaults:
                raise ValueError(
                    "FATAL: JWT_SECRET_KEY is not set. Refusing to start in production "
                    "with an empty or default JWT secret. Set JWT_SECRET_KEY in your .env file."
                )
            if self.rei_plugin_secret in _dangerous_defaults:
                _config_logger.warning(
                    "WARNING: REI_PLUGIN_SECRET is not set. REI plugin auth will not work."
                )

            # ── SECURITY FIX #13: Warn if PayPal is in sandbox mode in production ──
            if self.paypal_mode == "sandbox" and self.paypal_client_id:
                _config_logger.warning(
                    "WARNING: PayPal is running in SANDBOX mode in a non-development "
                    "environment (%s). No real payments will be processed! "
                    "Set PAYPAL_MODE=live for production.",
                    self.app_env,
                )

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


# ── Helm Hub Plan Catalog ──────────────────────────────────────────────

HELM_PLANS: dict[str, dict] = {
    "solo": {
        "name": "Solo",
        "monthly_price_cents": 7900,
        "annual_price_cents": 79000,
        "stripe_monthly_price_id": "",
        "stripe_annual_price_id": "",
        "max_seats": 1,
        "features": [
            "ai_personas", "sms_drafting", "content_assist",
            "telegram", "whatsapp", "memory", "heartbeat",
        ],
    },
    "pro": {
        "name": "Pro",
        "monthly_price_cents": 14900,
        "annual_price_cents": 149000,
        "stripe_monthly_price_id": "",
        "stripe_annual_price_id": "",
        "max_seats": 3,
        "features": [
            "ai_personas", "sms_drafting", "content_assist",
            "telegram", "whatsapp", "memory", "heartbeat",
            "full_assistant_hub", "content_hub_ai", "priority_support",
        ],
    },
}

HELM_TRIAL_DAYS = 7


def get_helm_plan_price_id(plan: str, interval: str, settings: Settings) -> str:
    """Return the Stripe price ID for a Helm Hub plan + interval."""
    key = f"helm_stripe_{plan}_{interval}_price_id"
    return getattr(settings, key, "")
