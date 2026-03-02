"""Storage service — save generated contracts to Google Drive or Dropbox.

Uses httpx only (no SDK packages).

Folder structure:
    {Company Name}/{Homeowner Name}/Contracts/{filename}.docx
"""

from __future__ import annotations

import base64
import json
import logging

import httpx

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# Google Drive
# ═══════════════════════════════════════════════════════════════

_GD_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_GD_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"


async def _gd_find_or_create_folder(
    name: str, parent_id: str | None, headers: dict, client: httpx.AsyncClient
) -> str:
    """Find an existing folder or create one under *parent_id*."""
    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"

    resp = await client.get(
        _GD_FILES_URL,
        params={"q": query, "fields": "files(id,name)", "spaces": "drive"},
        headers=headers,
    )
    resp.raise_for_status()
    files = resp.json().get("files", [])

    if files:
        return files[0]["id"]

    # Create the folder
    metadata: dict = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    if parent_id:
        metadata["parents"] = [parent_id]

    resp = await client.post(
        _GD_FILES_URL,
        json=metadata,
        headers={**headers, "Content-Type": "application/json"},
    )
    resp.raise_for_status()
    return resp.json()["id"]


async def save_to_google_drive(
    file_content_base64: str,
    file_name: str,
    company_name: str,
    homeowner_name: str,
    settings,
) -> dict:
    """Upload a .docx to Google Drive inside ``{company}/{homeowner}/Contracts/``.

    Returns ``{"file_id": ..., "web_view_link": ...}``.
    """
    access_token = getattr(settings, "google_drive_access_token", "")
    if not access_token:
        raise ValueError("Google Drive access token is not configured")

    headers = {"Authorization": f"Bearer {access_token}"}
    file_bytes = base64.b64decode(file_content_base64)

    async with httpx.AsyncClient(timeout=60) as client:
        # Build folder hierarchy
        company_folder_id = await _gd_find_or_create_folder(
            company_name, None, headers, client
        )
        homeowner_folder_id = await _gd_find_or_create_folder(
            homeowner_name, company_folder_id, headers, client
        )
        contracts_folder_id = await _gd_find_or_create_folder(
            "Contracts", homeowner_folder_id, headers, client
        )

        # Upload file (multipart upload)
        metadata = json.dumps(
            {"name": file_name, "parents": [contracts_folder_id]}
        )
        resp = await client.post(
            f"{_GD_UPLOAD_URL}?uploadType=multipart&fields=id,webViewLink",
            content=_build_multipart_body(metadata, file_bytes, file_name),
            headers={
                **headers,
                "Content-Type": "multipart/related; boundary=docboundary",
            },
        )
        resp.raise_for_status()
        data = resp.json()

    return {
        "file_id": data.get("id", ""),
        "web_view_link": data.get("webViewLink", ""),
    }


def _build_multipart_body(metadata_json: str, file_bytes: bytes, file_name: str) -> bytes:
    """Build a multipart/related body for the Drive upload API."""
    boundary = b"docboundary"
    parts = (
        b"--" + boundary + b"\r\n"
        b"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        + metadata_json.encode() + b"\r\n"
        b"--" + boundary + b"\r\n"
        b"Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n"
        + file_bytes + b"\r\n"
        b"--" + boundary + b"--"
    )
    return parts


# ═══════════════════════════════════════════════════════════════
# Dropbox
# ═══════════════════════════════════════════════════════════════

_DB_UPLOAD_URL = "https://content.dropboxapi.com/2/files/upload"
_DB_SHARING_URL = "https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings"


async def save_to_dropbox(
    file_content_base64: str,
    file_name: str,
    company_name: str,
    homeowner_name: str,
    settings,
) -> dict:
    """Upload a .docx to Dropbox at ``/{company}/{homeowner}/Contracts/{filename}``.

    Returns ``{"path_display": ..., "sharing_url": ...}``.
    """
    access_token = getattr(settings, "dropbox_access_token", "")
    if not access_token:
        raise ValueError("Dropbox access token is not configured")

    path = f"/{company_name}/{homeowner_name}/Contracts/{file_name}"
    file_bytes = base64.b64decode(file_content_base64)

    async with httpx.AsyncClient(timeout=60) as client:
        # Upload
        upload_resp = await client.post(
            _DB_UPLOAD_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Dropbox-API-Arg": json.dumps({
                    "path": path,
                    "mode": "add",
                    "autorename": True,
                }),
                "Content-Type": "application/octet-stream",
            },
            content=file_bytes,
        )
        upload_resp.raise_for_status()
        upload_data = upload_resp.json()

        # Create sharing link
        sharing_url = ""
        try:
            share_resp = await client.post(
                _DB_SHARING_URL,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={"path": upload_data.get("path_display", path)},
            )
            if share_resp.status_code == 200:
                sharing_url = share_resp.json().get("url", "")
            elif share_resp.status_code == 409:
                # Link already exists
                body = share_resp.json()
                sharing_url = (
                    body.get("error", {})
                    .get("shared_link_already_exists", {})
                    .get("metadata", {})
                    .get("url", "")
                )
        except Exception:
            logger.warning("Failed to create Dropbox sharing link for %s", path)

    return {
        "path_display": upload_data.get("path_display", path),
        "sharing_url": sharing_url,
    }
