"""ElevenLabs AI voice service — httpx only."""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from rei.config import Settings

logger = logging.getLogger(__name__)

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"


async def get_voices(settings: Settings) -> list[dict[str, Any]]:
    """Fetch available ElevenLabs voices."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{ELEVENLABS_API_BASE}/voices",
            headers={"xi-api-key": settings.elevenlabs_api_key},
        )
        resp.raise_for_status()
        data = resp.json()
        voices = data.get("voices", [])
        return [
            {
                "voice_id": v["voice_id"],
                "name": v["name"],
                "preview_url": v.get("preview_url", ""),
            }
            for v in voices
        ]


async def generate_audio(
    text: str, voice_id: str, settings: Settings
) -> Optional[bytes]:
    """Generate TTS audio via ElevenLabs. Returns MP3 bytes or None on failure."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{ELEVENLABS_API_BASE}/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": settings.elevenlabs_api_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                json={
                    "text": text,
                    "model_id": "eleven_monolingual_v1",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    },
                },
            )
            resp.raise_for_status()
            return resp.content
    except Exception:
        logger.warning("ElevenLabs TTS failed, will fall back to Twilio TTS")
        return None


def _generate_twilio_tts_twiml(text: str) -> str:
    """Fallback: generate TwiML <Say> for Twilio TTS."""
    return f"<Response><Say>{text}</Say></Response>"


async def generate_personalized_voicemail(
    script_template: str,
    contact_data: dict[str, str],
    voice_id: str,
    settings: Settings,
) -> dict[str, Any]:
    """Generate a personalized voicemail audio from a template.

    Replaces merge fields, calls ElevenLabs, falls back to Twilio TTS.
    Returns { audio_url, twiml_fallback, is_ai }.
    """
    # Replace merge fields
    personalized_text = script_template
    for field, value in contact_data.items():
        personalized_text = personalized_text.replace(f"{{{{{field}}}}}", value or "")

    # Try ElevenLabs
    audio_bytes = await generate_audio(personalized_text, voice_id, settings)
    if audio_bytes:
        # Upload to Twilio as media
        from rei.services.twilio_service import upload_media

        # We need the subaccount SID — it should be passed in contact_data
        subaccount_sid = contact_data.get(
            "_subaccount_sid", settings.twilio_account_sid
        )
        audio_url = await upload_media(
            audio_bytes,
            f"vm_{contact_data.get('first_name', 'contact')}.mp3",
            subaccount_sid,
            settings,
        )
        if audio_url:
            return {"audio_url": audio_url, "twiml_fallback": None, "is_ai": True}

    # Fallback to Twilio TTS
    logger.info("Using Twilio TTS fallback for voicemail drop")
    twiml = _generate_twilio_tts_twiml(personalized_text)
    return {"audio_url": None, "twiml_fallback": twiml, "is_ai": False}
