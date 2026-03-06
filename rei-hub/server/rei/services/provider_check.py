"""Quick helper for routes that need to check if a provider is configured.

Usage in any route:
    from rei.services.provider_check import require_provider_or_demo

    @router.get("/something")
    async def something(db: AsyncSession = Depends(get_db)):
        creds = await require_provider_or_demo(db, "stripe")
        if creds is None:
            return {"demo": True, "message": "Stripe not configured. Set up in Admin > Credentials."}
        # ... use creds["stripe_secret_key"] etc.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from rei.services.credentials_service import get_provider_credentials

logger = logging.getLogger(__name__)


async def require_provider_or_demo(
    db: AsyncSession,
    provider_name: str,
) -> Optional[dict[str, str]]:
    """Check if a provider has credentials configured.

    Returns the decrypted credentials dict if configured, None otherwise.
    Routes can use the None result to return demo/mock data instead of
    making real API calls.
    """
    try:
        creds = await get_provider_credentials(db, provider_name)
        if creds and any(v for v in creds.values()):
            return creds
    except Exception as e:
        logger.warning("Error checking credentials for %s: %s", provider_name, e)
    return None
