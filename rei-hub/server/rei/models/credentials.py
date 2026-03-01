"""ProviderCredentials model — stores encrypted API keys per integration."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from rei.database import Base


class ProviderCredentials(Base):
    """Stores encrypted API keys/secrets for each integration provider.

    Each row represents one provider (e.g. stripe, twilio, resend).
    The config_json field holds an encrypted JSON blob containing all
    key/value pairs for that provider.
    """

    __tablename__ = "provider_credentials"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    provider_name: Mapped[str] = mapped_column(
        String, unique=True, nullable=False, index=True
    )
    # Encrypted JSON — e.g. {"api_key": "enc...", "webhook_secret": "enc..."}
    config_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

    # Audit
    configured_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    last_updated_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ── Known providers and their credential fields ─────────────────────────

KNOWN_PROVIDERS: dict[str, list[dict[str, str]]] = {
    "stripe": [
        {"name": "stripe_secret_key", "label": "Secret Key", "type": "secret"},
        {"name": "stripe_webhook_secret", "label": "Webhook Secret", "type": "secret"},
        {"name": "stripe_publishable_key", "label": "Publishable Key", "type": "text"},
    ],
    "paypal": [
        {"name": "paypal_client_id", "label": "Client ID", "type": "text"},
        {"name": "paypal_client_secret", "label": "Client Secret", "type": "secret"},
        {"name": "paypal_mode", "label": "Mode (sandbox/production)", "type": "text"},
    ],
    "plaid": [
        {"name": "plaid_client_id", "label": "Client ID", "type": "text"},
        {"name": "plaid_secret", "label": "Secret", "type": "secret"},
        {"name": "plaid_env", "label": "Environment (sandbox/development/production)", "type": "text"},
    ],
    "twilio": [
        {"name": "twilio_account_sid", "label": "Account SID", "type": "text"},
        {"name": "twilio_auth_token", "label": "Auth Token", "type": "secret"},
        {"name": "twilio_api_key_sid", "label": "API Key SID", "type": "text"},
        {"name": "twilio_api_key_secret", "label": "API Key Secret", "type": "secret"},
        {"name": "twilio_twiml_app_sid", "label": "TwiML App SID", "type": "text"},
    ],
    "elevenlabs": [
        {"name": "elevenlabs_api_key", "label": "API Key", "type": "secret"},
    ],
    "sendgrid": [
        {"name": "sendgrid_api_key", "label": "API Key", "type": "secret"},
        {"name": "sendgrid_webhook_secret", "label": "Webhook Secret", "type": "secret"},
    ],
    "resend": [
        {"name": "resend_api_key", "label": "API Key", "type": "secret"},
    ],
    "google_calendar": [
        {"name": "google_client_id", "label": "Client ID", "type": "text"},
        {"name": "google_client_secret", "label": "Client Secret", "type": "secret"},
        {"name": "google_redirect_uri", "label": "Redirect URI", "type": "text"},
    ],
    "google_login": [
        {"name": "google_login_client_id", "label": "Client ID", "type": "text"},
        {"name": "google_login_client_secret", "label": "Client Secret", "type": "secret"},
        {"name": "google_login_redirect_uri", "label": "Redirect URI", "type": "text"},
    ],
    "google_drive_oauth": [
        {"name": "google_drive_client_id", "label": "Client ID", "type": "text"},
        {"name": "google_drive_client_secret", "label": "Client Secret", "type": "secret"},
        {"name": "google_drive_redirect_uri", "label": "Redirect URI", "type": "text"},
    ],
    "dropbox_oauth": [
        {"name": "dropbox_app_key", "label": "App Key", "type": "text"},
        {"name": "dropbox_app_secret", "label": "App Secret", "type": "secret"},
        {"name": "dropbox_redirect_uri", "label": "Redirect URI", "type": "text"},
    ],
    "outlook": [
        {"name": "outlook_client_id", "label": "Client ID", "type": "text"},
        {"name": "outlook_client_secret", "label": "Client Secret", "type": "secret"},
        {"name": "outlook_redirect_uri", "label": "Redirect URI", "type": "text"},
    ],
    "usps": [
        {"name": "usps_user_id", "label": "User ID", "type": "text"},
    ],
    "anthropic": [
        {"name": "anthropic_api_key", "label": "API Key", "type": "secret"},
    ],
    "openai": [
        {"name": "openai_api_key", "label": "API Key", "type": "secret"},
    ],
    "nvidia": [
        {"name": "nvidia_api_key", "label": "API Key", "type": "secret"},
    ],
    "attom": [
        {"name": "attom_api_key", "label": "API Key", "type": "secret"},
    ],
    "telegram": [
        {"name": "telegram_bot_token", "label": "Bot Token", "type": "secret"},
        {"name": "telegram_chat_id", "label": "Chat ID", "type": "text"},
    ],
    "hud_pdr": [
        {"name": "hud_api_key", "label": "HUD PD&R API Key (JWT)", "type": "secret"},
    ],
}
