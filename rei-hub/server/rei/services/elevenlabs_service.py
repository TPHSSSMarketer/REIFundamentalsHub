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


# ═══════════════════════════════════════════════════════════════════════
# Voice AI Additions — ElevenLabs Conversational AI Service
# ═══════════════════════════════════════════════════════════════════════

ELEVENLABS_CONV_BASE = "https://api.elevenlabs.io/v1/convai"


# ── Conversational AI Agent Management ──────────────────────────────────

async def create_conversational_agent(
    agent_name: str,
    system_prompt: str,
    voice_id: str,
    knowledge_base_text: str,
    settings: Settings,
) -> dict[str, Any]:
    """
    Create or update an ElevenLabs Conversational AI agent.

    This agent will handle real-time voice conversations using:
    - The specified ElevenLabs voice for speaking
    - Claude (Anthropic) as the LLM brain for thinking
    - The knowledge base text as context for the conversation

    Returns: {"agent_id": "...", "status": "created"}
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{ELEVENLABS_CONV_BASE}/agents/create",
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
            },
            json={
                "conversation_config": {
                    "agent": {
                        "prompt": {
                            "prompt": system_prompt,
                            "llm": "claude-sonnet-4-6",
                            "temperature": 0.7,
                            "max_tokens": 300,
                        },
                        "first_message": "Hello, thanks for calling! How can I help you today?",
                        "language": "en",
                    },
                    "tts": {
                        "voice_id": voice_id,
                        "model_id": "eleven_turbo_v2_5",
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                    },
                },
                "name": agent_name,
            },
        )
        resp.raise_for_status()
        data = resp.json()

        agent_id = data.get("agent_id")
        logger.info(f"Created ElevenLabs conversational agent: {agent_id}")

        # If knowledge base text is provided, add it to the agent
        if knowledge_base_text and agent_id:
            await _add_knowledge_to_agent(agent_id, knowledge_base_text, settings)

        return {"agent_id": agent_id, "status": "created"}


async def update_conversational_agent(
    agent_id: str,
    system_prompt: Optional[str] = None,
    voice_id: Optional[str] = None,
    first_message: Optional[str] = None,
    settings: Settings = None,
) -> dict[str, Any]:
    """Update an existing ElevenLabs Conversational AI agent."""
    update_data: dict[str, Any] = {"conversation_config": {}}

    if system_prompt:
        update_data["conversation_config"]["agent"] = {
            "prompt": {
                "prompt": system_prompt,
                "llm": "claude-sonnet-4-6",
                "temperature": 0.7,
                "max_tokens": 300,
            }
        }
        if first_message:
            update_data["conversation_config"]["agent"]["first_message"] = first_message

    if voice_id:
        update_data["conversation_config"]["tts"] = {
            "voice_id": voice_id,
        }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.patch(
            f"{ELEVENLABS_CONV_BASE}/agents/{agent_id}",
            headers={
                "xi-api-key": settings.elevenlabs_api_key,
                "Content-Type": "application/json",
            },
            json=update_data,
        )
        resp.raise_for_status()
        return resp.json()


async def _add_knowledge_to_agent(
    agent_id: str,
    knowledge_text: str,
    settings: Settings,
) -> None:
    """Add knowledge base text content to an ElevenLabs agent."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Use the knowledge base URL endpoint
            resp = await client.post(
                f"{ELEVENLABS_CONV_BASE}/agents/{agent_id}/add-to-knowledge-base",
                headers={
                    "xi-api-key": settings.elevenlabs_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": knowledge_text,
                    "name": "rei_knowledge_base",
                },
            )
            resp.raise_for_status()
            logger.info(f"Added knowledge base to agent {agent_id}")
    except Exception as e:
        logger.warning(f"Failed to add knowledge base to agent: {e}")


# ── Signed URL for ConversationRelay ────────────────────────────────────

async def get_signed_url(
    agent_id: str,
    settings: Settings,
) -> Optional[str]:
    """
    Get a signed WebSocket URL from ElevenLabs for a new conversation session.

    This URL is what Twilio ConversationRelay connects to so the caller
    can speak directly with the AI agent in real-time.

    Returns: wss:// URL string, or None on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{ELEVENLABS_CONV_BASE}/conversation/get-signed-url",
                headers={
                    "xi-api-key": settings.elevenlabs_api_key,
                },
                params={
                    "agent_id": agent_id,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            signed_url = data.get("signed_url")
            logger.info(f"Got signed URL for agent {agent_id}")
            return signed_url
    except Exception as e:
        logger.error(f"Failed to get ElevenLabs signed URL: {e}")
        return None


# ── Get Conversation Details (post-call) ────────────────────────────────

async def get_conversation_details(
    conversation_id: str,
    settings: Settings,
) -> Optional[dict[str, Any]]:
    """
    Retrieve the full conversation details from ElevenLabs after a call ends.
    Includes the transcript, audio, and metadata.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{ELEVENLABS_CONV_BASE}/conversations/{conversation_id}",
                headers={
                    "xi-api-key": settings.elevenlabs_api_key,
                },
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.error(f"Failed to get conversation details: {e}")
        return None
