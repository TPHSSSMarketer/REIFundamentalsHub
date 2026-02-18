"""Microsoft Teams integration — Helm accessible via Teams Bot.

Flow:
  1. Teams sends activities to our messaging endpoint (Bot Framework).
  2. We verify the JWT token and process messages.
  3. Route through HelmEngine.chat().
  4. Reply via Bot Framework REST API.

Setup:
  1. Register a bot in Azure Bot Service (https://portal.azure.com)
  2. Set messaging endpoint to: https://yourdomain.com/api/teams/webhook
  3. Set TEAMS_APP_ID and TEAMS_APP_PASSWORD in .env
  4. Install the bot in your Teams workspace
"""

from __future__ import annotations

import logging

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class TeamsClient:
    """Handles inbound Teams messages and sends replies via Bot Framework."""

    AUTH_URL = "https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token"

    def __init__(self) -> None:
        self._app_id = settings.teams_app_id
        self._app_password = settings.teams_app_password
        self._access_token: str = ""
        self._token_expires_at: float = 0

    @property
    def is_configured(self) -> bool:
        return bool(self._app_id and self._app_password)

    # ── Token Management ──────────────────────────────────────────────

    async def _ensure_token(self) -> str:
        """Get a Bot Framework access token (cached until expiry)."""
        import time

        if self._access_token and time.time() < self._token_expires_at - 60:
            return self._access_token

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    self.AUTH_URL,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self._app_id,
                        "client_secret": self._app_password,
                        "scope": "https://api.botframework.com/.default",
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                self._access_token = data["access_token"]
                self._token_expires_at = time.time() + data.get("expires_in", 3600)
                return self._access_token
        except httpx.HTTPError as exc:
            logger.error("Teams token refresh failed: %s", exc)
            return ""

    # ── Inbound ───────────────────────────────────────────────────────

    async def handle_activity(self, activity: dict) -> dict:
        """Process an incoming Bot Framework activity."""
        activity_type = activity.get("type", "")

        if activity_type == "message":
            await self._process_message(activity)
        elif activity_type == "conversationUpdate":
            # New member added — send welcome
            members = activity.get("membersAdded", [])
            for member in members:
                if member.get("id") != activity.get("recipient", {}).get("id"):
                    await self._send_reply(
                        activity,
                        "Hello! I'm Helm, your AI command center. How can I help?",
                    )

        return {"status": "ok"}

    async def _process_message(self, activity: dict) -> None:
        """Process a single Teams message."""
        from helm.assistant.engine import helm_engine
        from helm.models.schemas import AssistantMode, ChatRequest

        text = activity.get("text", "").strip()
        conversation_id_raw = activity.get("conversation", {}).get("id", "")
        user_id = activity.get("from", {}).get("id", "")

        if not text:
            return

        # Strip bot mention (Teams includes <at>BotName</at> prefix)
        if "<at>" in text:
            import re
            text = re.sub(r"<at>.*?</at>\s*", "", text).strip()

        # Tenant resolution
        tenant = await self._resolve_tenant(user_id)
        tenant_prefix = f"t{tenant['id'][:8]}_" if tenant else ""
        conversation_id = f"teams_{tenant_prefix}{conversation_id_raw[:32]}"

        request = ChatRequest(
            message=text,
            mode=AssistantMode.BUSINESS,
            conversation_id=conversation_id,
        )

        response = await helm_engine.chat(request)
        await self._send_reply(activity, response.reply)

    async def _resolve_tenant(self, user_id: str) -> dict | None:
        """Look up tenant by Teams user ID (future: map via DB)."""
        return None

    # ── Outbound ──────────────────────────────────────────────────────

    async def _send_reply(self, activity: dict, text: str) -> dict | None:
        """Reply to a Teams activity."""
        if not self.is_configured:
            return None

        service_url = activity.get("serviceUrl", "")
        conversation_id = activity.get("conversation", {}).get("id", "")

        if not service_url or not conversation_id:
            return None

        token = await self._ensure_token()
        if not token:
            return None

        url = f"{service_url.rstrip('/')}/v3/conversations/{conversation_id}/activities"

        payload = {
            "type": "message",
            "text": text,
            "from": activity.get("recipient", {}),
            "recipient": activity.get("from", {}),
            "replyToId": activity.get("id"),
        }

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Teams reply failed: %s", exc)
            return None

    async def send_proactive(
        self,
        service_url: str,
        conversation_id: str,
        text: str,
    ) -> dict | None:
        """Send a proactive message (e.g., check-in notification)."""
        if not self.is_configured:
            return None

        token = await self._ensure_token()
        if not token:
            return None

        url = f"{service_url.rstrip('/')}/v3/conversations/{conversation_id}/activities"
        payload = {"type": "message", "text": text}

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Teams proactive message failed: %s", exc)
            return None


# Singleton
teams_client = TeamsClient()
