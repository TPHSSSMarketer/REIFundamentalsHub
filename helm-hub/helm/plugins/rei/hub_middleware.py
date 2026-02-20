"""Plugin activation gating — ensures only tenants with the REI plugin
purchased can access Hub API endpoints.

Used as a FastAPI dependency on all /api/plugins/rei/hub/ routes.
"""

from __future__ import annotations

import logging

from fastapi import Depends, HTTPException, Request

from helm.api.middleware import optional_auth
from helm.config import get_settings

import httpx

logger = logging.getLogger(__name__)


async def require_rei_plugin(
    request: Request,
    user: dict | None = Depends(optional_auth),
) -> None:
    """Gate access to Hub endpoints — verify active REI Hub subscription via
    machine-to-machine call to the REI Hub validation endpoint.
    """
    settings = get_settings()

    # Admin always has access
    if user and user.get("is_admin"):
        return

    # In dev mode with no auth context, allow through
    if not settings.is_production and user is None:
        return

    # Require auth in all other cases
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Get the user's REI Hub email from their auth context
    email = user.get("email")
    if not email:
        raise HTTPException(status_code=403, detail="No email in auth context")

    # Call REI Hub validation endpoint (machine-to-machine)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{settings.rei_hub_url}/api/plugin/validate",
                params={"email": email},
                headers={"X-Plugin-Secret": settings.rei_plugin_secret},
            )

        if response.status_code == 200:
            data = response.json()
            if data.get("active"):
                return  # Active REI Hub subscription confirmed
            raise HTTPException(
                status_code=403,
                detail="Active REI Hub subscription required to use REI AI features.",
            )
        elif response.status_code == 404:
            raise HTTPException(
                status_code=403,
                detail="No REI Hub account found for this email.",
            )
        else:
            if settings.is_production:
                raise HTTPException(
                    status_code=503,
                    detail="Unable to verify REI Hub subscription.",
                )
            logger.warning(
                "REI Hub validation returned %s — allowing in dev mode",
                response.status_code,
            )
            return
    except HTTPException:
        raise
    except Exception as exc:
        if settings.is_production:
            raise HTTPException(
                status_code=503,
                detail="REI Hub validation service unavailable.",
            )
        logger.warning(
            "REI Hub validation call failed: %s — allowing in dev mode", exc
        )
        return
