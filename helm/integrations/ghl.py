"""GoHighLevel (GHL) API v2 integration — optional CRM plugin.

Provides access to contacts, pipelines, deals/opportunities, tasks,
calendar events, conversations, and notes through GHL's OAuth API.

Setup:
  1. Register a Custom App in the GHL Developer Marketplace.
  2. Set GHL_CLIENT_ID, GHL_CLIENT_SECRET, GHL_REDIRECT_URI in .env.
  3. Complete the OAuth flow to obtain access/refresh tokens.
  4. The client auto-refreshes tokens when they expire.

This integration is completely optional.  If not configured, Helm
continues to work with all other features.
"""

from __future__ import annotations

import logging
import time

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class GHLClient:
    """HTTP client for the GoHighLevel API v2."""

    API_BASE = "https://services.leadconnectorhq.com"

    def __init__(self) -> None:
        self._client_id = settings.ghl_client_id
        self._client_secret = settings.ghl_client_secret
        self._access_token = settings.ghl_access_token
        self._refresh_token = settings.ghl_refresh_token
        self._location_id = settings.ghl_location_id
        self._token_expires_at: float = 0

    @property
    def is_configured(self) -> bool:
        return bool(self._client_id and self._access_token)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
            "Version": "2021-07-28",
        }

    # ── Token Management ─────────────────────────────────────────────────

    async def _refresh_access_token(self) -> bool:
        """Refresh the OAuth access token using the refresh token."""
        if not self._refresh_token:
            return False
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.API_BASE}/oauth/token",
                    data={
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                        "grant_type": "refresh_token",
                        "refresh_token": self._refresh_token,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                self._access_token = data["access_token"]
                self._refresh_token = data.get("refresh_token", self._refresh_token)
                self._token_expires_at = time.time() + data.get("expires_in", 86400)
                logger.info("GHL access token refreshed successfully.")
                return True
        except httpx.HTTPError as exc:
            logger.error("GHL token refresh failed: %s", exc)
            return False

    async def _ensure_token(self) -> None:
        if self._token_expires_at and time.time() > self._token_expires_at - 300:
            await self._refresh_access_token()

    # ── HTTP Helpers ─────────────────────────────────────────────────────

    async def _get(self, path: str, params: dict | None = None) -> dict | None:
        if not self.is_configured:
            return None
        await self._ensure_token()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{self.API_BASE}{path}",
                    headers=self._headers,
                    params=params,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("GHL GET %s failed: %s", path, exc)
            return None

    async def _post(self, path: str, payload: dict) -> dict | None:
        if not self.is_configured:
            return None
        await self._ensure_token()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.API_BASE}{path}",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("GHL POST %s failed: %s", path, exc)
            return None

    async def _put(self, path: str, payload: dict) -> dict | None:
        if not self.is_configured:
            return None
        await self._ensure_token()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.put(
                    f"{self.API_BASE}{path}",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("GHL PUT %s failed: %s", path, exc)
            return None

    # ── Contacts ─────────────────────────────────────────────────────────

    async def search_contacts(self, query: str, location_id: str | None = None) -> list[dict]:
        loc = location_id or self._location_id
        data = await self._get(f"/contacts/", params={"locationId": loc, "query": query})
        return data.get("contacts", []) if data else []

    async def get_contact(self, contact_id: str) -> dict | None:
        data = await self._get(f"/contacts/{contact_id}")
        return data.get("contact") if data else None

    async def create_contact(self, contact_data: dict) -> dict | None:
        contact_data.setdefault("locationId", self._location_id)
        return await self._post("/contacts/", contact_data)

    async def update_contact(self, contact_id: str, updates: dict) -> dict | None:
        return await self._put(f"/contacts/{contact_id}", updates)

    # ── Pipelines & Opportunities ────────────────────────────────────────

    async def get_pipelines(self, location_id: str | None = None) -> list[dict]:
        loc = location_id or self._location_id
        data = await self._get(f"/opportunities/pipelines", params={"locationId": loc})
        return data.get("pipelines", []) if data else []

    async def get_opportunities(
        self,
        pipeline_id: str,
        stage_id: str | None = None,
        status: str | None = None,
        location_id: str | None = None,
    ) -> list[dict]:
        loc = location_id or self._location_id
        params: dict = {"locationId": loc, "pipelineId": pipeline_id}
        if stage_id:
            params["pipelineStageId"] = stage_id
        if status:
            params["status"] = status
        data = await self._get("/opportunities/search", params=params)
        return data.get("opportunities", []) if data else []

    async def create_opportunity(self, opp_data: dict) -> dict | None:
        opp_data.setdefault("locationId", self._location_id)
        return await self._post("/opportunities/", opp_data)

    async def update_opportunity(self, opp_id: str, updates: dict) -> dict | None:
        return await self._put(f"/opportunities/{opp_id}", updates)

    # ── Tasks ────────────────────────────────────────────────────────────

    async def get_tasks(self, contact_id: str | None = None) -> list[dict]:
        params: dict = {}
        if contact_id:
            params["contactId"] = contact_id
        data = await self._get("/contacts/tasks", params=params)
        return data.get("tasks", []) if data else []

    async def create_task(self, task_data: dict) -> dict | None:
        return await self._post("/contacts/tasks", task_data)

    async def complete_task(self, task_id: str) -> dict | None:
        return await self._put(f"/contacts/tasks/{task_id}", {"completed": True})

    # ── Calendar ─────────────────────────────────────────────────────────

    async def get_calendar_events(
        self, start_date: str, end_date: str, location_id: str | None = None
    ) -> list[dict]:
        loc = location_id or self._location_id
        data = await self._get(
            "/calendars/events",
            params={"locationId": loc, "startTime": start_date, "endTime": end_date},
        )
        return data.get("events", []) if data else []

    async def create_calendar_event(self, event_data: dict) -> dict | None:
        return await self._post("/calendars/events", event_data)

    # ── Conversations & Notes ────────────────────────────────────────────

    async def get_conversations(self, contact_id: str) -> list[dict]:
        data = await self._get(f"/conversations/search", params={"contactId": contact_id})
        return data.get("conversations", []) if data else []

    async def send_message(
        self, contact_id: str, message: str, channel: str = "sms"
    ) -> dict | None:
        return await self._post(
            "/conversations/messages",
            {"contactId": contact_id, "type": channel, "message": message},
        )

    async def get_notes(self, contact_id: str) -> list[dict]:
        data = await self._get(f"/contacts/{contact_id}/notes")
        return data.get("notes", []) if data else []

    async def add_note(self, contact_id: str, note: str) -> dict | None:
        return await self._post(f"/contacts/{contact_id}/notes", {"body": note})

    # ── Custom Fields ────────────────────────────────────────────────────

    async def get_custom_fields(self, location_id: str | None = None) -> list[dict]:
        loc = location_id or self._location_id
        data = await self._get("/locations/custom-fields", params={"locationId": loc})
        return data.get("customFields", []) if data else []


# Singleton
ghl_client = GHLClient()
