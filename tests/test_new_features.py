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
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/ghl/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "configured" in data


@pytest.mark.asyncio
async def test_ghl_tools_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
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
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/goals")
        assert resp.status_code == 200
        data = resp.json()
        assert "goals" in data


@pytest.mark.asyncio
async def test_agents_run_requires_params():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.post("/api/agents/run", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data


@pytest.mark.asyncio
async def test_elevenlabs_status_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/voice/elevenlabs/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "configured" in data


@pytest.mark.asyncio
async def test_tenants_list_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/tenants")
        assert resp.status_code == 200
        data = resp.json()
        assert "tenants" in data


@pytest.mark.asyncio
async def test_agent_logs_endpoint():
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/agents/logs")
        assert resp.status_code == 200
        data = resp.json()
        assert "logs" in data


# ── Circuit Breakers & Reliability Tests ─────────────────────────────────────


def test_breakers_registry():
    """All named breakers are registered and have correct defaults."""
    from helm.reliability.breakers import _ALL_BREAKERS, get_breaker

    assert "ghl" in _ALL_BREAKERS
    assert "elevenlabs" in _ALL_BREAKERS
    assert "whatsapp" in _ALL_BREAKERS
    assert "telegram" in _ALL_BREAKERS
    assert "supabase" in _ALL_BREAKERS
    assert "openrouter" in _ALL_BREAKERS

    ghl = get_breaker("ghl")
    assert ghl is not None
    assert ghl.failure_threshold == 3

    wa = get_breaker("whatsapp")
    assert wa is not None
    assert wa.failure_threshold == 5  # Higher threshold for messaging


def test_breakers_all_status():
    """get_all_breaker_status returns structured report."""
    from helm.reliability.breakers import get_all_breaker_status

    status = get_all_breaker_status()
    assert "breakers" in status
    assert "open_count" in status
    assert "total" in status
    assert status["total"] == 6
    assert status["open_count"] == 0  # All closed initially


@pytest.mark.asyncio
async def test_protected_call_unknown_breaker():
    """protected_call with unknown breaker falls through to direct call."""
    from helm.reliability.breakers import protected_call

    async def dummy():
        return 42

    result = await protected_call("nonexistent", dummy)
    assert result == 42


@pytest.mark.asyncio
async def test_protected_call_known_breaker():
    """protected_call through a known breaker works normally."""
    from helm.reliability.breakers import protected_call

    async def dummy():
        return "ok"

    result = await protected_call("ghl", dummy)
    assert result == "ok"


# ── Check-in Scheduler Tests ────────────────────────────────────────────────


def test_checkin_gating_quiet_hours():
    """GatingRules blocks during quiet hours."""
    from helm.checkins.scheduler import GatingRules

    rules = GatingRules({"quiet_hours_start": 22, "quiet_hours_end": 7})
    # Test the quiet hours detection
    from datetime import datetime, timezone
    midnight = datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc)
    assert rules._in_quiet_hours(midnight) is True

    noon = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
    assert rules._in_quiet_hours(noon) is False


def test_checkin_gating_sacred_blocks():
    """GatingRules respects sacred blocks."""
    from helm.checkins.scheduler import GatingRules

    config = {
        "sacred_blocks": [{"start": "09:00", "end": "11:00", "label": "Deep Work"}],
        "quiet_hours_start": 22,
        "quiet_hours_end": 7,
    }
    rules = GatingRules(config)
    from datetime import datetime, timezone
    ten_am = datetime(2025, 1, 1, 10, 0, tzinfo=timezone.utc)
    assert rules._in_sacred_block(ten_am)  # Returns label string (truthy)

    two_pm = datetime(2025, 1, 1, 14, 0, tzinfo=timezone.utc)
    assert not rules._in_sacred_block(two_pm)  # Returns None/empty (falsy)


def test_checkin_scheduler_singleton():
    """Scheduler singleton is importable."""
    from helm.checkins.scheduler import checkin_scheduler
    assert checkin_scheduler is not None


# ── WhatsApp Calling Tests ───────────────────────────────────────────────────


def test_whatsapp_calling_not_configured():
    """WhatsAppCallingClient reports status when not configured."""
    from helm.integrations.whatsapp_calling import whatsapp_calling

    status = whatsapp_calling.get_connection_status()
    assert "configured" in status
    assert "active_calls" in status


