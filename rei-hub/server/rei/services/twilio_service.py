"""Twilio REST API service — httpx only, no twilio Python package."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import math
import time
import uuid
from typing import Any, Optional

import logging

import httpx

logger = logging.getLogger(__name__)

from rei.config import Settings

TWILIO_API_BASE = "https://api.twilio.com/2010-04-01"
TWILIO_FAX_BASE = "https://fax.twilio.com/v1"


def get_auth(settings: Settings) -> tuple[str, str]:
    """Return (account_sid, auth_token) tuple for HTTP Basic auth."""
    return settings.twilio_account_sid, settings.twilio_auth_token


# ── Subaccount management ──────────────────────────────────────────────


async def create_subaccount(
    friendly_name: str, settings: Settings
) -> dict[str, str]:
    """Create a Twilio subaccount for billing isolation."""
    auth = get_auth(settings)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TWILIO_API_BASE}/Accounts.json",
            auth=auth,
            data={"FriendlyName": friendly_name},
        )
        resp.raise_for_status()
        data = resp.json()
        return {"sid": data["sid"], "auth_token": data["auth_token"]}


# ── Number management ──────────────────────────────────────────────────


async def search_available_numbers(
    area_code: str, settings: Settings
) -> list[dict[str, Any]]:
    """Search for available US local phone numbers by area code."""
    auth = get_auth(settings)
    sid = settings.twilio_account_sid
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{TWILIO_API_BASE}/Accounts/{sid}/AvailablePhoneNumbers/US/Local.json",
            auth=auth,
            params={"AreaCode": area_code, "VoiceEnabled": "true", "SmsEnabled": "true"},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("available_phone_numbers", [])


async def purchase_number(
    phone_number: str,
    friendly_name: str,
    voice_url: str,
    sms_url: str,
    fax_url: str,
    subaccount_sid: str,
    settings: Settings,
) -> dict[str, str]:
    """Purchase and configure a phone number under a subaccount."""
    auth = get_auth(settings)
    status_callback = voice_url.replace("/webhook/voice", "/webhook/call-status")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TWILIO_API_BASE}/Accounts/{subaccount_sid}/IncomingPhoneNumbers.json",
            auth=auth,
            data={
                "PhoneNumber": phone_number,
                "FriendlyName": friendly_name,
                "VoiceUrl": voice_url,
                "SmsUrl": sms_url,
                "FaxUrl": fax_url,
                "StatusCallback": status_callback,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return {"sid": data["sid"], "phone_number": data["phone_number"]}


async def release_number(
    number_sid: str, subaccount_sid: str, settings: Settings
) -> None:
    """Release a phone number from a subaccount."""
    auth = get_auth(settings)
    async with httpx.AsyncClient() as client:
        resp = await client.delete(
            f"{TWILIO_API_BASE}/Accounts/{subaccount_sid}/IncomingPhoneNumbers/{number_sid}.json",
            auth=auth,
        )
        resp.raise_for_status()


# ── Voice / Calls ──────────────────────────────────────────────────────


async def make_call(
    from_number: str,
    to_number: str,
    twiml_url: str,
    subaccount_sid: str,
    settings: Settings,
) -> dict[str, str]:
    """Initiate an outbound call."""
    auth = get_auth(settings)
    webhook_url = twiml_url.replace("/webhook/voice", "/webhook/call-status")
    recording_url = twiml_url.replace("/webhook/voice", "/webhook/recording")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TWILIO_API_BASE}/Accounts/{subaccount_sid}/Calls.json",
            auth=auth,
            data={
                "From": from_number,
                "To": to_number,
                "Url": twiml_url,
                "StatusCallback": webhook_url,
                "Record": "true",
                "RecordingStatusCallback": recording_url,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return {"call_sid": data["sid"]}


async def make_outbound_call(
    to: str,
    from_: str,
    twiml: str,
    settings: Settings,
) -> Optional[str]:
    """
    Initiate an outbound call using inline TwiML (not a URL).

    Used by the callback scheduler and campaign scheduler to make
    AI outbound calls with ConversationRelay TwiML directly.

    Returns the Twilio CallSid on success, None on failure.
    """
    auth = get_auth(settings)
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{TWILIO_API_BASE}/Accounts/{settings.TWILIO_ACCOUNT_SID}/Calls.json",
                auth=auth,
                data={
                    "From": from_,
                    "To": to,
                    "Twiml": twiml,
                    "StatusCallback": f"{settings.API_BASE_URL}/api/phone/webhook/call-status",
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("sid")
    except Exception as e:
        logger.error(f"Failed to make outbound call to {to}: {e}")
        return None


def generate_access_token(identity: str, settings: Settings) -> str:
    """Create a Twilio Access Token JWT for WebRTC softphone."""
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT", "cty": "twilio-fpa;v=1"}
    payload = {
        "jti": f"{settings.twilio_api_key_sid}-{now}",
        "iss": settings.twilio_api_key_sid,
        "sub": settings.twilio_account_sid,
        "exp": now + 3600,
        "grants": {
            "identity": identity,
            "voice": {
                "incoming": {"allow": True},
                "outgoing": {
                    "application_sid": settings.twilio_twiml_app_sid,
                },
            },
        },
    }

    def _b64url(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

    header_b64 = _b64url(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}"
    signature = hmac.new(
        settings.twilio_api_key_secret.encode(),
        signing_input.encode(),
        hashlib.sha256,
    ).digest()
    sig_b64 = _b64url(signature)
    return f"{signing_input}.{sig_b64}"


# ── SMS ────────────────────────────────────────────────────────────────


async def send_sms(
    from_number: str,
    to_number: str,
    body: str,
    subaccount_sid: str,
    settings: Settings,
) -> dict[str, str]:
    """Send an outbound SMS message."""
    auth = get_auth(settings)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TWILIO_API_BASE}/Accounts/{subaccount_sid}/Messages.json",
            auth=auth,
            data={"From": from_number, "To": to_number, "Body": body},
        )
        resp.raise_for_status()
        data = resp.json()
        return {"message_sid": data["sid"]}


# ── Voicemail drop ─────────────────────────────────────────────────────


async def drop_voicemail(
    to_number: str,
    from_number: str,
    audio_url: str,
    subaccount_sid: str,
    settings: Settings,
) -> dict[str, str]:
    """Drop a voicemail by calling with TwiML that plays audio on machine detection."""
    auth = get_auth(settings)
    # TwiML that plays the audio immediately
    twiml = f'<Response><Play>{audio_url}</Play></Response>'
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TWILIO_API_BASE}/Accounts/{subaccount_sid}/Calls.json",
            auth=auth,
            data={
                "From": from_number,
                "To": to_number,
                "Twiml": twiml,
                "MachineDetection": "DetectMessageEnd",
                "AsyncAmd": "true",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return {"call_sid": data["sid"]}


# ── Fax ────────────────────────────────────────────────────────────────


async def send_fax(
    from_number: str,
    to_number: str,
    media_url: str,
    subaccount_sid: str,
    settings: Settings,
) -> dict[str, str]:
    """Send a fax via Twilio Fax API."""
    auth = get_auth(settings)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TWILIO_FAX_BASE}/Faxes",
            auth=auth,
            data={"From": from_number, "To": to_number, "MediaUrl": media_url},
        )
        resp.raise_for_status()
        data = resp.json()
        return {"fax_sid": data["sid"]}


# ── TwiML generation helpers ──────────────────────────────────────────


def generate_forward_twiml(forward_to: str) -> str:
    """Return TwiML that dials/forwards to an external number."""
    return (
        "<Response>"
        '<Dial action="/api/phone/webhook/call-status">'
        f"<Number>{forward_to}</Number>"
        "</Dial>"
        "</Response>"
    )


def generate_voicemail_twiml() -> str:
    """Return TwiML for recording a voicemail."""
    return (
        "<Response>"
        "<Say>Please leave a message after the tone.</Say>"
        '<Record maxLength="120" transcribe="true" '
        'transcribeCallback="/api/phone/webhook/transcription"/>'
        "</Response>"
    )


def generate_softphone_twiml(identity: str) -> str:
    """Return TwiML for browser softphone connection."""
    return (
        "<Response>"
        "<Dial>"
        f'<Client>{identity}</Client>'
        "</Dial>"
        "</Response>"
    )


# ── Media upload helper ────────────────────────────────────────────────


async def upload_media(
    audio_bytes: bytes,
    filename: str,
    subaccount_sid: str,
    settings: Settings,
) -> str:
    """Upload audio to Twilio as a media resource and return its URL.

    Uses Twilio's Media resource on the subaccount to store the file
    so it can be referenced in TwiML <Play> elements.
    """
    auth = get_auth(settings)
    # Create a call-accessible URL by posting to a temporary TwiML bin-style approach.
    # In practice, Twilio recommends hosting media externally, but we can use
    # Twilio's Recordings/Media API. For simplicity, we return a data-uri style
    # hosted approach. The caller should host on their own server or S3 bucket.
    # For now, we use Twilio's media endpoint.
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{TWILIO_API_BASE}/Accounts/{subaccount_sid}/Messages.json",
            auth=auth,
            data={
                "From": "+15005550006",  # Twilio test number for media hosting
                "To": "+15005550006",
                "Body": f"media:{filename}",
            },
            files={"MediaUrl": (filename, audio_bytes, "audio/mpeg")},
        )
        # If media hosting fails, return empty string as a signal
        if resp.status_code >= 400:
            return ""
        data = resp.json()
        # Return the media URL from the message
        media_url = data.get("media", {}).get("uri", "")
        return media_url


# ═══════════════════════════════════════════════════════════════════════
# Voice AI Additions — Twilio Service for ConversationRelay
# ═══════════════════════════════════════════════════════════════════════

# ── ConversationRelay TwiML ─────────────────────────────────────────────

def generate_conversation_relay_twiml(
    elevenlabs_signed_url: str,
    voice: str = "en-US-Standard-F",
    dtmf_detection: bool = True,
) -> str:
    """
    Generate TwiML that connects an inbound/outbound call to ElevenLabs
    Conversational AI via Twilio's ConversationRelay.

    HOW THIS WORKS (in plain English):
    1. Twilio receives/makes a phone call
    2. This TwiML tells Twilio: "Stream this call's audio to this WebSocket URL"
    3. The WebSocket URL points to ElevenLabs' Conversational AI
    4. ElevenLabs handles speech-to-text, sends it to Claude, gets a response,
       converts it to speech with their voice, and streams it back
    5. The caller hears a natural AI voice speaking back to them

    Args:
        elevenlabs_signed_url: The wss:// URL from ElevenLabs get_signed_url()
        voice: Fallback TTS voice (only used if ElevenLabs connection fails)
        dtmf_detection: Whether to detect keypad presses during the call
    """
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay
            url="{elevenlabs_signed_url}"
            voice="{voice}"
            dtmfDetection="{str(dtmf_detection).lower()}"
            interruptible="true"
            welcomeGreeting=""
        />
    </Connect>
</Response>"""
    return twiml


