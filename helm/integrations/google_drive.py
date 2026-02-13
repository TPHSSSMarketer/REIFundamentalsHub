"""Google Drive integration — OAuth2 file management for SaaS tenants.

Tier 1 storage backend.  Every SaaS customer gets this by default.
The AI can create, read, organize, and search files in the user's Drive.

OAuth2 flow:
  1. User clicks "Connect Google Drive" in dashboard
  2. Redirected to Google consent screen (scopes: drive.file)
  3. Callback stores refresh_token per tenant
  4. All API calls use the tenant's token

Security:
  - ``drive.file`` scope: only files created by Helm, not entire Drive
  - Upgrade to ``drive`` scope for full access (opt-in per tenant)
"""

from __future__ import annotations

import logging
from datetime import datetime
from urllib.parse import quote

import httpx

from helm.config import get_settings
from helm.integrations.file_manager import BackendType, FileBackend, FileInfo

logger = logging.getLogger(__name__)
settings = get_settings()

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3"
GOOGLE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"

# Scope levels
SCOPES_LIMITED = "https://www.googleapis.com/auth/drive.file"  # Only Helm-created files
SCOPES_FULL = "https://www.googleapis.com/auth/drive"  # Full Drive access


class GoogleDriveClient:
    """Google Drive API v3 client with OAuth2 token management."""

    backend_type = BackendType.GOOGLE_DRIVE

    def __init__(self) -> None:
        self._client_id = settings.google_drive_client_id
        self._client_secret = settings.google_drive_client_secret
        self._redirect_uri = settings.google_drive_redirect_uri
        # Per-tenant tokens would come from the database in production.
        # For personal use / dev, these can be set via env.
        self._access_token = settings.google_drive_access_token
        self._refresh_token = settings.google_drive_refresh_token

    @property
    def is_configured(self) -> bool:
        return bool(self._client_id and self._client_secret)

    @property
    def is_connected(self) -> bool:
        """True if we have a valid (or refreshable) access token."""
        return bool(self._access_token or self._refresh_token)

    # ── OAuth2 Flow ───────────────────────────────────────────────────────

    def get_auth_url(self, state: str = "", scope: str = SCOPES_LIMITED) -> str:
        """Generate the Google OAuth2 consent URL."""
        params = {
            "client_id": self._client_id,
            "redirect_uri": self._redirect_uri,
            "response_type": "code",
            "scope": scope,
            "access_type": "offline",  # Gets refresh_token
            "prompt": "consent",
            "state": state,
        }
        qs = "&".join(f"{k}={quote(str(v))}" for k, v in params.items())
        return f"{GOOGLE_AUTH_URL}?{qs}"

    async def exchange_code(self, code: str) -> dict:
        """Exchange authorization code for access + refresh tokens."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(GOOGLE_TOKEN_URL, data={
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": self._redirect_uri,
            })
            resp.raise_for_status()
            tokens = resp.json()
            self._access_token = tokens.get("access_token", "")
            self._refresh_token = tokens.get("refresh_token", self._refresh_token)
            logger.info("Google Drive OAuth tokens obtained")
            return tokens

    async def _refresh_access_token(self) -> None:
        """Refresh the access token using the stored refresh token."""
        if not self._refresh_token:
            raise ValueError("No refresh token available — re-authorize")
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(GOOGLE_TOKEN_URL, data={
                "client_id": self._client_id,
                "client_secret": self._client_secret,
                "refresh_token": self._refresh_token,
                "grant_type": "refresh_token",
            })
            resp.raise_for_status()
            tokens = resp.json()
            self._access_token = tokens["access_token"]
            logger.info("Google Drive access token refreshed")

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._access_token}"}

    async def _request(
        self,
        method: str,
        url: str,
        **kwargs,
    ) -> httpx.Response:
        """Make an authenticated request with automatic token refresh."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(method, url, headers=self._headers, **kwargs)
            if resp.status_code == 401 and self._refresh_token:
                await self._refresh_access_token()
                resp = await client.request(method, url, headers=self._headers, **kwargs)
            resp.raise_for_status()
            return resp

    # ── Helper: resolve folder path to ID ─────────────────────────────────

    async def _resolve_folder_id(self, path: str) -> str:
        """Walk a ``/folder/subfolder`` path and return the Google Drive folder ID."""
        parts = [p for p in path.strip("/").split("/") if p]
        parent_id = "root"
        for part in parts:
            q = (
                f"name = '{part}' and '{parent_id}' in parents "
                f"and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
            )
            resp = await self._request(
                "GET",
                f"{GOOGLE_DRIVE_API}/files",
                params={"q": q, "fields": "files(id,name)", "pageSize": 1},
            )
            files = resp.json().get("files", [])
            if not files:
                return ""  # Path doesn't exist
            parent_id = files[0]["id"]
        return parent_id

    def _parse_file(self, item: dict) -> FileInfo:
        """Convert a Drive API file resource to FileInfo."""
        return FileInfo(
            name=item.get("name", ""),
            path=item.get("name", ""),  # Flat name; real path resolved in list_files
            mime_type=item.get("mimeType", ""),
            size_bytes=int(item.get("size", 0)),
            is_folder=item.get("mimeType") == "application/vnd.google-apps.folder",
            created_at=_parse_dt(item.get("createdTime")),
            modified_at=_parse_dt(item.get("modifiedTime")),
            backend="google_drive",
            backend_id=item.get("id", ""),
        )

    # ── FileBackend Implementation ────────────────────────────────────────

    async def list_files(self, path: str = "/") -> list[FileInfo]:
        if not self.is_connected:
            return []
        try:
            folder_id = await self._resolve_folder_id(path) if path and path != "/" else "root"
            if not folder_id:
                return []
            q = f"'{folder_id}' in parents and trashed = false"
            resp = await self._request(
                "GET",
                f"{GOOGLE_DRIVE_API}/files",
                params={
                    "q": q,
                    "fields": "files(id,name,mimeType,size,createdTime,modifiedTime)",
                    "pageSize": 100,
                    "orderBy": "folder,name",
                },
            )
            items = resp.json().get("files", [])
            prefix = f"{path.rstrip('/')}/" if path and path != "/" else ""
            results = []
            for item in items:
                fi = self._parse_file(item)
                fi.path = f"{prefix}{fi.name}"
                results.append(fi)
            return results
        except Exception as exc:
            logger.error("Google Drive list_files failed: %s", exc)
            return []

    async def read_file(self, path: str) -> bytes | None:
        if not self.is_connected:
            return None
        try:
            file_id = await self._find_file_id(path)
            if not file_id:
                return None
            resp = await self._request(
                "GET",
                f"{GOOGLE_DRIVE_API}/files/{file_id}",
                params={"alt": "media"},
            )
            return resp.content
        except Exception as exc:
            logger.error("Google Drive read_file failed: %s", exc)
            return None

    async def write_file(
        self, path: str, content: bytes, mime_type: str = ""
    ) -> FileInfo | None:
        if not self.is_connected:
            return None
        try:
            parts = path.rsplit("/", 1)
            folder_path = parts[0] if len(parts) > 1 else ""
            filename = parts[-1]

            # Ensure parent folders exist
            parent_id = "root"
            if folder_path:
                parent_id = await self._ensure_folder_path(folder_path)

            # Check if file already exists (update vs create)
            existing_id = await self._find_file_id(path)
            if existing_id:
                resp = await self._request(
                    "PATCH",
                    f"{GOOGLE_UPLOAD_API}/files/{existing_id}",
                    params={"uploadType": "media"},
                    content=content,
                    headers={**self._headers, "Content-Type": mime_type or "application/octet-stream"},
                )
            else:
                import json
                metadata = {"name": filename, "parents": [parent_id]}
                if mime_type:
                    metadata["mimeType"] = mime_type

                # Multipart upload
                boundary = "helm_upload_boundary"
                body = (
                    f"--{boundary}\r\n"
                    f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
                    f"{json.dumps(metadata)}\r\n"
                    f"--{boundary}\r\n"
                    f"Content-Type: {mime_type or 'application/octet-stream'}\r\n\r\n"
                ).encode() + content + f"\r\n--{boundary}--".encode()

                async with httpx.AsyncClient(timeout=60) as client:
                    resp = await client.post(
                        f"{GOOGLE_UPLOAD_API}/files",
                        params={"uploadType": "multipart"},
                        headers={
                            **self._headers,
                            "Content-Type": f"multipart/related; boundary={boundary}",
                        },
                        content=body,
                    )
                    if resp.status_code == 401 and self._refresh_token:
                        await self._refresh_access_token()
                        resp = await client.post(
                            f"{GOOGLE_UPLOAD_API}/files",
                            params={"uploadType": "multipart"},
                            headers={
                                **self._headers,
                                "Content-Type": f"multipart/related; boundary={boundary}",
                            },
                            content=body,
                        )
                    resp.raise_for_status()

            item = resp.json()
            logger.info("Wrote file to Google Drive: %s", path)
            fi = self._parse_file(item)
            fi.path = path
            return fi
        except Exception as exc:
            logger.error("Google Drive write_file failed: %s", exc)
            return None

    async def create_folder(self, path: str) -> FileInfo | None:
        if not self.is_connected:
            return None
        try:
            folder_id = await self._ensure_folder_path(path)
            return FileInfo(
                name=path.rstrip("/").rsplit("/", 1)[-1],
                path=path,
                mime_type="application/vnd.google-apps.folder",
                is_folder=True,
                backend="google_drive",
                backend_id=folder_id,
            )
        except Exception as exc:
            logger.error("Google Drive create_folder failed: %s", exc)
            return None

    async def delete_file(self, path: str) -> bool:
        if not self.is_connected:
            return False
        try:
            file_id = await self._find_file_id(path)
            if not file_id:
                return False
            await self._request("DELETE", f"{GOOGLE_DRIVE_API}/files/{file_id}")
            logger.info("Deleted from Google Drive: %s", path)
            return True
        except Exception as exc:
            logger.error("Google Drive delete_file failed: %s", exc)
            return False

    async def move_file(self, src: str, dst: str) -> FileInfo | None:
        if not self.is_connected:
            return None
        try:
            file_id = await self._find_file_id(src)
            if not file_id:
                return None

            # Get current parents
            resp = await self._request(
                "GET",
                f"{GOOGLE_DRIVE_API}/files/{file_id}",
                params={"fields": "parents"},
            )
            old_parents = ",".join(resp.json().get("parents", []))

            # Resolve new parent
            dst_parts = dst.rsplit("/", 1)
            new_parent_path = dst_parts[0] if len(dst_parts) > 1 else ""
            new_name = dst_parts[-1]
            new_parent_id = await self._ensure_folder_path(new_parent_path) if new_parent_path else "root"

            resp = await self._request(
                "PATCH",
                f"{GOOGLE_DRIVE_API}/files/{file_id}",
                params={"addParents": new_parent_id, "removeParents": old_parents},
                json={"name": new_name},
            )
            fi = self._parse_file(resp.json())
            fi.path = dst
            logger.info("Moved file: %s → %s", src, dst)
            return fi
        except Exception as exc:
            logger.error("Google Drive move_file failed: %s", exc)
            return None

    async def search_files(self, query: str) -> list[FileInfo]:
        if not self.is_connected:
            return []
        try:
            q = f"name contains '{query}' and trashed = false"
            resp = await self._request(
                "GET",
                f"{GOOGLE_DRIVE_API}/files",
                params={
                    "q": q,
                    "fields": "files(id,name,mimeType,size,createdTime,modifiedTime)",
                    "pageSize": 50,
                },
            )
            return [self._parse_file(item) for item in resp.json().get("files", [])]
        except Exception as exc:
            logger.error("Google Drive search failed: %s", exc)
            return []

    # ── Private Helpers ───────────────────────────────────────────────────

    async def _find_file_id(self, path: str) -> str:
        """Find a file's ID by full path."""
        parts = path.strip("/").split("/")
        parent_id = "root"
        for i, part in enumerate(parts):
            is_last = i == len(parts) - 1
            mime_filter = "" if is_last else " and mimeType = 'application/vnd.google-apps.folder'"
            q = f"name = '{part}' and '{parent_id}' in parents{mime_filter} and trashed = false"
            resp = await self._request(
                "GET",
                f"{GOOGLE_DRIVE_API}/files",
                params={"q": q, "fields": "files(id)", "pageSize": 1},
            )
            files = resp.json().get("files", [])
            if not files:
                return ""
            parent_id = files[0]["id"]
        return parent_id

    async def _ensure_folder_path(self, path: str) -> str:
        """Walk the path, creating missing folders along the way."""
        parts = [p for p in path.strip("/").split("/") if p]
        parent_id = "root"
        for part in parts:
            q = (
                f"name = '{part}' and '{parent_id}' in parents "
                f"and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
            )
            resp = await self._request(
                "GET",
                f"{GOOGLE_DRIVE_API}/files",
                params={"q": q, "fields": "files(id)", "pageSize": 1},
            )
            files = resp.json().get("files", [])
            if files:
                parent_id = files[0]["id"]
            else:
                resp = await self._request(
                    "POST",
                    f"{GOOGLE_DRIVE_API}/files",
                    json={
                        "name": part,
                        "mimeType": "application/vnd.google-apps.folder",
                        "parents": [parent_id],
                    },
                )
                parent_id = resp.json()["id"]
                logger.info("Created Google Drive folder: %s", part)
        return parent_id


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


# Singleton
google_drive_client = GoogleDriveClient()
