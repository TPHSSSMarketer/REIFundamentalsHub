"""Telegram Bot integration — Helm accessible via Telegram.

Flow:
  1. Telegram sends updates to our webhook endpoint.
  2. We parse the incoming message (text or voice note).
  3. Route it through HelmEngine.chat().
  4. Send the reply back via Telegram Bot API.

Setup:
  1. Create a bot via @BotFather on Telegram.
  2. Set TELEGRAM_BOT_TOKEN in .env.
  3. Register the webhook:
     POST https://api.telegram.org/bot<TOKEN>/setWebhook
     Body: {"url": "https://yourdomain.com/api/telegram/webhook"}
"""

from __future__ import annotations

import logging

import httpx

from helm.assistant.engine import helm_engine
from helm.config import get_settings
from helm.models.schemas import AssistantMode, ChatRequest
from helm.reliability.breakers import telegram_breaker

logger = logging.getLogger(__name__)
settings = get_settings()

TELEGRAM_API = "https://api.telegram.org"


class TelegramBot:
    """Handles inbound Telegram updates and sends replies."""

    def __init__(self) -> None:
        self._token = settings.telegram_bot_token

    @property
    def is_configured(self) -> bool:
        return bool(self._token)

    @property
    def _base_url(self) -> str:
        return f"{TELEGRAM_API}/bot{self._token}"

    # ── Inbound ──────────────────────────────────────────────────────────

    async def handle_update(self, update: dict) -> None:
        """Process a single Telegram update (webhook payload)."""
        if not self.is_configured:
            logger.warning("Telegram bot token not configured — ignoring update.")
            return

        # Handle inline keyboard callbacks (button presses)
        callback_query = update.get("callback_query")
        if callback_query:
            await self.handle_callback(callback_query)
            return

        message = update.get("message") or update.get("edited_message")
        if not message:
            return

        chat_id = message["chat"]["id"]
        user_id = str(message.get("from", {}).get("id", ""))
        text = message.get("text", "")

        # ── Auth: restrict to admin user ID if configured ─────────────
        if settings.telegram_admin_user_id and user_id != settings.telegram_admin_user_id:
            # Check if this is a known tenant
            tenant = await self._resolve_tenant(str(chat_id))
            if not tenant:
                logger.warning("Unauthorized Telegram user: %s", user_id)
                return

        # Handle voice messages → transcribe first via voice module
        voice = message.get("voice")
        if voice and not text:
            text = await self._transcribe_voice(voice["file_id"])
            if not text:
                await self.send_message(
                    chat_id,
                    "I received your voice message but couldn't transcribe it. "
                    "Please try sending a text message instead.",
                )
                return

        if not text:
            return

        # Detect mode from commands
        mode = self._detect_mode(text)

        # Strip command prefix if present
        if text.startswith("/"):
            parts = text.split(" ", 1)
            text = parts[1] if len(parts) > 1 else ""

        # Handle special commands
        if not text:
            await self._handle_command(chat_id, message.get("text", ""))
            return

        # ── Tenant-scoped conversation ID ─────────────────────────────
        tenant = await self._resolve_tenant(str(chat_id))
        tenant_prefix = f"t{tenant['id'][:8]}_" if tenant else ""
        conversation_id = f"tg_{tenant_prefix}{chat_id}"

        request = ChatRequest(
            message=text,
            mode=mode,
            conversation_id=conversation_id,
        )

        response = await helm_engine.chat(request)

        # Telegram max message length is 4096 — split if needed
        await self.send_long_message(chat_id, response.reply)

    def _detect_mode(self, text: str) -> AssistantMode:
        """Detect mode from Telegram command prefix."""
        lower = text.lower()
        if lower.startswith("/realestate") or lower.startswith("/re "):
            return AssistantMode.REAL_ESTATE
        if lower.startswith("/personal"):
            return AssistantMode.PERSONAL
        if lower.startswith("/business"):
            return AssistantMode.BUSINESS
        return AssistantMode.BUSINESS

    async def _handle_command(self, chat_id: int, command: str) -> None:
        """Respond to slash commands with no message body."""
        lower = command.lower().strip()

        if lower in ("/start", "/help"):
            welcome = (
                "Welcome to *Helm* — your AI command center.\n\n"
                "*Commands:*\n"
                "/business <message> — Business mode\n"
                "/re <message> — Real Estate mode\n"
                "/personal <message> — Personal mode\n"
                "/briefing — Get your daily briefing\n"
                "/help — Show this menu\n\n"
                "Or just send a message and I'll respond in Business mode."
            )
            await self.send_message(chat_id, welcome, parse_mode="Markdown")

        elif lower == "/briefing":
            briefing = await helm_engine.daily_briefing()
            await self.send_long_message(chat_id, briefing)

    # ── Tenant Resolution ────────────────────────────────────────────────

    async def _resolve_tenant(self, chat_id: str) -> dict | None:
        """Look up a tenant by their Telegram chat ID."""
        try:
            from helm.integrations.tenant_manager import tenant_manager
            return await tenant_manager.get_tenant_by_telegram(chat_id)
        except Exception:
            return None

    # ── Inline Keyboards (for confirmation flows) ─────────────────────

    async def send_with_buttons(
        self,
        chat_id: int,
        text: str,
        buttons: list[list[dict]],
    ) -> dict | None:
        """Send a message with inline keyboard buttons.

        buttons format: [[{"text": "Label", "callback_data": "action_id"}]]
        """
        payload = {
            "chat_id": chat_id,
            "text": text,
            "reply_markup": {"inline_keyboard": buttons},
        }
        return await self._api_post("/sendMessage", payload)

    async def handle_callback(self, callback_query: dict) -> None:
        """Handle an inline keyboard button press."""
        callback_id = callback_query.get("id", "")
        data = callback_query.get("data", "")
        chat_id = callback_query.get("message", {}).get("chat", {}).get("id")

        if not chat_id or not data:
            return

        # Acknowledge the callback
        await self._api_post("/answerCallbackQuery", {"callback_query_id": callback_id})

        # Route based on callback data
        if data.startswith("confirm:"):
            action = data[len("confirm:"):]
            await self.send_message(chat_id, f"Confirmed: {action}. Executing...")
            result = await self._execute_callback_action(action, chat_id)
            if result:
                await self.send_message(chat_id, result)
        elif data.startswith("snooze:"):
            topic_and_hours = data[len("snooze:"):]
            parts = topic_and_hours.split(":", 1)
            hours = parts[0]
            await self.send_message(chat_id, f"Snoozed for {hours} hours.")
            # Update checkin state to suppress this topic
            try:
                from helm.checkins.scheduler import checkin_scheduler
                tenant = await self._resolve_tenant(str(chat_id))
                if tenant:
                    await checkin_scheduler.snooze_topic(
                        tenant["id"],
                        parts[1] if len(parts) > 1 else "unknown",
                        int(hours),
                    )
            except Exception as exc:
                logger.warning("Failed to update snooze state: %s", exc)
        elif data == "dismiss":
            await self.send_message(chat_id, "Dismissed.")

    async def _execute_callback_action(self, action: str, chat_id: int) -> str | None:
        """Execute a confirmed action from an inline keyboard callback."""
        try:
            parts = action.split(":", 1)
            action_type = parts[0]
            action_params = parts[1] if len(parts) > 1 else ""

            if action_type == "complete_task":
                from helm.integrations.ghl import ghl_client
                result = await ghl_client.complete_task(action_params)
                return "Task marked complete." if result else "Failed to complete task."

            elif action_type == "send_message":
                # Format: send_message:contact_id:channel:message
                msg_parts = action_params.split(":", 2)
                if len(msg_parts) >= 3:
                    from helm.integrations.ghl import ghl_client
                    result = await ghl_client.send_message(
                        msg_parts[0], msg_parts[2], msg_parts[1]
                    )
                    return "Message sent." if result else "Failed to send message."
                return "Invalid message parameters."

            elif action_type == "move_deal":
                # Format: move_deal:opp_id:stage_id
                deal_parts = action_params.split(":", 1)
                if len(deal_parts) == 2:
                    from helm.integrations.ghl import ghl_client
                    result = await ghl_client.update_opportunity(
                        deal_parts[0], {"pipelineStageId": deal_parts[1]}
                    )
                    return "Deal moved to new stage." if result else "Failed to move deal."
                return "Invalid deal parameters."

            elif action_type == "create_task":
                from helm.integrations.ghl import ghl_client
                result = await ghl_client.create_task({"title": action_params})
                return "Task created." if result else "Failed to create task."

            elif action_type == "call":
                # Initiate a voice call
                from helm.integrations.whatsapp_calling import whatsapp_calling
                tenant = await self._resolve_tenant(str(chat_id))
                if tenant and tenant.get("whatsapp_phone"):
                    result = await whatsapp_calling.initiate_call(
                        tenant["whatsapp_phone"], tenant["id"]
                    )
                    return "Call initiated." if result else "Failed to initiate call."
                return "No phone number configured for calls."

            else:
                return f"Unknown action type: {action_type}"

        except Exception as exc:
            logger.error("Callback action execution failed: %s", exc)
            return f"Action failed: {exc}"

    # ── Voice Transcription ──────────────────────────────────────────────

    async def _transcribe_voice(self, file_id: str) -> str | None:
        """Download a Telegram voice note and transcribe it via the voice module."""
        try:
            from helm.integrations.voice import voice_processor

            # Get file path from Telegram
            file_info = await self._api_get(f"/getFile", params={"file_id": file_id})
            if not file_info or "result" not in file_info:
                return None

            file_path = file_info["result"]["file_path"]
            download_url = f"{TELEGRAM_API}/file/bot{self._token}/{file_path}"

            # Download the audio file
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(download_url)
                resp.raise_for_status()
                audio_bytes = resp.content

            # Transcribe
            return await voice_processor.transcribe(audio_bytes, filename="voice.ogg")

        except Exception as exc:
            logger.error("Failed to transcribe Telegram voice message: %s", exc)
            return None

    # ── Outbound ─────────────────────────────────────────────────────────

    async def send_message(
        self,
        chat_id: int,
        text: str,
        parse_mode: str | None = None,
    ) -> dict | None:
        """Send a text message to a Telegram chat."""
        payload: dict = {"chat_id": chat_id, "text": text}
        if parse_mode:
            payload["parse_mode"] = parse_mode
        return await self._api_post("/sendMessage", payload)

    async def send_long_message(self, chat_id: int, text: str) -> None:
        """Split and send messages that exceed Telegram's 4096-char limit."""
        max_len = 4096
        while text:
            chunk = text[:max_len]
            text = text[max_len:]
            await self.send_message(chat_id, chunk)

    async def send_voice(self, chat_id: int, audio_bytes: bytes) -> dict | None:
        """Send a voice message (OGG/Opus) to a Telegram chat."""
        if not self.is_configured:
            return None
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{self._base_url}/sendVoice",
                    data={"chat_id": str(chat_id)},
                    files={"voice": ("reply.ogg", audio_bytes, "audio/ogg")},
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Telegram sendVoice failed: %s", exc)
            return None

    # ── Webhook Registration ─────────────────────────────────────────────

    async def register_webhook(self) -> dict | None:
        """Register the webhook URL with Telegram."""
        if not settings.telegram_webhook_url:
            logger.warning("TELEGRAM_WEBHOOK_URL not set — skipping webhook registration.")
            return None
        return await self._api_post(
            "/setWebhook",
            {"url": settings.telegram_webhook_url},
        )

    async def remove_webhook(self) -> dict | None:
        return await self._api_post("/deleteWebhook", {})

    # ── HTTP Helpers ─────────────────────────────────────────────────────

    async def _api_post(self, path: str, payload: dict) -> dict | None:
        if not self.is_configured:
            return None

        async def _do_post() -> dict:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(f"{self._base_url}{path}", json=payload)
                resp.raise_for_status()
                return resp.json()

        try:
            return await telegram_breaker.call(_do_post)
        except Exception as exc:
            logger.error("Telegram API error [%s]: %s", path, exc)
            return None

    async def _api_get(self, path: str, params: dict | None = None) -> dict | None:
        if not self.is_configured:
            return None

        async def _do_get() -> dict:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(f"{self._base_url}{path}", params=params)
                resp.raise_for_status()
                return resp.json()

        try:
            return await telegram_breaker.call(_do_get)
        except Exception as exc:
            logger.error("Telegram API error [%s]: %s", path, exc)
            return None


# Singleton
telegram_bot = TelegramBot()
