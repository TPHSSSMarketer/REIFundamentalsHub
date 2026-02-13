"""REIFundamentals Hub integration — connects Helm to the real estate platform."""

from __future__ import annotations

import logging

import httpx

from helm.config import get_settings
from helm.models.schemas import PortfolioOverview, PropertySummary

logger = logging.getLogger(__name__)
settings = get_settings()


class REIFundamentalsClient:
    """HTTP client for the REIFundamentals Hub API.

    All methods gracefully degrade when the API is unreachable or
    credentials are not configured — Helm should never crash because
    an integration is offline.
    """

    def __init__(self) -> None:
        self._base_url = settings.reifundamentals_api_url.rstrip("/")
        self._api_key = settings.reifundamentals_api_key

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "User-Agent": "Helm-AI/0.1.0",
        }

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def _get(self, path: str, params: dict | None = None) -> dict | None:
        if not self.is_configured:
            logger.warning("REIFundamentals Hub API key not configured — skipping request.")
            return None
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._base_url}{path}",
                    headers=self._headers,
                    params=params,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("REIFundamentals Hub request failed: %s", exc)
            return None

    async def _post(self, path: str, payload: dict) -> dict | None:
        if not self.is_configured:
            logger.warning("REIFundamentals Hub API key not configured — skipping request.")
            return None
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._base_url}{path}",
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("REIFundamentals Hub request failed: %s", exc)
            return None

    # ── Portfolio ────────────────────────────────────────────────────────

    async def get_portfolio(self) -> PortfolioOverview:
        """Fetch the user's full portfolio overview."""
        data = await self._get("/portfolio")
        if data is None:
            return PortfolioOverview()
        return PortfolioOverview(**data)

    async def get_property(self, property_id: str) -> PropertySummary | None:
        """Fetch details for a single property."""
        data = await self._get(f"/properties/{property_id}")
        if data is None:
            return None
        return PropertySummary(**data)

    async def search_properties(self, query: str) -> list[PropertySummary]:
        """Search properties by address or keyword."""
        data = await self._get("/properties/search", params={"q": query})
        if data is None:
            return []
        return [PropertySummary(**p) for p in data.get("results", [])]

    # ── Deal Pipeline ────────────────────────────────────────────────────

    async def get_pipeline(self) -> list[dict]:
        """Fetch active deals in the pipeline."""
        data = await self._get("/deals/pipeline")
        return data if data else []

    async def submit_deal(self, deal: dict) -> dict | None:
        """Submit a new deal to the pipeline."""
        return await self._post("/deals", deal)

    # ── Market Data ──────────────────────────────────────────────────────

    async def get_market_data(self, zip_code: str) -> dict | None:
        """Pull market comps and trends for a zip code."""
        return await self._get(f"/markets/{zip_code}")

    # ── Webhooks ─────────────────────────────────────────────────────────

    def verify_webhook(self, payload: bytes, signature: str) -> bool:
        """Verify an inbound webhook signature from REIFundamentals Hub."""
        import hashlib
        import hmac

        expected = hmac.new(
            settings.reifundamentals_webhook_secret.encode(),
            payload,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)


# Singleton
reifundamentals_client = REIFundamentalsClient()
