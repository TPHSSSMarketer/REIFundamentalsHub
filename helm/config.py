"""Application configuration loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central configuration for the Helm application."""

    # ── App ──────────────────────────────────────────────────────────────
    app_name: str = "Helm"
    app_env: str = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    secret_key: str = "change-me"

    # ── AI ───────────────────────────────────────────────────────────────
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5-20250929"
    anthropic_model_opus: str = "claude-opus-4-6"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # ── OpenRouter (multi-model gateway + Perplexity research) ─────────
    openrouter_api_key: str = ""

    # ── Database ─────────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./helm.db"

    # ── REIFundamentals Hub ──────────────────────────────────────────────
    reifundamentals_api_url: str = "https://api.reifundamentals.com/v1"
    reifundamentals_api_key: str = ""
    reifundamentals_webhook_secret: str = ""

    # ── Auth ─────────────────────────────────────────────────────────────
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 1440

    # ── Telegram ─────────────────────────────────────────────────────────
    telegram_bot_token: str = ""
    telegram_webhook_url: str = ""  # e.g. https://yourdomain.com/api/telegram/webhook

    # ── WhatsApp (Meta Business Cloud API) ───────────────────────────────
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    whatsapp_verify_token: str = "helm-whatsapp-verify"
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

    # ── Virtual Workspace ──────────────────────────────────────────────────
    workspace_enabled: bool = True
    workspace_max_size_mb: int = 500   # Per-tenant limit

    # ── Smart Check-ins ─────────────────────────────────────────────────
    checkin_enabled: bool = False
    checkin_interval_minutes: int = 30
    checkin_quiet_hours_start: int = 22   # 10pm
    checkin_quiet_hours_end: int = 7      # 7am

    # ── Logging ──────────────────────────────────────────────────────────
    log_level: str = "INFO"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
