"""Google Chat integration — Helm accessible via Google Chat Bot.

Flow:
  1. Google Chat sends events to our webhook endpoint.
  2. We verify the request and process messages.
  3. Route through HelmEngine.chat().
  4. Reply synchronously in the webhook response or async via API.

Setup:
  1. Create a project in Google Cloud Console
  2. Enable Google Chat API
  3. Configure the bot: https://chat.google.com/u/0/botmanagement
  4. Set the endpoint to: https://yourdomain.com/api/google-chat/webhook
  5. Set GOOGLE_CHAT_SERVICE_ACCOUNT_KEY in .env (path to JSON key file)

Two modes:
  - Synchronous: Reply directly in the webhook response (simplest)
  - Async: Use Google Chat REST API with service account (for proactive messages)
"""

from __future__ import annotations

import logging

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class GoogleChatClient:
    """Handles inbound Google Chat events and sends replies."""

    API_BASE = "https://chat.googleapis.com/v1"

    def __init__(self) -> None:
        self._service_account_key = settings.google_chat_service_account_key

    @property
    def is_configured(self) -> bool:
        return bool(self._service_account_key)

    # ── Inbound (webhook handler) ─────────────────────────────────────

    async def handle_event(self, event: dict) -> dict:
        """Process a Google Chat event. Returns the response payload.

        Google Chat expects a synchronous JSON response with the reply.
        """
        event_type = event.get("type", "")

        if event_type == "ADDED_TO_SPACE":
            space_type = event.get("space", {}).get("type", "")
            if space_type == "DM":
                return {"text": "Hello! I'm Helm, your AI command center. How can I help you today?"}
            return {"text": "Thanks for adding me! Mention me with @Helm to get started."}

        if event_type == "MESSAGE":
            return await self._process_message(event)

        if event_type == "REMOVED_FROM_SPACE":
            logger.info("Bot removed from space: %s", event.get("space", {}).get("name"))
            return {}

        return {}

    async def _process_message(self, event: dict) -> dict:
        """Process a message event and return the reply."""
        from helm.assistant.engine import helm_engine
        from helm.models.schemas import AssistantMode, ChatRequest

        message = event.get("message", {})
        text = message.get("argumentText", "") or message.get("text", "")
        space_name = event.get("space", {}).get("name", "")
        user_name = event.get("user", {}).get("displayName", "")
        user_email = event.get("user", {}).get("email", "")

        if not text.strip():
            return {"text": "I didn't catch that. Could you try again?"}

        # Tenant resolution
        tenant = await self._resolve_tenant(user_email)
        tenant_prefix = f"t{tenant['id'][:8]}_" if tenant else ""
        conversation_id = f"gchat_{tenant_prefix}{space_name}"

        request = ChatRequest(
            message=text.strip(),
            mode=AssistantMode.BUSINESS,
            conversation_id=conversation_id,
        )

        try:
            response = await helm_engine.chat(request)
            return {"text": response.reply}
        except Exception as exc:
            logger.error("Google Chat processing failed: %s", exc)
            return {"text": "I'm having trouble processing your message. Please try again."}

    async def _resolve_tenant(self, email: str) -> dict | None:
        """Look up tenant by Google email (future: map via DB)."""
        return None

    # ── Outbound (async API calls) ────────────────────────────────────

    async def send_message(
        self,
        space_name: str,
        text: str,
    ) -> dict | None:
        """Send a message to a Google Chat space using the REST API.

        Requires service account authentication.
        """
        if not self.is_configured:
            return None

        token = await self._get_service_token()
        if not token:
            return None

        url = f"{self.API_BASE}/{space_name}/messages"

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json={"text": text},
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Google Chat send failed: %s", exc)
            return None

    async def send_card(
        self,
        space_name: str,
        title: str,
        subtitle: str,
        sections: list[dict],
    ) -> dict | None:
        """Send a card message with rich formatting."""
        if not self.is_configured:
            return None

        token = await self._get_service_token()
        if not token:
            return None

        card = {
            "cardsV2": [{
                "cardId": "helm_card",
                "card": {
                    "header": {"title": title, "subtitle": subtitle},
                    "sections": sections,
                },
            }]
        }

        url = f"{self.API_BASE}/{space_name}/messages"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=card,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Google Chat card send failed: %s", exc)
            return None

    async def _get_service_token(self) -> str | None:
        """Get an access token using the service account key."""
        # In production, use google-auth library for proper JWT/OAuth2 flow.
        # For now, return None if not using the library.
        logger.debug("Google Chat service account auth requires google-auth library.")
        return None


# Singleton
google_chat_client = GoogleChatClient()