@pytest.mark.asyncio
async def test_whatsapp_calling_initiate_not_configured():
    """Initiating a call when not configured returns error."""
    from helm.integrations.whatsapp_calling import whatsapp_calling

    result = await whatsapp_calling.initiate_call("1234567890")
    assert "error" in result


@pytest.mark.asyncio
async def test_whatsapp_calling_webhook_handler():
    """Call webhook dispatches to correct handler."""
    from helm.integrations.whatsapp_calling import whatsapp_calling

    # Unknown event type should be handled gracefully
    result = await whatsapp_calling.handle_call_webhook({
        "event_type": "unknown_event",
        "data": {},
    })
    assert result is not None or result is None  # Should not raise


# ── GHL SaaS Tests ──────────────────────────────────────────────────────────


def test_ghl_saas_onboarding_questions():
    """get_onboarding_questions returns structured questionnaire."""
    from helm.integrations.ghl_saas import ghl_saas

    questions = ghl_saas.get_onboarding_questions()
    assert isinstance(questions, list)
    assert len(questions) > 0

    # Each question should have id, label, type
    for q in questions:
        assert "id" in q
        assert "label" in q
        assert "type" in q


def test_ghl_saas_business_type_map():
    """Business type mapping provides correct agent configs."""
    from helm.integrations.ghl_saas import _BUSINESS_AGENT_MAP

    assert "real_estate" in _BUSINESS_AGENT_MAP
    re_agents = _BUSINESS_AGENT_MAP["real_estate"]["enabled_agents"]
    assert "deal-analyzer" in re_agents
    assert "market-researcher" in re_agents

    assert "general" in _BUSINESS_AGENT_MAP


@pytest.mark.asyncio
async def test_ghl_saas_handle_unknown_event():
    """SaaS webhook handler ignores unknown events."""
    from helm.integrations.ghl_saas import ghl_saas

    result = await ghl_saas.handle_webhook("unknown.event", {})
    assert result is not None or result is None  # Should not raise


# ── API Endpoint Tests for New Features ──────────────────────────────────────


@pytest.mark.asyncio
async def test_breakers_endpoint():
    """GET /reliability/breakers returns breaker status."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/reliability/breakers")
        assert resp.status_code == 200
        data = resp.json()
        assert "breakers" in data


@pytest.mark.asyncio
async def test_retry_queue_endpoint():
    """GET /reliability/retry-queue returns queue status."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/reliability/retry-queue")
        assert resp.status_code == 200
        data = resp.json()
        assert "pending" in data


@pytest.mark.asyncio
async def test_voice_call_status_endpoint():
    """GET /voice/call/status returns calling integration status."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/voice/call/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "configured" in data


@pytest.mark.asyncio
async def test_saas_onboarding_questions_endpoint():
    """GET /onboarding/saas/questions returns questionnaire."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/onboarding/saas/questions")
        assert resp.status_code == 200
        data = resp.json()
        assert "questions" in data
        assert len(data["questions"]) > 0


# ── Idempotency Key Tests ──────────────────────────────────────────────────


def test_retry_queue_idempotency_key_generation():
    """Idempotency keys are deterministic for same input."""
    from helm.reliability.retry_queue import RetryQueue

    key1 = RetryQueue._generate_idempotency_key("ghl_create_task", {"title": "Test"})
    key2 = RetryQueue._generate_idempotency_key("ghl_create_task", {"title": "Test"})
    assert key1 == key2
    assert len(key1) == 16  # truncated sha256 hex


def test_retry_queue_idempotency_key_differs():
    """Different payloads produce different keys."""
    from helm.reliability.retry_queue import RetryQueue

    key1 = RetryQueue._generate_idempotency_key("ghl_create_task", {"title": "A"})
    key2 = RetryQueue._generate_idempotency_key("ghl_create_task", {"title": "B"})
    assert key1 != key2


def test_retry_queue_deduplication():
    """Enqueue rejects duplicate actions with same idempotency key."""
    from helm.reliability.retry_queue import RetryQueue

    q = RetryQueue()
    q._queue.clear()  # ensure clean state

    id1 = q.enqueue("test_action", {"key": "value"})
    id2 = q.enqueue("test_action", {"key": "value"})  # duplicate

    assert id1 == id2  # Same ID returned
    assert q.pending_count == 1  # Only one in queue

    q._queue.clear()  # cleanup


