"""Smart check-in scheduler -- proactive outreach when it matters.

Runs on a configurable interval (default: 30 minutes).  For each active
tenant, it collects data from all integrations, asks Claude to analyze
what is actionable, and decides whether to reach out or stay quiet.

Three possible outcomes per cycle per tenant:
  NONE -- Nothing actionable.  Don't interrupt.
  TEXT -- Send a message via Telegram/WhatsApp with context + action buttons.
  CALL -- Urgent.  Request permission to call (future: ElevenLabs voice).

The system respects quiet hours, sacred blocks, cooldowns, topic
de-duplication, and anti-spam rules so it never becomes annoying.

Multi-tenant: ``run_all_tenants()`` iterates over every active tenant,
loading per-tenant gating config and DB-backed CheckinState so each
tenant's check-in cadence is independent.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from helm.config import get_settings
from helm.integrations.ghl import ghl_client
from helm.integrations.registry import registry
from helm.integrations.tenant_manager import tenant_manager
from helm.models.database import CheckinState, Goal, Conversation, Message, Tenant, async_session

logger = logging.getLogger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Defaults -- used when a tenant has no gating_config or it is incomplete
# ---------------------------------------------------------------------------
_DEFAULT_GATING = {
    "min_hours_between_checkins": 2,
    "quiet_hours_start": 22,
    "quiet_hours_end": 7,
    "sacred_blocks": [],
    "urgency_overrides": {
        "deal_deadline_within_24h": True,
        "missed_closing_date": True,
        "client_emergency": True,
    },
    "same_topic_cooldown_hours": 4,
}


# =========================================================================
#  GatingRules -- smart gating to prevent over-notification
# =========================================================================

class GatingRules:
    """Per-tenant gating logic.

    Evaluates quiet hours, sacred time-blocks, minimum cooldowns between
    check-ins, and topic-level de-duplication before allowing delivery.
    """

    def __init__(self, gating_config: dict | None = None) -> None:
        cfg = {**_DEFAULT_GATING, **(gating_config or {})}
        self.min_hours_between_checkins: float = cfg.get(
            "min_hours_between_checkins", 2
        )
        self.quiet_hours_start: int = cfg.get(
            "quiet_hours_start", settings.checkin_quiet_hours_start
        )
        self.quiet_hours_end: int = cfg.get(
            "quiet_hours_end", settings.checkin_quiet_hours_end
        )
        self.sacred_blocks: list[dict] = cfg.get("sacred_blocks", [])
        self.urgency_overrides: dict = cfg.get("urgency_overrides", {})
        self.same_topic_cooldown_hours: float = cfg.get(
            "same_topic_cooldown_hours", 4
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def should_send(
        self,
        urgency: str = "normal",
        last_checkin_at: datetime | None = None,
    ) -> tuple[bool, str]:
        """Return ``(allowed, reason)`` -- whether a check-in may be sent now.

        ``reason`` is a human-readable explanation when blocked.
        """
        now = datetime.now(timezone.utc)
        is_urgent = urgency == "urgent"

        # Quiet hours (unless urgent)
        if not is_urgent and self._in_quiet_hours(now):
            return False, "quiet_hours"

        # Sacred blocks (never interrupted, even urgent)
        block_label = self._in_sacred_block(now)
        if block_label:
            return False, f"sacred_block:{block_label}"

        # Cooldown between check-ins (unless urgent)
        if not is_urgent and last_checkin_at:
            hours_since = (now - last_checkin_at).total_seconds() / 3600
            if hours_since < self.min_hours_between_checkins:
                return False, f"cooldown:{hours_since:.1f}h_since_last"

        return True, "ok"

    def is_topic_cooled_down(
        self,
        topic: str,
        suppressed_items: list[dict],
    ) -> bool:
        """Return True if *topic* should be suppressed (still in cooldown).

        ``suppressed_items`` is a list of dicts, each with at least
        ``{"topic": "...", "suppressed_at": "<ISO timestamp>"}``.
        """
        now = datetime.now(timezone.utc)
        cooldown = timedelta(hours=self.same_topic_cooldown_hours)
        for item in suppressed_items:
            if item.get("topic") == topic:
                try:
                    suppressed_at = datetime.fromisoformat(item["suppressed_at"])
                    if suppressed_at.tzinfo is None:
                        suppressed_at = suppressed_at.replace(tzinfo=timezone.utc)
                    if now - suppressed_at < cooldown:
                        return True
                except (KeyError, ValueError):
                    continue
        return False

    def is_anti_spam_blocked(
        self,
        topic: str,
        pending_items: list[dict],
    ) -> bool:
        """Return True if *topic* was already in the last check-in's pending items.

        This prevents nagging about the same actionable item in consecutive
        check-ins.  Items must be explicitly snoozed or resolved to reappear.
        """
        for item in pending_items:
            if item.get("topic") == topic:
                return True
        return False

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _in_quiet_hours(self, now: datetime) -> bool:
        hour = now.hour
        if self.quiet_hours_start > self.quiet_hours_end:
            return hour >= self.quiet_hours_start or hour < self.quiet_hours_end
        return self.quiet_hours_start <= hour < self.quiet_hours_end

    def _in_sacred_block(self, now: datetime) -> str | None:
        """Return the label of the active sacred block, or None."""
        current_time_str = now.strftime("%H:%M")
        for block in self.sacred_blocks:
            start = block.get("start", "")
            end = block.get("end", "")
            label = block.get("label", "Sacred Block")
            if not start or not end:
                continue
            if start <= end:
                if start <= current_time_str < end:
                    return label
            else:
                # Wraps midnight
                if current_time_str >= start or current_time_str < end:
                    return label
        return None


# =========================================================================
#  Decision item -- structured output from the analysis phase
# =========================================================================

class CheckinDecision:
    """Structured representation of a single check-in action item."""

    __slots__ = ("action", "urgency", "priority", "topic", "summary", "details")

    def __init__(
        self,
        action: str = "none",
        urgency: str = "normal",
        priority: str = "low",
        topic: str = "",
        summary: str = "",
        details: str = "",
    ) -> None:
        self.action = action        # "none" | "text" | "call"
        self.urgency = urgency      # "normal" | "urgent"
        self.priority = priority    # "high" | "medium" | "low"
        self.topic = topic          # Short label for dedup
        self.summary = summary      # One-line summary
        self.details = details      # Full message body

    def to_dict(self) -> dict:
        return {
            "action": self.action,
            "urgency": self.urgency,
            "priority": self.priority,
            "topic": self.topic,
            "summary": self.summary,
            "details": self.details,
        }


# =========================================================================
#  CheckinScheduler -- the main orchestrator
# =========================================================================

class CheckinScheduler:
    """Collects data, analyzes, gates, delivers proactive check-ins.

    Operates in multi-tenant mode: call ``run_all_tenants()`` from the
    PM2 cron job.  Each tenant is processed independently with their own
    gating config, DB-backed state, and messaging channels.
    """

    # ==================================================================
    #  Multi-tenant entry point
    # ==================================================================

    async def run_all_tenants(self) -> list[dict]:
        """Run one check-in cycle for every active tenant.

        Returns a list of per-tenant result summaries.
        """
        if not settings.checkin_enabled:
            logger.debug("Check-ins globally disabled.")
            return [{"status": "disabled"}]

        tenants = await tenant_manager.list_tenants(active_only=True)
        if not tenants:
            logger.debug("No active tenants found.")
            return [{"status": "no_tenants"}]

        results: list[dict] = []
        for tenant_dict in tenants:
            # Respect per-tenant toggle
            agent_cfg = tenant_dict.get("agent_config") or {}
            if not agent_cfg.get("proactive_checkins", True):
                results.append({
                    "tenant_id": tenant_dict["id"],
                    "tenant_name": tenant_dict.get("name", ""),
                    "status": "disabled_for_tenant",
                })
                continue

            try:
                result = await self.run_cycle_for_tenant(tenant_dict)
                results.append(result)
            except Exception as exc:
                logger.error(
                    "Check-in cycle failed for tenant %s: %s",
                    tenant_dict.get("id"),
                    exc,
                    exc_info=True,
                )
                results.append({
                    "tenant_id": tenant_dict["id"],
                    "tenant_name": tenant_dict.get("name", ""),
                    "status": "error",
                    "error": str(exc),
                })

        return results

    # ==================================================================
    #  Single-tenant cycle (also usable standalone)
    # ==================================================================

    async def run_cycle(self) -> dict:
        """Legacy single-tenant entry point.

        Uses the admin tenant or falls back to an anonymous cycle.
        """
        if not settings.checkin_enabled:
            return {"status": "disabled"}

        # Try to find admin tenant
        admin_id = settings.admin_tenant_id
        if admin_id:
            tenant_dict = await tenant_manager.get_tenant(admin_id)
            if tenant_dict:
                return await self.run_cycle_for_tenant(tenant_dict)

        # Fallback: use first active tenant
        tenants = await tenant_manager.list_tenants(active_only=True)
        if tenants:
            return await self.run_cycle_for_tenant(tenants[0])

        return {"status": "no_tenants"}

    async def run_cycle_for_tenant(self, tenant_dict: dict) -> dict:
        """Execute one check-in cycle for a specific tenant.

        Steps:
          1. Load DB-backed CheckinState
          2. Build tenant-specific GatingRules
          3. Collect data from integrations
          4. Analyze with Claude (structured decisions)
          5. Filter through gating + topic cooldowns + anti-spam
          6. Deliver via Telegram / WhatsApp with action buttons
          7. Update DB state
        """
        tenant_id = tenant_dict["id"]
        tenant_name = tenant_dict.get("name", "Unknown")
        gating_config = tenant_dict.get("gating_config") or {}

        base_result = {"tenant_id": tenant_id, "tenant_name": tenant_name}

        # -- Step 1: Load DB state ----------------------------------------
        state = await self._load_checkin_state(tenant_id)

        # -- Step 2: Gating rules -----------------------------------------
        gating = GatingRules(gating_config)

        # -- Step 3: Pre-flight gating check (cooldown / quiet / sacred) ---
        allowed, block_reason = gating.should_send(
            urgency="normal",
            last_checkin_at=state.get("last_checkin_at"),
        )
        # We still collect data even if gated -- urgent items can override
        # But if we are in a sacred block, skip entirely
        if block_reason.startswith("sacred_block:"):
            logger.debug(
                "Tenant %s: skipping check-in -- %s", tenant_id, block_reason
            )
            return {**base_result, "status": "gated", "reason": block_reason}

        # -- Step 4: Collect data -----------------------------------------
        data = await self._collect(tenant_dict)
        if not data:
            return {**base_result, "status": "nothing_collected"}

        # -- Step 5: Analyze (structured decisions) -----------------------
        decisions = await self._analyze(data, tenant_dict, state)
        if not decisions or all(d.action == "none" for d in decisions):
            return {
                **base_result,
                "status": "nothing_actionable",
                "data_collected": True,
            }

        # -- Step 6: Filter decisions through gating ----------------------
        suppressed = state.get("suppressed_items") or []
        pending = state.get("pending_items") or []
        deliverable: list[CheckinDecision] = []

        for decision in decisions:
            if decision.action == "none":
                continue

            # Topic cooldown
            if decision.topic and gating.is_topic_cooled_down(
                decision.topic, suppressed
            ):
                logger.debug(
                    "Tenant %s: topic '%s' still in cooldown -- suppressed.",
                    tenant_id,
                    decision.topic,
                )
                continue

            # Anti-spam: don't repeat same topic from last check-in
            if decision.topic and gating.is_anti_spam_blocked(
                decision.topic, pending
            ):
                logger.debug(
                    "Tenant %s: topic '%s' already in pending -- anti-spam skip.",
                    tenant_id,
                    decision.topic,
                )
                continue

            # Overall cooldown (urgent items bypass)
            if not allowed and decision.urgency != "urgent":
                logger.debug(
                    "Tenant %s: non-urgent item gated (%s).",
                    tenant_id,
                    block_reason,
                )
                continue

            deliverable.append(decision)

        if not deliverable:
            return {**base_result, "status": "all_gated", "reason": block_reason}

        # -- Step 7: Deliver ----------------------------------------------
        delivered_topics: list[dict] = []
        checkin_type = "text"
        summaries: list[str] = []

        for decision in deliverable:
            await self._deliver(decision, tenant_dict)
            delivered_topics.append({
                "topic": decision.topic,
                "suppressed_at": datetime.now(timezone.utc).isoformat(),
            })
            summaries.append(decision.summary or decision.topic)
            if decision.action == "call":
                checkin_type = "call"

        # -- Step 8: Update DB state --------------------------------------
        now = datetime.now(timezone.utc)
        new_pending = [d.to_dict() for d in deliverable]

        # Merge new suppressed topics with existing (keep within window)
        cutoff = now - timedelta(
            hours=gating.same_topic_cooldown_hours * 2
        )
        still_valid = [
            s for s in suppressed
            if _parse_iso(s.get("suppressed_at")) and _parse_iso(s.get("suppressed_at")) > cutoff
        ]
        merged_suppressed = still_valid + delivered_topics

        await self._save_checkin_state(
            tenant_id=tenant_id,
            last_checkin_at=now,
            last_checkin_type=checkin_type,
            last_checkin_summary="; ".join(summaries)[:500],
            pending_items=new_pending,
            suppressed_items=merged_suppressed,
        )

        return {
            **base_result,
            "status": "sent",
            "checkin_type": checkin_type,
            "items_delivered": len(deliverable),
            "summaries": summaries,
        }

    # ==================================================================
    #  TOPIC SNOOZING
    # ==================================================================

    async def snooze_topic(self, tenant_id: str, topic: str, hours: int) -> None:
        """Suppress a topic for the given number of hours."""
        try:
            async with async_session() as session:
                result = await session.execute(
                    select(CheckinState).where(CheckinState.tenant_id == tenant_id)
                )
                state = result.scalar_one_or_none()
                if state:
                    suppressed = state.suppressed_items or []
                    suppressed.append({
                        "topic": topic,
                        "snoozed_until": (
                            datetime.now(timezone.utc) + timedelta(hours=hours)
                        ).isoformat(),
                    })
                    state.suppressed_items = suppressed
                    await session.commit()
                    logger.info("Topic '%s' snoozed for %dh for tenant %s", topic, hours, tenant_id)
        except Exception as exc:
            logger.error("Failed to snooze topic: %s", exc)

    # ==================================================================
    #  DATA COLLECTION
    # ==================================================================

    async def _collect(self, tenant_dict: dict) -> dict[str, Any]:
        """Gather data from all integrations for a specific tenant.

        Runs GHL + DB queries in parallel where possible.
        """
        tenant_id = tenant_dict["id"]
        ghl_location = tenant_dict.get("ghl_location_id")
        collected: dict[str, Any] = {}

        # Build parallel tasks
        tasks: dict[str, Any] = {}

        # ---- GHL data (tasks, calendar, opportunities) ----------------
        ghl = registry.get("ghl")
        if ghl and ghl_location:
            today = datetime.now(timezone.utc)
            today_str = today.strftime("%Y-%m-%d")
            three_days = (today + timedelta(days=3)).strftime("%Y-%m-%d")

            tasks["ghl_tasks"] = ghl.get_tasks()
            tasks["ghl_calendar"] = ghl.get_calendar_events(
                start_date=today_str,
                end_date=three_days,
                location_id=ghl_location,
            )
            tasks["ghl_pipelines"] = ghl.get_pipelines(location_id=ghl_location)

        # ---- DB data (goals, recent conversations) --------------------
        tasks["goals"] = self._fetch_goals(tenant_id)
        tasks["recent_conversations"] = self._fetch_recent_conversations(
            tenant_id, days=3
        )

        # Run all IO in parallel
        if tasks:
            keys = list(tasks.keys())
            results = await asyncio.gather(
                *tasks.values(), return_exceptions=True
            )
            for key, result in zip(keys, results):
                if isinstance(result, Exception):
                    logger.warning(
                        "Data collection '%s' failed for tenant %s: %s",
                        key,
                        tenant_id,
                        result,
                    )
                else:
                    collected[key] = result

        # ---- Post-process GHL opportunities --------------------------
        # Pull open opportunities from each pipeline to find deadline-sensitive deals
        if "ghl_pipelines" in collected and collected["ghl_pipelines"]:
            opps: list[dict] = []
            for pipeline in collected["ghl_pipelines"]:
                pid = pipeline.get("id")
                if pid:
                    try:
                        pipeline_opps = await ghl_client.get_opportunities(
                            pipeline_id=pid,
                            status="open",
                            location_id=ghl_location,
                        )
                        opps.extend(pipeline_opps)
                    except Exception as exc:
                        logger.warning("Failed to fetch opps for pipeline %s: %s", pid, exc)
            if opps:
                collected["ghl_opportunities"] = opps

        # ---- Supabase goals (fallback if DB query returned nothing) ---
        supabase = registry.get("supabase")
        if supabase and not collected.get("goals"):
            try:
                goals = await supabase.get_goals()
                if goals:
                    collected["goals"] = goals
            except Exception as exc:
                logger.warning("Supabase goals fallback failed: %s", exc)

        return collected

    async def _fetch_goals(self, tenant_id: str) -> list[dict]:
        """Fetch active goals for a tenant from the local database."""
        try:
            async with async_session() as session:
                result = await session.execute(
                    select(Goal).where(
                        Goal.tenant_id == tenant_id,
                        Goal.status == "active",
                    )
                )
                goals = result.scalars().all()
                return [
                    {
                        "id": g.id,
                        "goal": g.goal,
                        "target_date": g.target_date,
                        "progress_notes": g.progress_notes,
                    }
                    for g in goals
                ]
        except Exception as exc:
            logger.warning("Failed to fetch goals for tenant %s: %s", tenant_id, exc)
            return []

    async def _fetch_recent_conversations(
        self, tenant_id: str, days: int = 3
    ) -> list[dict]:
        """Fetch recent conversation messages for context."""
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            async with async_session() as session:
                result = await session.execute(
                    select(Conversation)
                    .where(
                        Conversation.tenant_id == tenant_id,
                        Conversation.updated_at >= cutoff,
                    )
                    .order_by(Conversation.updated_at.desc())
                    .limit(5)
                )
                conversations = result.scalars().all()

                summaries = []
                for conv in conversations:
                    # Eagerly load the last few messages
                    msg_result = await session.execute(
                        select(Message)
                        .where(Message.conversation_id == conv.id)
                        .order_by(Message.created_at.desc())
                        .limit(5)
                    )
                    msgs = msg_result.scalars().all()
                    summaries.append({
                        "conversation_id": conv.id,
                        "title": conv.title,
                        "channel": conv.channel,
                        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
                        "recent_messages": [
                            {"role": m.role, "content": m.content[:200]}
                            for m in reversed(msgs)
                        ],
                    })
                return summaries
        except Exception as exc:
            logger.warning(
                "Failed to fetch recent conversations for tenant %s: %s",
                tenant_id,
                exc,
            )
            return []

    # ==================================================================
    #  ANALYSIS -- ask Claude to produce structured decisions
    # ==================================================================

    async def _analyze(
        self,
        data: dict,
        tenant_dict: dict,
        state: dict,
    ) -> list[CheckinDecision]:
        """Ask Claude to analyze the collected data and return structured decisions.

        Returns a list of ``CheckinDecision`` objects (may be empty).
        """
        if not data:
            return []

        from helm.assistant.engine import helm_engine
        from helm.models.schemas import ChatRequest

        tenant_name = tenant_dict.get("name", "the user")
        system_prompt = tenant_dict.get("system_prompt") or ""
        last_summary = state.get("last_checkin_summary") or "None"
        pending_topics = [
            p.get("topic", "") for p in (state.get("pending_items") or [])
        ]

        prompt = (
            "You are running a proactive check-in analysis for "
            f"{tenant_name}. Review the data below and decide if there "
            "is anything actionable that warrants reaching out right now.\n\n"
        )
        if system_prompt:
            prompt += f"Context about this user: {system_prompt}\n\n"

        prompt += f"Collected data:\n{json.dumps(data, default=str, indent=2)}\n\n"

        if pending_topics:
            prompt += (
                "Topics already mentioned in the LAST check-in (avoid repeating): "
                f"{', '.join(pending_topics)}\n\n"
            )
        prompt += f"Last check-in summary: {last_summary}\n\n"

        prompt += (
            "Respond ONLY with a JSON array of action items. Each item must have:\n"
            '  "action": "none" | "text" | "call"\n'
            '  "urgency": "normal" | "urgent"\n'
            '  "priority": "high" | "medium" | "low"\n'
            '  "topic": "<short unique label for this item>"\n'
            '  "summary": "<one-line summary>"\n'
            '  "details": "<full message to send to the user, including relevant numbers/dates>"\n\n'
            "Rules:\n"
            "- Be conservative. Only include items with genuine value.\n"
            "- 'call' is reserved for truly urgent, time-sensitive situations.\n"
            "- Do NOT repeat topics that were in the last check-in.\n"
            "- Group related items under a single topic.\n"
            "- If nothing is actionable, return: [{\"action\": \"none\"}]\n\n"
            "Respond with the JSON array only, no markdown fences, no explanation."
        )

        try:
            request = ChatRequest(
                message=prompt,
                mode="business",
                conversation_id=f"checkin_{tenant_dict['id']}",
            )
            response = await helm_engine.chat(request)
            reply = response.reply.strip()

            # Strip markdown code fences if present
            if reply.startswith("```"):
                # Remove opening fence (possibly ```json)
                first_newline = reply.index("\n")
                reply = reply[first_newline + 1 :]
            if reply.endswith("```"):
                reply = reply[:-3].strip()

            items = json.loads(reply)
            if not isinstance(items, list):
                items = [items]

            decisions = []
            for item in items:
                decisions.append(
                    CheckinDecision(
                        action=item.get("action", "none"),
                        urgency=item.get("urgency", "normal"),
                        priority=item.get("priority", "low"),
                        topic=item.get("topic", ""),
                        summary=item.get("summary", ""),
                        details=item.get("details", ""),
                    )
                )
            return decisions

        except json.JSONDecodeError as exc:
            logger.warning(
                "Check-in analysis returned non-JSON for tenant %s: %s",
                tenant_dict.get("id"),
                exc,
            )
            # Fallback: try to extract a simple decision from the raw reply
            return self._fallback_parse(response.reply if "response" in dir() else "")

        except Exception as exc:
            logger.error(
                "Check-in analysis failed for tenant %s: %s",
                tenant_dict.get("id"),
                exc,
                exc_info=True,
            )
            return []

    def _fallback_parse(self, raw_reply: str) -> list[CheckinDecision]:
        """Best-effort extraction when Claude does not return valid JSON."""
        if not raw_reply:
            return []
        upper = raw_reply.upper()
        if "URGENT" in upper:
            return [
                CheckinDecision(
                    action="text",
                    urgency="urgent",
                    priority="high",
                    topic="urgent_fallback",
                    summary="Urgent item detected (unstructured)",
                    details=raw_reply,
                )
            ]
        if "TEXT" in upper:
            return [
                CheckinDecision(
                    action="text",
                    urgency="normal",
                    priority="medium",
                    topic="general_fallback",
                    summary="Action item detected (unstructured)",
                    details=raw_reply,
                )
            ]
        return []

    # ==================================================================
    #  DELIVERY -- send via Telegram / WhatsApp with action buttons
    # ==================================================================

    async def _deliver(
        self, decision: CheckinDecision, tenant_dict: dict
    ) -> None:
        """Send a check-in message with inline action buttons.

        Tries Telegram first (personal channel), then WhatsApp.
        """
        message_body = self._format_message(decision)
        if not message_body:
            return

        delivered = False

        # ---- Telegram delivery ----------------------------------------
        telegram = registry.get("telegram")
        tg_chat_id = tenant_dict.get("telegram_chat_id")
        if telegram and tg_chat_id:
            try:
                buttons = self._telegram_buttons(decision)
                await telegram.send_with_buttons(
                    chat_id=int(tg_chat_id),
                    text=message_body,
                    buttons=buttons,
                )
                delivered = True
                logger.info(
                    "Check-in delivered via Telegram to tenant %s (topic=%s).",
                    tenant_dict["id"],
                    decision.topic,
                )
            except Exception as exc:
                logger.warning(
                    "Telegram delivery failed for tenant %s: %s",
                    tenant_dict["id"],
                    exc,
                )

        # ---- WhatsApp delivery (primary or fallback) -------------------
        whatsapp = registry.get("whatsapp")
        wa_phone = tenant_dict.get("whatsapp_phone")
        if whatsapp and wa_phone and not delivered:
            try:
                buttons = self._whatsapp_buttons(decision)
                await whatsapp.send_with_buttons(
                    to=wa_phone,
                    body=message_body,
                    buttons=buttons,
                )
                delivered = True
                logger.info(
                    "Check-in delivered via WhatsApp to tenant %s (topic=%s).",
                    tenant_dict["id"],
                    decision.topic,
                )
            except Exception as exc:
                logger.warning(
                    "WhatsApp delivery failed for tenant %s: %s",
                    tenant_dict["id"],
                    exc,
                )

        if not delivered:
            logger.info(
                "Check-in for tenant %s generated but no channel available (topic=%s).",
                tenant_dict["id"],
                decision.topic,
            )

    def _format_message(self, decision: CheckinDecision) -> str:
        """Build a formatted check-in message from a decision."""
        priority_icons = {"high": "[!]", "medium": "[-]", "low": "[.]"}
        icon = priority_icons.get(decision.priority, "[-]")

        parts = []
        if decision.summary:
            parts.append(f"{icon} {decision.summary}")
        if decision.details and decision.details != decision.summary:
            parts.append("")
            parts.append(decision.details)
        if decision.urgency == "urgent":
            parts.append("")
            parts.append("(URGENT -- time-sensitive)")

        return "\n".join(parts) if parts else decision.summary or ""

    def _telegram_buttons(
        self, decision: CheckinDecision
    ) -> list[list[dict]]:
        """Build inline keyboard rows for Telegram.

        Returns a list-of-rows, where each row is a list of button dicts.
        """
        buttons: list[list[dict]] = []

        # Row 1: primary actions
        row1: list[dict] = [
            {
                "text": "Show Details",
                "callback_data": f"confirm:show_details:{decision.topic}",
            },
        ]
        if decision.action == "call":
            row1.append(
                {
                    "text": "Call Me",
                    "callback_data": f"confirm:call:{decision.topic}",
                }
            )
        buttons.append(row1)

        # Row 2: snooze / dismiss
        row2: list[dict] = [
            {
                "text": "Snooze 4h",
                "callback_data": f"snooze:4:{decision.topic}",
            },
            {
                "text": "Dismiss",
                "callback_data": f"dismiss:{decision.topic}",
            },
        ]
        buttons.append(row2)

        return buttons

    def _whatsapp_buttons(self, decision: CheckinDecision) -> list[dict]:
        """Build interactive reply buttons for WhatsApp (max 3)."""
        buttons: list[dict] = [
            {"id": f"show_details_{decision.topic}", "title": "Show Details"},
            {"id": f"snooze_4h_{decision.topic}", "title": "Snooze 4hr"},
        ]
        if decision.action == "call":
            buttons.append(
                {"id": f"call_{decision.topic}", "title": "Call Me"}
            )
        return buttons[:3]

    # ==================================================================
    #  DB-BACKED CHECKIN STATE
    # ==================================================================

    async def _load_checkin_state(self, tenant_id: str) -> dict:
        """Load the CheckinState row from the database for a tenant.

        Returns a dict with keys: last_checkin_at, last_checkin_type,
        last_checkin_summary, pending_items, suppressed_items.
        If no row exists, returns sensible defaults.
        """
        try:
            async with async_session() as session:
                result = await session.execute(
                    select(CheckinState).where(
                        CheckinState.tenant_id == tenant_id
                    )
                )
                row = result.scalar_one_or_none()
                if row:
                    return {
                        "last_checkin_at": row.last_checkin_at,
                        "last_checkin_type": row.last_checkin_type,
                        "last_checkin_summary": row.last_checkin_summary,
                        "pending_items": row.pending_items or [],
                        "suppressed_items": row.suppressed_items or [],
                    }
        except Exception as exc:
            logger.warning(
                "Failed to load CheckinState for tenant %s: %s",
                tenant_id,
                exc,
            )

        return {
            "last_checkin_at": None,
            "last_checkin_type": None,
            "last_checkin_summary": None,
            "pending_items": [],
            "suppressed_items": [],
        }

    async def _save_checkin_state(
        self,
        tenant_id: str,
        last_checkin_at: datetime,
        last_checkin_type: str,
        last_checkin_summary: str,
        pending_items: list[dict],
        suppressed_items: list[dict],
    ) -> None:
        """Upsert the CheckinState row for a tenant."""
        try:
            async with async_session() as session:
                result = await session.execute(
                    select(CheckinState).where(
                        CheckinState.tenant_id == tenant_id
                    )
                )
                row = result.scalar_one_or_none()

                if row:
                    row.last_checkin_at = last_checkin_at
                    row.last_checkin_type = last_checkin_type
                    row.last_checkin_summary = last_checkin_summary
                    row.pending_items = pending_items
                    row.suppressed_items = suppressed_items
                else:
                    row = CheckinState(
                        tenant_id=tenant_id,
                        last_checkin_at=last_checkin_at,
                        last_checkin_type=last_checkin_type,
                        last_checkin_summary=last_checkin_summary,
                        pending_items=pending_items,
                        suppressed_items=suppressed_items,
                    )
                    session.add(row)

                await session.commit()

                logger.debug(
                    "CheckinState saved for tenant %s (type=%s, items=%d).",
                    tenant_id,
                    last_checkin_type,
                    len(pending_items),
                )
        except Exception as exc:
            logger.error(
                "Failed to save CheckinState for tenant %s: %s",
                tenant_id,
                exc,
            )


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _parse_iso(value: str | None) -> datetime | None:
    """Safely parse an ISO-8601 timestamp string."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
#  Singleton
# ---------------------------------------------------------------------------

checkin_scheduler = CheckinScheduler()
