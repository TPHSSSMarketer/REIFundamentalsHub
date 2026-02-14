"""WhatsApp Business Cloud API integration — Helm accessible via WhatsApp.

Flow:
  1. Meta sends webhook events to our endpoint.
  2. We verify the webhook (GET) and process messages (POST).
  3. Route text/voice through HelmEngine.chat().
  4. Reply via the WhatsApp Cloud API.

Setup:
  1. Create a Meta Developer account and set up a WhatsApp Business app.
  2. Go to WhatsApp → API Setup to get your phone number ID and token.
  3. Configure the webhook URL: https://yourdomain.com/api/whatsapp/webhook
  4. Subscribe to "messages" webhook field.
  5. Set WHATSAPP_* variables in .env.
"""

from __future__ import annotations

import logging

import httpx

from helm.assistant.engine import helm_engine
from helm.config import get_settings
from helm.models.schemas import AssistantMode, ChatRequest
from helm.reliability.breakers import whatsapp_breaker

logger = logging.getLogger(__name__)
settings = get_settings()


class WhatsAppClient:
    """Handles inbound WhatsApp messages and sends replies via Cloud API."""

    def __init__(self) -> None:
        self._phone_number_id = settings.whatsapp_phone_number_id
        self._access_token = settings.whatsapp_access_token
        self._verify_token = settings.whatsapp_verify_token
        self._api_version = settings.whatsapp_api_version

    @property
    def is_configured(self) -> bool:
        return bool(self._phone_number_id and self._access_token)

    @property
    def _base_url(self) -> str:
        return f"https://graph.facebook.com/{self._api_version}/{self._phone_number_id}"

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    # ── Webhook Verification (GET) ───────────────────────────────────────

    def verify_webhook(self, mode: str, token: str, challenge: str) -> str | None:
        """Verify the webhook subscription from Meta.

        Returns the challenge string if valid, None otherwise.
        """
        if mode == "subscribe" and token == self._verify_token:
            logger.info("WhatsApp webhook verified successfully.")
            return challenge
        logger.warning("WhatsApp webhook verification failed (bad token or mode).")
        return None

    # ── Inbound ──────────────────────────────────────────────────────────

    async def handle_webhook(self, payload: dict) -> None:
        """Process an inbound WhatsApp webhook event."""
        if not self.is_configured:
            logger.warning("WhatsApp not configured — ignoring webhook.")
            return

        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])

                for message in messages:
                    await self._process_message(message)

    async def _process_message(self, message: dict) -> None:
        """Process a single inbound WhatsApp message."""
        sender = message.get("from", "")  # Phone number
        msg_type = message.get("type", "")
        msg_id = message.get("id", "")

        text = ""

        if msg_type == "text":
            text = message.get("text", {}).get("body", "")

        elif msg_type == "audio":
            audio_id = message.get("audio", {}).get("id", "")
            if audio_id:
                text = await self._transcribe_audio(audio_id)
                if not text:
                    await self.send_text(
                        sender,
                        "I received your voice message but couldn't transcribe it. "
                        "Please try sending a text message.",
                    )
                    return

        elif msg_type == "interactive":
            interactive = message.get("interactive", {})
            if "button_reply" in interactive:
                text = interactive["button_reply"].get("title", "")
            elif "list_reply" in interactive:
                text = interactive["list_reply"].get("title", "")

        if not text:
            return

        # Mark as read
        if msg_id:
            await self.mark_read(msg_id)

        # ── Tenant resolution: map phone → tenant ─────────────────────
        tenant = await self._resolve_tenant(sender)
        tenant_prefix = f"t{tenant['id'][:8]}_" if tenant else ""

        # Detect mode from prefix keywords
        mode, text = self._detect_mode(text)

        # Tenant-scoped conversation ID
        conversation_id = f"wa_{tenant_prefix}{sender}"

        request = ChatRequest(
            message=text,
            mode=mode,
            conversation_id=conversation_id,
        )

        response = await helm_engine.chat(request)

        await self.send_long_text(sender, response.reply)

    def _detect_mode(self, text: str) -> tuple[AssistantMode, str]:
        """Detect mode from message prefix. Returns (mode, cleaned_text)."""
        lower = text.lower().strip()
        for prefix, mode in [
            ("re:", AssistantMode.REAL_ESTATE),
            ("real estate:", AssistantMode.REAL_ESTATE),
            ("personal:", AssistantMode.PERSONAL),
            ("biz:", AssistantMode.BUSINESS),
            ("business:", AssistantMode.BUSINESS),
        ]:
            if lower.startswith(prefix):
                return mode, text[len(prefix):].strip()
        return AssistantMode.BUSINESS, text

    # ── Tenant Resolution ────────────────────────────────────────────────

    async def _resolve_tenant(self, phone: str) -> dict | None:
        """Look up a tenant by their WhatsApp phone number."""
        try:
            from helm.integrations.tenant_manager import tenant_manager
            return await tenant_manager.get_tenant_by_phone(phone)
        except Exception:
            return None

    # ── Interactive Messages (for confirmation flows) ─────────────────

    async def send_with_buttons(
        self,
        to: str,
        body: str,
        buttons: list[dict],
    ) -> dict | None:
        """Send an interactive button message.

        buttons format: [{"id": "action_id", "title": "Button Label"}]
        Max 3 buttons per message.
        """
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": body},
                "action": {
                    "buttons": [
                        {"type": "reply", "reply": {"id": b["id"], "title": b["title"][:20]}}
                        for b in buttons[:3]
                    ]
                },
            },
        }
        return await self._api_post("/messages", payload)

    # ── Voice Transcription ──────────────────────────────────────────────

    async def _transcribe_audio(self, media_id: str) -> str | None:
        """Download a WhatsApp audio message and transcribe it."""
        try:
            from helm.integrations.voice import voice_processor

            # Step 1: Get the media URL
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"https://graph.facebook.com/{self._api_version}/{media_id}",
                    headers=self._headers,
                )
                resp.raise_for_status()
                media_url = resp.json().get("url")
                if not media_url:
                    return None

                # Step 2: Download the audio
                resp = await client.get(media_url, headers=self._headers)
                resp.raise_for_status()
                audio_bytes = resp.content

            # Step 3: Transcribe
            return await voice_processor.transcribe(audio_bytes, filename="voice.ogg")

        except Exception as exc:
            logger.error("Failed to transcribe WhatsApp audio: %s", exc)
            return None

    # ── Outbound ─────────────────────────────────────────────────────────

    async def send_text(self, to: str, text: str) -> dict | None:
        """Send a text message to a WhatsApp number."""
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }
        return await self._api_post("/messages", payload)

    async def send_long_text(self, to: str, text: str) -> None:
        """Split and send messages exceeding WhatsApp's 4096-char limit."""
        max_len = 4096
        while text:
            chunk = text[:max_len]
            text = text[max_len:]
            await self.send_text(to, chunk)

    async def send_reaction(self, to: str, message_id: str, emoji: str) -> dict | None:
        """React to a message with an emoji."""
        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "reaction",
            "reaction": {"message_id": message_id, "emoji": emoji},
        }
        return await self._api_post("/messages", payload)

    async def mark_read(self, message_id: str) -> dict | None:
        """Mark a message as read (blue checkmarks)."""
        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        }
        return await self._api_post("/messages", payload)

    # ── HTTP Helpers ─────────────────────────────────────────────────────

    async def _api_post(self, path: str, payload: dict) -> dict | None:
        if not self.is_configured:
            return None

        async def _do_post() -> dict:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._base_url}{path}",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()

        try:
            return await whatsapp_breaker.call(_do_post)
        except Exception as exc:
            logger.error("WhatsApp API error [%s]: %s", path, exc)
            return None


# Singleton
whatsapp_client = WhatsAppClient()