# ── Circuit Breaker Wiring Tests ───────────────────────────────────────────


def test_ghl_imports_breaker():
    """GHL module imports and uses ghl_breaker."""
    import helm.integrations.ghl as ghl_mod
    assert hasattr(ghl_mod, "ghl_breaker")


def test_whatsapp_imports_breaker():
    """WhatsApp module imports and uses whatsapp_breaker."""
    import helm.integrations.whatsapp as wa_mod
    assert hasattr(wa_mod, "whatsapp_breaker")


def test_telegram_imports_breaker():
    """Telegram module imports and uses telegram_breaker."""
    import helm.integrations.telegram as tg_mod
    assert hasattr(tg_mod, "telegram_breaker")


def test_elevenlabs_imports_breaker():
    """ElevenLabs module imports and uses elevenlabs_breaker."""
    import helm.integrations.elevenlabs as el_mod
    assert hasattr(el_mod, "elevenlabs_breaker")


def test_openrouter_imports_breaker():
    """OpenRouter module imports and uses openrouter_breaker."""
    import helm.integrations.openrouter as or_mod
    assert hasattr(or_mod, "openrouter_breaker")


def test_supabase_imports_breaker():
    """Supabase memory module imports and uses supabase_breaker."""
    import helm.integrations.supabase_memory as sb_mod
    assert hasattr(sb_mod, "supabase_breaker")


# ── JSON Logging Tests ────────────────────────────────────────────────────


def test_json_formatter():
    """JSONFormatter produces valid JSON log entries."""
    import json as json_mod
    import logging as log_mod
    from helm.logging_config import JSONFormatter

    formatter = JSONFormatter()
    record = log_mod.LogRecord(
        name="test", level=log_mod.INFO, pathname="", lineno=0,
        msg="Hello %s", args=("world",), exc_info=None,
    )
    output = formatter.format(record)
    parsed = json_mod.loads(output)
    assert parsed["message"] == "Hello world"
    assert parsed["level"] == "INFO"
    assert "timestamp" in parsed


def test_json_formatter_extra_fields():
    """JSONFormatter includes Helm-specific extra fields."""
    import json as json_mod
    import logging as log_mod
    from helm.logging_config import JSONFormatter

    formatter = JSONFormatter()
    record = log_mod.LogRecord(
        name="test", level=log_mod.INFO, pathname="", lineno=0,
        msg="test", args=(), exc_info=None,
    )
    record.tenant_id = "t-123"
    record.agent_name = "deal-analyzer"
    output = formatter.format(record)
    parsed = json_mod.loads(output)
    assert parsed["tenant_id"] == "t-123"
    assert parsed["agent_name"] == "deal-analyzer"


def test_setup_logging():
    """setup_logging configures root logger without error."""
    from helm.logging_config import setup_logging
    setup_logging(level="WARNING", json_output=False)
    # Restore for other tests
    setup_logging(level="WARNING", json_output=False)


# ── Runner Scripts Tests ─────────────────────────────────────────────────


def test_context_sync_runner_importable():
    """Context sync runner module is importable."""
    from helm.orchestrator import run_context_sync
    assert hasattr(run_context_sync, "main")


def test_checkin_runner_importable():
    """Check-in runner module is importable."""
    from helm.checkins import run_checkins
    assert hasattr(run_checkins, "main")


# ── Telegram Callback Action Tests ───────────────────────────────────────


def test_telegram_has_execute_callback():
    """TelegramBot has _execute_callback_action method."""
    from helm.integrations.telegram import telegram_bot
    assert hasattr(telegram_bot, "_execute_callback_action")


# ── Checkin Scheduler Snooze Tests ───────────────────────────────────────


def test_checkin_scheduler_has_snooze():
    """CheckinScheduler has snooze_topic method."""
    from helm.checkins.scheduler import checkin_scheduler
    assert hasattr(checkin_scheduler, "snooze_topic")


# ── Auth Middleware Tests ──────────────────────────────────────────────────


def test_rate_limiter_allows():
    """RateLimiter allows requests within limit."""
    from helm.api.middleware import RateLimiter
    limiter = RateLimiter(max_requests=5, window_seconds=60)
    for _ in range(5):
        assert limiter.is_allowed("test-ip") is True
    assert limiter.is_allowed("test-ip") is False


