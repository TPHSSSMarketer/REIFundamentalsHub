"""Tests for new features: GHL tools, ElevenLabs, agent spawner, tenant manager."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── GHL Tool Tests ──────────────────────────────────────────────────────────


def test_ghl_tool_definitions():
    """GHL client exposes MCP tool definitions."""
    from helm.integrations.ghl import ghl_client

    tools = ghl_client.get_tool_definitions()
    assert len(tools) >= 16
    tool_names = {t["name"] for t in tools}
    assert "ghl_search_contacts" in tool_names
    assert "ghl_get_opportunities" in tool_names
    assert "ghl_create_task" in tool_names
    assert "ghl_send_message" in tool_names


def test_ghl_connection_status_unconfigured():
    """GHL reports not configured when no credentials set."""
    from helm.integrations.ghl import GHLClient

    client = GHLClient()
    status = client.get_connection_status()
    assert status["configured"] is False


@pytest.mark.asyncio
async def test_ghl_execute_tool_unknown():
    """Unknown tool name returns error."""
    from helm.integrations.ghl import ghl_client

    result = await ghl_client.execute_tool("ghl_nonexistent", {})
    assert "error" in result


@pytest.mark.asyncio
async def test_ghl_execute_tool_not_configured():
    """Tools return error when GHL is not configured."""
    from helm.integrations.ghl import GHLClient

    client = GHLClient()
    result = await client.execute_tool("ghl_search_contacts", {"query": "test"})
    assert "error" in result


def test_ghl_auth_url_not_configured():
    """Auth URL returns None when client_id is missing."""
    from helm.integrations.ghl import GHLClient

    client = GHLClient()
    assert client.get_auth_url() is None


# ── ElevenLabs Tests ────────────────────────────────────────────────────────


def test_elevenlabs_not_configured():
    """ElevenLabs reports not configured when no API key set."""
    from helm.integrations.elevenlabs import ElevenLabsClient

    client = ElevenLabsClient()
    assert client.is_configured is False


def test_elevenlabs_connection_status():
    """Connection status reports correct fields."""
    from helm.integrations.elevenlabs import ElevenLabsClient

    client = ElevenLabsClient()
    status = client.get_connection_status()
    assert "configured" in status
    assert "has_voice" in status
    assert "has_agent" in status


@pytest.mark.asyncio
async def test_elevenlabs_synthesize_not_configured():
    """Synthesis returns None when not configured."""
    from helm.integrations.elevenlabs import ElevenLabsClient

    client = ElevenLabsClient()
    result = await client.synthesize("Hello world")
    assert result is None


@pytest.mark.asyncio
async def test_elevenlabs_list_voices_not_configured():
    """List voices returns empty when not configured."""
    from helm.integrations.elevenlabs import ElevenLabsClient

    client = ElevenLabsClient()
    voices = await client.list_voices()
    assert voices == []


def test_elevenlabs_agent_config():
    """Agent config builder produces valid structure."""
    from helm.integrations.elevenlabs import ElevenLabsClient

    client = ElevenLabsClient()
    config = client.get_agent_config(
        system_prompt="You are a helpful assistant.",
        conversation_history=[
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi!"},
        ],
        goals=[{"goal": "Close 5 deals this month"}],
    )
    assert "agent_config" in config
    assert "prompt" in config["agent_config"]
    assert "first_message" in config["agent_config"]


# ── Agent Spawner Tests ─────────────────────────────────────────────────────


def test_agent_spawner_detect_agent():
    """Spawner detects agent routing from message content."""
    from helm.orchestrator.agent_spawner import agent_spawner

    # Intent-based routing (works with core agents)
    assert agent_spawner.detect_agent("draft an email to the seller") == "outreach-drafter"
    assert agent_spawner.detect_agent("what's on my plate today") == "task-manager"
    assert agent_spawner.detect_agent("hello there") is None


def test_agent_spawner_detect_explicit_at_mention():
    """@ mention routes to the correct agent (only if registered)."""
    from helm.orchestrator.agent_spawner import agent_spawner

    # Core agents are always registered
    assert agent_spawner.detect_agent("@health-coach how's my progress") == "health-coach"
    assert agent_spawner.detect_agent("@research-assistant look up interest rates") == "research-assistant"
    assert agent_spawner.detect_agent("@outreach-drafter write a follow-up") == "outreach-drafter"


@pytest.mark.asyncio
async def test_agent_spawner_unknown_agent():
    """Running an unknown agent returns failure."""
    from helm.orchestrator.agent_spawner import agent_spawner

    result = await agent_spawner.run_agent("nonexistent-agent", "do something")
    assert result.status == "failed"
    assert "Unknown agent" in result.error


# ── Tenant Manager Tests ────────────────────────────────────────────────────


def test_tenant_manager_default_configs():
    """Default configs have expected structure."""
    from helm.integrations.tenant_manager import DEFAULT_AGENT_CONFIG, DEFAULT_GATING_CONFIG

    assert "enabled_agents" in DEFAULT_AGENT_CONFIG
    assert len(DEFAULT_AGENT_CONFIG["enabled_agents"]) >= 4
    assert "min_hours_between_checkins" in DEFAULT_GATING_CONFIG
    assert DEFAULT_GATING_CONFIG["quiet_hours_start"] == 22


def test_tenant_manager_generate_prompt():
    """Tenant manager generates sensible default prompts."""
    from helm.integrations.tenant_manager import TenantManager

    tm = TenantManager()
    prompt = tm._generate_default_prompt("Alex")
    assert "Grace" in prompt
    assert "Alex" in prompt


def test_tenant_manager_generate_onboarding_prompt():
    """Onboarding prompt includes business type and goals."""
    from helm.integrations.tenant_manager import TenantManager

    tm = TenantManager()
    prompt = tm._generate_onboarding_prompt(
        "Alex", "real_estate", ["Buy 10 properties", "Grow portfolio"]
    )
    assert "real_estate" in prompt
    assert "Buy 10 properties" in prompt


# ── Memory Persistence Tests ────────────────────────────────────────────────


def test_memory_add_sync():
    """Synchronous add still works for backward compatibility."""
    from helm.assistant.memory import ConversationMemory

    mem = ConversationMemory()
    mem.add("test_conv", "user", "Hello")
    mem.add("test_conv", "assistant", "Hi!")

    history = mem.get_history("test_conv")
    assert len(history) == 2
    assert history[0]["role"] == "user"


def test_memory_conversation_meta():
    """Conversation metadata is correctly generated."""
    from helm.assistant.memory import ConversationMemory

    mem = ConversationMemory()
    mem.add("conv_1", "user", "What is real estate investing?")
    mem.add("conv_1", "assistant", "Real estate investing involves...")
    mem.add("conv_2", "user", "Hello there")

    metas = mem.list_conversations_meta()
    assert len(metas) == 2
    assert metas[0].message_count >= 1


# ── Context Sync Tests ──────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_context_sync_generates_default():
    """Context sync creates default context file when none exists."""
    from helm.orchestrator.context_sync import _generate_default_context

    content = _generate_default_context()
    assert "Helm AI Assistant" in content
    assert "Master Context" in content


# ── New API Route Tests ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_ghl_status_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/ghl/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "configured" in data


@pytest.mark.asyncio
async def test_ghl_tools_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/ghl/tools")
        assert resp.status_code == 200
        data = resp.json()
        assert "tools" in data
        assert len(data["tools"]) >= 16


@pytest.mark.asyncio
async def test_goals_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/goals")
        assert resp.status_code == 200
        data = resp.json()
        assert "goals" in data


@pytest.mark.asyncio
async def test_agents_run_requires_params():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/agents/run", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data


@pytest.mark.asyncio
async def test_elevenlabs_status_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/voice/elevenlabs/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "configured" in data


@pytest.mark.asyncio
async def test_tenants_list_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/tenants")
        assert resp.status_code == 200
        data = resp.json()
        assert "tenants" in data


@pytest.mark.asyncio
async def test_agent_logs_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/agents/logs")
        assert resp.status_code == 200
        data = resp.json()
        assert "logs" in data