# ── Simultaneous Ring TwiML ─────────────────────────────────────────────

def generate_simultaneous_ring_twiml(
    softphone_identity: str | None = None,
    cell_number: str | None = None,
    caller_id: str = "",
    timeout: int = 25,
    record: bool = True,
    phone_number_id: int | None = None,
    api_base_url: str = "",
) -> str:
    """
    Generate TwiML that rings multiple endpoints at the same time.

    The first person to pick up gets connected to the caller.
    Can ring: softphone only, cell only, or BOTH simultaneously.

    If nobody answers, the call routes to a fallback webhook that
    connects the caller to the AI agent instead of voicemail.

    HOW THIS WORKS (in plain English):
    1. A call comes in and the system decides a human should answer
    2. This TwiML tells Twilio: "Ring all these endpoints at the same time"
    3. The <Client> tag rings the WebRTC softphone in the browser
    4. The <Number> tag rings the cell phone
    5. Whoever picks up first gets the call — the other stops ringing
    6. If NOBODY picks up, Twilio hits our 'action' URL
    7. That webhook checks if an AI agent is available → routes to AI
    8. If no AI agent, THEN it falls back to voicemail

    Args:
        softphone_identity: WebRTC client identity (e.g. "user-123")
        cell_number: Cell phone number in E.164 format (e.g. "+15551234567")
        caller_id: The caller ID to display
        timeout: How many seconds to ring before giving up
        record: Whether to record the call
        phone_number_id: The PhoneNumber record ID (for AI fallback routing)
        api_base_url: Base URL for webhooks (e.g. "https://api.example.com")
    """
    # Build the dial children based on what targets are provided
    dial_children = ""

    if softphone_identity:
        dial_children += f'\n            <Client>{softphone_identity}</Client>'

    if cell_number:
        dial_children += f'\n            <Number>{cell_number}</Number>'

    record_attr = 'record="record-from-answer-dual"' if record else ""

    # The 'action' URL is where Twilio goes when the Dial completes
    # (whether answered, no-answer, busy, or failed).
    # We point it to our dial-fallback webhook which routes to AI.
    action_attr = ""
    if phone_number_id and api_base_url:
        action_attr = (
            f'action="{api_base_url}/api/phone/webhook/dial-fallback'
            f'?phone_number_id={phone_number_id}"'
        )

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial
        timeout="{timeout}"
        callerId="{caller_id}"
        {record_attr}
        {action_attr}
    >{dial_children}
    </Dial>
    <Say>Sorry, no one is available right now. Please leave a message after the beep.</Say>
    <Record maxLength="120" transcribe="true" />
