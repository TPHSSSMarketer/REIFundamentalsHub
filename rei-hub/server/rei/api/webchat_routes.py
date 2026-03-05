"""Web Chat API Routes — Public endpoints for the embeddable chat widget.

Register in main.py:
    from rei.api.webchat_routes import webchat_router, webchat_public_router
    app.include_router(webchat_router, prefix="/api")
    app.include_router(webchat_public_router)

TWO sets of routes:
1. webchat_router (authenticated) — Dashboard endpoints for managing chat settings,
   viewing active chats, human takeover, etc.
2. webchat_public_router (no auth) — Public endpoints that the embeddable widget calls.
   These are what visitors on an investor's website hit when they chat.

HOW THE WIDGET WORKS:
1. Investor embeds a <script> tag on their website
2. Script loads the chat widget (floating bubble bottom-right)
3. Visitor clicks bubble → widget opens → starts a ChatSession
4. Each message from the visitor hits POST /chat/{widget_id}/message
5. The Flow Engine processes it and returns the AI's response
6. For real-time: WebSocket connection at /ws/chat/{session_id}
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import get_settings
from rei.database import async_session_factory
from rei.models.conversation_flow import (
    ChatSession,
    ConversationFlow,
    FlowExecution,
)
from rei.models.user import User
from rei.services.flow_engine import process_message, start_flow_execution

logger = logging.getLogger(__name__)
settings = get_settings()

webchat_router = APIRouter(prefix="/webchat", tags=["webchat"])
webchat_public_router = APIRouter(tags=["webchat-public"])

# In-memory store for active WebSocket connections
# In production, you'd use Redis pub/sub for multi-server support
_active_connections: dict[str, list[WebSocket]] = {}


# ── Schemas ─────────────────────────────────────────────────────


class ChatWidgetConfig(BaseModel):
    """Settings for the embeddable chat widget."""
    flow_id: str
    persona_id: Optional[str] = None
    # Appearance
    widget_title: str = "Chat with us"
    welcome_message: str = "Hi there! How can I help you today?"
    primary_color: str = "#1B3A6B"
    bubble_icon: str = "chat"  # "chat", "phone", "help"
    position: str = "bottom-right"  # "bottom-right", "bottom-left"
    # Behavior
    auto_open_delay_seconds: int = 0  # 0 = don't auto-open
    collect_email_first: bool = False
    collect_name_first: bool = False
    show_powered_by: bool = True


class WidgetMessageRequest(BaseModel):
    """A message from a website visitor."""
    message: str
    visitor_id: Optional[str] = None
    visitor_name: Optional[str] = None
    visitor_email: Optional[str] = None
    page_url: Optional[str] = None


class DashboardChatMessage(BaseModel):
    """A message from the investor (human takeover)."""
    message: str


# ════════════════════════════════════════════════════════════════
# AUTHENTICATED ENDPOINTS (Dashboard)
# ════════════════════════════════════════════════════════════════


@webchat_router.get("/config")
async def get_webchat_config(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the user's chat widget configuration.

    Returns the embed code and settings. The investor copies the
    embed code and pastes it into their website's HTML.
    """
    # For now, return a default config with the user's ID as widget_id
    widget_id = f"rei-{workspace_user_id(user)}"

    # Find their active flow for webchat
    result = await db.execute(
        select(ConversationFlow).where(
            and_(
                ConversationFlow.user_id == workspace_user_id(user),
                ConversationFlow.is_active == True,
                ConversationFlow.channel.in_(["webchat", "all"]),
            )
        )
    )
    active_flow = result.scalar_one_or_none()

    embed_code = (
        f'<script src="{settings.hub_url}/chat-widget.js" '
        f'data-widget-id="{widget_id}"></script>'
    )

    return {
        "widget_id": widget_id,
        "embed_code": embed_code,
        "active_flow_id": active_flow.id if active_flow else None,
        "active_flow_name": active_flow.name if active_flow else None,
    }


