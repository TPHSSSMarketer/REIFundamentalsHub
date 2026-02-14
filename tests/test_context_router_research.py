"""Tests for context templates, multi-model router, and OpenRouter/Perplexity."""

from __future__ import annotations

import pytest


# ── Context File Templates ────────────────────────────────────────────────────


def test_all_templates_defined():
    from helm.context.templates import CONTEXT_FILES, TEMPLATES

    for filename in CONTEXT_FILES:
        assert filename in TEMPLATES, f"Missing template for {filename}"
        assert len(TEMPLATES[filename]) > 50, f"Template too short for {filename}"


def test_list_context_templates():
    from helm.context.templates import list_context_templates

    templates = list_context_templates()
    assert len(templates) >= 10
    names = [t["filename"] for t in templates]
    assert "USER.md" in names
    assert "RULES.md" in names
    assert "DEALS_PIPELINE.md" in names
    assert "CONTACTS.md" in names
    assert "MARKET_CONTEXT.md" in names
    assert "PORTFOLIO.md" in names
    assert "MEMORY.md" in names


def test_templates_have_descriptions():
    from helm.context.templates import list_context_templates

    templates = list_context_templates()
    for t in templates:
        assert t["description"], f"No description for {t['filename']}"
        assert t["category"] in ("core", "docs", "templates")


@pytest.mark.asyncio
async def test_provision_creates_files(tmp_path):
    from helm.context.templates import CONTEXT_FILES, provision_tenant_context
    from helm.integrations.workspace import VirtualWorkspace

    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    result = await provision_tenant_context(ws)

    assert len(result["created"]) == len(CONTEXT_FILES)
    assert len(result["skipped"]) == 0

    # Verify files actually exist
    for filename in CONTEXT_FILES:
        content = await ws.read_file(filename)
        assert content is not None, f"File not created: {filename}"
        assert len(content) > 0


@pytest.mark.asyncio
async def test_provision_skips_existing(tmp_path):
    from helm.context.templates import provision_tenant_context
    from helm.integrations.workspace import VirtualWorkspace

    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    # Write a custom USER.md first
    await ws.write_file("USER.md", b"# My Custom Profile\nName: Test User")

    result = await provision_tenant_context(ws)

    assert "USER.md" in result["skipped"]
    assert "USER.md" not in result["created"]

    # Verify custom content was preserved
    content = await ws.read_file("USER.md")
    assert b"My Custom Profile" in content


@pytest.mark.asyncio
async def test_read_context_for_prompt_skips_unfilled(tmp_path):
    from helm.context.templates import provision_tenant_context, read_context_for_prompt
    from helm.integrations.workspace import VirtualWorkspace

    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    await provision_tenant_context(ws)

    # Default reads USER.md, RULES.md, MEMORY.md — USER.md has [Your Name] so it's skipped
    # RULES.md and MEMORY.md use [amount] and other markers but may pass the check
    prompt_text = await read_context_for_prompt(ws, files=["USER.md"])
    assert prompt_text == ""  # USER.md has [Your Name] placeholder — skipped


@pytest.mark.asyncio
async def test_read_context_includes_filled_files(tmp_path):
    from helm.context.templates import read_context_for_prompt
    from helm.integrations.workspace import VirtualWorkspace

    ws = VirtualWorkspace.__new__(VirtualWorkspace)
    ws._tenant_id = "test"
    ws._root = tmp_path

    # Write a filled-out USER.md (no placeholders)
    await ws.write_file("USER.md", b"# Investor Profile\nName: John Smith\nGoal: 10 doors")

    prompt_text = await read_context_for_prompt(ws, files=["USER.md"])
    assert "John Smith" in prompt_text
    assert "USER.md" in prompt_text


# ── Multi-Model Router ────────────────────────────────────────────────────────


def test_router_defaults_to_sonnet():
    from helm.orchestrator.multi_ai_router import ModelTier, classify_task

    assert classify_task("hello, how are you?") == ModelTier.SONNET
    assert classify_task("what time is my meeting?") == ModelTier.SONNET
    assert classify_task("summarize this email") == ModelTier.SONNET


def test_router_detects_opus_tasks():
    from helm.orchestrator.multi_ai_router import ModelTier, classify_task

    assert classify_task("analyze this deal at 123 Oak St") == ModelTier.OPUS
    assert classify_task("what's the cash-on-cash return?") == ModelTier.OPUS
    assert classify_task("should I buy this property?") == ModelTier.OPUS
    assert classify_task("evaluate this property for BRRRR strategy") == ModelTier.OPUS
    assert classify_task("negotiation strategy for seller financing") == ModelTier.OPUS