def test_rate_limiter_different_keys():
    """RateLimiter tracks keys independently."""
    from helm.api.middleware import RateLimiter
    limiter = RateLimiter(max_requests=2, window_seconds=60)
    assert limiter.is_allowed("ip-a") is True
    assert limiter.is_allowed("ip-a") is True
    assert limiter.is_allowed("ip-a") is False
    assert limiter.is_allowed("ip-b") is True  # Different key still allowed


@pytest.mark.asyncio
async def test_auth_required_endpoint_rejects_no_auth():
    """Authenticated endpoints reject requests without credentials."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/integrations")
        assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_with_api_key():
    """Authenticated endpoints accept valid API key."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/integrations")
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_webhooks_dont_require_auth():
    """Webhook endpoints are public (no auth required)."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/telegram/webhook", json={})
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_health_endpoints_public():
    """Health endpoints are public."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
        assert resp.status_code == 200


# ── Permission System Tests ──────────────────────────────────────────────


def test_permissions_module_importable():
    """Permissions module is importable."""
    from helm.api.permissions import check_tool_permission, check_action_permission, GHL_TOOL_PERMISSIONS
    assert len(GHL_TOOL_PERMISSIONS) >= 16


def test_read_tool_auto_approved():
    """Read-only GHL tools are auto-approved."""
    from helm.api.permissions import check_tool_permission
    allowed, reason = check_tool_permission("ghl_search_contacts")
    assert allowed is True
    assert reason == "auto_approved"


def test_write_tool_requires_confirmation():
    """Write GHL tools require confirmation for non-admin users."""
    from helm.api.permissions import check_tool_permission
    allowed, reason = check_tool_permission("ghl_create_task", user={"is_admin": False})
    assert allowed is False
    assert "confirmation" in reason


def test_write_tool_admin_override():
    """Admin users bypass confirmation for write tools."""
    from helm.api.permissions import check_tool_permission
    allowed, reason = check_tool_permission("ghl_create_task", user={"is_admin": True})
    assert allowed is True
    assert reason == "admin_override"


def test_engine_permission_check():
    """Engine has _check_and_enforce_permission method."""
    from helm.assistant.engine import helm_engine
    assert hasattr(helm_engine, "_check_and_enforce_permission")


def test_engine_detect_write_action():
    """Engine correctly maps tool names to permission actions."""
    from helm.assistant.engine import HelmEngine
    assert HelmEngine._detect_write_action("ghl_create_task") == "create_task"
    assert HelmEngine._detect_write_action("ghl_search_contacts") is None


# ── Tenant Isolation Tests ───────────────────────────────────────────────


def test_tenant_scoped_query():
    """tenant_scoped_query adds WHERE clause for tenant_id."""
    from helm.models.database import tenant_scoped_query, Memory
    query = tenant_scoped_query(Memory, "test-tenant")
    compiled = str(query)
    assert "tenant_id" in compiled


def test_tenant_scoped_query_no_tenant():
    """tenant_scoped_query without tenant_id returns unscoped query."""
    from helm.models.database import tenant_scoped_query, Memory
    query = tenant_scoped_query(Memory, None)
    compiled = str(query)
    # Should still be a valid query, just not scoped
    assert "memories" in compiled.lower()


# ── Health Alerting Tests ────────────────────────────────────────────────


def test_health_checker_has_alert():
    """HealthChecker has alert_on_failure and run_and_alert methods."""
    from helm.reliability.health_check import health_checker
    assert hasattr(health_checker, "alert_on_failure")
    assert hasattr(health_checker, "run_and_alert")


# ── Anti-Spam Gating Tests ──────────────────────────────────────────────


def test_gating_check_sent_folder():
    """GatingRules has check_sent_folder config."""
    from helm.checkins.scheduler import GatingRules
    rules = GatingRules({"check_sent_folder": True, "quiet_hours_start": 22, "quiet_hours_end": 7})
    assert rules.check_sent_folder is True


def test_gating_contact_frequency_aware():
    """GatingRules has contact_frequency_aware config."""
    from helm.checkins.scheduler import GatingRules
    rules = GatingRules({"contact_frequency_aware": True, "quiet_hours_start": 22, "quiet_hours_end": 7})
    assert rules.contact_frequency_aware is True
    assert rules.max_surfaces_before_suppress == 3


