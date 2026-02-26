"""Service layer for provider credentials — encrypt, decrypt, store, retrieve."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import get_settings
from rei.models.credentials import KNOWN_PROVIDERS, ProviderCredentials
from rei.services.ai_service import decrypt_api_key, encrypt_api_key, mask_api_key

logger = logging.getLogger(__name__)


def _get_encryption_secret() -> str:
    """Return the encryption key from settings.

    Falls back to jwt_secret if ai_encryption_key is not set.
    """
    settings = get_settings()
    return settings.ai_encryption_key or settings.jwt_secret


# ── Read ─────────────────────────────────────────────────────────────────


async def get_provider_credentials(
    db: AsyncSession,
    provider_name: str,
) -> Optional[dict[str, str]]:
    """Fetch and decrypt credentials for a provider.

    Returns None if the provider is not configured.
    Returns a dict of {field_name: decrypted_value}.
    """
    result = await db.execute(
        select(ProviderCredentials).where(
            ProviderCredentials.provider_name == provider_name
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return None

    secret = _get_encryption_secret()
    try:
        encrypted_config = json.loads(row.config_json)
    except json.JSONDecodeError:
        logger.warning("Corrupt config_json for provider %s", provider_name)
        return None

    # Decrypt each value
    decrypted: dict[str, str] = {}
    for key, enc_val in encrypted_config.items():
        decrypted[key] = decrypt_api_key(enc_val, secret) if enc_val else ""

    return decrypted


async def is_provider_configured(
    db: AsyncSession,
    provider_name: str,
) -> bool:
    """Quick check — does this provider have any credentials stored?"""
    result = await db.execute(
        select(ProviderCredentials.id).where(
            ProviderCredentials.provider_name == provider_name
        )
    )
    return result.scalar_one_or_none() is not None


# ── Write ────────────────────────────────────────────────────────────────


async def save_provider_credentials(
    db: AsyncSession,
    provider_name: str,
    config: dict[str, str],
    user_id: int,
) -> ProviderCredentials:
    """Encrypt and save (upsert) credentials for a provider."""
    secret = _get_encryption_secret()

    # Encrypt each non-empty value
    encrypted_config: dict[str, str] = {}
    for key, val in config.items():
        encrypted_config[key] = encrypt_api_key(val, secret) if val else ""

    # Upsert
    result = await db.execute(
        select(ProviderCredentials).where(
            ProviderCredentials.provider_name == provider_name
        )
    )
    row = result.scalar_one_or_none()

    if row:
        # Merge: keep existing encrypted values for fields not being updated
        try:
            existing = json.loads(row.config_json)
        except json.JSONDecodeError:
            existing = {}
        # Only overwrite fields that are present in the new config
        for key, val in encrypted_config.items():
            existing[key] = val
        row.config_json = json.dumps(existing)
        row.configured_at = datetime.utcnow()
        row.last_updated_by = user_id
        row.updated_at = datetime.utcnow()
    else:
        row = ProviderCredentials(
            provider_name=provider_name,
            config_json=json.dumps(encrypted_config),
            configured_at=datetime.utcnow(),
            last_updated_by=user_id,
        )
        db.add(row)

    await db.commit()
    await db.refresh(row)
    return row


# ── Delete ───────────────────────────────────────────────────────────────


async def delete_provider_credentials(
    db: AsyncSession,
    provider_name: str,
) -> bool:
    """Remove credentials for a provider. Returns True if found and deleted."""
    result = await db.execute(
        select(ProviderCredentials).where(
            ProviderCredentials.provider_name == provider_name
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return False
    await db.delete(row)
    await db.commit()
    return True


# ── Status listing ───────────────────────────────────────────────────────


async def get_all_credential_statuses(
    db: AsyncSession,
) -> list[dict]:
    """Return status info for all known providers.

    Returns a list of dicts with provider_name, configured, fields, etc.
    Never returns actual credential values.
    """
    # Fetch all stored credentials
    result = await db.execute(select(ProviderCredentials))
    rows = {row.provider_name: row for row in result.scalars().all()}

    statuses = []
    for provider_name, fields in KNOWN_PROVIDERS.items():
        row = rows.get(provider_name)
        configured = False
        last_updated = None
        configured_fields: dict[str, bool] = {}

        if row:
            last_updated = row.configured_at.isoformat() if row.configured_at else None
            try:
                enc_config = json.loads(row.config_json)
            except json.JSONDecodeError:
                enc_config = {}

            secret = _get_encryption_secret()
            for field in fields:
                fname = field["name"]
                enc_val = enc_config.get(fname, "")
                decrypted = decrypt_api_key(enc_val, secret) if enc_val else ""
                configured_fields[fname] = bool(decrypted)

            # Provider is "configured" if at least one required field is set
            configured = any(configured_fields.values())

        statuses.append({
            "provider_name": provider_name,
            "configured": configured,
            "last_updated": last_updated,
            "fields": fields,
            "configured_fields": configured_fields,
        })

    return statuses


# ── Connection testing ───────────────────────────────────────────────────


async def test_provider_connection(
    provider_name: str,
    config: dict[str, str],
) -> dict[str, str]:
    """Attempt a basic connectivity test for a provider.

    Returns {"status": "connected"} or {"status": "error", "message": "..."}.

    Currently returns placeholder results — real API tests will be added
    when Chris has credentials configured.
    """
    # For now, just verify the key fields are non-empty
    required_fields = {
        "stripe": ["stripe_secret_key"],
        "paypal": ["paypal_client_id", "paypal_client_secret"],
        "plaid": ["plaid_client_id", "plaid_secret"],
        "twilio": ["twilio_account_sid", "twilio_auth_token"],
        "elevenlabs": ["elevenlabs_api_key"],
        "sendgrid": ["sendgrid_api_key"],
        "resend": ["resend_api_key"],
        "google_calendar": ["google_client_id", "google_client_secret"],
        "outlook": ["outlook_client_id", "outlook_client_secret"],
        "usps": ["usps_user_id"],
        "anthropic": ["anthropic_api_key"],
        "openai": ["openai_api_key"],
        "nvidia": ["nvidia_api_key"],
    }

    needed = required_fields.get(provider_name, [])
    missing = [f for f in needed if not config.get(f)]

    if missing:
        return {
            "status": "error",
            "message": f"Missing required fields: {', '.join(missing)}",
        }

    # TODO: Add real API connectivity tests per provider
    # e.g. stripe.Account.retrieve(), twilio client.api.accounts.list(), etc.
    return {
        "status": "connected",
        "message": f"Credentials saved for {provider_name}. "
        "Live connection test will be available once the integration is active.",
    }