</Response>"""
    return twiml


# ── Transfer from AI to Human ───────────────────────────────────────────

def generate_transfer_twiml(
    softphone_identity: str | None = None,
    cell_number: str | None = None,
    caller_id: str = "",
    whisper_message: str = "Incoming transfer from AI agent.",
) -> str:
    """
    Generate TwiML to transfer an active AI call to a human.

    This is used when the AI determines the caller is a hot lead and
    wants to connect them with the investor immediately.

    HOW THIS WORKS (in plain English):
    1. AI agent is talking to a caller
    2. AI decides: "This is a hot lead, let me transfer to the investor"
    3. The system updates the Twilio call with this new TwiML
    4. The call gets redirected to the human (softphone, cell, or both)
    5. The human hears a quick whisper: "Incoming transfer from AI agent"
    6. Then they're connected to the caller

    Args:
        softphone_identity: WebRTC client identity for browser softphone
        cell_number: Cell phone number to transfer to
        caller_id: Caller ID to display
        whisper_message: Quick message the human hears before being connected
    """
    dial_children = ""

    if softphone_identity:
        dial_children += f'\n            <Client>{softphone_identity}</Client>'

    if cell_number:
        dial_children += f'\n            <Number>{cell_number}</Number>'

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>{whisper_message}</Say>
    <Dial callerId="{caller_id}">
        {dial_children}
    </Dial>
</Response>"""
    return twiml
