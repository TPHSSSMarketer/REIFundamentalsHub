"""Tests for sub-agent definitions."""

from __future__ import annotations

from helm.agents.definitions import ALL_AGENTS, get_agent, get_agent_names, list_agents


def test_core_agents_populated():
    """Core always has at least 5 general-purpose agents."""
    assert len(ALL_AGENTS) >= 5


def test_get_agent_by_name():
    """Can look up a core agent by name."""
    agent = get_agent("outreach-drafter")
    assert agent is not None
    assert agent.name == "outreach-drafter"
    assert "communications" in agent.description.lower()


def test_get_agent_returns_none_for_unknown():
    assert get_agent("nonexistent-agent") is None


def test_list_agents_by_scope():
    project_agents = list_agents(scope="project")
    personal_agents = list_agents(scope="personal")

    assert all(a.scope == "project" for a in project_agents)
    assert all(a.scope == "personal" for a in personal_agents)
    assert len(project_agents) + len(personal_agents) == len(ALL_AGENTS)


def test_get_agent_names():
    names = get_agent_names()
    assert "outreach-drafter" in names
    assert "health-coach" in names
    assert "research-assistant" in names


def test_all_agents_have_system_prompts():
    for name, agent in ALL_AGENTS.items():
        assert agent.system_prompt, f"Agent {name} has no system prompt"
        assert len(agent.system_prompt) > 50, f"Agent {name} system prompt too short"
