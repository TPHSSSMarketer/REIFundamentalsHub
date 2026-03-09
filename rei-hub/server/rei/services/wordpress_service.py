"""Service for managing WordPress user integrations — encrypt/decrypt/store/retrieve credentials."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import get_settings
from rei.models.user_integrations import UserWordPressIntegration
from rei.services.ai_service import decrypt_api_key, encrypt_api_key

logger = logging.getLogger(__name__)


def _get_encryption_secret() -> str:
    """Return the encryption key from settings.

    Falls back to jwt_secret if ai_encryption_key is not set.
    """
    settings = get_settings()
    return settings.ai_encryption_key or settings.jwt_secret


async def save_wordpress_credentials(
    db: AsyncSession,
    user_id: int,
    wp_url: str,
    wp_username: str,
    wp_app_password: str,
) -> UserWordPressIntegration:
    """Encrypt and save (upsert) WordPress credentials for a user."""
    secret = _get_encryption_secret()

    # Encrypt each credential
    wp_url_enc = encrypt_api_key(wp_url, secret)
    wp_username_enc = encrypt_api_key(wp_username, secret)
    wp_password_enc = encrypt_api_key(wp_app_password, secret)

    # Check if user already has WordPress credentials
    result = await db.execute(
        select(UserWordPressIntegration).where(
            UserWordPressIntegration.user_id == user_id
        )
    )
    row = result.scalar_one_or_none()

    if row:
        # Update existing
        row.wp_url_encrypted = wp_url_enc
        row.wp_username_encrypted = wp_username_enc
        row.wp_app_password_encrypted = wp_password_enc
        row.configured_at = datetime.utcnow()
        row.updated_at = datetime.utcnow()
    else:
        # Create new
        row = UserWordPressIntegration(
            user_id=user_id,
            wp_url_encrypted=wp_url_enc,
            wp_username_encrypted=wp_username_enc,
            wp_app_password_encrypted=wp_password_enc,
            configured_at=datetime.utcnow(),
        )
        db.add(row)

    await db.commit()
    await db.refresh(row)
    return row


async def get_wordpress_credentials(
    db: AsyncSession,
    user_id: int,
) -> Optional[dict[str, str]]:
    """Fetch and decrypt WordPress credentials for a user.

    Returns None if the user has not configured WordPress.
    Returns a dict with keys: wp_url, wp_username, wp_app_password.
    """
    result = await db.execute(
        select(UserWordPressIntegration).where(
            UserWordPressIntegration.user_id == user_id
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return None

    secret = _get_encryption_secret()

    try:
        return {
            "wp_url": decrypt_api_key(row.wp_url_encrypted, secret),
            "wp_username": decrypt_api_key(row.wp_username_encrypted, secret),
            "wp_app_password": decrypt_api_key(row.wp_app_password_encrypted, secret),
        }
    except Exception as e:
        logger.error(f"Failed to decrypt WordPress credentials for user {user_id}: {e}")
        return None


async def delete_wordpress_credentials(
    db: AsyncSession,
    user_id: int,
) -> bool:
    """Delete WordPress credentials for a user. Returns True if found and deleted."""
    result = await db.execute(
        select(UserWordPressIntegration).where(
            UserWordPressIntegration.user_id == user_id
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return False
    await db.delete(row)
    await db.commit()
    return True


async def has_wordpress_credentials(
    db: AsyncSession,
    user_id: int,
) -> bool:
    """Check if user has WordPress credentials configured."""
    result = await db.execute(
        select(UserWordPressIntegration.id).where(
            UserWordPressIntegration.user_id == user_id
        )
    )
    return result.scalar_one_or_none() is not None
