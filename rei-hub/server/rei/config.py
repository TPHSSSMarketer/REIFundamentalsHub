"""Application settings — reads from .env with REI_ prefix."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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

    model_config = SettingsConfigDict(env_file=".env", env_prefix="REI_")


@lru_cache
def get_settings() -> Settings:
    return Settings()
