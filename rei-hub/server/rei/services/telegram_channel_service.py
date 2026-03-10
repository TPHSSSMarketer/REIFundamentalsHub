"""Telegram two-way channel for the AI Assistant.

Handles incoming Telegram messages (text + voice), routes them through
the Assistant orchestrator, and sends responses back via Telegram.
Supports OpenAI Whisper for voice-to-text and TTS for text-to-voice.
"""

from __future__ import annotations

import io
import logging
import tempfile
from typing import Optional

import httpx

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings, get_settings
from rei.database import async_session_factory
from rei.models.user import User

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org"
OPENAI_API = "https://api.openai.com/v1"


# ═══════════════════════════════════════════════════════════════════════════
# TELEGRAM BOT HELPERS
# ═══════════════════════════════════════════════════════════════════════════


async def _get_bot_token(db: AsyncSession) -> str:
    """Get the admin's Telegram bot token from encrypted credentials."""
    from rei.services.credentials_service import get_provider_credentials

    creds = await get_provider_credentials(db, "telegram")
    if not creds:
        return ""
    return creds.get("telegram_bot_token", "")


async def _get_openai_key(db: AsyncSession) -> str:
    """Get the OpenAI API key from encrypted credentials."""
    from rei.services.credentials_service import get_provider_credentials

    creds = await get_provider_credentials(db, "openai")
    if not creds:
        return ""
    return creds.get("openai_api_key", "")


async def send_telegram_text(bot_token: str, chat_id: str, text: str) -> bool:
    """Send a text message to a Telegram chat."""
    if not bot_token or not chat_id:
        return False

    url = f"{TELEGRAM_API}/bot{bot_token}/sendMessage"

    # Telegram has a 4096 char limit per message — split if needed
    chunks = _split_message(text, 4000)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for chunk in chunks:
                resp = await client.post(url, json={
                    "chat_id": chat_id,
                    "text": chunk,
                    "parse_mode": "HTML",
                })
                if not resp.is_success:
                    logger.error(
                        "Telegram send failed: %s %s",
                        resp.status_code, resp.text[:200],
                    )
                    return False
        return True
    except Exception as exc:
        logger.error("Telegram send error: %s", exc)
        return False


async def send_telegram_voice(bot_token: str, chat_id: str, audio_bytes: bytes) -> bool:
    """Send a voice note (.ogg) to a Telegram chat."""
    if not bot_token or not chat_id or not audio_bytes:
        return False

    url = f"{TELEGRAM_API}/bot{bot_token}/sendVoice"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                data={"chat_id": chat_id},
                files={"voice": ("response.ogg", audio_bytes, "audio/ogg")},
            )
            if not resp.is_success:
                logger.error("Telegram voice send failed: %s", resp.text[:200])
                return False
        return True
    except Exception as exc:
        logger.error("Telegram voice send error: %s", exc)
        return False


