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
        {"name": "stripe_starter_monthly_price_id", "label": "Starter Monthly Price ID", "type": "text"},
        {"name": "stripe_starter_annual_price_id", "label": "Starter Annual Price ID", "type": "text"},
        {"name": "stripe_pro_monthly_price_id", "label": "Pro Monthly Price ID", "type": "text"},
        {"name": "stripe_pro_annual_price_id", "label": "Pro Annual Price ID", "type": "text"},
        {"name": "stripe_team_monthly_price_id", "label": "Team Monthly Price ID", "type": "text"},
        {"name": "stripe_team_annual_price_id", "label": "Team Annual Price ID", "type": "text"},
    ],
    "stripe_connect": [
        {"name": "stripe_connect_secret_key", "label": "Connect Secret Key", "type": "secret"},
        {"name": "stripe_connect_account_id", "label": "Connect Account ID", "type": "text"},
        {"name": "stripe_connect_publishable_key", "label": "Connect Publishable Key", "type": "text"},
        {"name": "stripe_platform_account_id", "label": "Platform Account ID", "type": "text"},
        {"name": "tphs_admin_email", "label": "TPHS Admin Email", "type": "text"},
    ],
    "paypal": [
        {"name": "paypal_client_id", "label": "Client ID", "type": "text"},
        {"name": "paypal_client_secret", "label": "Client Secret", "type": "secret"},
        {"name": "paypal_webhook_id", "label": "Webhook ID", "type": "text"},
        {"name": "paypal_mode", "label": "Mode", "type": "text"},
        {"name": "paypal_starter_monthly_plan_id", "label": "Starter Monthly Plan ID", "type": "text"},
        {"name": "paypal_starter_annual_plan_id", "label": "Starter Annual Plan ID", "type": "text"},
        {"name": "paypal_pro_monthly_plan_id", "label": "Pro Monthly Plan ID", "type": "text"},
        {"name": "paypal_pro_annual_plan_id", "label": "Pro Annual Plan ID", "type": "text"},
        {"name": "paypal_team_monthly_plan_id", "label": "Team Monthly Plan ID", "type": "text"},
        {"name": "paypal_team_annual_plan_id", "label": "Team Annual Plan ID", "type": "text"},
    ],
    "plaid": [
        {"name": "plaid_client_id", "label": "Client ID", "type": "text"},
        {"name": "plaid_secret", "label": "Secret", "type": "secret"},
        {"name": "plaid_env", "label": "Environment", "type": "text"},
    ],
    "twilio": [
        {"name": "twilio_account_sid", "label": "Account SID", "type": "text"},
        {"name": "twilio_auth_token", "label": "Auth Token", "type": "secret"},
        {"name": "twilio_api_key_sid", "label": "API Key SID", "type": "text"},
        {"name": "twilio_api_key_secret", "label": "API Key Secret", "type": "secret"},
        {"name": "twilio_twiml_app_sid", "label": "TwiML App SID", "type": "text"},
        {"name": "twilio_whatsapp_from_number", "label": "WhatsApp From Number", "type": "text"},
        {"name": "twilio_whatsapp_to_number", "label": "WhatsApp Admin Number", "type": "text"},
    ],
    "elevenlabs": [
        {"name": "elevenlabs_api_key", "label": "API Key", "type": "secret"},
    ],
    "sendgrid": [
        {"name": "sendgrid_api_key", "label": "API Key", "type": "secret"},
        {"name": "sendgrid_webhook_secret", "label": "Webhook Verification Key", "type": "secret"},
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
    "google_maps": [
        {"name": "google_maps_api_key", "label": "API Key", "type": "secret"},
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
        {"name": "outlook_client_id", "label": "Application (Client) ID", "type": "text"},
        {"name": "outlook_client_secret", "label": "Client Secret", "type": "secret"},
        {"name": "outlook_redirect_uri", "label": "Redirect URI", "type": "text"},
    ],
    "usps": [
        {"name": "usps_client_id", "label": "Consumer Key (Client ID)", "type": "text"},
        {"name": "usps_client_secret", "label": "Consumer Secret (Client Secret)", "type": "secret"},
        {"name": "usps_api_url", "label": "API Base URL", "type": "text"},
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
    "thanks_io": [
        {"name": "thanks_io_api_key", "label": "API Key", "type": "secret"},
    ],
    "lob": [
        {"name": "lob_api_key", "label": "API Key (test_ or live_)", "type": "secret"},
    ],
    "attom": [
        {"name": "attom_api_key", "label": "API Key", "type": "secret"},
    ],
    "hud_pdr": [
        {"name": "hud_api_key", "label": "HUD PD&R API Key (JWT)", "type": "secret"},
    ],
    "telegram": [
        {"name": "telegram_bot_token", "label": "Bot Token", "type": "secret"},
        {"name": "telegram_chat_id", "label": "Chat ID", "type": "text"},
    ],
    "slack": [
        {"name": "slack_webhook_url", "label": "Incoming Webhook URL", "type": "secret"},
    ],
    # ── Free API Integrations ──────────────────────────────────────────
    "openweathermap": [
        {"name": "openweathermap_api_key", "label": "API Key", "type": "secret"},
    ],
    "census_bureau": [
        {"name": "census_bureau_api_key", "label": "API Key", "type": "secret"},
    ],
    "fbi_crime_data": [
        {"name": "fbi_crime_api_key", "label": "API Key", "type": "secret"},
    ],
    "adzuna": [
        {"name": "adzuna_app_id", "label": "Application ID", "type": "text"},
        {"name": "adzuna_api_key", "label": "API Key", "type": "secret"},
    ],
    "abstract_email": [
        {"name": "abstract_email_api_key", "label": "API Key", "type": "secret"},
    ],
    "numverify": [
        {"name": "numverify_api_key", "label": "API Key", "type": "secret"},
    ],
    "square": [
        {"name": "square_access_token", "label": "Access Token", "type": "secret"},
        {"name": "square_application_id", "label": "Application ID", "type": "text"},
        {"name": "square_location_id", "label": "Location ID", "type": "text"},
    ],
    "frankfurter": [],  # No auth required — included for completeness
    # ── Social Media OAuth (admin creates the developer app, users connect their accounts) ──
    "facebook_oauth": [
        {"name": "facebook_app_id", "label": "App ID", "type": "text"},
        {"name": "facebook_app_secret", "label": "App Secret", "type": "secret"},
        {"name": "facebook_redirect_uri", "label": "Redirect URI", "type": "text"},
    ],
    "linkedin_oauth": [
        {"name": "linkedin_client_id", "label": "Client ID", "type": "text"},
        {"name": "linkedin_client_secret", "label": "Client Secret", "type": "secret"},
        {"name": "linkedin_redirect_uri", "label": "Redirect URI", "type": "text"},
    ],
    "x_twitter_oauth": [
        {"name": "x_twitter_client_id", "label": "Client ID", "type": "text"},
        {"name": "x_twitter_client_secret", "label": "Client Secret", "type": "secret"},
        {"name": "x_twitter_redirect_uri", "label": "Redirect URI", "type": "text"},
    ],
    "instagram_oauth": [],  # Uses same Facebook app — no extra credentials needed
    # ── Vector Database ──────────────────────────────────────────────────
    "qdrant": [
        {"name": "qdrant_url", "label": "Qdrant URL", "type": "text"},
        {"name": "qdrant_api_key", "label": "API Key (optional for local)", "type": "secret"},
    ],
}
