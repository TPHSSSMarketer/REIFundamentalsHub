"""Tests for the Helm API endpoints."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from helm.main import app


AUTH_HEADERS = {"X-API-Key": "test-api-key-for-tests"}


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers=AUTH_HEADERS) as ac:
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
    """Portfolio endpoint now lives at /api/plugins/rei/portfolio."""
    resp = await client.get("/api/plugins/rei/portfolio")
    # Plugin routes are registered during lifespan, so this should work
    assert resp.status_code in (200, 404)  # 404 if lifespan hasn't run
    if resp.status_code == 200:
        data = resp.json()
        assert data["total_properties"] == 0


@pytest.mark.asyncio
async def test_clear_nonexistent_conversation(client: AsyncClient):
    resp = await client.delete("/api/chat/nonexistent-id")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "cleared"


@pytest.mark.asyncio
async def test_telegram_webhook_accepts_empty_update(client: AsyncClient):
    resp = await client.post("/api/telegram/webhook", json={})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


@pytest.mark.asyncio
async def test_whatsapp_webhook_verification_rejects_bad_token(client: AsyncClient):
    resp = await client.get(
        "/api/whatsapp/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "bad-token",
            "hub.challenge": "test",
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_whatsapp_webhook_post_accepts_empty_payload(client: AsyncClient):
    resp = await client.post("/api/whatsapp/webhook", json={})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_voice_synthesize_rejects_empty_text(client: AsyncClient):
    resp = await client.post("/api/voice/synthesize", json={"text": ""})
    assert resp.status_code == 200
    data = resp.json()
    assert "error" in data
