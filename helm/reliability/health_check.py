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

        return {
            "status": status,
            "timestamp": time.time(),
            "duration_ms": round((time.time() - start) * 1000),
            "checks": checks,
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


# Singleton
health_checker = HealthChecker()
