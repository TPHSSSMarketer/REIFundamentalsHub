"""Plugin activation gating — ensures only tenants with the REI plugin
purchased can access Hub API endpoints.

Used as a FastAPI dependency on all /api/plugins/rei/hub/ routes.
"""

from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, Request

from helm.api.middleware import optional_auth
from helm.config import get_settings

logger = logging.getLogger(__name__)


async def require_rei_plugin(
    request: Request,
    user: dict | None = Depends(optional_auth),
) -> None:
    """Gate access to Hub endpoints — only tenants with REI plugin activated.

    Checks:
    1. Admin users always have access (personal use / development).
    2. If a tenant_id is present in the auth context, check the DB for
       ``agent_config.enabled_plugins`` containing ``"rei"``.
    3. If no auth and no tenant context, allow access only in dev mode
       (so the Hub can connect during local development).
    """
    settings = get_settings()

    # Admin always has access
    if user and user.get("is_admin"):
        return

    # Authenticated user with tenant_id — check plugin entitlement
    if user and user.get("tenant_id"):
        tenant_id = user["tenant_id"]
        try:
            from helm.models.database import Tenant, async_session
            from sqlalchemy import select

            async with async_session() as session:
                result = await session.execute(
                    select(Tenant).where(Tenant.id == tenant_id)
                )
                tenant = result.scalar_one_or_none()

                if tenant is None:
                    raise HTTPException(status_code=404, detail="Tenant not found")

                agent_config = tenant.agent_config or {}
                enabled_plugins = agent_config.get("enabled_plugins", [])

                if "rei" not in enabled_plugins:
                    raise HTTPException(
                        status_code=403,
                        detail=(
                            "REI plugin not activated for this account. "
                            "Upgrade your plan to access real estate AI features."
                        ),
                    )
                return  # Plugin is enabled for this tenant
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Plugin gating check failed: %s — allowing access", exc)
            return  # Fail open to avoid blocking if DB is down

    # No tenant context — allow in dev mode, block in production
    if not settings.is_production:
        return

    # In production with no auth context, require authentication
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
