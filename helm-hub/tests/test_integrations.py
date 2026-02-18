"""Tests for the REIFundamentals Hub integration layer."""

from __future__ import annotations

import pytest

from helm.integrations.reifundamentals import REIFundamentalsClient
from helm.models.schemas import PortfolioOverview


@pytest.mark.asyncio
async def test_client_returns_empty_portfolio_when_unconfigured():
    """When no API key is set, the client should gracefully return empty data."""
    client = REIFundamentalsClient()
    # Force unconfigured state
    client._api_key = ""

    portfolio = await client.get_portfolio()
    assert isinstance(portfolio, PortfolioOverview)
    assert portfolio.total_properties == 0


@pytest.mark.asyncio
async def test_client_returns_none_for_property_when_unconfigured():
    client = REIFundamentalsClient()
    client._api_key = ""

    result = await client.get_property("prop-123")
    assert result is None


@pytest.mark.asyncio
async def test_client_returns_empty_list_for_search_when_unconfigured():
    client = REIFundamentalsClient()
    client._api_key = ""

    results = await client.search_properties("123 Main St")
    assert results == []


@pytest.mark.asyncio
async def test_client_is_configured_property():
    client = REIFundamentalsClient()
    client._api_key = ""
    assert client.is_configured is False

    client._api_key = "some-key"
    assert client.is_configured is True