def test_router_detects_research_tasks():
    from helm.orchestrator.multi_ai_router import ModelTier, classify_task

    assert classify_task("look up comparable sales near 30318") == ModelTier.PERPLEXITY_SEARCH
    assert classify_task("what's happening in the Atlanta market?") == ModelTier.PERPLEXITY_SEARCH
    assert classify_task("find comps for 123 Main St") == ModelTier.PERPLEXITY_SEARCH
    assert classify_task("search for rent estimate in zip 30318") == ModelTier.PERPLEXITY_SEARCH


def test_router_detects_deep_research():
    from helm.orchestrator.multi_ai_router import ModelTier, classify_task

    assert classify_task("deep dive on the East Atlanta neighborhood") == ModelTier.PERPLEXITY_DEEP
    assert classify_task("generate the weekly market report") == ModelTier.PERPLEXITY_DEEP
    assert classify_task("comprehensive analysis of rent trends") == ModelTier.PERPLEXITY_DEEP


def test_router_explicit_commands():
    from helm.orchestrator.multi_ai_router import ModelTier, classify_task

    assert classify_task("/opus what do you think of this deal?") == ModelTier.OPUS
    assert classify_task("/sonnet summarize today") == ModelTier.SONNET
    assert classify_task("/research comps near 30318") == ModelTier.PERPLEXITY_SEARCH
    assert classify_task("/deepresearch Atlanta market trends") == ModelTier.PERPLEXITY_DEEP


def test_router_strip_command():
    from helm.orchestrator.multi_ai_router import strip_command

    assert strip_command("/opus analyze this deal") == "analyze this deal"
    assert strip_command("/research find comps") == "find comps"
    assert strip_command("no command here") == "no command here"


def test_router_model_info():
    from helm.orchestrator.multi_ai_router import ModelTier, get_model_info

    info = get_model_info(ModelTier.OPUS)
    assert info["name"] == "Claude Opus"
    assert info["cost"] == "high"

    info = get_model_info(ModelTier.SONNET)
    assert info["name"] == "Claude Sonnet"
    assert info["cost"] == "low"

    info = get_model_info(ModelTier.PERPLEXITY_SEARCH)
    assert info["name"] == "Perplexity Sonar Pro"


# ── OpenRouter Client ────────────────────────────────────────────────────────


def test_openrouter_not_configured_by_default():
    from helm.integrations.openrouter import OpenRouterClient

    client = OpenRouterClient()
    assert client.is_configured is False


@pytest.mark.asyncio
async def test_openrouter_search_returns_error_when_unconfigured():
    from helm.integrations.openrouter import OpenRouterClient

    client = OpenRouterClient()
    result = await client.search("test query")
    assert "error" in result
    assert result["content"] == ""


@pytest.mark.asyncio
async def test_openrouter_deep_research_returns_error_when_unconfigured():
    from helm.integrations.openrouter import OpenRouterClient

    client = OpenRouterClient()
    result = await client.deep_research("test query")
    assert "error" in result


@pytest.mark.asyncio
async def test_openrouter_research_comps_returns_error_when_unconfigured():
    from helm.integrations.openrouter import OpenRouterClient

    client = OpenRouterClient()
    result = await client.research_comps("123 Main St, Atlanta GA")
    assert "error" in result


def test_openrouter_cost_estimation():
    from helm.integrations.openrouter import OpenRouterClient

    cost = OpenRouterClient._estimate_cost(
        "perplexity/sonar-pro",
        {"prompt_tokens": 1000, "completion_tokens": 500},
    )
    assert cost > 0
    assert cost < 1.0  # Sanity check — shouldn't be more than $1 for 1.5K tokens


# ── API Route Tests ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_context_templates_endpoint():
    from httpx import ASGITransport, AsyncClient

    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.get("/api/context/templates")
        assert resp.status_code == 200
        data = resp.json()
        assert "templates" in data
        assert len(data["templates"]) >= 10


@pytest.mark.asyncio
async def test_router_classify_endpoint():
    from httpx import ASGITransport, AsyncClient

    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.post("/api/router/classify", json={
            "message": "analyze this deal at 123 Oak St",
            "mode": "real_estate",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["tier"] == "opus"
        assert "model" in data


@pytest.mark.asyncio
async def test_router_classify_sonnet_default():
    from httpx import ASGITransport, AsyncClient

    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.post("/api/router/classify", json={
            "message": "summarize my emails today",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["tier"] == "sonnet"


@pytest.mark.asyncio
async def test_research_endpoint_rejects_unconfigured():
    from httpx import ASGITransport, AsyncClient

    from helm.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test", headers={"X-API-Key": "test-api-key-for-tests"}) as client:
        resp = await client.post("/api/research/search", json={
            "query": "comparable sales Atlanta 30318",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "error" in data  # Not configured