async def get_telegram_file(bot_token: str, file_id: str) -> Optional[bytes]:
    """Download a file from Telegram servers (used for voice messages)."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Step 1: Get file path
            resp = await client.get(
                f"{TELEGRAM_API}/bot{bot_token}/getFile",
                params={"file_id": file_id},
            )
            resp.raise_for_status()
            file_path = resp.json()["result"]["file_path"]

            # Step 2: Download the file
            download_url = f"{TELEGRAM_API}/file/bot{bot_token}/{file_path}"
            resp = await client.get(download_url)
            resp.raise_for_status()
            return resp.content
    except Exception as exc:
        logger.error("Failed to download Telegram file %s: %s", file_id, exc)
        return None


# ═══════════════════════════════════════════════════════════════════════════
# OPENAI WHISPER (Voice-to-Text) & TTS (Text-to-Voice)
# ═══════════════════════════════════════════════════════════════════════════


async def transcribe_voice(audio_bytes: bytes, openai_key: str) -> str:
    """Transcribe audio using OpenAI Whisper API.

    Accepts any audio format Telegram sends (usually .oga / .ogg).
    Returns the transcribed text.
    """
    if not openai_key or not audio_bytes:
        return ""

    url = f"{OPENAI_API}/audio/transcriptions"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                headers={"Authorization": f"Bearer {openai_key}"},
                data={"model": "whisper-1"},
                files={"file": ("voice.ogg", audio_bytes, "audio/ogg")},
            )
            resp.raise_for_status()
            result = resp.json()
            return result.get("text", "")
    except Exception as exc:
        logger.error("Whisper transcription failed: %s", exc)
        return ""


async def text_to_speech(text: str, openai_key: str, voice: str = "nova") -> Optional[bytes]:
    """Convert text to speech using OpenAI TTS API.

    Returns OGG/Opus audio bytes suitable for Telegram voice messages.
    Voice options: alloy, echo, fable, onyx, nova, shimmer
    """
    if not openai_key or not text:
        return None

    # Truncate very long responses for voice (TTS has limits)
    if len(text) > 4000:
        text = text[:4000] + "... I've summarized the rest in the text message."

    url = f"{OPENAI_API}/audio/speech"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {openai_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "tts-1",
                    "input": text,
                    "voice": voice,
                    "response_format": "opus",
                },
            )
            resp.raise_for_status()
            return resp.content
    except Exception as exc:
        logger.error("TTS generation failed: %s", exc)
        return None


# ═══════════════════════════════════════════════════════════════════════════
# USER LOOKUP — Match Telegram chat_id to subscriber account
# ═══════════════════════════════════════════════════════════════════════════


async def find_user_by_telegram_chat_id(
    chat_id: str, db: AsyncSession
) -> Optional[User]:
    """Find the subscriber whose telegram_chat_id matches the sender."""
    stmt = select(User).where(
        User.telegram_enabled == True,  # noqa: E712
        User.telegram_chat_id == str(chat_id),
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ═══════════════════════════════════════════════════════════════════════════
# SESSION MANAGEMENT — Persistent Telegram <-> Assistant sessions
# ═══════════════════════════════════════════════════════════════════════════


# In-memory map: telegram_chat_id -> assistant session_id
# This keeps the conversation going across messages without creating
# a new session every time someone texts the bot.
_telegram_sessions: dict[str, str] = {}


def get_telegram_session(chat_id: str) -> Optional[str]:
    """Get the active Assistant session for a Telegram chat."""
    return _telegram_sessions.get(str(chat_id))


def set_telegram_session(chat_id: str, session_id: str) -> None:
    """Store the active Assistant session for a Telegram chat."""
    _telegram_sessions[str(chat_id)] = session_id


# ═══════════════════════════════════════════════════════════════════════════
# MAIN MESSAGE HANDLER — The core two-way pipeline
# ═══════════════════════════════════════════════════════════════════════════


async def _try_auto_link_admin(
    chat_id: str, db: AsyncSession
) -> Optional[User]:
    """If the sender's chat_id matches the admin's stored Chat ID in
    provider credentials, auto-link it to the admin's User record.

    This solves the chicken-and-egg problem where the admin needs their
    chat_id to configure Telegram but can't get it without the bot working.
    """
    from rei.services.credentials_service import get_provider_credentials

    creds = await get_provider_credentials(db, "telegram")
    if not creds:
        return None

    stored_chat_id = creds.get("telegram_chat_id", "")
    if not stored_chat_id or str(stored_chat_id) != str(chat_id):
        return None

    # The sender's chat_id matches the admin's stored Chat ID.
    # Find the admin user (superadmin) and auto-link.
    stmt = select(User).where(User.is_superadmin == True)  # noqa: E712
    result = await db.execute(stmt)
    admin = result.scalar_one_or_none()
    if not admin:
        return None

    # Auto-set telegram fields on the admin's User record
    admin.telegram_enabled = True
    admin.telegram_chat_id = str(chat_id)
    await db.commit()
    await db.refresh(admin)

    logger.info(
        "Auto-linked Telegram chat_id %s to admin user %s",
        chat_id, admin.id,
    )
    return admin


async def handle_telegram_message(update: dict) -> None:
    """Process an incoming Telegram message end-to-end.

    Flow:
    1. Extract sender chat_id and message content (text or voice)
    2. Match chat_id to a subscriber account (with admin auto-link fallback)
    3. If voice: transcribe with Whisper
    4. Route through the Assistant orchestrator
    5. Send response back via Telegram (text, and optionally voice)
    """
    try:
        await _handle_telegram_message_inner(update)
    except Exception as exc:
        logger.error(
            "FATAL error in handle_telegram_message: %s",
            exc, exc_info=True,
        )


async def _handle_telegram_message_inner(update: dict) -> None:
    """Inner handler — separated so the outer wrapper can catch all errors."""
    message = update.get("message", {})
    chat_id = str(message.get("chat", {}).get("id", ""))
    if not chat_id:
        logger.warning("Telegram update missing chat_id: %s", update.get("update_id"))
        return

    settings = get_settings()

    # Check for /chatid command BEFORE database lookup so ANY sender can use it
    raw_text = (message.get("text") or "").strip().lower()
    if raw_text in ("/chatid", "/chat_id", "/mychatid", "/id"):
        # Respond with the sender's chat_id — no auth needed
        # We need the bot token to reply, so open a quick DB session
        async with async_session_factory() as db:
            bot_token = await _get_bot_token(db)
            if bot_token:
                await send_telegram_text(
                    bot_token, chat_id,
                    f"Your Telegram Chat ID is:\n\n<code>{chat_id}</code>\n\n"
                    "Copy this and paste it into your REI Hub Settings "
                    "under Preferences > Notifications > Telegram Chat ID."
                )
        return

    async with async_session_factory() as db:
        # ── Step 1: Get bot token ──
        bot_token = await _get_bot_token(db)
        if not bot_token:
            logger.error("No Telegram bot token configured — cannot process message")
            return

        # ── Step 2: Find the subscriber ──
        user = await find_user_by_telegram_chat_id(chat_id, db)

        # Fallback: try to auto-link if sender matches admin's stored Chat ID
        if not user:
            user = await _try_auto_link_admin(chat_id, db)
            if user:
                logger.info(
                    "Auto-linked admin user %s via credential Chat ID match",
                    user.id,
                )

        if not user:
            # Unknown sender — include their chat_id so they can copy it
            await send_telegram_text(
                bot_token, chat_id,
                f"Hi! I don't recognize this Telegram account.\n\n"
                f"Your Chat ID is: <code>{chat_id}</code>\n\n"
                "To link your account:\n"
                "1. Log into REI Hub\n"
                "2. Go to Settings > Preferences > Notifications\n"
                "3. Enable Telegram and paste this Chat ID\n"
                "4. Save your preferences\n\n"
                "Then message me again!"
            )
            logger.info("Telegram message from unknown chat_id %s — not linked", chat_id)
            return

        logger.info(
            "Telegram message from user %s (chat_id=%s)",
            user.id, chat_id,
        )

        # ── Step 3: Extract message content ──
        user_text = ""

        # Check for voice message
        voice = message.get("voice") or message.get("audio")
        is_voice = bool(voice)
        if voice:
            file_id = voice.get("file_id", "")
            logger.info(
                "Voice message from user %s: file_id=%s, duration=%s",
                user.id, file_id, voice.get("duration"),
            )
            if file_id:
                openai_key = await _get_openai_key(db)
                if openai_key:
                    # Download voice file from Telegram
                    audio_bytes = await get_telegram_file(bot_token, file_id)
                    if audio_bytes:
                        logger.info(
                            "Downloaded voice file for user %s: %d bytes",
                            user.id, len(audio_bytes),
                        )
                        # Estimate duration from file size (~16kbps for Telegram voice)
                        voice_duration = voice.get("duration", len(audio_bytes) / 2000)
                        user_text = await transcribe_voice(audio_bytes, openai_key)
                        if user_text:
                            logger.info(
                                "Whisper transcription for user %s: %s",
                                user.id, user_text[:100],
                            )
                            # Record Whisper usage against subscriber's AI allowance
                            from rei.services.ai_service import record_voice_usage
                            await record_voice_usage(
                                user_id=user.id, db=db,
                                service="whisper",
                                duration_seconds=voice_duration,
                            )
                        else:
                            logger.warning(
                                "Whisper returned empty transcription for user %s",
                                user.id,
                            )
                    else:
                        logger.error("Failed to download voice file for user %s", user.id)
                        user_text = "[Voice message could not be downloaded]"
                else:
                    logger.error("No OpenAI key configured — cannot transcribe voice for user %s", user.id)
                    user_text = ""  # Will trigger voice-specific error below
        else:
            # Regular text message
            user_text = message.get("text", "").strip()

        if not user_text:
            if is_voice:
                # Voice-specific error message
                openai_key = await _get_openai_key(db)
                if not openai_key:
                    await send_telegram_text(
                        bot_token, chat_id,
                        "I received your voice note but can't transcribe it yet. "
                        "An OpenAI API key needs to be configured in Admin > Credentials "
                        "for voice recognition to work. Please send a text message instead."
                    )
                else:
                    await send_telegram_text(
                        bot_token, chat_id,
                        "I received your voice note but couldn't transcribe it. "
                        "The audio may have been too short or unclear. "
                        "Please try again or send a text message."
                    )
            else:
                await send_telegram_text(
                    bot_token, chat_id,
                    "I received your message but couldn't read it. "
                    "Please send a text or voice message."
                )
            return

        # ── Step 4: Check for special commands ──
        lower_text = user_text.lower().strip()

        _VALID_VOICES = {"alloy", "echo", "fable", "onyx", "nova", "shimmer"}
        _VOICE_DESCRIPTIONS = {
            "alloy": "Alloy (Neutral, balanced)",
            "echo": "Echo (Male, clear & smooth)",
            "fable": "Fable (Expressive, storytelling)",
            "nova": "Nova (Female, warm & natural)",
            "onyx": "Onyx (Male, deep & authoritative)",
            "shimmer": "Shimmer (Female, bright & energetic)",
        }

        if lower_text == "voice on":
            # Enable voice responses for this user
            user.voice_enabled = True
            await db.commit()
            current_voice = getattr(user, 'preferred_voice', 'nova') or 'nova'
            await send_telegram_text(
                bot_token, chat_id,
                f"Voice responses are now ON using <b>{_VOICE_DESCRIPTIONS.get(current_voice, current_voice)}</b>.\n\n"
                "I'll send you voice notes along with text replies.\n\n"
                "To change your voice, type: <code>voice nova</code>, <code>voice echo</code>, etc.\n"
                "Type <code>/voice</code> to see all available voices."
            )
            return

        if lower_text == "voice off":
            # Disable voice responses
            user.voice_enabled = False
            await db.commit()
            await send_telegram_text(
                bot_token, chat_id,
                "Voice responses are now OFF. I'll send text-only replies.\n\n"
                "Type <code>voice on</code> anytime to re-enable."
            )
            return

        if lower_text in ("/voice", "/voices", "voices"):
            # Show available voices
            current_voice = getattr(user, 'preferred_voice', 'nova') or 'nova'
            voice_enabled = getattr(user, 'voice_enabled', False)
            lines = ["<b>Available Voices:</b>\n"]
            for v_name, v_desc in _VOICE_DESCRIPTIONS.items():
                marker = " ← current" if v_name == current_voice else ""
                lines.append(f"  • <code>voice {v_name}</code> — {v_desc}{marker}")
            lines.append(f"\nVoice is currently: <b>{'ON' if voice_enabled else 'OFF'}</b>")
            lines.append("\nTo change, type: <code>voice nova</code> or <code>voice echo</code>, etc.")
            await send_telegram_text(bot_token, chat_id, "\n".join(lines))
            return

        # Handle "voice <name>" to switch voice
        if lower_text.startswith("voice ") and lower_text != "voice on" and lower_text != "voice off":
            requested_voice = lower_text.replace("voice ", "").strip()
            if requested_voice in _VALID_VOICES:
                user.preferred_voice = requested_voice
                # Also enable voice if it wasn't on yet
                if not getattr(user, 'voice_enabled', False):
                    user.voice_enabled = True
                await db.commit()
                await send_telegram_text(
                    bot_token, chat_id,
                    f"Voice changed to <b>{_VOICE_DESCRIPTIONS.get(requested_voice, requested_voice)}</b>.\n"
                    "Voice responses are ON."
                )
                return
            else:
                voice_list = ", ".join(sorted(_VALID_VOICES))
                await send_telegram_text(
                    bot_token, chat_id,
                    f"Unknown voice: <code>{requested_voice}</code>\n\n"
                    f"Available voices: {voice_list}\n\n"
                    "Example: <code>voice echo</code>"
                )
                return

        if lower_text == "new chat" or lower_text == "/start":
            # Start a fresh session
            _telegram_sessions.pop(chat_id, None)
            await send_telegram_text(
                bot_token, chat_id,
                "Starting a fresh conversation. How can I help you?"
            )
            return

        # ── Step 5: Route through the Assistant orchestrator ──
        session_id = get_telegram_session(chat_id)

        # Send "typing" indicator so user knows we're working
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{TELEGRAM_API}/bot{bot_token}/sendChatAction",
                    json={"chat_id": chat_id, "action": "typing"},
                )
        except Exception:
            pass  # Non-critical

        try:
            from rei.services.admin_orchestrator_service import process_message

            result = await process_message(
                session_id=session_id,
                user_message=user_text,
                user=user,
                db=db,
                settings=settings,
            )

            if result.get("error"):
                response_text = f"Sorry, something went wrong: {result['error']}"
            else:
                response_text = result.get("response", "I processed your request but have no response to show.")
                # Store the session for continuity
                new_session_id = result.get("session_id")
                if new_session_id:
                    set_telegram_session(chat_id, new_session_id)

        except Exception as exc:
            logger.error("Assistant orchestrator error for user %s: %s", user.id, exc)
            response_text = "Sorry, I ran into an error processing your request. Please try again."

        # ── Step 6: Send response back via Telegram ──

        # Clean up any [TOOL_CALL: ...] markers from the response
        import re
        clean_response = re.sub(
            r'\[TOOL_CALL:\s*\w+\s*\([^)]*\)\s*\]',
            '',
            response_text,
        ).strip()

        # Always send text response
        await send_telegram_text(bot_token, chat_id, clean_response)

        # Optionally send voice response if user has it enabled
        voice_enabled = getattr(user, 'voice_enabled', False)
        if voice_enabled and clean_response:
            openai_key = await _get_openai_key(db)
            if openai_key:
                user_voice = getattr(user, 'preferred_voice', 'nova') or 'nova'
                audio_bytes = await text_to_speech(clean_response, openai_key, voice=user_voice)
                if audio_bytes:
                    await send_telegram_voice(bot_token, chat_id, audio_bytes)
                    # Record TTS usage against subscriber's AI allowance
                    from rei.services.ai_service import record_voice_usage
                    await record_voice_usage(
                        user_id=user.id, db=db,
                        service="tts",
                        character_count=len(clean_response),
                    )

        logger.info(
            "Telegram response sent to user %s (voice=%s, len=%d)",
            user.id, voice_enabled, len(clean_response),
        )


# ═══════════════════════════════════════════════════════════════════════════
# WEBHOOK REGISTRATION — Tell Telegram where to send updates
# ═══════════════════════════════════════════════════════════════════════════


async def register_telegram_webhook(webhook_url: str) -> bool:
    """Register a webhook URL with the Telegram Bot API.

    Call this once during server startup or when the bot token changes.
    webhook_url should be like: https://yourdomain.com/api/telegram/webhook
    """
    async with async_session_factory() as db:
        bot_token = await _get_bot_token(db)

    if not bot_token:
        logger.warning("Cannot register Telegram webhook — no bot token configured")
        return False

    url = f"{TELEGRAM_API}/bot{bot_token}/setWebhook"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json={
                "url": webhook_url,
                "allowed_updates": ["message"],
            })
            resp.raise_for_status()
            result = resp.json()
            if result.get("ok"):
                logger.info("Telegram webhook registered: %s", webhook_url)
                return True
            else:
                logger.error("Telegram webhook registration failed: %s", result)
                return False
    except Exception as exc:
        logger.error("Telegram webhook registration error: %s", exc)
        return False


def _split_message(text: str, max_len: int = 4000) -> list[str]:
    """Split a long message into chunks for Telegram's 4096 char limit."""
    if len(text) <= max_len:
        return [text]

    chunks = []
    while text:
        if len(text) <= max_len:
            chunks.append(text)
            break
        # Try to split at a newline
        split_at = text.rfind("\n", 0, max_len)
        if split_at == -1:
            split_at = text.rfind(" ", 0, max_len)
        if split_at == -1:
            split_at = max_len
        chunks.append(text[:split_at])
        text = text[split_at:].lstrip()

    return chunks