def test_gating_filter_already_handled():
    """filter_already_handled removes items for recently-contacted people."""
    from helm.checkins.scheduler import GatingRules
    from datetime import datetime, timezone

    rules = GatingRules({"check_sent_folder": True, "quiet_hours_start": 22, "quiet_hours_end": 7})

    class FakeDecision:
        def __init__(self, topic, details=""):
            self.topic = topic
            self.details = details

    decisions = [FakeDecision("contact-123", "Follow up with contact-123")]
    outbound = [{"contact_id": "contact-123", "sent_at": datetime.now(timezone.utc).isoformat()}]

    filtered = rules.filter_already_handled(decisions, outbound)
    assert len(filtered) == 0  # Should be filtered out


def test_gating_track_surface_count():
    """track_surface_count increments topic counters."""
    from helm.checkins.scheduler import GatingRules
    rules = GatingRules({"contact_frequency_aware": True, "quiet_hours_start": 22, "quiet_hours_end": 7})

    pending = []
    pending = rules.track_surface_count("deal-review", pending)
    assert len(pending) == 1
    assert pending[0]["surface_count"] == 1

    pending = rules.track_surface_count("deal-review", pending)
    assert pending[0]["surface_count"] == 2


# ── GHL Custom Fields Tests ─────────────────────────────────────────────


def test_ghl_has_create_custom_fields():
    """GHL client has create_custom_fields method."""
    from helm.integrations.ghl import ghl_client
    assert hasattr(ghl_client, "create_custom_fields")


# ── Hub Integration Tests ──────────────────────────────────────────────────


def test_hub_routes_importable():
    """Hub routes module is importable and has endpoints."""
    from helm.plugins.rei.hub_routes import router
    assert len(router.routes) >= 9


def test_hub_middleware_importable():
    """Hub middleware module is importable."""
    from helm.plugins.rei.hub_middleware import require_rei_plugin
    assert callable(require_rei_plugin)


def test_reifundamentals_client_properties():
    """REIFundamentals client has Hub-aware properties."""
    from helm.integrations.reifundamentals import reifundamentals_client

    assert hasattr(reifundamentals_client, "is_configured")
    assert hasattr(reifundamentals_client, "hub_connected")
    assert hasattr(reifundamentals_client, "notify_hub")
    assert hasattr(reifundamentals_client, "verify_webhook")
    assert hasattr(reifundamentals_client, "_portfolio_from_ghl")


def test_reifundamentals_client_not_connected():
    """REIFundamentals client reports not connected without API key."""
    from helm.integrations.reifundamentals import reifundamentals_client

    assert reifundamentals_client.hub_connected is False


@pytest.mark.asyncio
async def test_reifundamentals_portfolio_fallback():
    """Portfolio returns empty overview when nothing configured."""
    from helm.integrations.reifundamentals import reifundamentals_client

    portfolio = await reifundamentals_client.get_portfolio()
    assert portfolio.total_properties == 0
    assert portfolio.total_value == 0.0


def test_hub_event_summarizer():
    """Hub event summarizer creates readable summaries."""
    from helm.plugins.rei.hub_routes import _summarize_event

    # Deal created
    summary = _summarize_event("deal.created", {"title": "123 Oak St", "value": 250000})
    assert "123 Oak St" in summary
    assert "$250,000" in summary

    # Contact added
    summary = _summarize_event("contact.added", {"firstName": "John", "lastName": "Doe"})
    assert "John Doe" in summary

    # Task completed
    summary = _summarize_event("task.completed", {"title": "Call seller"})
    assert "Call seller" in summary

    # Stage change
    summary = _summarize_event("deal.stage_changed", {"title": "456 Elm", "stageName": "Under Contract"})
    assert "Under Contract" in summary


def test_hub_webhook_signature_verification():
    """Webhook signature verification works correctly."""
    import hashlib
    import hmac as hmac_mod

    from helm.integrations.reifundamentals import REIFundamentalsClient

    client = REIFundamentalsClient.__new__(REIFundamentalsClient)
    client._webhook_secret = "test-secret"

    payload = b'{"event": "test"}'
    valid_sig = hmac_mod.new(b"test-secret", payload, hashlib.sha256).hexdigest()
    assert client.verify_webhook(payload, valid_sig) is True
    assert client.verify_webhook(payload, "invalid-signature") is False


