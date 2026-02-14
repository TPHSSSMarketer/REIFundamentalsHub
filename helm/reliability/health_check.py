"""Health check system — monitors all components and reports status.

Runs checks against every configured integration and internal system.
Returns a structured health report used by the /api/health/detailed
endpoint and the smart check-in alerting system.
"""

from __future__ import annotations

import logging
import time

import httpx

from helm.config import get_settings
from helm.integrations.registry import registry
from helm.reliability.breakers import get_all_breaker_status
from helm.reliability.retry_queue import retry_queue

logger = logging.getLogger(__name__)
settings = get_settings()


class HealthChecker:
    """Runs health checks against all system components."""

    async def full_check(self) -> dict:
        """Run all health checks and return a structured report."""
        start = time.time()

        checks = {
            "helm_core": await self._check_core(),
            "plugins": registry.get_status_report(),
            "retry_queue": retry_queue.get_status(),
            "circuit_breakers": self._check_breakers(),
        }

        # Check each active integration
        for plugin in registry.list_all():
            if plugin.is_active and hasattr(plugin.instance, "is_configured"):
                checks[f"integration_{plugin.name}"] = {
                    "configured": True,
                    "category": plugin.category,
                }

        # Supabase connectivity (if configured)
        if registry.is_active("supabase"):
            checks["supabase"] = await self._check_supabase()

        # Overall status
        failed = [k for k, v in checks.items() if isinstance(v, dict) and v.get("error")]
        status = "healthy" if not failed else "degraded"

        # Build integrations summary for the frontend dashboard
        plugins_report = checks.get("plugins", {})
        integrations_summary = {
            "active": plugins_report.get("total_active", 0),
            "total": plugins_report.get("total_registered", 0),
            "plugins": plugins_report.get("plugins", {}),
        }

        return {
            "status": status,
            "timestamp": time.time(),
            "duration_ms": round((time.time() - start) * 1000),
            "checks": checks,
            "integrations": integrations_summary,
            "failed_checks": failed,
        }

    async def _check_core(self) -> dict:
        """Check that Helm core systems are functional."""
        return {
            "status": "ok",
            "app_name": settings.app_name,
            "env": settings.app_env,
            "ai_configured": bool(settings.anthropic_api_key),
        }

    def _check_breakers(self) -> dict:
        """Check all circuit breaker states and flag any that are open."""
        breaker_status = get_all_breaker_status()
        open_count = breaker_status["open_count"]
        if open_count > 0:
            return {
                "status": "degraded",
                "open_count": open_count,
                "total": breaker_status["total"],
                "breakers": breaker_status["breakers"],
            }
        return {
            "status": "ok",
            "open_count": 0,
            "total": breaker_status["total"],
            "breakers": breaker_status["breakers"],
        }

    async def _check_supabase(self) -> dict:
        """Ping Supabase to verify connectivity."""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    f"{settings.supabase_url}/rest/v1/",
                    headers={
                        "apikey": settings.supabase_anon_key or settings.supabase_service_role_key
                    },
                )
                return {"status": "ok", "response_code": resp.status_code}
        except Exception as exc:
            return {"status": "error", "error": str(exc)}

    async def alert_on_failure(self, report: dict) -> None:
        """Send an alert to the admin's Telegram if any checks failed."""
        failed = report.get("failed_checks", [])
        if not failed:
            return

        # Only alert if Telegram is configured
        if not settings.telegram_bot_token or not settings.telegram_admin_user_id:
            logger.warning("Health check failures but Telegram alerting not configured: %s", failed)
            return

        try:
            from helm.integrations.telegram import telegram_bot

            status = report.get("status", "unknown")
            message = (
                f"*Helm Health Alert*\n\n"
                f"Status: {status.upper()}\n"
                f"Failed checks: {len(failed)}\n\n"
            )
            for check_name in failed:
                check_data = report.get("checks", {}).get(check_name, {})
                error = check_data.get("error", "unknown error")
                message += f"- `{check_name}`: {error}\n"

            message += f"\nTimestamp: {report.get('timestamp', 'unknown')}"

            await telegram_bot.send_message(
                int(settings.telegram_admin_user_id),
                message,
                parse_mode="Markdown",
            )
            logger.info("Health alert sent to Telegram admin")
        except Exception as exc:
            logger.error("Failed to send health alert via Telegram: %s", exc)

    async def run_and_alert(self) -> dict:
        """Run full health check and alert on failures. Used by PM2 cron."""
        report = await self.full_check()
        await self.alert_on_failure(report)
        return report


# Singleton
health_checker = HealthChecker()
