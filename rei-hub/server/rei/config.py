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
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_starter_monthly_price_id: str = ""
    stripe_starter_annual_price_id: str = ""
    stripe_pro_monthly_price_id: str = ""
    stripe_pro_annual_price_id: str = ""
    stripe_team_monthly_price_id: str = ""
    stripe_team_annual_price_id: str = ""
    stripe_starter_addon_monthly_price_id: str = ""
    stripe_starter_addon_annual_price_id: str = ""
    stripe_pro_addon_monthly_price_id: str = ""
    stripe_pro_addon_annual_price_id: str = ""
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_mode: str = "sandbox"
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    paypal_starter_monthly_plan_id: str = ""
    paypal_starter_annual_plan_id: str = ""
    paypal_pro_monthly_plan_id: str = ""
    paypal_pro_annual_plan_id: str = ""
    paypal_team_monthly_plan_id: str = ""
    paypal_team_annual_plan_id: str = ""
    paypal_starter_addon_monthly_plan_id: str = ""
    paypal_starter_addon_annual_plan_id: str = ""
    paypal_pro_addon_monthly_plan_id: str = ""
    paypal_pro_addon_annual_plan_id: str = ""
    plugin_shared_secret: str = "change-me-in-production"
    rei_hub_url: str = "http://localhost:5173"
    sendgrid_api_key: str = ""
    email_from: str = "noreply@reifundamentalshub.com"
    email_from_name: str = "REIFundamentals Hub"

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
        "helm_addon_monthly_cents": 4900,
        "helm_addon_annual_cents": 49000,
    },
    "pro": {
        "name": "Pro",
        "monthly_price_cents": 15000,
        "annual_price_cents": 150000,
        "stripe_monthly_price_id": "",
        "stripe_annual_price_id": "",
        "paypal_monthly_plan_id": "",
        "paypal_annual_plan_id": "",
        "max_seats": 3,
        "features": [
            "dashboard", "pipeline", "contacts", "markets", "portfolio",
            "content_hub", "wordpress_publish", "cloud_sync",
            "assistant_hub", "csv_export",
        ],
        "helm_addon_monthly_cents": 7900,
        "helm_addon_annual_cents": 79000,
    },
    "team": {
        "name": "Team",
        "monthly_price_cents": 25000,
        "annual_price_cents": 250000,
        "stripe_monthly_price_id": "",
        "stripe_annual_price_id": "",
        "paypal_monthly_plan_id": "",
        "paypal_annual_plan_id": "",
        "max_seats": 999,
        "features": [
            "dashboard", "pipeline", "contacts", "markets", "portfolio",
            "content_hub", "wordpress_publish", "cloud_sync",
            "assistant_hub", "csv_export", "priority_support", "helm_hub",
        ],
        "helm_addon_monthly_cents": 0,
        "helm_addon_annual_cents": 0,
    },
}

TRIAL_DAYS = 7


# ── Helpers to resolve Stripe price IDs from settings ──────────────────


def get_plan_price_id(plan: str, interval: str, settings: Settings) -> str:
    """Return the Stripe price ID for a given plan + interval."""
    key = f"stripe_{plan}_{interval}_price_id"
    return getattr(settings, key, "")


def get_addon_price_id(plan: str, interval: str, settings: Settings) -> str:
    """Return the Stripe addon price ID for a given plan + interval."""
    key = f"stripe_{plan}_addon_{interval}_price_id"
    return getattr(settings, key, "")


# ── Helpers to resolve PayPal plan IDs from settings ───────────────────


def get_paypal_plan_id(plan: str, interval: str, settings: Settings) -> str:
    """Return the PayPal plan ID for a given plan + interval."""
    key = f"paypal_{plan}_{interval}_plan_id"
    return getattr(settings, key, "")


def get_paypal_addon_plan_id(plan: str, interval: str, settings: Settings) -> str:
    """Return the PayPal addon plan ID for a given plan + interval."""
    key = f"paypal_{plan}_addon_{interval}_plan_id"
    return getattr(settings, key, "")
