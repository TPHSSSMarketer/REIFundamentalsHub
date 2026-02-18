"""Slack integration — Helm accessible via Slack Bot.

Flow:
  1. Slack sends events to our webhook endpoint (Events API).
  2. We verify the request and process messages.
  3. Route through HelmEngine.chat().
  4. Reply via Slack Web API.

Setup:
  1. Create a Slack App at https://api.slack.com/apps
  2. Enable Event Subscriptions → URL: https://yourdomain.com/api/slack/webhook
  3. Subscribe to bot events: message.im, message.channels, app_mention
  4. Install to workspace and get Bot Token
  5. Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET in .env
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class SlackClient:
    """Handles inbound Slack events and sends replies via Web API."""

    API_BASE = "https://slack.com/api"

    def __init__(self) -> None:
        self._bot_token = settings.slack_bot_token
        self._signing_secret = settings.slack_signing_secret

    @property
    def is_configured(self) -> bool:
        return bool(self._bot_token)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._bot_token}",
            "Content-Type": "application/json; charset=utf-8",
        }

    # ── Webhook Verification ──────────────────────────────────────────

    def verify_request(self, timestamp: str, body: str, signature: str) -> bool:
        """Verify a Slack request signature."""
        if not self._signing_secret:
            return True  # Skip verification if no secret configured
        if abs(time.time() - float(timestamp)) > 300:
            return False  # Replay attack protection
        sig_basestring = f"v0:{timestamp}:{body}"
        expected = "v0=" + hmac.new(
            self._signing_secret.encode(),
            sig_basestring.encode(),
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    # ── Inbound ───────────────────────────────────────────────────────

    async def handle_event(self, payload: dict) -> dict:
        """Process a Slack Events API payload."""
        # URL verification challenge
        if payload.get("type") == "url_verification":
            return {"challenge": payload.get("challenge", "")}

        event = payload.get("event", {})
        event_type = event.get("type", "")

        # Ignore bot's own messages
        if event.get("bot_id"):
            return {"ok": True}

        if event_type in ("message", "app_mention"):
            await self._process_message(event)

        return {"ok": True}

    async def _process_message(self, event: dict) -> None:
        """Process a single Slack message event."""
        from helm.assistant.engine import helm_engine
        from helm.models.schemas import AssistantMode, ChatRequest

        text = event.get("text", "")
        channel = event.get("channel", "")
        user = event.get("user", "")

        if not text or not channel:
            return

        # Strip bot mention if present (<@BOTID> text)
        if text.startswith("<@"):
            text = text.split(">", 1)[-1].strip()

        # Tenant resolution
        tenant = await self._resolve_tenant(user)
        tenant_prefix = f"t{tenant['id'][:8]}_" if tenant else ""
        conversation_id = f"slack_{tenant_prefix}{channel}"

        request = ChatRequest(
            message=text,
            mode=AssistantMode.BUSINESS,
            conversation_id=conversation_id,
        )

        response = await helm_engine.chat(request)
        await self.send_message(channel, response.reply, thread_ts=event.get("ts"))

    async def _resolve_tenant(self, user_id: str) -> dict | None:
        """Look up tenant by Slack user ID (future: map via DB)."""
        return None

    # ── Outbound ──────────────────────────────────────────────────────

    async def send_message(
        self,
        channel: str,
        text: str,
        thread_ts: str | None = None,
    ) -> dict | None:
        """Send a message to a Slack channel."""
        if not self.is_configured:
            return None
        payload: dict = {"channel": channel, "text": text}
        if thread_ts:
            payload["thread_ts"] = thread_ts
        return await self._api_post("chat.postMessage", payload)

    async def send_with_blocks(
        self,
        channel: str,
        text: str,
        blocks: list[dict],
    ) -> dict | None:
        """Send a rich message with Block Kit elements."""
        if not self.is_configured:
            return None
        payload = {"channel": channel, "text": text, "blocks": blocks}
        return await self._api_post("chat.postMessage", payload)

    # ── HTTP Helpers ──────────────────────────────────────────────────

    async def _api_post(self, method: str, payload: dict) -> dict | None:
        if not self.is_configured:
            return None
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self.API_BASE}/{method}",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                if not data.get("ok"):
                    logger.error("Slack API error [%s]: %s", method, data.get("error"))
                return data
        except httpx.HTTPError as exc:
            logger.error("Slack API error [%s]: %s", method, exc)
            return None


# Singleton
slack_client = SlackClient()
