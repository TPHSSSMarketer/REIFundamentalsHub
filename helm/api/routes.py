"""API route definitions — the external surface of Helm."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request, Response, UploadFile, WebSocket, WebSocketDisconnect

from helm.agents.definitions import get_agent, list_agents
from helm.assistant.engine import helm_engine
from helm.assistant.memory import memory
from helm.checkins.scheduler import checkin_scheduler
from helm.integrations.registry import registry
from helm.integrations.reifundamentals import reifundamentals_client
from helm.integrations.telegram import telegram_bot
from helm.integrations.voice import voice_processor
from helm.integrations.whatsapp import whatsapp_client
from helm.models.schemas import (
    AssistantMode,
    ChatRequest,
    ChatResponse,
    DealAnalysisRequest,
    PortfolioOverview,
)
from helm.reliability.health_check import health_checker

router = APIRouter()


# ── Health ───────────────────────────────────────────────────────────────────


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "Helm AI Assistant"}


@router.get("/health/detailed")
async def health_detailed():
    """Detailed health check with all integration statuses."""
    return await health_checker.full_check()


# ── Integrations Status ─────────────────────────────────────────────────────


@router.get("/integrations")
async def list_integrations():
    """List all registered integrations and their status."""
    return registry.get_status_report()


# ── Agents ───────────────────────────────────────────────────────────────────


@router.get("/agents")
async def list_available_agents(scope: str | None = None):
    """List all available sub-agents."""
    agents = list_agents(scope)
    return {
        "agents": [
            {
                "name": a.name,
                "description": a.description,
                "scope": a.scope,
                "requires_plugins": a.requires_plugins,
            }
            for a in agents
        ]
    }


# ── Check-ins ────────────────────────────────────────────────────────────────


@router.post("/checkin/trigger")
async def trigger_checkin():
    """Manually trigger a smart check-in cycle."""
    result = await checkin_scheduler.run_cycle()
    return result


# ── Chat ─────────────────────────────────────────────────────────────────────


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Send a message to Helm and receive a response."""
    return await helm_engine.chat(request)


@router.delete("/chat/{conversation_id}")
async def clear_conversation(conversation_id: str):
    """Clear a conversation's history."""
    memory.clear(conversation_id)
    return {"status": "cleared", "conversation_id": conversation_id}


# ── Real Estate ──────────────────────────────────────────────────────────────


@router.get("/portfolio", response_model=PortfolioOverview)
async def get_portfolio():
    """Fetch the user's portfolio overview from REIFundamentals Hub."""
    return await reifundamentals_client.get_portfolio()


@router.post("/deal/analyze")
async def analyze_deal(request: DealAnalysisRequest):
    """Run an AI-powered analysis on a potential deal."""
    return await helm_engine.analyze_deal(
        address=request.address,
        purchase_price=request.purchase_price,
        rehab_cost=request.rehab_cost,
        after_repair_value=request.after_repair_value,
        monthly_rent=request.monthly_rent,
        strategy=request.strategy,
    )


# ── Briefing ─────────────────────────────────────────────────────────────────


@router.get("/briefing")
async def daily_briefing():
    """Generate the daily briefing."""
    text = await helm_engine.daily_briefing()
    return {"briefing": text}


# ── WebSocket (real-time chat) ───────────────────────────────────────────────


@router.websocket("/ws/chat")
async def websocket_chat(ws: WebSocket):
    """Real-time chat over WebSocket for the frontend dashboard."""
    await ws.accept()
    conversation_id: str | None = None
    mode = AssistantMode.BUSINESS

    try:
        while True:
            data = await ws.receive_json()

            # Allow the client to switch modes mid-conversation
            if "mode" in data:
                mode = AssistantMode(data["mode"])

            if "conversation_id" in data:
                conversation_id = data["conversation_id"]

            request = ChatRequest(
                message=data.get("message", ""),
                mode=mode,
                conversation_id=conversation_id,
            )

            response = await helm_engine.chat(request)
            conversation_id = response.conversation_id

            await ws.send_json(response.model_dump(mode="json"))

    except WebSocketDisconnect:
        pass


# ── Telegram Webhook ────────────────────────────────────────────────────────


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    """Receive inbound updates from Telegram."""
    update = await request.json()
    await telegram_bot.handle_update(update)
    return {"ok": True}


# ── WhatsApp Webhook ────────────────────────────────────────────────────────


@router.get("/whatsapp/webhook")
async def whatsapp_verify(
    hub_mode: str = Query("", alias="hub.mode"),
    hub_verify_token: str = Query("", alias="hub.verify_token"),
    hub_challenge: str = Query("", alias="hub.challenge"),
):
    """Meta webhook verification (GET request)."""
    challenge = whatsapp_client.verify_webhook(hub_mode, hub_verify_token, hub_challenge)
    if challenge is not None:
        return Response(content=challenge, media_type="text/plain")
    return Response(content="Forbidden", status_code=403)


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request):
    """Receive inbound messages from WhatsApp."""
    payload = await request.json()
    await whatsapp_client.handle_webhook(payload)
    return {"status": "ok"}


# ── Voice ───────────────────────────────────────────────────────────────────


@router.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile):
    """Upload an audio file and get a text transcription."""
    audio_bytes = await file.read()
    text = await voice_processor.transcribe(audio_bytes, filename=file.filename or "audio.ogg")
    if text is None:
        return {"error": "Transcription failed. Check voice API configuration."}
    return {"text": text}


@router.post("/voice/synthesize")
async def voice_synthesize(request: Request):
    """Convert text to speech. Returns audio bytes."""
    data = await request.json()
    text = data.get("text", "")
    voice = data.get("voice")
    if not text:
        return {"error": "No text provided."}

    audio_bytes = await voice_processor.synthesize(text, voice=voice)
    if audio_bytes is None:
        return {"error": "Speech synthesis failed. Check voice API configuration."}

    return Response(
        content=audio_bytes,
        media_type="audio/ogg",
        headers={"Content-Disposition": "attachment; filename=helm_reply.ogg"},
    )


@router.post("/voice/chat")
async def voice_chat(file: UploadFile):
    """Full voice round-trip: upload audio → transcribe → AI reply → synthesize."""
    audio_bytes = await file.read()
    reply_text, reply_audio = await voice_processor.voice_chat(
        audio_bytes, filename=file.filename or "audio.ogg"
    )

    if reply_text is None:
        return {"error": "Could not process voice message."}

    if reply_audio:
        import base64

        return {
            "text": reply_text,
            "audio_base64": base64.b64encode(reply_audio).decode(),
        }

    return {"text": reply_text, "audio_base64": None}
