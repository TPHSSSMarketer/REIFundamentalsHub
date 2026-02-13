"""Tests for the Claude CLI integration backend."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

import pytest

from helm.integrations.claude_cli import ClaudeCLIClient
from helm.models.schemas import AssistantMode, ChatRequest


# ── Prompt building ──────────────────────────────────────────────────────────


def test_build_prompt_simple_message():
    """Single user message builds a clean prompt."""
    client = ClaudeCLIClient()
    messages = [{"role": "user", "content": "Hello"}]
    prompt = client._build_prompt(messages)
    assert "<user>" in prompt
    assert "Hello" in prompt


def test_build_prompt_with_system():
    """System prompt is wrapped in <system> tags."""
    client = ClaudeCLIClient()
    messages = [{"role": "user", "content": "Hello"}]
    prompt = client._build_prompt(messages, system_prompt="You are Helm.")
    assert "<system>" in prompt
    assert "You are Helm." in prompt
    assert "<user>" in prompt


def test_build_prompt_conversation_history():
    """Multi-turn conversation preserves role tags."""
    client = ClaudeCLIClient()
    messages = [
        {"role": "user", "content": "What's 2+2?"},
        {"role": "assistant", "content": "4"},
        {"role": "user", "content": "And 3+3?"},
    ]
    prompt = client._build_prompt(messages)
    assert prompt.count("<user>") == 2
    assert "<assistant>" in prompt
    assert "4" in prompt


def test_build_prompt_system_in_messages():
    """System role in messages list is handled correctly."""
    client = ClaudeCLIClient()
    messages = [
        {"role": "system", "content": "Be concise."},
        {"role": "user", "content": "Hello"},
    ]
    prompt = client._build_prompt(messages)
    assert "<system>" in prompt
    assert "Be concise." in prompt


# ── Configuration checks ────────────────────────────────────────────────────


def test_is_configured_false_when_no_binary():
    """Returns False when claude binary isn't on PATH."""
    client = ClaudeCLIClient()
    with patch("shutil.which", return_value=None):
        client._claude_path = None
        assert not client.is_configured


def test_is_configured_true_when_binary_found():
    """Returns True when claude binary exists."""
    client = ClaudeCLIClient()
    with patch("shutil.which", return_value="/usr/local/bin/claude"):
        client._claude_path = None
        assert client.is_configured


# ── Chat method (mocks _run_subprocess) ──────────────────────────────────────


@pytest.mark.asyncio
async def test_chat_returns_error_when_not_configured():
    """Chat gracefully returns error dict when CLI not available."""
    client = ClaudeCLIClient()
    client._claude_path = ""

    result = await client.chat(
        messages=[{"role": "user", "content": "Hello"}],
    )

    assert result["content"] == ""
    assert "not found" in result["error"].lower()


@pytest.mark.asyncio
async def test_chat_calls_subprocess():
    """Chat invokes _run_subprocess and returns its result."""
    client = ClaudeCLIClient()
    client._claude_path = "/usr/local/bin/claude"

    mock_result = {
        "content": "Hello back!",
        "model": "claude-cli (Max subscription)",
        "tokens_used": 0,
        "cost_usd": 0.0,
        "timestamp": "2026-02-13T00:00:00+00:00",
    }
    client._run_subprocess = AsyncMock(return_value=mock_result)

    result = await client.chat(
        messages=[{"role": "user", "content": "Hello"}],
        system_prompt="You are Helm.",
    )

    assert result["content"] == "Hello back!"
    assert result["cost_usd"] == 0.0
    cmd = client._run_subprocess.call_args[0][0]
    assert cmd[0] == "/usr/local/bin/claude"
    assert "-p" in cmd
    assert "--output-format" in cmd


@pytest.mark.asyncio
async def test_chat_passes_model_flag():
    """Model override is passed to CLI command."""
    client = ClaudeCLIClient()
    client._claude_path = "/usr/local/bin/claude"
    client._run_subprocess = AsyncMock(return_value={"content": "ok", "model": "test"})

    await client.chat(
        messages=[{"role": "user", "content": "Hi"}],
        model="claude-opus-4-6",
    )

    cmd = client._run_subprocess.call_args[0][0]
    assert "--model" in cmd
    assert "claude-opus-4-6" in cmd


# ── Subprocess execution ────────────────────────────────────────────────────


def _make_mock_proc(returncode=0, stdout=b"", stderr=b""):
    """Create a mock subprocess with async communicate."""
    proc = MagicMock()
    proc.returncode = returncode
    proc.kill = MagicMock()

    async def communicate():
        return (stdout, stderr)

    proc.communicate = communicate
    return proc


@pytest.mark.asyncio
async def test_run_subprocess_success():
    """Successful subprocess returns content."""
    client = ClaudeCLIClient()
    mock_proc = _make_mock_proc(returncode=0, stdout=b"Hello world!")

    async def mock_create(*args, **kwargs):
        return mock_proc

    with patch("asyncio.create_subprocess_exec", side_effect=mock_create):
        result = await client._run_subprocess(["claude", "-p", "test"])

    assert result["content"] == "Hello world!"
    assert result["cost_usd"] == 0.0


@pytest.mark.asyncio
async def test_run_subprocess_nonzero_exit():
    """Non-zero exit code returns error with stderr."""
    client = ClaudeCLIClient()
    mock_proc = _make_mock_proc(returncode=1, stderr=b"Authentication required")

    async def mock_create(*args, **kwargs):
        return mock_proc

    with patch("asyncio.create_subprocess_exec", side_effect=mock_create):
        result = await client._run_subprocess(["claude", "-p", "test"])

    assert result["content"] == ""
    assert "Authentication required" in result["error"]


@pytest.mark.asyncio
async def test_run_subprocess_timeout():
    """Subprocess timeout returns a clean error."""
    import asyncio as aio

    client = ClaudeCLIClient()
    mock_proc = MagicMock()
    mock_proc.kill = MagicMock()

    async def mock_communicate():
        return (b"", b"")

    mock_proc.communicate = mock_communicate

    async def mock_create(*args, **kwargs):
        return mock_proc

    with patch("asyncio.create_subprocess_exec", side_effect=mock_create), \
         patch("asyncio.wait_for", side_effect=aio.TimeoutError()):
        result = await client._run_subprocess(["claude", "-p", "test"])

    assert result["content"] == ""
    assert "timed out" in result["error"].lower()


# ── Engine integration ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_engine_routes_to_claude_cli():
    """When ai_backend=claude_cli, engine uses the CLI backend."""
    from helm.assistant.engine import HelmEngine

    engine = HelmEngine()

    mock_cli_chat = AsyncMock(return_value={
        "content": "Hello from CLI!",
        "model": "claude-cli (Max subscription)",
        "cost_usd": 0.0,
    })

    with patch.object(type(engine), "_use_claude_cli",
                      new_callable=PropertyMock, return_value=True), \
         patch.object(type(engine), "_use_openrouter",
                      new_callable=PropertyMock, return_value=False), \
         patch("helm.integrations.claude_cli.claude_cli_client") as mock_cli:
        mock_cli.chat = mock_cli_chat

        request = ChatRequest(message="hello")
        response = await engine.chat(request)

    assert response.reply == "Hello from CLI!"
    assert response.model_tier == "sonnet"
    mock_cli_chat.assert_called_once()
