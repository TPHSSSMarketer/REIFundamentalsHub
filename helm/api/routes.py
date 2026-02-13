"""API route definitions — the external surface of Helm."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from helm.assistant.engine import helm_engine
from helm.assistant.memory import memory
from helm.integrations.reifundamentals import reifundamentals_client
from helm.models.schemas import (
    AssistantMode,
    ChatRequest,
    ChatResponse,
    DealAnalysisRequest,
    PortfolioOverview,
)

router = APIRouter()


# ── Health ───────────────────────────────────────────────────────────────────


@router.get("/health")
async def health_check():
    return {"status": "ok", "service": "Helm AI Assistant"}


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
