"""WhatsApp Business Calling API + ElevenLabs voice agent integration.

Provides:
  - Business-initiated outbound VoIP calls (with permission prompt first)
  - User-initiated inbound call handling (webhook-driven)
  - Post-call processing pipeline: transcript -> tasks -> memory -> summary
  - ElevenLabs conversational AI agent context injection for live calls

Flow (outbound):
  1. System sends a permission request via WhatsApp text with interactive buttons.
  2. User taps [Accept Call] -> system initiates VoIP call via Cloud API.
  3. Call connects to ElevenLabs conversational AI agent with full context.
  4. On call end, transcript is processed: action items extracted, GHL tasks
     created, summary stored in memory, and a recap sent via messaging channel.

Flow (inbound):
  1. User calls the WhatsApp Business number.
  2. Webhook fires with call event -> system resolves tenant from caller ID.
  3. ElevenLabs agent config built with tenant context (history, goals, deals).
  4. Call ends -> same post-call pipeline as outbound.

Setup:
  1. Enable WhatsApp Business Calling API in your Meta Business account.
  2. Configure the calling webhook URL: https://yourdomain.com/api/voice/call/webhook
  3. Ensure WHATSAPP_* and ELEVENLABS_* env vars are set.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Call event types from WhatsApp Business Calling API webhooks
CALL_EVENT_INCOMING = "incoming"
CALL_EVENT_ENDED = "ended"
CALL_EVENT_FAILED = "failed"
CALL_EVENT_ACCEPTED = "accepted"


class WhatsAppCallingClient:
    """Handles WhatsApp Business VoIP calls with ElevenLabs voice agent."""

    def __init__(self) -> None:
        self._phone_number_id = settings.whatsapp_phone_number_id
        self._access_token = settings.whatsapp_access_token
        self._api_version = settings.whatsapp_api_version

        # Track active call sessions: call_id -> session metadata
        self._active_calls: dict[str, dict] = {}
        # Track pending permission requests: phone -> request metadata
        self._pending_permissions: dict[str, dict] = {}

    @property
    def is_configured(self) -> bool:
        """Check if WhatsApp calling is configured."""
        from helm.integrations.elevenlabs import elevenlabs_client

        return bool(
            self._phone_number_id
            and self._access_token
            and elevenlabs_client.is_configured
        )

    @property
    def _base_url(self) -> str:
        return f"https://graph.facebook.com/{self._api_version}/{self._phone_number_id}"

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }

    # ── Outbound Calls (Business-Initiated) ───────────────────────────────

    async def initiate_call(self, to: str, tenant_id: str | None = None) -> dict:
        """Start a business-initiated VoIP call.

        Sends a permission request first via WhatsApp interactive buttons.
        The actual call is initiated only when the user accepts.

        Args:
            to: Recipient phone number (E.164 format).
            tenant_id: Optional tenant ID for multi-tenant context.

        Returns:
            Status dict with request_id and current state.
        """
        if not self.is_configured:
            logger.warning("WhatsApp calling not configured — cannot initiate call.")
            return {"error": "WhatsApp calling not configured", "status": "unconfigured"}

        from helm.integrations.whatsapp import whatsapp_client

        request_id = uuid.uuid4().hex[:16]

        # Store the pending permission request
        self._pending_permissions[to] = {
            "request_id": request_id,
            "tenant_id": tenant_id,
            "phone": to,
            "requested_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
        }

        # Send permission request via WhatsApp interactive buttons
        body = (
            "Grace wants to call you about important updates. "
            "Would you like to take the call now?"
        )
        buttons = [
            {"id": f"accept_call_{request_id}", "title": "Accept Call"},
            {"id": f"decline_call_{request_id}", "title": "Not Now"},
        ]

        result = await whatsapp_client.send_with_buttons(to, body, buttons)

        if result is None:
            logger.error("Failed to send call permission request to %s", to)
            self._pending_permissions.pop(to, None)
            return {"error": "Failed to send permission request", "status": "failed"}

        logger.info(
            "Call permission request sent to %s (request_id=%s)", to, request_id
        )
        return {
            "status": "permission_requested",
            "request_id": request_id,
            "phone": to,
        }

    async def handle_call_permission_response(
        self, phone: str, button_id: str
    ) -> dict:
        """Handle the user's response to the call permission request.

        Called when an interactive button reply is received matching
        accept_call_* or decline_call_*.

        Args:
            phone: The user's phone number.
            button_id: The button ID from the interactive reply.

        Returns:
            Status dict with the outcome.
        """
        pending = self._pending_permissions.get(phone)
        if not pending:
            logger.warning(
                "Call permission response from %s but no pending request found.", phone
            )
            return {"error": "No pending call request", "status": "no_request"}

        request_id = pending["request_id"]

        if button_id.startswith("accept_call_"):
            logger.info("Call accepted by %s (request_id=%s)", phone, request_id)
            self._pending_permissions.pop(phone, None)
            return await self._start_outbound_call(
                phone, tenant_id=pending.get("tenant_id")
            )

        elif button_id.startswith("decline_call_"):
            logger.info("Call declined by %s (request_id=%s)", phone, request_id)
            self._pending_permissions.pop(phone, None)

            from helm.integrations.whatsapp import whatsapp_client

            await whatsapp_client.send_text(
                phone,
                "No problem! I'll send you a text summary instead. "
                "Feel free to call anytime.",
            )
            return {"status": "declined", "request_id": request_id}

        return {"error": "Unknown button response", "status": "unknown"}

    async def _start_outbound_call(
        self, to: str, tenant_id: str | None = None
    ) -> dict:
        """Initiate the actual VoIP call after permission is granted.

        Args:
            to: Recipient phone number.
            tenant_id: Tenant ID for context loading.

        Returns:
            Status dict with call_id.
        """
        call_id = uuid.uuid4().hex[:16]

        # Build the agent context for the call
        agent_config = await self._build_call_context(tenant_id)

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._base_url}/calls",
                    headers=self._headers,
                    json={
                        "messaging_product": "whatsapp",
                        "to": to,
                        "type": "voice",
                    },
                )
                resp.raise_for_status()
                data = resp.json()

                # Store the active call session
                self._active_calls[call_id] = {
                    "call_id": call_id,
                    "phone": to,
                    "tenant_id": tenant_id,
                    "direction": "outbound",
                    "agent_config": agent_config,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "api_call_id": data.get("calls", [{}])[0].get("id"),
                    "status": "initiated",
                }

                logger.info(
                    "Outbound call initiated to %s (call_id=%s)", to, call_id
                )
                return {
                    "status": "call_initiated",
                    "call_id": call_id,
                    "agent_config": agent_config,
                }

        except httpx.HTTPError as exc:
            logger.error("Failed to initiate outbound call to %s: %s", to, exc)
            return {"error": f"Call initiation failed: {exc}", "status": "failed"}

    # ── Inbound Calls (User-Initiated) ────────────────────────────────────

    async def handle_incoming_call(self, call_event: dict) -> dict:
        """Handle a user-initiated inbound call.

        Extracts caller info, resolves tenant, loads context, and builds
        the ElevenLabs agent config for the call session.

        Args:
            call_event: The webhook event payload for the incoming call.

        Returns:
            Dict with agent_config for the ElevenLabs voice session.
        """
        caller_id = call_event.get("from", "")
        call_id = call_event.get("id", uuid.uuid4().hex[:16])

        logger.info("Incoming call from %s (call_id=%s)", caller_id, call_id)

        # Resolve tenant from phone number
        tenant_id = None
        try:
            from helm.integrations.tenant_manager import tenant_manager

            tenant = await tenant_manager.get_tenant_by_phone(caller_id)
            if tenant:
                tenant_id = tenant["id"]
                logger.info(
                    "Resolved caller %s to tenant %s", caller_id, tenant_id
                )
        except Exception as exc:
            logger.warning("Failed to resolve tenant for caller %s: %s", caller_id, exc)

        # Build the agent context
        agent_config = await self._build_call_context(tenant_id)

        # Store the active call session
        self._active_calls[call_id] = {
            "call_id": call_id,
            "phone": caller_id,
            "tenant_id": tenant_id,
            "direction": "inbound",
            "agent_config": agent_config,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "status": "connected",
        }

        logger.info(
            "Inbound call session created for %s (call_id=%s, tenant=%s)",
            caller_id,
            call_id,
            tenant_id,
        )

        return {
            "status": "connected",
            "call_id": call_id,
            "tenant_id": tenant_id,
            "agent_config": agent_config,
        }

    # ── Call Ended (Post-Call Pipeline) ───────────────────────────────────

    async def handle_call_ended(self, call_event: dict) -> dict:
        """Post-call processing pipeline.

        Runs after a call ends (inbound or outbound):
          1. Extract transcript from the call event.
          2. Analyze transcript via ElevenLabs client.
          3. Parse action items from the analysis.
          4. Create GHL tasks for each action item (if GHL connected).
          5. Store call summary in semantic memory.
          6. Send summary message to the user's messaging channel.
          7. Log the call in agent_logs table.

        Args:
            call_event: The webhook event payload for the ended call.

        Returns:
            Dict with processing results.
        """
        call_id = call_event.get("id", "")
        transcript = call_event.get("transcript", "")
        duration_seconds = call_event.get("duration", 0)
        end_reason = call_event.get("reason", "normal")

        # Look up the active call session
        session = self._active_calls.pop(call_id, None)
        if not session:
            # Try to find by matching fields in the event
            logger.warning(
                "No active session found for call_id=%s, processing with event data.",
                call_id,
            )
            session = {
                "call_id": call_id,
                "phone": call_event.get("from", call_event.get("to", "")),
                "tenant_id": None,
                "direction": "unknown",
                "started_at": None,
            }

        phone = session.get("phone", "")
        tenant_id = session.get("tenant_id")
        direction = session.get("direction", "unknown")
        start_time = time.time()

        logger.info(
            "Processing ended call: call_id=%s, direction=%s, duration=%ds, reason=%s",
            call_id,
            direction,
            duration_seconds,
            end_reason,
        )

        result = {
            "call_id": call_id,
            "direction": direction,
            "phone": phone,
            "duration_seconds": duration_seconds,
            "end_reason": end_reason,
        }

        # Skip processing if there is no transcript
        if not transcript:
            logger.info("No transcript available for call %s — skipping analysis.", call_id)
            result["status"] = "completed_no_transcript"
            await self._log_call(
                tenant_id=tenant_id,
                call_id=call_id,
                direction=direction,
                status="completed_no_transcript",
                duration_ms=duration_seconds * 1000,
                summary="Call ended without transcript.",
            )
            return result

        # Step 1: Process the transcript through ElevenLabs analysis
        analysis = {}
        try:
            from helm.integrations.elevenlabs import elevenlabs_client

            analysis = await elevenlabs_client.process_call_transcript(transcript)
            result["analysis"] = analysis.get("analysis", "")
            logger.info("Call transcript analyzed for call_id=%s", call_id)
        except Exception as exc:
            logger.error("Failed to analyze call transcript: %s", exc)
            result["analysis_error"] = str(exc)

        # Step 2: Parse action items from the analysis
        action_items = self._parse_action_items(analysis.get("analysis", ""))
        result["action_items"] = action_items

        # Step 3: Create GHL tasks for action items (if GHL connected)
        tasks_created = []
        if action_items:
            try:
                from helm.integrations.ghl import ghl_client

                if ghl_client.is_configured:
                    for item in action_items:
                        task_result = await ghl_client.create_task({
                            "title": item[:200],
                            "description": f"From voice call ({call_id}): {item}",
                            "dueDate": datetime.now(timezone.utc).isoformat(),
                        })
                        if task_result:
                            tasks_created.append(item[:100])
                            logger.info(
                                "GHL task created from call %s: %s",
                                call_id,
                                item[:80],
                            )
            except Exception as exc:
                logger.error("Failed to create GHL tasks from call: %s", exc)

        result["tasks_created"] = tasks_created

        # Step 4: Store the call summary in semantic memory
        summary_text = analysis.get("analysis", f"Voice call ({direction}) — {duration_seconds}s")
        try:
            from helm.assistant.memory import memory

            memory_content = (
                f"Voice call ({direction}) with {phone} on "
                f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}\n"
                f"Duration: {duration_seconds}s\n\n"
                f"Summary:\n{summary_text}\n\n"
                f"Transcript:\n{transcript[:2000]}"
            )
            conversation_id = f"voice_call_{call_id}"
            await memory.add_and_persist(conversation_id, "system", memory_content)
            logger.info("Call summary stored in memory for call_id=%s", call_id)
        except Exception as exc:
            logger.error("Failed to store call summary in memory: %s", exc)

        # Step 5: Send summary to the user's messaging channel
        await self._send_call_summary(
            phone=phone,
            tenant_id=tenant_id,
            direction=direction,
            duration_seconds=duration_seconds,
            summary=summary_text,
            action_items=action_items,
        )

        # Step 6: Log the call in agent_logs
        processing_ms = int((time.time() - start_time) * 1000)
        await self._log_call(
            tenant_id=tenant_id,
            call_id=call_id,
            direction=direction,
            status="completed",
            duration_ms=duration_seconds * 1000,
            summary=summary_text[:500],
            processing_ms=processing_ms,
        )

        result["status"] = "processed"
        result["processing_ms"] = processing_ms
        return result

    # ── Context Building ──────────────────────────────────────────────────

    async def _build_call_context(self, tenant_id: str | None = None) -> dict:
        """Build context for the ElevenLabs voice agent.

        Loads:
          - Last 15 messages from conversation history
          - Active goals from the database
          - Tenant system prompt (if multi-tenant)
          - Active deal summaries from GHL (if connected)

        Args:
            tenant_id: Optional tenant ID for scoped context.

        Returns:
            ElevenLabs agent config dict with full context injected.
        """
        from helm.integrations.elevenlabs import elevenlabs_client

        system_prompt = (
            "You are Grace, a helpful AI assistant on a live voice call. "
            "Be conversational, concise, and action-oriented. "
            "When the caller mentions tasks or follow-ups, acknowledge them clearly. "
            "At the end of the call, briefly summarize any action items discussed."
        )
        conversation_history: list[dict] = []
        goals: list[dict] = []

        # Load tenant-specific context
        if tenant_id:
            try:
                from helm.integrations.tenant_manager import tenant_manager

                tenant = await tenant_manager.get_tenant(tenant_id)
                if tenant and tenant.get("system_prompt"):
                    system_prompt = tenant["system_prompt"]
            except Exception as exc:
                logger.warning("Failed to load tenant system prompt: %s", exc)

        # Load recent conversation history (last 15 messages)
        try:
            from helm.models.database import Message, Conversation, async_session
            from sqlalchemy import select

            async with async_session() as session:
                # Get the most recent conversation for this tenant
                conv_query = select(Conversation).order_by(
                    Conversation.updated_at.desc()
                )
                if tenant_id:
                    conv_query = conv_query.where(
                        Conversation.tenant_id == tenant_id
                    )
                conv_query = conv_query.limit(1)
                conv_result = await session.execute(conv_query)
                conversation = conv_result.scalar_one_or_none()

                if conversation:
                    msg_result = await session.execute(
                        select(Message)
                        .where(Message.conversation_id == conversation.id)
                        .order_by(Message.created_at.desc())
                        .limit(15)
                    )
                    messages = msg_result.scalars().all()
                    conversation_history = [
                        {"role": m.role, "content": m.content}
                        for m in reversed(messages)
                    ]
        except Exception as exc:
            logger.warning("Failed to load conversation history for call context: %s", exc)

        # Load active goals
        try:
            from helm.models.database import Goal, async_session
            from sqlalchemy import select

            async with async_session() as session:
                goal_query = select(Goal).where(Goal.status == "active")
                if tenant_id:
                    goal_query = goal_query.where(Goal.tenant_id == tenant_id)
                goal_query = goal_query.limit(10)
                goal_result = await session.execute(goal_query)
                goal_records = goal_result.scalars().all()
                goals = [{"goal": g.goal, "status": g.status} for g in goal_records]
        except Exception as exc:
            logger.warning("Failed to load goals for call context: %s", exc)

        # Load active deal summaries from GHL (if connected)
        deal_summaries: list[str] = []
        try:
            from helm.integrations.ghl import ghl_client

            if ghl_client.is_configured:
                pipelines = await ghl_client.get_pipelines()
                for pipeline in pipelines[:3]:
                    pipeline_id = pipeline.get("id", "")
                    if pipeline_id:
                        opportunities = await ghl_client.get_opportunities(
                            pipeline_id, status="open"
                        )
                        for opp in opportunities[:5]:
                            name = opp.get("name", "Unnamed deal")
                            stage = opp.get("pipelineStageId", "Unknown stage")
                            value = opp.get("monetaryValue", "N/A")
                            deal_summaries.append(
                                f"- {name} (Stage: {stage}, Value: {value})"
                            )
        except Exception as exc:
            logger.warning("Failed to load GHL deals for call context: %s", exc)

        # Inject deal context into system prompt if available
        if deal_summaries:
            deals_text = "\n".join(deal_summaries[:10])
            system_prompt += f"\n\n--- Active Deals ---\n{deals_text}"

        # Build the ElevenLabs agent config
        first_message = "Hello! This is Grace, your AI assistant. How can I help you?"
        agent_config = elevenlabs_client.get_agent_config(
            system_prompt=system_prompt,
            conversation_history=conversation_history,
            goals=goals,
            first_message=first_message,
        )

        logger.info(
            "Built call context: %d history msgs, %d goals, %d deals",
            len(conversation_history),
            len(goals),
            len(deal_summaries),
        )

        return agent_config

    # ── Connection Status ─────────────────────────────────────────────────

    def get_connection_status(self) -> dict:
        """Dashboard health check for the calling integration.

        Returns:
            Dict with configuration status, active calls, and pending requests.
        """
        from helm.integrations.elevenlabs import elevenlabs_client

        return {
            "configured": self.is_configured,
            "whatsapp_configured": bool(self._phone_number_id and self._access_token),
            "elevenlabs_configured": elevenlabs_client.is_configured,
            "elevenlabs_agent": bool(elevenlabs_client._agent_id),
            "active_calls": len(self._active_calls),
            "pending_permissions": len(self._pending_permissions),
            "active_call_ids": list(self._active_calls.keys()),
        }

    # ── Webhook Dispatcher ────────────────────────────────────────────────

    async def handle_call_webhook(self, payload: dict) -> dict:
        """Main dispatcher for WhatsApp calling webhook events.

        Routes incoming webhook payloads to the appropriate handler based
        on the event type (incoming, ended, failed).

        Args:
            payload: The raw webhook payload from WhatsApp Business API.

        Returns:
            Processing result dict.
        """
        # Extract call events from the webhook payload
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})

                # Check for call-related events
                calls = value.get("calls", [])
                for call_event in calls:
                    event_type = call_event.get("type", "")
                    call_id = call_event.get("id", "")

                    logger.info(
                        "Call webhook event: type=%s, call_id=%s",
                        event_type,
                        call_id,
                    )

                    if event_type == CALL_EVENT_INCOMING:
                        return await self.handle_incoming_call(call_event)

                    elif event_type == CALL_EVENT_ENDED:
                        return await self.handle_call_ended(call_event)

                    elif event_type == CALL_EVENT_FAILED:
                        return await self._handle_call_failed(call_event)

                    elif event_type == CALL_EVENT_ACCEPTED:
                        logger.info("Call accepted: call_id=%s", call_id)
                        if call_id in self._active_calls:
                            self._active_calls[call_id]["status"] = "connected"
                        return {"status": "accepted", "call_id": call_id}

                # Check for interactive button replies (call permission responses)
                messages = value.get("messages", [])
                for message in messages:
                    if message.get("type") == "interactive":
                        interactive = message.get("interactive", {})
                        button_reply = interactive.get("button_reply", {})
                        button_id = button_reply.get("id", "")

                        if button_id.startswith(
                            ("accept_call_", "decline_call_")
                        ):
                            phone = message.get("from", "")
                            return await self.handle_call_permission_response(
                                phone, button_id
                            )

        logger.debug("Call webhook received but no actionable events found.")
        return {"status": "no_action"}

    # ── Internal Helpers ──────────────────────────────────────────────────

    async def _handle_call_failed(self, call_event: dict) -> dict:
        """Handle a failed call event.

        Cleans up the active session and notifies the user.

        Args:
            call_event: The webhook event payload for the failed call.

        Returns:
            Status dict.
        """
        call_id = call_event.get("id", "")
        error_code = call_event.get("error", {}).get("code", "unknown")
        error_message = call_event.get("error", {}).get("message", "Call failed")

        logger.error(
            "Call failed: call_id=%s, error=%s (%s)",
            call_id,
            error_code,
            error_message,
        )

        session = self._active_calls.pop(call_id, None)
        phone = session.get("phone", "") if session else ""
        tenant_id = session.get("tenant_id") if session else None

        # Notify the user that the call failed
        if phone:
            try:
                from helm.integrations.whatsapp import whatsapp_client

                await whatsapp_client.send_text(
                    phone,
                    f"Sorry, the call could not be connected ({error_message}). "
                    "Please try again or let me know how I can help via text.",
                )
            except Exception as exc:
                logger.error("Failed to send call failure notification: %s", exc)

        # Log the failure
        await self._log_call(
            tenant_id=tenant_id,
            call_id=call_id,
            direction=session.get("direction", "unknown") if session else "unknown",
            status="failed",
            duration_ms=0,
            summary=f"Call failed: {error_message}",
            error=f"{error_code}: {error_message}",
        )

        return {
            "status": "failed",
            "call_id": call_id,
            "error_code": error_code,
            "error_message": error_message,
        }

    def _parse_action_items(self, analysis_text: str) -> list[str]:
        """Extract action items from the call transcript analysis.

        Looks for items under ACTION_ITEMS and FOLLOW_UPS sections
        in the structured analysis output.

        Args:
            analysis_text: The structured analysis from process_call_transcript().

        Returns:
            List of action item strings.
        """
        if not analysis_text:
            return []

        items: list[str] = []
        in_action_section = False

        for line in analysis_text.splitlines():
            stripped = line.strip()

            # Detect action/follow-up section headers
            upper = stripped.upper()
            if "ACTION_ITEMS" in upper or "ACTION ITEMS" in upper:
                in_action_section = True
                continue
            elif "FOLLOW_UPS" in upper or "FOLLOW UPS" in upper or "FOLLOW-UPS" in upper:
                in_action_section = True
                continue
            elif (
                "KEY_DECISIONS" in upper
                or "KEY DECISIONS" in upper
                or "SUMMARY" in upper
            ):
                in_action_section = False
                continue

            # Extract bullet points within action sections
            if in_action_section and stripped:
                # Remove common bullet prefixes
                clean = stripped.lstrip("-*>").lstrip("0123456789.").strip()
                if clean and len(clean) > 5:
                    items.append(clean)

        return items

    async def _send_call_summary(
        self,
        phone: str,
        tenant_id: str | None,
        direction: str,
        duration_seconds: int,
        summary: str,
        action_items: list[str],
    ) -> None:
        """Send a post-call summary to the user's messaging channel.

        Tries WhatsApp first, then falls back to Telegram if configured.

        Args:
            phone: The user's phone number.
            tenant_id: Optional tenant ID.
            direction: Call direction (inbound/outbound).
            duration_seconds: Call duration in seconds.
            summary: The call summary text.
            action_items: List of action items extracted.
        """
        # Build the summary message
        minutes = duration_seconds // 60
        seconds = duration_seconds % 60
        duration_display = f"{minutes}m {seconds}s" if minutes > 0 else f"{seconds}s"

        parts = [
            f"Call Summary ({direction}, {duration_display})",
            "",
            summary[:1500],
        ]

        if action_items:
            parts.append("")
            parts.append("Action Items:")
            for i, item in enumerate(action_items[:10], 1):
                parts.append(f"  {i}. {item[:150]}")

        message = "\n".join(parts)

        # Try sending via WhatsApp
        if phone:
            try:
                from helm.integrations.whatsapp import whatsapp_client

                await whatsapp_client.send_long_text(phone, message)
                logger.info("Call summary sent to %s via WhatsApp.", phone)
                return
            except Exception as exc:
                logger.warning(
                    "Failed to send call summary via WhatsApp: %s", exc
                )

        # Fallback: try Telegram if tenant has a chat_id
        if tenant_id:
            try:
                from helm.integrations.tenant_manager import tenant_manager
                from helm.integrations.telegram import telegram_bot

                tenant = await tenant_manager.get_tenant(tenant_id)
                chat_id = tenant.get("telegram_chat_id") if tenant else None
                if chat_id:
                    await telegram_bot.send_message(chat_id, message)
                    logger.info(
                        "Call summary sent to tenant %s via Telegram.", tenant_id
                    )
                    return
            except Exception as exc:
                logger.warning(
                    "Failed to send call summary via Telegram fallback: %s", exc
                )

        logger.warning(
            "Could not send call summary — no messaging channel available."
        )

    async def _log_call(
        self,
        tenant_id: str | None,
        call_id: str,
        direction: str,
        status: str,
        duration_ms: int,
        summary: str = "",
        processing_ms: int | None = None,
        error: str | None = None,
    ) -> None:
        """Log a call event to the agent_logs database table.

        Args:
            tenant_id: Optional tenant ID.
            call_id: Unique call identifier.
            direction: Call direction (inbound/outbound).
            status: Final call status (completed, failed, etc.).
            duration_ms: Call duration in milliseconds.
            summary: Optional call summary.
            processing_ms: Optional processing time in milliseconds.
            error: Optional error message.
        """
        try:
            from helm.models.database import AgentLog, async_session

            async with async_session() as session:
                log = AgentLog(
                    tenant_id=tenant_id,
                    agent_name="whatsapp_calling",
                    task=f"voice_call_{direction}_{call_id}",
                    status=status,
                    input_summary=f"Direction: {direction}, Call ID: {call_id}",
                    output_summary=summary[:500] if summary else None,
                    duration_ms=processing_ms or duration_ms,
                    error=error,
                )
                session.add(log)
                await session.commit()

            logger.info(
                "Call logged: call_id=%s, status=%s, duration=%dms",
                call_id,
                status,
                duration_ms,
            )
        except Exception as exc:
            logger.error("Failed to log call to database: %s", exc)


# Singleton
whatsapp_calling = WhatsAppCallingClient()
