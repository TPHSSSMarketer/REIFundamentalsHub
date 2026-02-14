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
from helm.reliability.breakers import ghl_breaker

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

        async def _do_get() -> dict:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{self.API_BASE}{path}",
                    headers=self._headers,
                    params=params,
                )
                resp.raise_for_status()
                return resp.json()

        try:
            return await ghl_breaker.call(_do_get)
        except Exception as exc:
            logger.error("GHL GET %s failed: %s", path, exc)
            return None

    async def _post(self, path: str, payload: dict) -> dict | None:
        if not self.is_configured:
            return None
        await self._ensure_token()

        async def _do_post() -> dict:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.API_BASE}{path}",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()

        try:
            return await ghl_breaker.call(_do_post)
        except Exception as exc:
            logger.error("GHL POST %s failed: %s", path, exc)
            return None

    async def _put(self, path: str, payload: dict) -> dict | None:
        if not self.is_configured:
            return None
        await self._ensure_token()

        async def _do_put() -> dict:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.put(
                    f"{self.API_BASE}{path}",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()

        try:
            return await ghl_breaker.call(_do_put)
        except Exception as exc:
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

    async def create_pipeline(self, pipeline_data: dict) -> dict | None:
        pipeline_data.setdefault("locationId", self._location_id)
        return await self._post("/opportunities/pipelines", pipeline_data)

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

    async def create_custom_fields(self, location_id: str | None = None) -> dict:
        """Create the standard Helm custom fields in a GHL location.

        Creates custom fields for both the Deal Tracker and Life Manager pipelines.
        Skips fields that already exist.
        """
        loc = location_id or self._location_id
        if not loc or not self.is_configured:
            return {"error": "GHL not configured or no location_id"}

        # Define all custom fields per the spec
        deal_fields = [
            {"name": "ARV", "dataType": "MONETARY", "placeholder": "After Repair Value"},
            {"name": "Purchase Price", "dataType": "MONETARY", "placeholder": "Agreed purchase price"},
            {"name": "Rehab Budget", "dataType": "MONETARY", "placeholder": "Estimated rehab cost"},
            {"name": "Rent Estimate", "dataType": "MONETARY", "placeholder": "Monthly rent estimate"},
            {"name": "Cap Rate", "dataType": "TEXT", "placeholder": "e.g. 8.5%"},
            {"name": "Cash on Cash", "dataType": "TEXT", "placeholder": "e.g. 12%"},
            {"name": "LTV", "dataType": "TEXT", "placeholder": "Loan-to-Value ratio"},
            {"name": "Strategy", "dataType": "TEXT", "placeholder": "BRRRR / Flip / Hold"},
            {"name": "Agent Name", "dataType": "TEXT", "placeholder": "Real estate agent"},
            {"name": "Lender", "dataType": "TEXT", "placeholder": "Lending institution"},
            {"name": "Closing Date", "dataType": "DATE", "placeholder": "Expected closing date"},
            {"name": "Inspection Date", "dataType": "DATE", "placeholder": "Inspection date"},
        ]

        life_fields = [
            {"name": "Category", "dataType": "TEXT", "placeholder": "Health/Family/Finance/Home/Learning/Social"},
            {"name": "Priority", "dataType": "TEXT", "placeholder": "P1/P2/P3"},
            {"name": "Energy Level", "dataType": "TEXT", "placeholder": "High/Low"},
            {"name": "Time Estimate", "dataType": "TEXT", "placeholder": "e.g. 30min, 2hr"},
        ]

        all_fields = deal_fields + life_fields
        results = {"created": [], "skipped": [], "errors": []}

        # Get existing fields to avoid duplicates
        existing = await self.get_custom_fields(loc)
        existing_names = {f.get("name", "").lower() for f in existing} if existing else set()

        for field_def in all_fields:
            if field_def["name"].lower() in existing_names:
                results["skipped"].append(field_def["name"])
                continue

            payload = {
                "name": field_def["name"],
                "dataType": field_def["dataType"],
                "placeholder": field_def.get("placeholder", ""),
            }

            result = await self._post(
                f"/locations/{loc}/customFields",
                payload,
            )
            if result and "error" not in str(result).lower():
                results["created"].append(field_def["name"])
            else:
                results["errors"].append(f"{field_def['name']}: {result}")

        logger.info("GHL custom fields: created=%d skipped=%d errors=%d",
                     len(results["created"]), len(results["skipped"]), len(results["errors"]))
        return results

    # ── OAuth Flow ────────────────────────────────────────────────────────

    def get_auth_url(self, scopes: str = "contacts.readonly contacts.write opportunities.readonly opportunities.write calendars.readonly calendars.write conversations.readonly conversations.write") -> str | None:
        """Generate the OAuth authorization URL for GHL app installation."""
        if not self._client_id:
            return None
        redirect = settings.ghl_redirect_uri or "http://localhost:8000/api/ghl/auth/callback"
        return (
            f"{self.API_BASE}/oauth/chooselocation"
            f"?response_type=code"
            f"&redirect_uri={redirect}"
            f"&client_id={self._client_id}"
            f"&scope={scopes}"
        )

    async def exchange_code(self, code: str) -> dict:
        """Exchange an authorization code for access + refresh tokens."""
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.API_BASE}/oauth/token",
                    data={
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": settings.ghl_redirect_uri,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                self._access_token = data["access_token"]
                self._refresh_token = data.get("refresh_token", "")
                self._location_id = data.get("locationId", self._location_id)
                self._token_expires_at = time.time() + data.get("expires_in", 86400)
                logger.info("GHL OAuth completed. Location: %s", self._location_id)
                return data
        except httpx.HTTPError as exc:
            logger.error("GHL OAuth code exchange failed: %s", exc)
            return {"error": str(exc)}

    def get_connection_status(self) -> dict:
        """Return current connection status for the dashboard."""
        return {
            "configured": self.is_configured,
            "has_tokens": bool(self._access_token),
            "location_id": self._location_id or None,
        }

    # ── MCP Tool Definitions ─────────────────────────────────────────────

    def get_tool_definitions(self) -> list[dict]:
        """Return MCP-compatible tool definitions for Claude Code."""
        return [
            {"name": "ghl_search_contacts", "description": "Search GHL contacts by name/tag/email/phone", "parameters": {"query": "string", "locationId": "string (optional)"}},
            {"name": "ghl_get_contact", "description": "Get full contact details", "parameters": {"contactId": "string"}},
            {"name": "ghl_create_contact", "description": "Create a new contact", "parameters": {"data": "object (firstName, lastName, email, phone, tags)"}},
            {"name": "ghl_update_contact", "description": "Update contact fields/tags", "parameters": {"contactId": "string", "data": "object"}},
            {"name": "ghl_get_opportunities", "description": "Get deals from a pipeline", "parameters": {"pipelineId": "string", "stageId": "string (optional)", "status": "string (optional)"}},
            {"name": "ghl_create_opportunity", "description": "Create a new deal", "parameters": {"data": "object (name, pipelineId, pipelineStageId, contactId, monetaryValue)"}},
            {"name": "ghl_update_opportunity", "description": "Update deal or move stages", "parameters": {"opportunityId": "string", "data": "object"}},
            {"name": "ghl_get_pipelines", "description": "List all pipelines and stages", "parameters": {"locationId": "string (optional)"}},
            {"name": "ghl_get_tasks", "description": "Get tasks (today/overdue)", "parameters": {"contactId": "string (optional)"}},
            {"name": "ghl_create_task", "description": "Create a task", "parameters": {"data": "object (title, body, dueDate, contactId)"}},
            {"name": "ghl_complete_task", "description": "Mark task complete", "parameters": {"taskId": "string"}},
            {"name": "ghl_get_calendar_events", "description": "Get calendar events", "parameters": {"startDate": "string", "endDate": "string"}},
            {"name": "ghl_create_calendar_event", "description": "Schedule an event", "parameters": {"data": "object (title, startTime, endTime, calendarId)"}},
            {"name": "ghl_send_message", "description": "Send message via GHL", "parameters": {"contactId": "string", "message": "string", "channel": "string (sms/email/whatsapp)"}},
            {"name": "ghl_get_notes", "description": "Get contact notes", "parameters": {"contactId": "string"}},
            {"name": "ghl_add_note", "description": "Add note to contact", "parameters": {"contactId": "string", "note": "string"}},
        ]

    async def execute_tool(self, tool_name: str, params: dict) -> dict:
        """Execute an MCP tool call. Returns the result or error."""
        if not self.is_configured:
            return {"error": "GHL not configured"}

        tool_map = {
            "ghl_search_contacts": lambda p: self.search_contacts(p["query"], p.get("locationId")),
            "ghl_get_contact": lambda p: self.get_contact(p["contactId"]),
            "ghl_create_contact": lambda p: self.create_contact(p.get("data", p)),
            "ghl_update_contact": lambda p: self.update_contact(p["contactId"], p.get("data", {})),
            "ghl_get_opportunities": lambda p: self.get_opportunities(p["pipelineId"], p.get("stageId"), p.get("status")),
            "ghl_create_opportunity": lambda p: self.create_opportunity(p.get("data", p)),
            "ghl_update_opportunity": lambda p: self.update_opportunity(p["opportunityId"], p.get("data", {})),
            "ghl_get_pipelines": lambda p: self.get_pipelines(p.get("locationId")),
            "ghl_get_tasks": lambda p: self.get_tasks(p.get("contactId")),
            "ghl_create_task": lambda p: self.create_task(p.get("data", p)),
            "ghl_complete_task": lambda p: self.complete_task(p["taskId"]),
            "ghl_get_calendar_events": lambda p: self.get_calendar_events(p["startDate"], p["endDate"]),
            "ghl_create_calendar_event": lambda p: self.create_calendar_event(p.get("data", p)),
            "ghl_send_message": lambda p: self.send_message(p["contactId"], p["message"], p.get("channel", "sms")),
            "ghl_get_notes": lambda p: self.get_notes(p["contactId"]),
            "ghl_add_note": lambda p: self.add_note(p["contactId"], p["note"]),
        }

        handler = tool_map.get(tool_name)
        if not handler:
            return {"error": f"Unknown tool: {tool_name}"}

        try:
            result = await handler(params)
            return {"result": result}
        except Exception as exc:
            logger.error("GHL tool %s failed: %s", tool_name, exc)
            return {"error": str(exc)}


# Singleton
ghl_client = GHLClient()
