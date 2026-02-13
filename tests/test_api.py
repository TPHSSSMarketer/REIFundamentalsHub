"""Tests for the Helm API endpoints."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from helm.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["service"] == "Helm AI Assistant"


@pytest.mark.asyncio
async def test_portfolio_returns_empty_when_unconfigured(client: AsyncClient):
    resp = await client.get("/api/portfolio")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_properties"] == 0


@pytest.mark.asyncio
async def test_clear_nonexistent_conversation(client: AsyncClient):
    resp = await client.delete("/api/chat/nonexistent-id")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cleared"
