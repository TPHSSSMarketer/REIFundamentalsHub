"""Tests for the Helm AI engine and supporting modules."""

from __future__ import annotations

from helm.assistant.memory import ConversationMemory
from helm.assistant.prompts import MODE_PROMPTS, build_system_prompt
from helm.models.schemas import AssistantMode, ChatRequest


def test_build_system_prompt_includes_identity():
    prompt = build_system_prompt("business")
    assert "Helm" in prompt
    assert "command center" in prompt


def test_build_system_prompt_includes_mode():
    for mode in ("business", "personal", "real_estate"):
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
