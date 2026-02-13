"""Smart check-in scheduler — proactive outreach when it matters.

Runs on a configurable interval (default: 30 minutes).  For each check-in
cycle, it collects data from all active integrations, asks Claude to
analyze what's actionable, and decides whether to reach out or stay quiet.

Three possible outcomes per cycle:
  NONE — Nothing actionable.  Don't interrupt.
  TEXT — Send a message via Telegram/WhatsApp with context + action buttons.
  CALL — Urgent.  Request permission to call (future: ElevenLabs voice).

The system respects quiet hours, cooldowns, and anti-spam rules so it
never becomes annoying.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from helm.config import get_settings
from helm.integrations.registry import registry

logger = logging.getLogger(__name__)
settings = get_settings()


class GatingRules:
    """Smart gating to prevent over-notification."""

    def __init__(self) -> None:
        self.min_hours_between_checkins = 2
        self.quiet_hours_start = settings.checkin_quiet_hours_start
        self.quiet_hours_end = settings.checkin_quiet_hours_end
        self.sacred_blocks: list[dict] = []
        self.last_checkin_at: datetime | None = None
        self.topic_cooldowns: dict[str, datetime] = {}

    def should_send(self, urgency: str = "normal") -> bool:
        """Determine if we're allowed to send a check-in right now."""
        now = datetime.now(timezone.utc)

        # Quiet hours (unless urgent)
        if urgency != "urgent" and self._in_quiet_hours(now):
            logger.debug("Check-in suppressed: quiet hours.")
            return False

        # Cooldown between check-ins (unless urgent)
        if urgency != "urgent" and self.last_checkin_at:
            hours_since = (now - self.last_checkin_at).total_seconds() / 3600
            if hours_since < self.min_hours_between_checkins:
                logger.debug("Check-in suppressed: cooldown (%0.1fh since last).", hours_since)
                return False

        return True

    def _in_quiet_hours(self, now: datetime) -> bool:
        hour = now.hour
        if self.quiet_hours_start > self.quiet_hours_end:
            # Wraps midnight (e.g., 22-7)
            return hour >= self.quiet_hours_start or hour < self.quiet_hours_end
        return self.quiet_hours_start <= hour < self.quiet_hours_end

    def mark_sent(self) -> None:
        self.last_checkin_at = datetime.now(timezone.utc)


class CheckinScheduler:
    """Collects data, analyzes, and delivers proactive check-ins."""

    def __init__(self) -> None:
        self.gating = GatingRules()

    async def run_cycle(self) -> dict:
        """Execute one check-in cycle. Returns a summary of what happened."""
        if not settings.checkin_enabled:
            return {"status": "disabled"}

        # Step 1: Collect data from all active integrations
        data = await self._collect()

        # Step 2: Analyze (ask Claude what's actionable)
        decision = await self._analyze(data)

        # Step 3: Gate (should we actually send?)
        if decision["action"] == "none":
            return {"status": "nothing_actionable", "data_collected": bool(data)}

        if not self.gating.should_send(urgency=decision.get("urgency", "normal")):
            return {"status": "gated", "reason": "cooldown_or_quiet_hours"}

        # Step 4: Deliver
        await self._deliver(decision)
        self.gating.mark_sent()

        return {"status": "sent", "action": decision["action"], "summary": decision.get("summary")}

    async def _collect(self) -> dict:
        """Gather data from all active integrations in parallel."""
        collected = {}

        # GHL data (if connected)
        ghl = registry.get("ghl")
        if ghl:
            try:
                pipelines = await ghl.get_pipelines()
                tasks = await ghl.get_tasks()
                collected["ghl"] = {
                    "pipelines": len(pipelines),
                    "tasks": tasks,
                }
            except Exception as exc:
                logger.warning("GHL data collection failed: %s", exc)

        # REIFundamentals Hub data (if connected)
        rei = registry.get("reifundamentals")
        if rei:
            try:
                portfolio = await rei.get_portfolio()
                collected["portfolio"] = {
                    "total_properties": portfolio.total_properties,
                    "total_value": portfolio.total_value,
                }
            except Exception as exc:
                logger.warning("REIFundamentals data collection failed: %s", exc)

        # Supabase goals (if connected)
        supabase = registry.get("supabase")
        if supabase:
            try:
                goals = await supabase.get_goals()
                collected["goals"] = goals
            except Exception as exc:
                logger.warning("Supabase data collection failed: %s", exc)

        return collected

    async def _analyze(self, data: dict) -> dict:
        """Ask Claude to analyze the collected data and decide what to do."""
        if not data:
            return {"action": "none"}

        from helm.assistant.engine import helm_engine
        from helm.models.schemas import ChatRequest

        prompt = (
            "You are running a proactive check-in analysis. Review this data "
            "and decide if there's anything actionable that warrants reaching "
            "out to the user right now.\n\n"
            f"Collected data: {data}\n\n"
            "Respond with one of:\n"
            "- NONE: Nothing actionable right now.\n"
            "- TEXT: Something worth mentioning. Include a brief summary.\n"
            "- URGENT: Time-sensitive item that needs immediate attention.\n\n"
            "Be conservative. Don't notify unless there's genuine value."
        )

        try:
            request = ChatRequest(
                message=prompt,
                mode="business",
                conversation_id="checkin_system",
            )
            response = await helm_engine.chat(request)

            reply = response.reply.upper()
            if "URGENT" in reply:
                return {"action": "text", "urgency": "urgent", "summary": response.reply}
            elif "TEXT" in reply:
                return {"action": "text", "urgency": "normal", "summary": response.reply}
            else:
                return {"action": "none"}
        except Exception as exc:
            logger.error("Check-in analysis failed: %s", exc)
            return {"action": "none"}

    async def _deliver(self, decision: dict) -> None:
        """Send the check-in via the best available channel."""
        summary = decision.get("summary", "")
        if not summary:
            return

        # Try Telegram first (personal channel)
        telegram = registry.get("telegram")
        if telegram:
            try:
                # Use the admin's chat — in production, this would be
                # looked up from tenant config
                from helm.config import get_settings

                s = get_settings()
                if s.telegram_bot_token:
                    await telegram.send_long_message(0, summary)  # Chat ID from config
                    return
            except Exception as exc:
                logger.warning("Telegram delivery failed: %s", exc)

        # Fallback to WhatsApp
        whatsapp = registry.get("whatsapp")
        if whatsapp:
            try:
                await whatsapp.send_long_text("", summary)  # Phone from config
            except Exception as exc:
                logger.warning("WhatsApp delivery failed: %s", exc)

        logger.info("Check-in generated but no messaging channel available to deliver.")


# Singleton
checkin_scheduler = CheckinScheduler()
