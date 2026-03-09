"""User integrations API routes — WordPress and other per-user integrations."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.user import User
from rei.services.wordpress_service import (
    delete_wordpress_credentials,
    get_wordpress_credentials,
    has_wordpress_credentials,
    save_wordpress_credentials,
)

logger = logging.getLogger(__name__)
integrations_router = APIRouter(prefix="/integrations", tags=["integrations"])


# ── Schemas ───────────────────────────────────────────────────────────────


class WordPressCredentialsRequest(BaseModel):
    """Request to save WordPress credentials."""

    wp_url: str
    wp_username: str
    wp_app_password: str


class WordPressCredentialsResponse(BaseModel):
    """Response with decrypted WordPress credentials."""

    wp_url: str
    wp_username: str
    wp_app_password: str


class WordPressStatusResponse(BaseModel):
    """Response indicating if WordPress is configured."""

    configured: bool


# ── Endpoints ─────────────────────────────────────────────────────────────


@integrations_router.post("/wordpress")
async def save_wordpress_integration(
    body: WordPressCredentialsRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save encrypted WordPress credentials for the authenticated user."""
    if not body.wp_url or not body.wp_username or not body.wp_app_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="All WordPress credentials are required: wp_url, wp_username, wp_app_password",
        )

    try:
        await save_wordpress_credentials(
            db=db,
            user_id=user.id,
            wp_url=body.wp_url,
            wp_username=body.wp_username,
            wp_app_password=body.wp_app_password,
        )
        return {"status": "success", "message": "WordPress credentials saved securely."}
    except Exception as e:
        logger.error(f"Failed to save WordPress credentials for user {user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save WordPress credentials.",
        )


@integrations_router.get("/wordpress")
async def get_wordpress_integration(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WordPressCredentialsResponse:
    """Retrieve decrypted WordPress credentials for the authenticated user."""
    credentials = await get_wordpress_credentials(db=db, user_id=user.id)

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="WordPress credentials not configured.",
        )

    return WordPressCredentialsResponse(**credentials)


@integrations_router.get("/wordpress/status")
async def get_wordpress_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WordPressStatusResponse:
    """Check if WordPress is configured for the authenticated user (no credentials returned)."""
    configured = await has_wordpress_credentials(db=db, user_id=user.id)
    return WordPressStatusResponse(configured=configured)


@integrations_router.delete("/wordpress")
async def delete_wordpress_integration(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete WordPress credentials for the authenticated user."""
    deleted = await delete_wordpress_credentials(db=db, user_id=user.id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="WordPress credentials not found.",
        )

    return {"status": "success", "message": "WordPress credentials deleted."}
