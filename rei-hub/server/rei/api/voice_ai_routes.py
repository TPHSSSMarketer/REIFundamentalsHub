"""
Voice AI API Routes — Agent Management, Knowledge Base, Conversation History
=============================================================================
ADD THIS FILE to: rei-hub/server/rei/api/voice_ai_routes.py

Then register the router in your main app:
    from rei.api.voice_ai_routes import voice_ai_router
    app.include_router(voice_ai_router, prefix="/api")

These endpoints let the frontend manage:
- AI Agents (Maya, Marcus, Sofia) — configure voice, personality, prompts
- Knowledge Base — add/edit/delete scripts, company data, objection handlers
- Conversation History — view AI call transcripts, extracted data, mood analysis
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import (
    AIAgent,
    ConversationLog,
    KnowledgeEntry,
    User,
)
from rei.services import elevenlabs_service
from rei.services.ai_service import build_voice_agent_prompt

logger = logging.getLogger(__name__)
voice_ai_router = APIRouter(prefix="/voice-ai", tags=["voice-ai"])
settings = get_settings()


# ── Schemas ─────────────────────────────────────────────────────────────

class UpdateAgentRequest(BaseModel):
    name: Optional[str] = None
    personality: Optional[str] = None
    elevenlabs_voice_id: Optional[str] = None
    system_prompt: Optional[str] = None
    is_active: Optional[bool] = None
    first_message: Optional[str] = None


class CreateKnowledgeRequest(BaseModel):
    name: str
    entry_type: str  # "account_data", "custom_script"
    content: str


class UpdateKnowledgeRequest(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None


# ════════════════════════════════════════════════════════════════════════
# AI AGENT ENDPOINTS
# ════════════════════════════════════════════════════════════════════════

@voice_ai_router.get("/agents")
async def list_agents(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all AI agents for the current user.
    Returns Maya, Marcus, and Sofia (or any custom agents).
    """
    result = await db.execute(
        select(AIAgent).where(AIAgent.user_id == user.id)
    )
    agents = result.scalars().all()

    # If no agents exist yet, create the default three
    if not agents:
        agents = await _create_default_agents(user.id, db)

    return [
        {
            "id": a.id,
            "name": a.name,
            "role": a.role,
            "personality": a.personality,
            "elevenlabs_voice_id": a.elevenlabs_voice_id,
            "elevenlabs_agent_id": a.elevenlabs_agent_id,
            "system_prompt": a.system_prompt,
            "is_active": a.is_active,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in agents
    ]


@voice_ai_router.patch("/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    body: UpdateAgentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update an AI agent's configuration.
    This is how investors customize their agents' voice, personality, and scripts.
    """
    result = await db.execute(
        select(AIAgent).where(
            and_(AIAgent.id == agent_id, AIAgent.user_id == user.id)
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Update fields
    if body.name is not None:
        agent.name = body.name
    if body.personality is not None:
        agent.personality = body.personality
    if body.elevenlabs_voice_id is not None:
        agent.elevenlabs_voice_id = body.elevenlabs_voice_id
    if body.system_prompt is not None:
        agent.system_prompt = body.system_prompt
    if body.is_active is not None:
        agent.is_active = body.is_active

    agent.updated_at = datetime.utcnow()

    # If voice or prompt changed, update the ElevenLabs agent too
    if agent.elevenlabs_agent_id and (body.elevenlabs_voice_id or body.system_prompt):
        try:
            # Build the full prompt with knowledge base
            knowledge = await _get_agent_knowledge(user.id, db)
            full_prompt = build_voice_agent_prompt(
                agent_name=agent.name,
                agent_role=agent.role,
                agent_personality=agent.personality,
                custom_system_prompt=agent.system_prompt,
                knowledge_entries=knowledge,
            )

            await elevenlabs_service.update_conversational_agent(
                agent_id=agent.elevenlabs_agent_id,
                system_prompt=full_prompt if body.system_prompt else None,
                voice_id=body.elevenlabs_voice_id,
                first_message=body.first_message,
                settings=settings,
            )
        except Exception as e:
            logger.warning(f"Failed to update ElevenLabs agent: {e}")

    await db.commit()
    return {"status": "updated", "agent_id": agent_id}


@voice_ai_router.post("/agents/{agent_id}/provision")
async def provision_agent(
    agent_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Provision (create) an ElevenLabs Conversational AI agent.

    This needs to be called once per agent to set up the ElevenLabs side.
    After this, the agent can handle real phone calls.

    WHAT THIS DOES (in plain English):
    1. Looks up the agent (e.g. Maya) and all their settings
    2. Gathers the knowledge base (scripts, company data)
    3. Builds the full system prompt
    4. Creates the agent on ElevenLabs' servers
    5. Saves the ElevenLabs agent ID back to our database
    """
    result = await db.execute(
        select(AIAgent).where(
            and_(AIAgent.id == agent_id, AIAgent.user_id == user.id)
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not agent.elevenlabs_voice_id:
        raise HTTPException(
            status_code=400,
            detail="Agent must have an ElevenLabs voice selected before provisioning"
        )

    # Gather knowledge base
    knowledge = await _get_agent_knowledge(user.id, db)
    knowledge_text = "\n\n".join(
        f"=== {k['name']} ===\n{k['content']}" for k in knowledge
    )

    # Build system prompt
    full_prompt = build_voice_agent_prompt(
        agent_name=agent.name,
        agent_role=agent.role,
        agent_personality=agent.personality,
        custom_system_prompt=agent.system_prompt,
        knowledge_entries=knowledge,
    )

    # Create on ElevenLabs
    result_data = await elevenlabs_service.create_conversational_agent(
        agent_name=f"{agent.name} - {agent.role}",
        system_prompt=full_prompt,
        voice_id=agent.elevenlabs_voice_id,
        knowledge_base_text=knowledge_text,
        settings=settings,
    )

    # Save the ElevenLabs agent ID
    agent.elevenlabs_agent_id = result_data.get("agent_id")
    agent.updated_at = datetime.utcnow()
    await db.commit()

    return {
        "status": "provisioned",
        "agent_id": agent_id,
        "elevenlabs_agent_id": agent.elevenlabs_agent_id,
    }


@voice_ai_router.get("/voices")
async def list_voices(
    user: User = Depends(get_current_user),
):
    """
    List available ElevenLabs voices.
    Used by the frontend to populate the voice selection dropdown.
    """
    voices = await elevenlabs_service.get_voices(settings)
    return voices


# ════════════════════════════════════════════════════════════════════════
# KNOWLEDGE BASE ENDPOINTS
# ════════════════════════════════════════════════════════════════════════

@voice_ai_router.get("/knowledge-base")
async def list_knowledge(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all knowledge base entries — both platform-level and account-level.
    Platform-level entries (user_id is NULL) are available to all users.
    """
    result = await db.execute(
        select(KnowledgeEntry).where(
            (KnowledgeEntry.user_id == user.id) | (KnowledgeEntry.user_id.is_(None))
        )
    )
    entries = result.scalars().all()

    return [
        {
            "id": e.id,
            "name": e.name,
            "entry_type": e.entry_type,
            "content": e.content,
            "is_platform": e.user_id is None,
            "is_active": e.is_active,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


@voice_ai_router.post("/knowledge-base")
async def create_knowledge(
    body: CreateKnowledgeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Add a new knowledge base entry for the current user.
    This is how investors add their company data or custom scripts.
    """
    # Only allow account-level types (not platform_script)
    if body.entry_type not in ("account_data", "custom_script", "objection_handler"):
        raise HTTPException(
            status_code=400,
            detail="entry_type must be 'account_data', 'custom_script', or 'objection_handler'"
        )

    entry = KnowledgeEntry(
        user_id=user.id,
        name=body.name,
        entry_type=body.entry_type,
        content=body.content,
    )
    db.add(entry)
    await db.commit()

    return {"status": "created", "id": entry.id}


@voice_ai_router.put("/knowledge-base/{entry_id}")
async def update_knowledge(
    entry_id: str,
    body: UpdateKnowledgeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a knowledge base entry (account-level only)."""
    result = await db.execute(
        select(KnowledgeEntry).where(
            and_(
                KnowledgeEntry.id == entry_id,
                KnowledgeEntry.user_id == user.id,  # Can't edit platform entries
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")

    if body.name is not None:
        entry.name = body.name
    if body.content is not None:
        entry.content = body.content
    if body.is_active is not None:
        entry.is_active = body.is_active

    entry.updated_at = datetime.utcnow()
    await db.commit()

    return {"status": "updated", "id": entry_id}


@voice_ai_router.delete("/knowledge-base/{entry_id}")
async def delete_knowledge(
    entry_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a knowledge base entry (account-level only)."""
    result = await db.execute(
        select(KnowledgeEntry).where(
            and_(
                KnowledgeEntry.id == entry_id,
                KnowledgeEntry.user_id == user.id,
            )
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Knowledge entry not found")

    await db.delete(entry)
    await db.commit()

    return {"status": "deleted", "id": entry_id}


# ════════════════════════════════════════════════════════════════════════
# CONVERSATION HISTORY ENDPOINTS
# ════════════════════════════════════════════════════════════════════════

@voice_ai_router.get("/conversations")
async def list_conversations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    offset: int = 0,
    outcome: Optional[str] = None,
):
    """
    List AI conversation logs with filtering.
    Shows call history handled by AI agents with mood, eagerness, and outcome.
    """
    query = select(ConversationLog).where(
        ConversationLog.user_id == user.id
    )

    if outcome:
        query = query.where(ConversationLog.outcome == outcome)

    query = query.order_by(ConversationLog.started_at.desc())
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    conversations = result.scalars().all()

    return [
        {
            "id": c.id,
            "call_log_id": c.call_log_id,
            "agent_id": c.agent_id,
            "caller_mood": c.caller_mood,
            "deal_eagerness": c.deal_eagerness,
            "outcome": c.outcome,
            "summary": c.summary,
            "status": c.status,
            "started_at": c.started_at.isoformat() if c.started_at else None,
            "ended_at": c.ended_at.isoformat() if c.ended_at else None,
            "extracted_data": json.loads(c.extracted_data) if c.extracted_data else {},
        }
        for c in conversations
    ]


@voice_ai_router.get("/conversations/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get full details of a single AI conversation.
    Includes the complete transcript, extracted data, and analysis.
    """
    result = await db.execute(
        select(ConversationLog).where(
            and_(
                ConversationLog.id == conversation_id,
                ConversationLog.user_id == user.id,
            )
        )
    )
    conv = result.scalar_one_or_none()

    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "id": conv.id,
        "call_log_id": conv.call_log_id,
        "agent_id": conv.agent_id,
        "elevenlabs_conversation_id": conv.elevenlabs_conversation_id,
        "transcript": json.loads(conv.transcript) if conv.transcript else [],
        "extracted_data": json.loads(conv.extracted_data) if conv.extracted_data else {},
        "caller_mood": conv.caller_mood,
        "deal_eagerness": conv.deal_eagerness,
        "outcome": conv.outcome,
        "summary": conv.summary,
        "status": conv.status,
        "started_at": conv.started_at.isoformat() if conv.started_at else None,
        "ended_at": conv.ended_at.isoformat() if conv.ended_at else None,
    }


# ── Helper Functions ────────────────────────────────────────────────────

async def _create_default_agents(user_id: int, db: AsyncSession) -> list[AIAgent]:
    """Create the default three AI agents for a new user."""
    defaults = [
        {
            "name": "Maya",
            "role": "lead_qualifier",
            "personality": "Warm & empathetic",
            "system_prompt": "You specialize in qualifying inbound leads. Your goal is to determine if the caller has a property to sell and if they're motivated.",
        },
        {
            "name": "Marcus",
            "role": "appointment_setter",
            "personality": "Direct & confident",
            "system_prompt": "You specialize in scheduling appointments between motivated sellers and the investor. Be efficient and action-oriented.",
        },
        {
            "name": "Sofia",
            "role": "follow_up",
            "personality": "Friendly & persistent",
            "system_prompt": "You specialize in following up with leads who haven't responded. Be warm, understanding, and gently persistent.",
        },
    ]

    agents = []
    for d in defaults:
        agent = AIAgent(user_id=user_id, **d)
        db.add(agent)
        agents.append(agent)

    await db.commit()
    return agents


async def _get_agent_knowledge(user_id: int, db: AsyncSession) -> list[dict]:
    """Get all active knowledge entries for a user (platform + account level)."""
    result = await db.execute(
        select(KnowledgeEntry).where(
            and_(
                (KnowledgeEntry.user_id == user_id) | (KnowledgeEntry.user_id.is_(None)),
                KnowledgeEntry.is_active == True,
            )
        )
    )
    entries = result.scalars().all()
    return [{"name": e.name, "content": e.content} for e in entries]
