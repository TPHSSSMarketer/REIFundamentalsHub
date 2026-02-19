"""Cloud Drive OAuth + Upload — Google Drive and Dropbox integration.

Optional integration for publishing content directly to cloud storage.
Feature is disabled if the relevant env vars are not set.

Token storage: data/cloud_tokens.json (simple JSON file).
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from urllib.parse import quote, urlencode

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Env Vars ────────────────────────────────────────────────────────────────

GOOGLE_DRIVE_CLIENT_ID: str | None = getattr(settings, "google_drive_client_id", None) or os.environ.get("GOOGLE_DRIVE_CLIENT_ID")
GOOGLE_DRIVE_CLIENT_SECRET: str | None = getattr(settings, "google_drive_client_secret", None) or os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET")
GOOGLE_DRIVE_REDIRECT_URI: str | None = getattr(settings, "google_drive_redirect_uri", None) or os.environ.get("GOOGLE_DRIVE_REDIRECT_URI")

DROPBOX_APP_KEY: str | None = os.environ.get("DROPBOX_APP_KEY")
DROPBOX_APP_SECRET: str | None = os.environ.get("DROPBOX_APP_SECRET")
DROPBOX_REDIRECT_URI: str | None = os.environ.get("DROPBOX_REDIRECT_URI")

# ── Token Storage ───────────────────────────────────────────────────────────

TOKEN_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "cloud_tokens.json"


def load_tokens() -> dict:
    """Load OAuth tokens from data/cloud_tokens.json."""
    if not TOKEN_FILE.exists():
        return {}
    try:
        return json.loads(TOKEN_FILE.read_text())
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read cloud tokens: %s", exc)
        return {}


def save_tokens(data: dict) -> None:
    """Save OAuth tokens to data/cloud_tokens.json."""
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_FILE.write_text(json.dumps(data, indent=2))


# ── Google Drive ────────────────────────────────────────────────────────────

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3"


def get_google_auth_url() -> str:
    """Return the Google OAuth2 authorization URL."""
    params = {
        "client_id": GOOGLE_DRIVE_CLIENT_ID,
        "redirect_uri": GOOGLE_DRIVE_REDIRECT_URI,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/drive.file",
        "access_type": "offline",
        "prompt": "consent",
    }
    return f"{GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"


async def exchange_google_code(code: str) -> dict:
    """Exchange an authorization code for Google Drive tokens."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(GOOGLE_TOKEN_ENDPOINT, data={
            "client_id": GOOGLE_DRIVE_CLIENT_ID,
            "client_secret": GOOGLE_DRIVE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": GOOGLE_DRIVE_REDIRECT_URI,
        })
        resp.raise_for_status()
        token_data = resp.json()

    tokens = load_tokens()
    tokens["google_drive"] = {
        "access_token": token_data["access_token"],
        "refresh_token": token_data.get("refresh_token", ""),
        "expires_at": time.time() + token_data.get("expires_in", 3600),
    }
    save_tokens(tokens)
    logger.info("Google Drive OAuth tokens saved")
    return {"status": "connected"}


async def upload_to_google_drive(
    filename: str,
    content: str,
    mime_type: str = "text/markdown",
) -> dict:
    """Upload a file to Google Drive root folder."""
    tokens = load_tokens()
    gd = tokens.get("google_drive")
    if not gd or not gd.get("access_token"):
        raise RuntimeError("Google Drive not connected — no stored token")

    access_token = gd["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}

    metadata = json.dumps({"name": filename})
    boundary = "helm_cloud_upload"
    body = (
        f"--{boundary}\r\n"
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{metadata}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: {mime_type}\r\n\r\n"
        f"{content}\r\n"
        f"--{boundary}--"
    ).encode()

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{GOOGLE_DRIVE_UPLOAD_API}/files",
            params={"uploadType": "multipart", "fields": "id,webViewLink"},
            headers={
                **headers,
                "Content-Type": f"multipart/related; boundary={boundary}",
            },
            content=body,
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "file_id": data.get("id", ""),
        "web_view_link": data.get("webViewLink", ""),
    }


