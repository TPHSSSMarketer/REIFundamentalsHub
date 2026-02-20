"""Supabase client — optional persistent store alongside SQLite."""

from __future__ import annotations

import logging

from helm.config import get_settings

logger = logging.getLogger(__name__)

_client = None


async def init_supabase() -> None:
    """Initialise the Supabase client if credentials are configured."""
    global _client
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        logger.info("Supabase not configured — skipping init")
        return
    try:
        from supabase import create_client

        _client = create_client(settings.supabase_url, settings.supabase_anon_key)
        logger.info("Supabase client initialised")
    except Exception as exc:
        logger.warning("Supabase init failed: %s", exc)


def get_supabase():
    """Return the cached Supabase client (may be None)."""
    return _client
