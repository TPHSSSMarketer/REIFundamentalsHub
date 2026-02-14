"""Tests for the Helm AI engine and supporting modules."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest

from helm.assistant.memory import ConversationMemory
from helm.assistant.prompts import MODE_PROMPTS, build_system_prompt
from helm.models.schemas import AssistantMode, ChatRequest


def test_build_system_prompt_includes_identity():
    prompt = build_system_prompt("business")
    assert "Helm" in prompt
    assert "command center" in prompt


def test_build_system_prompt_includes_mode():
    """Core modes (business, personal) are in the prompt."""
    for mode in ("business", "personal"):
        prompt = build_system_prompt(mode)
        assert MODE_PROMPTS[mode] in prompt


def test_build_system_prompt_defaults_to_business():
    prompt = build_system_prompt("unknown_mode")
    assert MODE_PROMPTS["business"] in prompt


def test_conversation_memory_add_and_retrieve():
    mem = ConversationMemory(max_turns=5)
    mem.add("conv1", "user", "Hello")
    mem.add("conv1", "assistant", "Hi there!")

    history = mem.get_history("conv1")
    assert len(history) == 2
    assert history[0]["role"] == "user"
    assert history[1]["content"] == "Hi there!"


def test_conversation_memory_trims_old_turns():
    mem = ConversationMemory(max_turns=3)
    for i in range(5):
        mem.add("conv1", "user", f"Message {i}")

    history = mem.get_history("conv1")
    assert len(history) == 3
    assert history[0]["content"] == "Message 2"


def test_conversation_memory_clear():
    mem = ConversationMemory()
    mem.add("conv1", "user", "Hello")
    mem.clear("conv1")
    assert mem.get_history("conv1") == []


def test_conversation_memory_list_conversations():
    mem = ConversationMemory()
    mem.add("conv1", "user", "A")
    mem.add("conv2", "user", "B")
    convos = mem.list_conversations()
    assert "conv1" in convos
    assert "conv2" in convos


def test_chat_request_defaults():
    req = ChatRequest(message="Hello")
    assert req.mode == AssistantMode.BUSINESS
    assert req.conversation_id is None


def test_assistant_modes():
    assert AssistantMode.BUSINESS.value == "business"
    assert AssistantMode.PERSONAL.value == "personal"
    assert AssistantMode.REAL_ESTATE.value == "real_estate"


# ── Smart Router Integration ─────────────────────────────────────────────────


def test_model_for_tier_opus():
    from helm.assistant.engine import HelmEngine
    from helm.orchestrator.multi_ai_router import ModelTier

    engine = HelmEngine()
    assert "opus" in engine._model_for_tier(ModelTier.OPUS).lower()


def test_model_for_tier_sonnet():
    from helm.assistant.engine import HelmEngine
    from helm.orchestrator.multi_ai_router import ModelTier

    engine = HelmEngine()
    result = engine._model_for_tier(ModelTier.SONNET)
    assert "sonnet" in result.lower() or "claude" in result.lower()


def _mock_anthropic_response(text: str):
    """Create a mock Anthropic messages.create response."""
    block = MagicMock()
    block.text = text
    response = MagicMock()
    response.content = [block]
    return response


from contextlib import contextmanager


@contextmanager
def _force_anthropic(engine):
    """Context manager to force Anthropic backend for testing."""
    with patch.object(type(engine), "_use_openrouter",
                      new_callable=PropertyMock, return_value=False), \
         patch.object(type(engine), "_use_claude_cli",
                      new_callable=PropertyMock, return_value=False):
        yield


@pytest.mark.asyncio
async def test_chat_routes_opus_for_deal_analysis():
    """Messages with deal analysis keywords should use Opus model."""
    from helm.assistant.engine import HelmEngine
    from helm.config import get_settings

    engine = HelmEngine()
    mock_create = AsyncMock(return_value=_mock_anthropic_response("Deal looks great!"))
    engine._client = MagicMock()
    engine._client.messages.create = mock_create

    request = ChatRequest(message="analyze this deal at 123 Oak St", mode=AssistantMode.REAL_ESTATE)
    with _force_anthropic(engine), \
         patch("helm.assistant.engine.agent_spawner") as mock_spawner:
        mock_spawner.detect_agent.return_value = None
        response = await engine.chat(request)

    assert response.model_tier == "opus"
    settings = get_settings()
    mock_create.assert_called_once()
    call_kwargs = mock_create.call_args[1]
    assert call_kwargs["model"] == settings.anthropic_model_opus
    assert response.reply == "Deal looks great!"


@pytest.mark.asyncio
async def test_chat_routes_sonnet_for_simple_message():
    """Simple messages should route to Sonnet."""
    from helm.assistant.engine import HelmEngine

    engine = HelmEngine()
    mock_create = AsyncMock(return_value=_mock_anthropic_response("Good morning!"))
    engine._client = MagicMock()
    engine._client.messages.create = mock_create

    request = ChatRequest(message="hello, how are you?")
    with _force_anthropic(engine), \
         patch("helm.assistant.engine.agent_spawner") as mock_spawner:
        mock_spawner.detect_agent.return_value = None
        response = await engine.chat(request)

    assert response.model_tier == "sonnet"
    assert response.reply == "Good morning!"


@pytest.mark.asyncio
async def test_chat_routes_research_to_openrouter():
    """Research queries should hit OpenRouter, then synthesise with Claude."""
    from helm.assistant.engine import HelmEngine

    engine = HelmEngine()
    mock_create = AsyncMock(return_value=_mock_anthropic_response("Here's what I found..."))
    engine._client = MagicMock()
    engine._client.messages.create = mock_create

    with patch("helm.integrations.openrouter.openrouter_client") as mock_or, \
         _force_anthropic(engine), \
         patch("helm.assistant.engine.agent_spawner") as mock_spawner:
        mock_spawner.detect_agent.return_value = None
        mock_or.search = AsyncMock(return_value={"content": "Median price is $350k..."})

        request = ChatRequest(message="look up comparable sales near 30318")
        response = await engine.chat(request)

    assert response.model_tier == "perplexity_search"
    assert "perplexity" in response.model_used
    assert response.reply == "Here's what I found..."


@pytest.mark.asyncio
async def test_chat_research_fallback_when_openrouter_unconfigured():
    """When OpenRouter has no content, fall back to Sonnet."""
    from helm.assistant.engine import HelmEngine

    engine = HelmEngine()
    mock_create = AsyncMock(return_value=_mock_anthropic_response("I'll do my best without research."))
    engine._client = MagicMock()
    engine._client.messages.create = mock_create

    with patch("helm.integrations.openrouter.openrouter_client") as mock_or, \
         _force_anthropic(engine), \
         patch("helm.assistant.engine.agent_spawner") as mock_spawner:
        mock_spawner.detect_agent.return_value = None
        mock_or.search = AsyncMock(return_value={"error": "OpenRouter not configured", "content": ""})

        request = ChatRequest(message="look up comparable sales near 30318")
        response = await engine.chat(request)

    assert response.model_tier == "perplexity_search"
    # Should have fallen back to Sonnet
    assert "perplexity" not in response.model_used
    assert response.reply == "I'll do my best without research."


@pytest.mark.asyncio
async def test_chat_explicit_opus_command():
    """/opus command should force Opus model."""
    from helm.assistant.engine import HelmEngine
    from helm.config import get_settings

    engine = HelmEngine()
    mock_create = AsyncMock(return_value=_mock_anthropic_response("Deep analysis..."))
    engine._client = MagicMock()
    engine._client.messages.create = mock_create

    request = ChatRequest(message="/opus what do you think of this deal?")
    with _force_anthropic(engine):
        response = await engine.chat(request)

    assert response.model_tier == "opus"
    settings = get_settings()
    call_kwargs = mock_create.call_args[1]
    assert call_kwargs["model"] == settings.anthropic_model_opus


@pytest.mark.asyncio
async def test_chat_response_includes_routing_metadata():
    """ChatResponse should include model_tier and model_used fields."""
    from helm.assistant.engine import HelmEngine

    engine = HelmEngine()
    mock_create = AsyncMock(return_value=_mock_anthropic_response("Hi"))
    engine._client = MagicMock()
    engine._client.messages.create = mock_create

    request = ChatRequest(message="hello")
    with _force_anthropic(engine):
        response = await engine.chat(request)

    assert response.model_tier != ""
    assert response.model_used != ""
    assert response.conversation_id != ""


# ── OpenRouter Backend Tests ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_chat_via_openrouter_backend():
    """When ai_backend=openrouter, chat should route through OpenRouter."""
    from helm.assistant.engine import HelmEngine

    engine = HelmEngine()

    mock_or_call = AsyncMock(return_value={
        "content": "Hello from OpenRouter!",
        "model": "anthropic/claude-sonnet-4-5-20250929",
    })

    with patch.object(type(engine), "_use_openrouter",
                      new_callable=PropertyMock, return_value=True), \
         patch.object(type(engine), "_use_claude_cli",
                      new_callable=PropertyMock, return_value=False), \
         patch("helm.integrations.openrouter.openrouter_client") as mock_or:
        mock_or._call = mock_or_call
        mock_or.is_configured = True

        request = ChatRequest(message="hello")
        response = await engine.chat(request)

    assert response.reply == "Hello from OpenRouter!"
    assert response.model_tier == "sonnet"
    mock_or_call.assert_called_once()
