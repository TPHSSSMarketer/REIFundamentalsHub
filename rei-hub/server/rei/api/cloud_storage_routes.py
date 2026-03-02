"""Cloud storage OAuth routes — Google Drive and Dropbox."""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import aiohttp
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import User

settings = get_settings()
cloud_storage_router = APIRouter(prefix="/cloud-storage", tags=["cloud-storage"])


# ---- Google Drive ----

@cloud_storage_router.get("/google-drive/auth-url")
async def google_drive_auth_url(user: User = Depends(get_current_user)):
    """Return the Google OAuth2 authorization URL the frontend should redirect to."""
    from urllib.parse import urlencode

    params = {
        "client_id": settings.google_drive_client_id,
        "redirect_uri": settings.google_drive_redirect_uri,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive.file",
        "access_type": "offline",
        "prompt": "consent",
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return {"auth_url": url}


@cloud_storage_router.post("/google-drive/callback")
async def google_drive_callback(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange the authorization code for tokens and persist them."""
    code = payload.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_drive_client_id,
                "client_secret": settings.google_drive_client_secret,
                "redirect_uri": settings.google_drive_redirect_uri,
                "grant_type": "authorization_code",
            },
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise HTTPException(status_code=400, detail=f"Token exchange failed: {body}")
            tokens = await resp.json()

    cloud = json.loads(user.cloud_storage_settings or "{}")
    cloud["google_drive"] = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", cloud.get("google_drive", {}).get("refresh_token", "")),
        "expires_at": (datetime.utcnow() + timedelta(seconds=tokens.get("expires_in", 3600))).isoformat(),
        "connected": True,
    }
    user.cloud_storage_settings = json.dumps(cloud)
    await db.commit()
    return {"status": "connected"}


@cloud_storage_router.post("/google-drive/disconnect")
async def google_drive_disconnect(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cloud = json.loads(user.cloud_storage_settings or "{}")
    cloud.pop("google_drive", None)
    user.cloud_storage_settings = json.dumps(cloud)
    await db.commit()
    return {"status": "disconnected"}


@cloud_storage_router.get("/google-drive/status")
async def google_drive_status(user: User = Depends(get_current_user)):
    cloud = json.loads(user.cloud_storage_settings or "{}")
    gd = cloud.get("google_drive", {})
    return {"connected": gd.get("connected", False)}


@cloud_storage_router.get("/google-drive/oauth-redirect")
async def google_drive_oauth_redirect(code: str = Query(None), error: str = Query(None)):
    """Server-side OAuth redirect: Google sends user here, we redirect to frontend."""
    import urllib.parse
    if error:
        return RedirectResponse(
            url="https://hub.reifundamentalshub.com/settings?drive_error=" + urllib.parse.quote(error)
        )
    if not code:
        return RedirectResponse(
            url="https://hub.reifundamentalshub.com/settings?drive_error=no_code"
        )
    return RedirectResponse(
        url="https://hub.reifundamentalshub.com/settings?drive_code=" + urllib.parse.quote(code)
    )


# ---- Dropbox ----

@cloud_storage_router.get("/dropbox/auth-url")
async def dropbox_auth_url(user: User = Depends(get_current_user)):
    """Return the Dropbox OAuth2 authorization URL."""
    from urllib.parse import urlencode

    params = {
        "client_id": settings.dropbox_app_key,
        "redirect_uri": settings.dropbox_redirect_uri,
        "response_type": "code",
        "token_access_type": "offline",
    }
    url = "https://www.dropbox.com/oauth2/authorize?" + urlencode(params)
    return {"auth_url": url}


@cloud_storage_router.post("/dropbox/callback")
async def dropbox_callback(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange the Dropbox authorization code for tokens."""
    code = payload.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "code": code,
                "grant_type": "authorization_code",
                "client_id": settings.dropbox_app_key,
                "client_secret": settings.dropbox_app_secret,
                "redirect_uri": settings.dropbox_redirect_uri,
            },
        ) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise HTTPException(status_code=400, detail=f"Token exchange failed: {body}")
            tokens = await resp.json()

    cloud = json.loads(user.cloud_storage_settings or "{}")
    cloud["dropbox"] = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_at": (datetime.utcnow() + timedelta(seconds=tokens.get("expires_in", 14400))).isoformat(),
        "connected": True,
    }
    user.cloud_storage_settings = json.dumps(cloud)
    await db.commit()
    return {"status": "connected"}


@cloud_storage_router.post("/dropbox/disconnect")
async def dropbox_disconnect(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cloud = json.loads(user.cloud_storage_settings or "{}")
    cloud.pop("dropbox", None)
    user.cloud_storage_settings = json.dumps(cloud)
    await db.commit()
    return {"status": "disconnected"}


@cloud_storage_router.get("/dropbox/status")
async def dropbox_status(user: User = Depends(get_current_user)):
    cloud = json.loads(user.cloud_storage_settings or "{}")
    db_info = cloud.get("dropbox", {})
    return {"connected": db_info.get("connected", False)}


@cloud_storage_router.get("/dropbox/oauth-redirect")
async def dropbox_oauth_redirect(code: str = Query(None), error: str = Query(None)):
    """Server-side OAuth redirect: Dropbox sends user here, we redirect to frontend."""
    import urllib.parse
    if error:
        return RedirectResponse(
            url="https://hub.reifundamentalshub.com/settings?dropbox_error=" + urllib.parse.quote(error)
        )
    if not code:
        return RedirectResponse(
            url="https://hub.reifundamentalshub.com/settings?dropbox_error=no_code"
        )
    return RedirectResponse(
        url="https://hub.reifundamentalshub.com/settings?dropbox_code=" + urllib.parse.quote(code)
    )
