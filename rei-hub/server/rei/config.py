"""Application settings — reads from .env with REI_ prefix."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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


class Settings(BaseSettings):
    database_url: str = "sqlite+aiosqlite:///./rei_hub.db"
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 1440
    cors_origins: str = "http://localhost:3000"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"
    plugin_shared_secret: str = "change-me-in-production"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="REI_")


@lru_cache
def get_settings() -> Settings:
    return Settings()