def is_google_drive_connected() -> bool:
    """Return True if a valid Google Drive token exists."""
    tokens = load_tokens()
    gd = tokens.get("google_drive")
    return bool(gd and gd.get("access_token"))


# ── Dropbox ─────────────────────────────────────────────────────────────────

DROPBOX_AUTH_ENDPOINT = "https://www.dropbox.com/oauth2/authorize"
DROPBOX_TOKEN_ENDPOINT = "https://api.dropboxapi.com/oauth2/token"
DROPBOX_UPLOAD_ENDPOINT = "https://content.dropboxapi.com/2/files/upload"
DROPBOX_SHARING_ENDPOINT = "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings"


def get_dropbox_auth_url() -> str:
    """Return the Dropbox OAuth2 authorization URL."""
    params = {
        "client_id": DROPBOX_APP_KEY,
        "redirect_uri": DROPBOX_REDIRECT_URI,
        "response_type": "code",
        "token_access_type": "offline",
    }
    return f"{DROPBOX_AUTH_ENDPOINT}?{urlencode(params)}"


async def exchange_dropbox_code(code: str) -> dict:
    """Exchange an authorization code for a Dropbox access token."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(DROPBOX_TOKEN_ENDPOINT, data={
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": DROPBOX_REDIRECT_URI,
            "client_id": DROPBOX_APP_KEY,
            "client_secret": DROPBOX_APP_SECRET,
        })
        resp.raise_for_status()
        token_data = resp.json()

    tokens = load_tokens()
    tokens["dropbox"] = {
        "access_token": token_data["access_token"],
        "expires_at": time.time() + token_data.get("expires_in", 14400),
    }
    save_tokens(tokens)
    logger.info("Dropbox OAuth tokens saved")
    return {"status": "connected"}


async def upload_to_dropbox(filename: str, content: str) -> dict:
    """Upload a file to /HelmHub/ folder in Dropbox."""
    tokens = load_tokens()
    db = tokens.get("dropbox")
    if not db or not db.get("access_token"):
        raise RuntimeError("Dropbox not connected — no stored token")

    access_token = db["access_token"]
    path = f"/HelmHub/{filename}"

    dropbox_api_arg = json.dumps({
        "path": path,
        "mode": "overwrite",
        "autorename": True,
        "mute": False,
    })

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            DROPBOX_UPLOAD_ENDPOINT,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Dropbox-API-Arg": dropbox_api_arg,
                "Content-Type": "application/octet-stream",
            },
            content=content.encode(),
        )
        resp.raise_for_status()
        data = resp.json()

    file_path = data.get("path_display", path)

    # Try to create a shared link
    url = ""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            link_resp = await client.post(
                DROPBOX_SHARING_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={"path": file_path, "settings": {"requested_visibility": "public"}},
            )
            if link_resp.is_success:
                url = link_resp.json().get("url", "")
    except Exception:
        pass  # Sharing link is best-effort

    return {"path": file_path, "url": url}


def is_dropbox_connected() -> bool:
    """Return True if a valid Dropbox token exists."""
    tokens = load_tokens()
    db = tokens.get("dropbox")
    return bool(db and db.get("access_token"))


# ── Combined Upload ─────────────────────────────────────────────────────────


async def upload_to_all_connected(filename: str, content: str) -> dict:
    """Upload to all connected cloud storage backends.

    Returns results for each provider. Individual failures are caught
    and reported in the errors list so one failure doesn't block the other.
    """
    result: dict = {
        "google_drive": None,
        "dropbox": None,
        "errors": [],
    }

    if is_google_drive_connected():
        try:
            result["google_drive"] = await upload_to_google_drive(filename, content)
        except Exception as exc:
            result["errors"].append(f"Google Drive: {exc}")
            logger.error("Google Drive upload failed: %s", exc)

    if is_dropbox_connected():
        try:
            result["dropbox"] = await upload_to_dropbox(filename, content)
        except Exception as exc:
            result["errors"].append(f"Dropbox: {exc}")
            logger.error("Dropbox upload failed: %s", exc)

    return result
