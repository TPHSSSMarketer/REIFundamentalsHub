"""ElevenLabs voice integration — high-quality TTS and conversational AI agent.

Provides:
  - Text-to-Speech with custom voices (higher quality than OpenAI TTS)
  - Conversational AI agent for phone/voice call interactions
  - Voice cloning support for personalized assistant voices

This is an optional enhancement. When not configured, Helm falls back
to OpenAI TTS/STT (see voice.py).

Setup:
  1. Create an account at https://elevenlabs.io
  2. Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env
  3. Optionally set ELEVENLABS_AGENT_ID for conversational AI
"""

from __future__ import annotations

import logging

import httpx

from helm.config import get_settings
from helm.reliability.breakers import elevenlabs_breaker

logger = logging.getLogger(__name__)
settings = get_settings()


class ElevenLabsClient:
    """Client for ElevenLabs TTS and Conversational AI APIs."""

    API_BASE = "https://api.elevenlabs.io/v1"

    def __init__(self) -> None:
        self._api_key = settings.elevenlabs_api_key
        self._voice_id = settings.elevenlabs_voice_id
        self._agent_id = settings.elevenlabs_agent_id

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "xi-api-key": self._api_key,
            "Content-Type": "application/json",
        }

    # ── Text-to-Speech ────────────────────────────────────────────────────

    async def synthesize(
        self,
        text: str,
        voice_id: str | None = None,
        model_id: str = "eleven_turbo_v2_5",
        output_format: str = "mp3_44100_128",
        stability: float = 0.5,
        similarity_boost: float = 0.75,
    ) -> bytes | None:
        """Convert text to speech using ElevenLabs.

        Returns audio bytes in the requested format.
        Supports mp3_44100_128, pcm_16000, pcm_22050, pcm_24000, etc.
        """
        if not self.is_configured:
            logger.warning("ElevenLabs not configured — cannot synthesize.")
            return None

        vid = voice_id or self._voice_id
        if not vid:
            logger.warning("No voice_id set for ElevenLabs TTS.")
            return None

        async def _do_synthesize() -> bytes:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self.API_BASE}/text-to-speech/{vid}",
                    headers=self._headers,
                    params={"output_format": output_format},
                    json={
                        "text": text[:5000],  # ElevenLabs limit
                        "model_id": model_id,
                        "voice_settings": {
                            "stability": stability,
                            "similarity_boost": similarity_boost,
                        },
                    },
                )
                resp.raise_for_status()
                return resp.content

        try:
            audio = await elevenlabs_breaker.call(_do_synthesize)
            if audio:
                logger.info(
                    "ElevenLabs TTS: %d chars → %d bytes (%s)",
                    len(text), len(audio), output_format,
                )
            return audio
        except Exception as exc:
            logger.error("ElevenLabs TTS failed: %s", exc)
            return None

    # ── Voice List ────────────────────────────────────────────────────────

    async def list_voices(self) -> list[dict]:
        """List available voices."""
        if not self.is_configured:
            return []
        async def _do_list_voices() -> list[dict]:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{self.API_BASE}/voices",
                    headers=self._headers,
                )
                resp.raise_for_status()
                data = resp.json()
                return [
                    {
                        "voice_id": v["voice_id"],
                        "name": v["name"],
                        "category": v.get("category", ""),
                        "labels": v.get("labels", {}),
                    }
                    for v in data.get("voices", [])
                ]

        try:
            result = await elevenlabs_breaker.call(_do_list_voices)
            return result if result is not None else []
        except Exception as exc:
            logger.error("Failed to list ElevenLabs voices: %s", exc)
            return []

    # ── Conversational AI Agent ───────────────────────────────────────────

    def get_agent_config(
        self,
        system_prompt: str,
        conversation_history: list[dict] | None = None,
        goals: list[dict] | None = None,
        first_message: str = "Hello! How can I help you today?",
    ) -> dict:
        """Build a configuration payload for the ElevenLabs Conversational AI agent.

        This config is used to start a voice agent session with full context.
        """
        context_parts = [system_prompt]

        if conversation_history:
            recent = conversation_history[-15:]
            history_text = "\n".join(
                f"{m['role'].title()}: {m['content'][:200]}" for m in recent
            )
            context_parts.append(f"\n--- Recent Conversation ---\n{history_text}")

        if goals:
            goals_text = "\n".join(f"- {g.get('goal', g)}" for g in goals[:10])
            context_parts.append(f"\n--- Active Goals ---\n{goals_text}")

        return {
            "agent_id": self._agent_id,
            "agent_config": {
                "prompt": {
                    "prompt": "\n".join(context_parts),
                },
                "first_message": first_message,
                "language": "en",
            },
        }

    # ── Post-Call Pipeline ────────────────────────────────────────────────

    async def process_call_transcript(self, transcript: str) -> dict:
        """Process a call transcript: extract tasks, update memory, generate summary.

        Uses the Helm engine to analyze the transcript.
        """
        from helm.assistant.engine import helm_engine
        from helm.models.schemas import ChatRequest

        prompt = (
            "Analyze this voice call transcript and extract:\n"
            "1. ACTION_ITEMS: Specific tasks mentioned (with who/what/when)\n"
            "2. KEY_DECISIONS: Decisions made during the call\n"
            "3. FOLLOW_UPS: Things to follow up on\n"
            "4. SUMMARY: 2-3 sentence summary of the call\n\n"
            f"Transcript:\n{transcript}\n\n"
            "Format your response as structured sections with those headers."
        )

        request = ChatRequest(message=prompt, conversation_id="voice_call_analysis")
        response = await helm_engine.chat(request)
        return {
            "analysis": response.reply,
            "transcript": transcript,
        }

    def get_connection_status(self) -> dict:
        """Return connection status for the dashboard."""
        return {
            "configured": self.is_configured,
            "has_voice": bool(self._voice_id),
            "has_agent": bool(self._agent_id),
        }


# Singleton
elevenlabs_client = ElevenLabsClient()
