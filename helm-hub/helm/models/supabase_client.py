dir C:\Users\ssmar\Documents\GitHub\HelmEcosys"""Async Supabase client — optional persistent store alongside SQLite."""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

_supabase_client = None


async def init_supabase() -> None:
    """Initialize the Supabase async client if credentials are configured.
    Silently skips if supabase_url is not set or supabase package is missing.
    """
    global _supabase_client

    try:
        from supabase._async.client import create_client
    except ImportError:
        logger.warning(
            "supabase package not installed — Supabase sync disabled. "
            "Run: pip install supabase asyncpg"
        )
        return

    try:
        from helm.config import get_settings
        settings = get_settings()

        if not settings.supabase_url or not settings.supabase_service_role_key:
            logger.info(
                "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — "
                "running with SQLite only."
            )
            return

        _supabase_client = await create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        logger.info("Supabase async client initialized (service role).")

    except Exception as exc:
        logger.warning("Failed to initialize Supabase client: %s", exc)
        _supabase_client = None


async def get_supabase():
    """FastAPI dependency — returns the Supabase client or None."""
    return _supabase_clienttem\helm-hub\helm\api\