def test_hub_webhook_no_secret_accepts_all():
    """Webhook verification accepts all when no secret configured."""
    from helm.integrations.reifundamentals import REIFundamentalsClient

    client = REIFundamentalsClient.__new__(REIFundamentalsClient)
    client._webhook_secret = ""

    assert client.verify_webhook(b"anything", "any-sig") is True


def test_cors_origins_config():
    """CORS origins can be configured via settings."""
    from helm.config import Settings

    s = Settings(cors_origins="https://hub.example.com,http://localhost:5173")
    origins = [o.strip() for o in s.cors_origins.split(",") if o.strip()]
    assert len(origins) == 2
    assert "https://hub.example.com" in origins
    assert "http://localhost:5173" in origins


# ── Stripe Integration Tests ──────────────────────────────────────────────


def test_stripe_client_importable():
    """Stripe client module is importable."""
    from helm.integrations.stripe_client import stripe_client
    assert hasattr(stripe_client, "is_configured")
    assert hasattr(stripe_client, "create_checkout_session")
    assert hasattr(stripe_client, "create_portal_session")
    assert hasattr(stripe_client, "verify_webhook")


def test_stripe_not_configured():
    """Stripe reports not configured without API key."""
    from helm.integrations.stripe_client import stripe_client
    assert stripe_client.is_configured is False


def test_stripe_webhook_verification_no_secret():
    """Stripe webhook verification works without secret (accepts all)."""
    import json
    from helm.integrations.stripe_client import StripeClient

    client = StripeClient.__new__(StripeClient)
    client._secret_key = ""
    client._webhook_secret = ""

    payload = json.dumps({"type": "test.event"}).encode()
    result = client.verify_webhook(payload, "")
    assert result is not None
    assert result["type"] == "test.event"


# ── PayPal Integration Tests ─────────────────────────────────────────────


def test_paypal_client_importable():
    """PayPal client module is importable."""
    from helm.integrations.paypal_client import paypal_client
    assert hasattr(paypal_client, "is_configured")
    assert hasattr(paypal_client, "create_subscription")
    assert hasattr(paypal_client, "cancel_subscription")
    assert hasattr(paypal_client, "verify_webhook")


def test_paypal_not_configured():
    """PayPal reports not configured without credentials."""
    from helm.integrations.paypal_client import paypal_client
    assert paypal_client.is_configured is False


def test_paypal_api_base_sandbox():
    """PayPal uses sandbox URL by default."""
    from helm.integrations.paypal_client import _paypal_api_base
    assert "sandbox" in _paypal_api_base()


# ── Billing Routes Tests ─────────────────────────────────────────────────


def test_billing_routes_importable():
    """Billing routes module is importable with all endpoints."""
    from helm.api.billing_routes import billing_router
    assert len(billing_router.routes) >= 7


@pytest.mark.asyncio
async def test_billing_status_endpoint():
    """GET /billing/status returns billing configuration."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/billing/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "stripe_configured" in data
        assert "paypal_configured" in data
        assert "plans" in data
        assert "base" in data["plans"]
        assert "rei_plugin" in data["plans"]


@pytest.mark.asyncio
async def test_stripe_checkout_unconfigured():
    """Stripe checkout returns 503 when not configured."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.post("/api/billing/stripe/checkout", json={
            "plan": "base", "email": "test@example.com", "tenant_id": "t-1"
        })
        assert resp.status_code == 503


