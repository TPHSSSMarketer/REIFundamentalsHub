"""Tests for the voice integration (STT + TTS)."""

from __future__ import annotations

import pytest

from helm.integrations.voice import VoiceProcessor


def test_voice_not_configured_when_empty():
    proc = VoiceProcessor()
    proc._api_key = ""
    assert proc.is_configured is False


def test_voice_configured_when_key_set():
    proc = VoiceProcessor()
    proc._api_key = "sk-test"
    assert proc.is_configured is True


@pytest.mark.asyncio
async def test_transcribe_returns_none_when_unconfigured():
    proc = VoiceProcessor()
    proc._api_key = ""
    result = await proc.transcribe(b"fake audio data")
    assert result is None


@pytest.mark.asyncio
async def test_synthesize_returns_none_when_unconfigured():
    proc = VoiceProcessor()
    proc._api_key = ""
    result = await proc.synthesize("Hello world")
    assert result is None


@pytest.mark.asyncio
async def test_synthesize_returns_none_for_empty_text():
    proc = VoiceProcessor()
    proc._api_key = "sk-test"
    result = await proc.synthesize("")
    assert result is None
