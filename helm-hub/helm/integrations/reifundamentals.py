"""REIFundamentals Hub integration — bridges Helm AI with the Hub dashboard.

The Hub runs independently and talks to GHL directly for CRUD.  This
service lets Helm push data TO the Hub (notifications, AI results) and
provides helper methods used by Helm's AI agents when they need to
reference the user's real estate portfolio context.

Architecture:
    Hub <-> GHL API       (core CRUD — contacts, deals, pipelines)
    Hub --> Helm API      (AI features — analysis, chat, research, insights)
    Helm --> Hub Webhook  (optional — push notifications back to Hub)
    Helm <-> GHL API      (check-ins, proactive monitoring, agent tasks)
"""

from __future__ import annotations

import hashlib
import hmac
import logging

import httpx

from helm.config import get_settings
from helm.plugins.rei.schemas import PortfolioOverview, PropertySummary

logger = logging.getLogger(__name__)
settings = get_settings()


class REIFundamentalsClient:
    """Integration client for the REIFundamentals Hub.

    Two operating modes:

    1. **Hub-connected** — ``reifundamentals_api_url`` points to the Hub's
       backend (if it has one) or a data endpoint.  Methods fetch portfolio
       data for AI context enrichment.

    2. **GHL-only** — If no Hub URL is configured, portfolio data is pulled
       directly from GHL via Helm's own GHL client.  The Hub is treated as
       a standalone frontend that calls Helm's API for AI features.

    All methods gracefully degrade — Helm never crashes because the Hub
    or an integration is offline.
    """

    def __init__(self) -> None:
        self._hub_url = settings.reifundamentals_api_url.rstrip("/")
        self._api_key = settings.reifundamentals_api_key
        self._webhook_secret = settings.reifundamentals_webhook_secret

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Helm-AI/0.3.0",
        }

    @property
    def is_configured(self) -> bool:
        """True if we have either a Hub API key or a GHL connection."""
        return bool(self._api_key) or self._ghl_available()

    @property
    def hub_connected(self) -> bool:
        """True if a Hub backend URL and API key are configured."""
        return bool(self._api_key and self._hub_url)

    def _ghl_available(self) -> bool:
        """Check if GHL is configured as a fallback data source."""
        return bool(settings.ghl_access_token or settings.ghl_client_id)

    # ── Portfolio (for AI context) ────────────────────────────────────────

    async def get_portfolio(self) -> PortfolioOverview:
        """Fetch portfolio overview — from Hub API or GHL fallback."""
        # Try Hub API first
        if self.hub_connected:
            data = await self._hub_get("/portfolio")
            if data:
                return PortfolioOverview(**data)

        # Fallback: build portfolio from GHL pipeline data
        return await self._portfolio_from_ghl()

    async def get_property(self, property_id: str) -> PropertySummary | None:
        """Fetch a single property's details."""
        if self.hub_connected:
            data = await self._hub_get(f"/properties/{property_id}")
            if data:
                return PropertySummary(**data)
        return None

    async def search_properties(self, query: str) -> list[PropertySummary]:
        """Search properties by address or keyword."""
        if self.hub_connected:
            data = await self._hub_get("/properties/search", params={"q": query})
            if data:
                return [PropertySummary(**p) for p in data.get("results", [])]
        return []

    # ── GHL Fallback — build portfolio from pipeline data ─────────────────

    async def _portfolio_from_ghl(self) -> PortfolioOverview:
        """Build a portfolio overview from GHL opportunities."""
        try:
            from helm.integrations.ghl import ghl_client

            if not ghl_client.is_configured:
                return PortfolioOverview()

            opportunities = await ghl_client.get_opportunities(status="open")
            if not opportunities:
                return PortfolioOverview()

            properties: list[PropertySummary] = []
            total_value = 0.0
            total_rent = 0.0

            for opp in opportunities:
                value = opp.get("monetaryValue", 0) or 0
                total_value += value
                properties.append(PropertySummary(
                    address=opp.get("name", "Unknown"),
                    city="",
                    state="",
                    zip_code="",
                    purchase_price=value,
                    current_value=value,
                ))

            return PortfolioOverview(
                total_properties=len(properties),
                total_value=total_value,
                total_monthly_income=total_rent,
                properties=properties,
            )
        except Exception as exc:
            logger.warning("Failed to build portfolio from GHL: %s", exc)
            return PortfolioOverview()

    # ── Push to Hub (notifications) ───────────────────────────────────────

    async def notify_hub(self, event: str, data: dict) -> bool:
        """Push an event notification to the Hub (if webhook URL configured)."""
        if not self.hub_connected:
            return False
        return await self._hub_post("/webhooks/helm-events", {
            "event": event,
            "data": data,
        }) is not None

    # ── Webhook Verification ──────────────────────────────────────────────

    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        """Verify an inbound webhook signature from the Hub."""
        if not self._webhook_secret:
            return True  # No secret configured — accept all
        expected = hmac.new(
            self._webhook_secret.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)

    # ── HTTP Helpers ──────────────────────────────────────────────────────

    async def _hub_get(self, path: str, params: dict | None = None) -> dict | None:
        """GET request to the Hub API."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._hub_url}{path}",
                    headers=self._headers,
                    params=params,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.warning("Hub API request failed: %s %s — %s", "GET", path, exc)
            return None

    async def _hub_post(self, path: str, payload: dict) -> dict | None:
        """POST request to the Hub API."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._hub_url}{path}",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.warning("Hub API request failed: %s %s — %s", "POST", path, exc)
            return None


# Singleton
reifundamentals_client = REIFundamentalsClient()
