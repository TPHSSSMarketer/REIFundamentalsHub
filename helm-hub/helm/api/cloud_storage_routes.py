"""Cloud Storage API routes — Google Drive and Dropbox OAuth + upload.

Mounted at: /api/cloud-storage
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from helm.api.middleware import get_current_user

logger = logging.getLogger(__name__)

cloud_storage_router = APIRouter(
    prefix="/cloud-storage",
    tags=["cloud-storage"],
)


class UploadRequest(BaseModel):
    filename: str
    content: str
    mime_type: Optional[str] = None


# ── Status ──────────────────────────────────────────────────────────────────


@cloud_storage_router.get("/status", dependencies=[Depends(get_current_user)])
async def cloud_storage_status():
    """Return connection status for all cloud storage providers."""
    from helm.integrations.cloud_storage import is_dropbox_connected, is_google_drive_connected

    return {
        "google_drive": is_google_drive_connected(),
        "dropbox": is_dropbox_connected(),
    }


# ── Google Drive ────────────────────────────────────────────────────────────


@cloud_storage_router.get("/google-drive/connect", dependencies=[Depends(get_current_user)])
async def google_drive_connect():
    """Return the Google Drive OAuth2 authorization URL."""
    from helm.integrations.cloud_storage import (
        GOOGLE_DRIVE_CLIENT_ID,
        GOOGLE_DRIVE_CLIENT_SECRET,
        GOOGLE_DRIVE_REDIRECT_URI,
        get_google_auth_url,
    )

    if not GOOGLE_DRIVE_CLIENT_ID or not GOOGLE_DRIVE_CLIENT_SECRET or not GOOGLE_DRIVE_REDIRECT_URI:
        return {"error": "Google Drive not configured"}
    return {"auth_url": get_google_auth_url()}


@cloud_storage_router.get("/google-drive/callback", dependencies=[Depends(get_current_user)])
async def google_drive_callback(code: str):
    """Exchange the Google OAuth2 authorization code for tokens."""
    from helm.integrations.cloud_storage import exchange_google_code

    try:
        result = await exchange_google_code(code)
        return result
    except Exception as exc:
        logger.error("Google Drive OAuth exchange failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


# ── Dropbox ─────────────────────────────────────────────────────────────────


@cloud_storage_router.get("/dropbox/connect", dependencies=[Depends(get_current_user)])
async def dropbox_connect():
    """Return the Dropbox OAuth2 authorization URL."""
    from helm.integrations.cloud_storage import (
        DROPBOX_APP_KEY,
        DROPBOX_APP_SECRET,
        DROPBOX_REDIRECT_URI,
        get_dropbox_auth_url,
    )

    if not DROPBOX_APP_KEY or not DROPBOX_APP_SECRET or not DROPBOX_REDIRECT_URI:
        return {"error": "Dropbox not configured"}
    return {"auth_url": get_dropbox_auth_url()}


@cloud_storage_router.get("/dropbox/callback", dependencies=[Depends(get_current_user)])
async def dropbox_callback(code: str):
    """Exchange the Dropbox authorization code for an access token."""
    from helm.integrations.cloud_storage import exchange_dropbox_code

    try:
        result = await exchange_dropbox_code(code)
        return result
    except Exception as exc:
        logger.error("Dropbox OAuth exchange failed: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


# ── Upload ──────────────────────────────────────────────────────────────────


@cloud_storage_router.post("/upload", dependencies=[Depends(get_current_user)])
async def cloud_storage_upload(req: UploadRequest):
    """Upload a file to all connected cloud storage providers."""
    from helm.integrations.cloud_storage import upload_to_all_connected

    result = await upload_to_all_connected(req.filename, req.content)
    return result