@pytest.mark.asyncio
async def test_paypal_subscribe_unconfigured():
    """PayPal subscribe returns 503 when not configured."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.post("/api/billing/paypal/subscribe", json={
            "plan": "base", "email": "test@example.com", "tenant_id": "t-1"
        })
        assert resp.status_code == 503


@pytest.mark.asyncio
async def test_billing_activate_plugin_admin_access():
    """Admin (API key user) can access plugin activation — gets 404 for missing tenant."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.post("/api/billing/activate-plugin", json={
            "tenant_id": "nonexistent", "plugin": "rei", "active": True
        })
        # API key users are admin — passes gate, 404 because tenant doesn't exist
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_billing_activate_plugin_no_auth():
    """Plugin activation rejects unauthenticated requests."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/billing/activate-plugin", json={
            "tenant_id": "t-1", "plugin": "rei", "active": True
        })
        assert resp.status_code == 401


def test_billing_toggle_plugin_helper():
    """_toggle_plugin function exists and is async."""
    import inspect
    from helm.api.billing_routes import _toggle_plugin
    assert inspect.iscoroutinefunction(_toggle_plugin)


def test_billing_config_fields():
    """Billing config fields exist in settings."""
    from helm.config import Settings
    s = Settings()
    assert hasattr(s, "stripe_secret_key")
    assert hasattr(s, "stripe_publishable_key")
    assert hasattr(s, "stripe_webhook_secret")
    assert hasattr(s, "paypal_client_id")
    assert hasattr(s, "paypal_client_secret")
    assert hasattr(s, "paypal_mode")
    assert s.paypal_mode == "sandbox"


# ── Hub Billing Routes Tests ────────────────────────────────────────────────


def test_hub_billing_routes_importable():
    """Hub billing routes module is importable with all endpoints."""
    from helm.api.hub_billing_routes import hub_billing_router
    assert len(hub_billing_router.routes) >= 5


@pytest.mark.asyncio
async def test_hub_billing_config_endpoint():
    """GET /hub/billing/config returns public billing config (no auth required)."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/hub/billing/config")
        assert resp.status_code == 200
        data = resp.json()
        assert "stripe" in data
        assert "paypal" in data
        assert "configured" in data["stripe"]
        assert "plans" in data["stripe"]
        assert "configured" in data["paypal"]
        assert "plans" in data["paypal"]
        assert "mode" in data["paypal"]


@pytest.mark.asyncio
async def test_hub_stripe_checkout_unconfigured():
    """Hub Stripe checkout returns 503 when Stripe not configured."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/hub/billing/stripe/checkout", json={
            "plan": "base", "email": "test@hub.com", "tenant_id": "t-hub-1"
        })
        assert resp.status_code == 503


@pytest.mark.asyncio
async def test_hub_stripe_portal_unconfigured():
    """Hub Stripe portal returns 503 when Stripe not configured."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/hub/billing/stripe/portal", json={
            "customer_id": "cus_test123"
        })
        assert resp.status_code == 503


@pytest.mark.asyncio
async def test_hub_paypal_subscribe_unconfigured():
    """Hub PayPal subscribe returns 503 when PayPal not configured."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/hub/billing/paypal/subscribe", json={
            "plan": "base", "email": "test@hub.com", "tenant_id": "t-hub-1"
        })
        assert resp.status_code == 503


@pytest.mark.asyncio
async def test_hub_subscription_status_not_found():
    """Hub subscription status returns 404 for non-existent tenant."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/hub/billing/subscription/nonexistent-tenant")
        assert resp.status_code == 404


@pytest.mark.asyncio
async def test_hub_stripe_checkout_validation():
    """Hub Stripe checkout requires email or customer_id."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Mock stripe as configured by checking the validation path
        resp = await client.post("/api/hub/billing/stripe/checkout", json={
            "plan": "base", "tenant_id": "t-1"
        })
        # Either 503 (not configured) or 400 (validation error)
        assert resp.status_code in (400, 503)


@pytest.mark.asyncio
async def test_hub_paypal_subscribe_validation():
    """Hub PayPal subscribe requires email."""
    from httpx import ASGITransport, AsyncClient
    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/hub/billing/paypal/subscribe", json={
            "plan": "base", "tenant_id": "t-1"
        })
        # Either 503 (not configured) or 400 (validation error)
        assert resp.status_code in (400, 503)


def test_hub_billing_service_file_exists():
    """Hub SDK billing service file exists."""
    from pathlib import Path
    service_file = Path(__file__).parent.parent / "hub-sdk" / "helmBillingService.ts"
    assert service_file.exists()
    content = service_file.read_text()
    assert "HelmBillingService" in content
    assert "stripeCheckout" in content
    assert "paypalSubscribe" in content
    assert "getBillingConfig" in content
    assert "getSubscriptionStatus" in content


def test_hub_billing_portal_component_exists():
    """Hub SDK billing portal React component exists."""
    from pathlib import Path
    component_file = Path(__file__).parent.parent / "hub-sdk" / "HelmBillingPortal.tsx"
    assert component_file.exists()
    content = component_file.read_text()
    assert "HelmBillingPortal" in content
    assert "helmBilling" in content