@webchat_router.get("/sessions")
async def list_chat_sessions(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all chat sessions (for the dashboard inbox view)."""
    query = select(ChatSession).where(ChatSession.user_id == workspace_user_id(user))

    if status:
        query = query.where(ChatSession.status == status)

    query = query.order_by(ChatSession.last_message_at.desc())
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    sessions = result.scalars().all()

    return [
        {
            "id": s.id,
            "channel": s.channel,
            "contact_name": s.contact_name,
            "contact_email": s.contact_email,
            "contact_phone": s.contact_phone,
            "status": s.status,
            "is_human_takeover": s.is_human_takeover,
            "page_url": s.page_url,
            "last_message_at": s.last_message_at.isoformat() if s.last_message_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@webchat_router.get("/sessions/{session_id}")
async def get_chat_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full chat session details including messages."""
    result = await db.execute(
        select(ChatSession).where(
            and_(ChatSession.id == session_id, ChatSession.user_id == workspace_user_id(user))
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get the flow execution messages
    messages = []
    if session.active_execution_id:
        result = await db.execute(
            select(FlowExecution).where(
                FlowExecution.id == session.active_execution_id
            )
        )
        execution = result.scalar_one_or_none()
        if execution:
            messages = json.loads(execution.messages or "[]")

    return {
        "id": session.id,
        "channel": session.channel,
        "contact_name": session.contact_name,
        "contact_email": session.contact_email,
        "status": session.status,
        "is_human_takeover": session.is_human_takeover,
        "page_url": session.page_url,
        "messages": messages,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


@webchat_router.post("/sessions/{session_id}/takeover")
async def human_takeover(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Take over a chat session from the AI (human agent steps in)."""
    result = await db.execute(
        select(ChatSession).where(
            and_(ChatSession.id == session_id, ChatSession.user_id == workspace_user_id(user))
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.is_human_takeover = True
    session.status = "transferred_to_human"
    await db.commit()

    # Notify the visitor via WebSocket that a human has joined
    if session_id in _active_connections:
        for ws in _active_connections[session_id]:
            try:
                await ws.send_json({
                    "type": "system",
                    "message": "A team member has joined the conversation.",
                })
            except Exception:
                pass

    return {"status": "takeover_active", "session_id": session_id}


@webchat_router.post("/sessions/{session_id}/release")
async def release_takeover(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Release human takeover — AI resumes responding."""
    result = await db.execute(
        select(ChatSession).where(
            and_(ChatSession.id == session_id, ChatSession.user_id == workspace_user_id(user))
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.is_human_takeover = False
    session.status = "active"
    await db.commit()

    return {"status": "ai_resumed", "session_id": session_id}


@webchat_router.post("/sessions/{session_id}/message")
async def send_human_message(
    session_id: str,
    body: DashboardChatMessage,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message as the human agent during takeover."""
    result = await db.execute(
        select(ChatSession).where(
            and_(ChatSession.id == session_id, ChatSession.user_id == workspace_user_id(user))
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Add message to the execution's message history
    if session.active_execution_id:
        result = await db.execute(
            select(FlowExecution).where(
                FlowExecution.id == session.active_execution_id
            )
        )
        execution = result.scalar_one_or_none()
        if execution:
            messages = json.loads(execution.messages or "[]")
            messages.append({
                "role": "assistant",
                "content": body.message,
                "timestamp": datetime.utcnow().isoformat(),
                "is_human": True,
            })
            execution.messages = json.dumps(messages)
            await db.commit()

    # Send to visitor via WebSocket
    if session_id in _active_connections:
        for ws in _active_connections[session_id]:
            try:
                await ws.send_json({
                    "type": "message",
                    "role": "assistant",
                    "content": body.message,
                    "is_human": True,
                })
            except Exception:
                pass

    return {"status": "sent"}


# ════════════════════════════════════════════════════════════════
# PUBLIC ENDPOINTS (Called by the embeddable widget — no auth)
# ════════════════════════════════════════════════════════════════


@webchat_public_router.post("/chat/{widget_id}/start")
async def start_chat(
    widget_id: str,
    body: WidgetMessageRequest,
):
    """Start a new chat session (called when visitor opens the widget).

    The widget_id format is "rei-{user_id}" — this tells us which
    investor's flow to use.
    """
    # Extract user_id from widget_id
    try:
        user_id = int(widget_id.replace("rei-", ""))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid widget ID")

    async with async_session_factory() as db:
        # Find the active webchat flow for this user
        result = await db.execute(
            select(ConversationFlow).where(
                and_(
                    ConversationFlow.user_id == user_id,
                    ConversationFlow.is_active == True,
                    ConversationFlow.channel.in_(["webchat", "all"]),
                )
            )
        )
        flow = result.scalar_one_or_none()
        if not flow:
            return {
                "session_id": None,
                "greeting": "Sorry, chat is not available right now.",
                "status": "unavailable",
            }

        # Create a chat session
        session = ChatSession(
            user_id=user_id,
            channel="webchat",
            visitor_id=body.visitor_id or str(uuid.uuid4()),
            contact_name=body.visitor_name,
            contact_email=body.visitor_email,
            page_url=body.page_url,
            status="active",
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

        # Start the flow execution
        exec_result = await start_flow_execution(
            flow_id=flow.id,
            user_id=user_id,
            db=db,
            settings=settings,
            channel="webchat",
            contact_name=body.visitor_name,
            contact_email=body.visitor_email,
            chat_session_id=session.id,
            persona_id=flow.persona_id,
        )

        # Link execution to session
        session.active_execution_id = exec_result.get("execution_id")
        session.last_message_at = datetime.utcnow()
        await db.commit()

        return {
            "session_id": session.id,
            "execution_id": exec_result.get("execution_id"),
            "greeting": exec_result.get("greeting", "Hi! How can I help?"),
            "status": "active",
        }


@webchat_public_router.post("/chat/{widget_id}/message")
async def send_visitor_message(
    widget_id: str,
    body: WidgetMessageRequest,
    session_id: Optional[str] = None,
):
    """Process a message from a website visitor.

    This is the main endpoint the widget calls on every message.
    """
    try:
        user_id = int(widget_id.replace("rei-", ""))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid widget ID")

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    async with async_session_factory() as db:
        # Load the chat session
        result = await db.execute(
            select(ChatSession).where(
                and_(
                    ChatSession.id == session_id,
                    ChatSession.user_id == user_id,
                )
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # If human has taken over, don't process through AI
        if session.is_human_takeover:
            # Still save the message to history
            if session.active_execution_id:
                result = await db.execute(
                    select(FlowExecution).where(
                        FlowExecution.id == session.active_execution_id
                    )
                )
                execution = result.scalar_one_or_none()
                if execution:
                    messages = json.loads(execution.messages or "[]")
                    messages.append({
                        "role": "user",
                        "content": body.message,
                        "timestamp": datetime.utcnow().isoformat(),
                    })
                    execution.messages = json.dumps(messages)
                    session.last_message_at = datetime.utcnow()
                    await db.commit()

            # Notify dashboard via WebSocket
            # (In production, use Redis pub/sub)
            return {
                "response": None,
                "status": "human_handling",
                "message": "A team member is responding...",
            }

        # Update contact info if provided
        if body.visitor_name and not session.contact_name:
            session.contact_name = body.visitor_name
        if body.visitor_email and not session.contact_email:
            session.contact_email = body.visitor_email

        # Process through the flow engine
        if not session.active_execution_id:
            raise HTTPException(status_code=400, detail="No active flow for this session")

        engine_result = await process_message(
            execution_id=session.active_execution_id,
            contact_message=body.message,
            db=db,
            settings=settings,
        )

        session.last_message_at = datetime.utcnow()
        await db.commit()

        # Send response via WebSocket if connected
        if session_id in _active_connections:
            for ws in _active_connections[session_id]:
                try:
                    await ws.send_json({
                        "type": "message",
                        "role": "assistant",
                        "content": engine_result.get("response", ""),
                    })
                except Exception:
                    pass

        return {
            "response": engine_result.get("response", ""),
            "status": engine_result.get("status", "active"),
            "variables": engine_result.get("variables", {}),
        }


# ════════════════════════════════════════════════════════════════
# WEBSOCKET — Real-time chat connection
# ════════════════════════════════════════════════════════════════


@webchat_public_router.websocket("/ws/chat/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """WebSocket connection for real-time chat.

    The widget connects here after starting a session.
    Messages flow both ways:
    - Visitor sends: {"type": "message", "content": "hello"}
    - Server sends: {"type": "message", "role": "assistant", "content": "Hi!"}
    - Server sends: {"type": "typing"} (typing indicator)
    - Server sends: {"type": "system", "message": "Human agent joined"}
    """
    await websocket.accept()

    # Register the connection
    if session_id not in _active_connections:
        _active_connections[session_id] = []
    _active_connections[session_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "message":
                content = data.get("content", "")
                widget_id = data.get("widget_id", "")

                if not content or not widget_id:
                    continue

                # Send typing indicator
                await websocket.send_json({"type": "typing"})

                try:
                    user_id = int(widget_id.replace("rei-", ""))
                except ValueError:
                    continue

                # Process the message
                async with async_session_factory() as db:
                    result = await db.execute(
                        select(ChatSession).where(ChatSession.id == session_id)
                    )
                    session = result.scalar_one_or_none()

                    if session and session.active_execution_id and not session.is_human_takeover:
                        engine_result = await process_message(
                            execution_id=session.active_execution_id,
                            contact_message=content,
                            db=db,
                            settings=settings,
                        )

                        session.last_message_at = datetime.utcnow()
                        await db.commit()

                        # Send the AI response
                        await websocket.send_json({
                            "type": "message",
                            "role": "assistant",
                            "content": engine_result.get("response", ""),
                            "status": engine_result.get("status", "active"),
                        })
                    elif session and session.is_human_takeover:
                        # Save message for human to see
                        if session.active_execution_id:
                            result = await db.execute(
                                select(FlowExecution).where(
                                    FlowExecution.id == session.active_execution_id
                                )
                            )
                            execution = result.scalar_one_or_none()
                            if execution:
                                messages = json.loads(execution.messages or "[]")
                                messages.append({
                                    "role": "user",
                                    "content": content,
                                    "timestamp": datetime.utcnow().isoformat(),
                                })
                                execution.messages = json.dumps(messages)
                                await db.commit()

            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        # Clean up connection
        if session_id in _active_connections:
            _active_connections[session_id].remove(websocket)
            if not _active_connections[session_id]:
                del _active_connections[session_id]
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
        if session_id in _active_connections:
            try:
                _active_connections[session_id].remove(websocket)
            except ValueError:
                pass
