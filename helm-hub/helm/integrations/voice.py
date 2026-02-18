"""Voice integration — Speech-to-Text (STT) and Text-to-Speech (TTS).

Uses OpenAI's Whisper for transcription and their TTS API for speech synthesis.
This module is used by:
  - The web dashboard (upload audio → transcribe → chat → synthesize reply)
  - Telegram voice notes
  - WhatsApp voice messages

Both STT and TTS gracefully degrade when not configured.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class VoiceProcessor:
    """Handles speech-to-text and text-to-speech via OpenAI APIs."""

    def __init__(self) -> None:
        self._api_key = settings.openai_api_key_voice or settings.openai_api_key

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    @property
    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}"}

    # ── Speech-to-Text (Whisper) ─────────────────────────────────────────

    async def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.ogg",
        language: str | None = None,
    ) -> str | None:
        """Transcribe audio bytes to text using OpenAI Whisper.

        Supports formats: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm.
        """
        if not self.is_configured:
            logger.warning("Voice API key not configured — cannot transcribe.")
            return None

        # Determine MIME type from extension
        ext = Path(filename).suffix.lower()
        mime_map = {
            ".ogg": "audio/ogg",
            ".oga": "audio/ogg",
            ".mp3": "audio/mpeg",
            ".mp4": "audio/mp4",
            ".m4a": "audio/mp4",
            ".wav": "audio/wav",
            ".webm": "audio/webm",
            ".flac": "audio/flac",
        }
        mime_type = mime_map.get(ext, "audio/ogg")

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                data = {"model": settings.voice_stt_model}
                if language:
                    data["language"] = language

                resp = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers=self._headers,
                    data=data,
                    files={"file": (filename, audio_bytes, mime_type)},
                )
                resp.raise_for_status()
                result = resp.json()
                text = result.get("text", "").strip()
                logger.info("Transcribed %d bytes → %d chars", len(audio_bytes), len(text))
                return text or None

        except httpx.HTTPError as exc:
            logger.error("Whisper transcription failed: %s", exc)
            return None

    # ── Text-to-Speech ───────────────────────────────────────────────────

    async def synthesize(
        self,
        text: str,
        voice: str | None = None,
        response_format: str = "opus",
        speed: float = 1.0,
    ) -> bytes | None:
        """Convert text to speech using OpenAI TTS.

        Returns audio bytes in the requested format (opus, mp3, aac, flac, wav, pcm).
        Opus is ideal for Telegram/WhatsApp voice messages.
        """
        if not self.is_configured:
            logger.warning("Voice API key not configured — cannot synthesize.")
            return None

        if not text or len(text) > 4096:
            # OpenAI TTS max is 4096 characters per request
            if text and len(text) > 4096:
                logger.warning("Text too long for TTS (%d chars), truncating.", len(text))
                text = text[:4096]
            elif not text:
                return None

        voice = voice or settings.voice_tts_voice

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={
                        **self._headers,
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.voice_tts_model,
                        "input": text,
                        "voice": voice,
                        "response_format": response_format,
                        "speed": speed,
                    },
                )
                resp.raise_for_status()
                audio_bytes = resp.content
                logger.info(
                    "Synthesized %d chars → %d bytes (%s)",
                    len(text), len(audio_bytes), response_format,
                )
                return audio_bytes

        except httpx.HTTPError as exc:
            logger.error("TTS synthesis failed: %s", exc)
            return None

    # ── Convenience: Full round-trip ─────────────────────────────────────

    async def voice_chat(
        self,
        audio_bytes: bytes,
        filename: str = "audio.ogg",
    ) -> tuple[str | None, bytes | None]:
        """Full voice round-trip: transcribe → chat → synthesize.

        Returns (reply_text, reply_audio_bytes).
        """
        from helm.assistant.engine import helm_engine
        from helm.models.schemas import ChatRequest

        # Step 1: Transcribe
        text = await self.transcribe(audio_bytes, filename=filename)
        if not text:
            return None, None

        # Step 2: Chat
        request = ChatRequest(message=text)
        response = await helm_engine.chat(request)

        # Step 3: Synthesize
        reply_audio = await self.synthesize(response.reply)

        return response.reply, reply_audio


# Singleton
voice_processor = VoiceProcessor()
