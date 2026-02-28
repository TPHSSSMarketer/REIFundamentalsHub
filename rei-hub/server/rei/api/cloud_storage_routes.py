"""Cloud storage OAuth routes — Google Drive and Dropbox."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import User

settings = get_settings()
cloud_storage_router = APIRouter(prefix="/cloud-storage", tags=["cloud-storage"])


# ── Google Drive OAuth ───────────────────────────────────────────────────────


@cloud_storage_router.get("/google-drive/auth-url")
async def google_drive_auth_url():
    """Return Google Drive OAuth consent URL."""
    import urllib.parse

    params = {
        "client_id": settings.google_drive_client_id,
        "redirect_uri": settings.google_drive_redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive.file",
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    return {"url": auth_url}


@cloud_storage_router.post("/google-drive/callback")
async def google_drive_callback(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange Google Drive auth code for tokens and save to user."""
    code = body.get("code")
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing authorization code",
        )

    token_data = {
        "client_id": settings.google_drive_client_id,
        "client_secret": settings.google_drive_client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": settings.google_drive_redirect_uri,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post("https://oauth2.googleapis.com/token", data=token_data) as resp:
            if resp.status != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to exchange authorization code",
                )
            tokens = await resp.json()

    current_user.google_drive_token = json.dumps(tokens)
    current_user.google_drive_connected = True
    await db.commit()

    return {"status": "connected"}


@cloud_storage_router.post("/google-drive/disconnect")
async def google_drive_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Google Drive and clear tokens."""
    current_user.google_drive_token = None
    current_user.google_drive_connected = False
    await db.commit()

    return {"status": "disconnected"}


@cloud_storage_router.get("/google-drive/status")
async def google_drive_status(current_user: User = Depends(get_current_user)):
    """Check if Google Drive is connected."""
    return {"connected": current_user.google_drive_connected}


# ── Dropbox OAuth ───────────────────────────────────────────────────────────


@cloud_storage_router.get("/dropbox/auth-url")
async def dropbox_auth_url():
    """Return Dropbox OAuth consent URL."""
    import urllib.parse

    params = {
        "client_id": settings.dropbox_app_key,
        "redirect_uri": settings.dropbox_redirect_uri,
        "response_type": "code",
        "state": "oauth2_state",
    }
    auth_url = "https://www.dropbox.com/oauth2/authorize?" + urllib.parse.urlencode(params)
    return {"url": auth_url}


@cloud_storage_router.post("/dropbox/callback")
async def dropbox_callback(
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange Dropbox auth code for tokens and save to user."""
    code = body.get("code")
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing authorization code",
        )

    token_data = {
        "client_id": settings.dropbox_app_key,
        "client_secret": settings.dropbox_app_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": settings.dropbox_redirect_uri,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post("https://api.dropboxapi.com/oauth2/token", data=token_data) as resp:
            if resp.status != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to exchange authorization code",
                )
            tokens = await resp.json()

    current_user.dropbox_token = json.dumps(tokens)
    current_user.dropbox_connected = True
    await db.commit()

    return {"status": "connected"}


@cloud_storage_router.post("/dropbox/disconnect")
async def dropbox_disconnect(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect Dropbox and clear tokens."""
    current_user.dropbox_token = None
    current_user.dropbox_connected = False
    await db.commit()

    return {"status": "disconnected"}


@cloud_storage_router.get("/dropbox/status")
async def dropbox_status(current_user: User = Depends(get_current_user)):
    """Check if Dropbox is connected."""
    return {"connected": current_user.dropbox_connected}
