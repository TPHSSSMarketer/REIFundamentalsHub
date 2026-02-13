"""OpenRouter integration — multi-model gateway + Perplexity web research.

OpenRouter provides a single API endpoint to access multiple AI models,
including Perplexity's Sonar Pro Search and Deep Research.  This lets
Helm route web research tasks through Perplexity without a separate
Perplexity subscription — just an OpenRouter API key.

Usage:
    from helm.integrations.openrouter import openrouter_client

    # Quick web research (Perplexity Sonar Pro)
    result = await openrouter_client.search("comparable sales 30318 last 90 days")

    # Deep research (Perplexity Deep Research)
    result = await openrouter_client.deep_research("Atlanta rental market trends 2026")

    # Route to any model via OpenRouter
    result = await openrouter_client.chat("analyze this", model="anthropic/claude-3.5-sonnet")
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions"

# Model IDs on OpenRouter
PERPLEXITY_SONAR_PRO = "perplexity/sonar-pro"
PERPLEXITY_SONAR = "perplexity/sonar"
PERPLEXITY_DEEP_RESEARCH = "perplexity/sonar-deep-research"


class OpenRouterClient:
    """OpenRouter API client for multi-model routing and Perplexity research."""

    def __init__(self) -> None:
        self._api_key = settings.openrouter_api_key

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://helm-ai.app",
            "X-Title": "Helm AI Assistant",
        }

    async def _call(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> dict:
        """Make a chat completion call through OpenRouter."""
        if not self.is_configured:
            return {"error": "OpenRouter not configured", "content": ""}

        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    OPENROUTER_API,
                    headers=self._headers,
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

                # Extract the response
                choices = data.get("choices", [])
                if not choices:
                    return {"error": "No response from model", "content": ""}

                content = choices[0].get("message", {}).get("content", "")
                usage = data.get("usage", {})

                return {
                    "content": content,
                    "model": data.get("model", model),
                    "tokens_used": usage.get("total_tokens", 0),
                    "cost_usd": self._estimate_cost(model, usage),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }

        except httpx.HTTPError as exc:
            logger.error("OpenRouter API error: %s", exc)
            return {"error": str(exc), "content": ""}

    # ── Perplexity Web Research ───────────────────────────────────────────

    async def search(self, query: str, context: str = "") -> dict:
        """Quick web research via Perplexity Sonar Pro.

        Use for: comp lookups, property data, news, market checks.
        Returns synthesized, AI-processed web search results.
        """
        messages = []
        if context:
            messages.append({"role": "system", "content": context})
        messages.append({"role": "user", "content": query})

        result = await self._call(
            messages=messages,
            model=PERPLEXITY_SONAR_PRO,
            max_tokens=4096,
            temperature=0.3,  # Lower temp for factual research
        )

        if result.get("content"):
            logger.info("Perplexity search complete: %d chars", len(result["content"]))

        return result

    async def deep_research(self, query: str, context: str = "") -> dict:
        """Deep research via Perplexity Deep Research.

        Use for: weekly market reports, neighborhood deep dives, trend analysis.
        Takes longer, produces comprehensive multi-source reports.
        """
        messages = []
        if context:
            messages.append({"role": "system", "content": context})
        messages.append({"role": "user", "content": query})

        result = await self._call(
            messages=messages,
            model=PERPLEXITY_DEEP_RESEARCH,
            max_tokens=8192,
            temperature=0.2,
        )

        if result.get("content"):
            logger.info("Perplexity deep research complete: %d chars", len(result["content"]))

        return result

    # ── Generic Chat (any model via OpenRouter) ───────────────────────────

    async def chat(
        self,
        message: str,
        model: str = PERPLEXITY_SONAR_PRO,
        system_prompt: str = "",
        max_tokens: int = 4096,
    ) -> dict:
        """Send a chat message to any model available on OpenRouter."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": message})

        return await self._call(
            messages=messages,
            model=model,
            max_tokens=max_tokens,
        )

    # ── REI-Specific Research Methods ────────────────────────────────────

    async def research_comps(self, address: str, radius_miles: float = 0.5) -> dict:
        """Research comparable sales for a property."""
        query = (
            f"Find comparable sales (comps) within {radius_miles} miles of {address}. "
            f"Focus on properties sold in the last 6 months. Include sale price, "
            f"price per square foot, bed/bath count, square footage, condition, "
            f"and sale date. Present as a table."
        )
        return await self.search(query, context="You are a real estate comp analyst.")

    async def research_neighborhood(self, address: str) -> dict:
        """Research neighborhood data for a property."""
        query = (
            f"Provide a neighborhood analysis for {address}. Include: "
            f"crime statistics, school ratings (GreatSchools), "
            f"walkability score, nearby amenities, flood zone status, "
            f"recent permit activity, and any environmental concerns. "
            f"Also note any upcoming developments or zoning changes."
        )
        return await self.search(query, context="You are a real estate market analyst.")

    async def research_market(self, market: str) -> dict:
        """Research market conditions for a city/metro area."""
        query = (
            f"Provide current real estate market conditions for {market}. Include: "
            f"median home price and YoY trend, median rent and trend, "
            f"days on market, vacancy rate, population growth, "
            f"job growth, major employers, and any notable market events. "
            f"Focus on investment-relevant metrics."
        )
        return await self.search(query, context="You are a real estate market researcher.")

    async def research_rent_estimate(self, address: str, bed: int, bath: int) -> dict:
        """Estimate rent for a property."""
        query = (
            f"Estimate the monthly rent for a {bed}bed/{bath}bath property at {address}. "
            f"Provide the estimate with supporting data: nearby rental comps, "
            f"Zillow/Rentometer estimates if available, and any factors "
            f"that would affect the rent (condition, amenities, location)."
        )
        return await self.search(query, context="You are a rental market analyst.")

    # ── Cost Tracking ────────────────────────────────────────────────────

    @staticmethod
    def _estimate_cost(model: str, usage: dict) -> float:
        """Rough cost estimate based on model and token usage."""
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)

        # Approximate per-million-token costs via OpenRouter (as of early 2026)
        rates = {
            PERPLEXITY_SONAR_PRO: (3.0, 15.0),      # $3/M in, $15/M out
            PERPLEXITY_SONAR: (1.0, 1.0),            # $1/M in, $1/M out
            PERPLEXITY_DEEP_RESEARCH: (2.0, 8.0),    # estimate
        }

        in_rate, out_rate = rates.get(model, (3.0, 15.0))
        cost = (input_tokens * in_rate + output_tokens * out_rate) / 1_000_000
        return round(cost, 6)


# Singleton
openrouter_client = OpenRouterClient()
