"""
Voice AI API Routes — Agent Management, Knowledge Base, Conversation History
=============================================================================
ADD THIS FILE to: rei-hub/server/rei/api/voice_ai_routes.py

Then register the router in your main app:
    from rei.api.voice_ai_routes import voice_ai_router
    app.include_router(voice_ai_router, prefix="/api")

These endpoints let the frontend manage:
- AI Agents (Grace, Marcus, Sofia) — configure voice, personality, prompts
- Knowledge Base — add/edit/delete scripts, company data, objection handlers
- Conversation History — view AI call transcripts, extracted data, mood analysis
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import (
    CallCampaign,
    CampaignContact,
    ConversationLog,
    KnowledgeEntry,
    PhoneNumber,
    ScheduledCallback,
    User,
)
from rei.models.conversation_flow import Persona
from rei.services import elevenlabs_service
from rei.services.ai_service import build_voice_agent_prompt, get_user_knowledge
from rei.services.rag_service import delete_embedding, embed_knowledge_entry
from rei.services.callback_scheduler import create_callback_from_conversation
from rei.services.campaign_scheduler import (
    get_campaign_stats,
    pause_campaign,
    start_campaign,
)

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


class CreateCallbackRequest(BaseModel):
    contact_phone: str
    contact_name: Optional[str] = None
    contact_email: Optional[str] = None
    property_address: Optional[str] = None
    scheduled_at: str  # ISO datetime string
    timezone: str = "America/New_York"
    callback_type: str = "ai"  # "ai" or "human"
    agent_id: Optional[str] = None
    phone_number_id: Optional[int] = None
    notes: Optional[str] = None


class CreateCampaignRequest(BaseModel):
    name: str
    agent_id: str
    phone_number_id: int
    calling_window_start: str = "09:00"
    calling_window_end: str = "17:00"
    calling_days: str = "[1,2,3,4,5]"
    timezone: str = "America/New_York"
    seconds_between_calls: int = 30


class AddCampaignContactRequest(BaseModel):
    contact_name: Optional[str] = None
    contact_phone: str
    contact_email: Optional[str] = None
    property_address: Optional[str] = None
    context_notes: Optional[str] = None


class AddCampaignContactsBulkRequest(BaseModel):
    contacts: list[AddCampaignContactRequest]


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
    Shows user's own personas AND system personas (platform-level).
    """
    result = await db.execute(
        select(Persona).where(
            (Persona.user_id == user.id) | (Persona.is_system.is_(True))
        )
    )
    personas = result.scalars().all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "role": p.role or "",
            "personality": p.personality_prompt,
            "elevenlabs_voice_id": p.elevenlabs_voice_id,
            "elevenlabs_agent_id": p.elevenlabs_agent_id,
            "system_prompt": p.personality_prompt,
            "is_active": p.is_active,
            "is_system": p.is_system,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in personas
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
        select(Persona).where(
            and_(Persona.id == agent_id, Persona.user_id == user.id)
        )
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Update fields
    if body.name is not None:
        persona.name = body.name
    if body.personality is not None:
        persona.personality_prompt = body.personality
    if body.elevenlabs_voice_id is not None:
        persona.elevenlabs_voice_id = body.elevenlabs_voice_id
    if body.system_prompt is not None:
        persona.personality_prompt = body.system_prompt
    if body.is_active is not None:
        persona.is_active = body.is_active

    persona.updated_at = datetime.utcnow()

    # If voice or prompt changed, update the ElevenLabs agent too
    if persona.elevenlabs_agent_id and (body.elevenlabs_voice_id or body.system_prompt):
        try:
            # Build the full prompt with knowledge base
            knowledge = await get_user_knowledge(user.id, db)
            full_prompt = build_voice_agent_prompt(
                agent_name=persona.name,
                agent_role=persona.role or "assistant",
                agent_personality=persona.personality_prompt,
                custom_system_prompt=persona.personality_prompt,
                knowledge_entries=knowledge,
            )

            await elevenlabs_service.update_conversational_agent(
                agent_id=persona.elevenlabs_agent_id,
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
    1. Looks up the agent (e.g. Grace) and all their settings
    2. Gathers the knowledge base (scripts, company data)
    3. Builds the full system prompt
    4. Creates the agent on ElevenLabs' servers
    5. Saves the ElevenLabs agent ID back to our database
    """
    result = await db.execute(
        select(Persona).where(
            and_(Persona.id == agent_id, Persona.user_id == user.id)
        )
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not persona.elevenlabs_voice_id:
        raise HTTPException(
            status_code=400,
            detail="Agent must have an ElevenLabs voice selected before provisioning"
        )

    # Gather knowledge base
    knowledge = await get_user_knowledge(user.id, db)
    knowledge_text = "\n\n".join(
        f"=== {k['name']} ===\n{k['content']}" for k in knowledge
    )

    # Build system prompt
    full_prompt = build_voice_agent_prompt(
        agent_name=persona.name,
        agent_role=persona.role or "assistant",
        agent_personality=persona.personality_prompt,
        custom_system_prompt=persona.personality_prompt,
        knowledge_entries=knowledge,
    )

    # Create on ElevenLabs
    result_data = await elevenlabs_service.create_conversational_agent(
        agent_name=f"{persona.name} - {persona.role}",
        system_prompt=full_prompt,
        voice_id=persona.elevenlabs_voice_id,
        knowledge_base_text=knowledge_text,
        settings=settings,
    )

    # Save the ElevenLabs agent ID
    persona.elevenlabs_agent_id = result_data.get("agent_id")
    persona.updated_at = datetime.utcnow()
    await db.commit()

    return {
        "status": "provisioned",
        "agent_id": agent_id,
        "elevenlabs_agent_id": persona.elevenlabs_agent_id,
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
    allowed = ("account_data", "custom_script", "objection_handler", "training")
    if body.entry_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"entry_type must be one of: {', '.join(allowed)}"
        )

    entry = KnowledgeEntry(
        user_id=user.id,
        name=body.name,
        entry_type=body.entry_type,
        content=body.content,
    )
    db.add(entry)
    await db.commit()

    # Generate embedding for RAG retrieval (non-blocking — failure won't break create)
    try:
        await embed_knowledge_entry(entry.id, db)
    except Exception:
        logger.warning("Failed to embed new entry %s — will retry later.", entry.id)

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

    # Re-embed the updated entry for RAG retrieval
    try:
        await embed_knowledge_entry(entry_id, db)
    except Exception:
        logger.warning("Failed to re-embed entry %s — will retry later.", entry_id)

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

    # Remove the embedding first (before deleting the entry)
    try:
        await delete_embedding(entry_id, db)
    except Exception:
        logger.warning("Failed to delete embedding for entry %s.", entry_id)

    await db.delete(entry)
    await db.commit()

    return {"status": "deleted", "id": entry_id}


# ════════════════════════════════════════════════════════════════════════
# BULK IMPORT ENDPOINT
# ════════════════════════════════════════════════════════════════════════

_MAX_BULK_FILES = 20
_MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB per file


def _extract_text_from_pdf(content: bytes) -> str:
    """Extract text from a PDF file."""
    from pypdf import PdfReader
    import io

    reader = PdfReader(io.BytesIO(content))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text.strip())
    return "\n\n".join(pages)


def _extract_text_from_docx(content: bytes) -> str:
    """Extract text from a .docx Word file."""
    from docx import Document
    import io

    doc = Document(io.BytesIO(content))
    paragraphs = []
    for para in doc.paragraphs:
        if para.text.strip():
            paragraphs.append(para.text.strip())
    return "\n\n".join(paragraphs)


def _extract_text_from_file(filename: str, content: bytes) -> str:
    """Extract plain text from a file based on its extension."""
    lower = filename.lower()

    if lower.endswith(".pdf"):
        return _extract_text_from_pdf(content)
    elif lower.endswith(".docx"):
        return _extract_text_from_docx(content)
    elif lower.endswith((".txt", ".md", ".markdown", ".text", ".csv")):
        # Plain text files — try UTF-8, fall back to latin-1
        try:
            return content.decode("utf-8").strip()
        except UnicodeDecodeError:
            return content.decode("latin-1").strip()
    else:
        raise ValueError(
            f"Unsupported file type: {filename}. "
            "Supported: .pdf, .docx, .txt, .md, .csv"
        )


@voice_ai_router.post("/knowledge-base/bulk-import")
async def bulk_import_knowledge(
    files: list[UploadFile] = File(...),
    entry_type: str = Form("training"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import files into the knowledge base.

    Accepts PDF, DOCX, TXT, MD, and CSV files. Each file becomes one
    knowledge entry. Text is extracted and stored as the entry content.
    Embeddings are generated automatically for RAG retrieval.
    """
    allowed_types = {"account_data", "custom_script", "objection_handler", "training"}
    if entry_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"entry_type must be one of: {', '.join(allowed_types)}"
        )

    if len(files) > _MAX_BULK_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {_MAX_BULK_FILES} files per import."
        )

    results = []
    for upload in files:
        filename = upload.filename or "unnamed"
        try:
            content = await upload.read()

            if len(content) > _MAX_FILE_SIZE:
                results.append({
                    "filename": filename,
                    "status": "error",
                    "message": "File too large (max 5 MB).",
                })
                continue

            if len(content) == 0:
                results.append({
                    "filename": filename,
                    "status": "error",
                    "message": "File is empty.",
                })
                continue

            # Extract text
            text = _extract_text_from_file(filename, content)

            if not text.strip():
                results.append({
                    "filename": filename,
                    "status": "error",
                    "message": "No text could be extracted from this file.",
                })
                continue

            # Truncate very large content to 50K chars for DB storage
            if len(text) > 50_000:
                text = text[:50_000] + "\n\n[... content truncated at 50,000 characters]"

            # Create knowledge entry
            # Use filename (without extension) as the entry name
            name = filename.rsplit(".", 1)[0] if "." in filename else filename

            entry = KnowledgeEntry(
                user_id=user.id,
                name=name,
                entry_type=entry_type,
                content=text,
            )
            db.add(entry)
            await db.flush()  # Get the ID before embedding

            # Generate embedding
            try:
                await embed_knowledge_entry(entry.id, db)
            except Exception:
                logger.warning("Failed to embed bulk entry %s — will retry later.", entry.id)

            results.append({
                "filename": filename,
                "status": "created",
                "id": entry.id,
                "name": name,
                "chars": len(text),
            })

        except ValueError as ve:
            results.append({
                "filename": filename,
                "status": "error",
                "message": str(ve),
            })
        except Exception as exc:
            logger.error("Bulk import failed for %s: %s", filename, exc)
            results.append({
                "filename": filename,
                "status": "error",
                "message": f"Failed to process: {str(exc)[:100]}",
            })

    await db.commit()

    created_count = sum(1 for r in results if r["status"] == "created")
    error_count = sum(1 for r in results if r["status"] == "error")

    return {
        "status": "completed",
        "created": created_count,
        "errors": error_count,
        "results": results,
    }


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
            "persona_id": c.persona_id,
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
        "persona_id": conv.persona_id,
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

# ════════════════════════════════════════════════════════════════════════
# SCHEDULED CALLBACKS
# ════════════════════════════════════════════════════════════════════════


@voice_ai_router.get("/callbacks")
async def list_callbacks(
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all scheduled callbacks for the current user."""
    query = select(ScheduledCallback).where(
        ScheduledCallback.user_id == user.id
    )
    if status:
        query = query.where(ScheduledCallback.status == status)
    query = query.order_by(ScheduledCallback.scheduled_at.desc())

    result = await db.execute(query)
    callbacks = result.scalars().all()

    return [
        {
            "id": cb.id,
            "contact_name": cb.contact_name,
            "contact_phone": cb.contact_phone,
            "contact_email": cb.contact_email,
            "property_address": cb.property_address,
            "scheduled_at": cb.scheduled_at.isoformat() if cb.scheduled_at else None,
            "timezone": cb.timezone,
            "callback_type": cb.callback_type,
            "agent_id": cb.agent_id,
            "persona_id": cb.persona_id,
            "status": cb.status,
            "attempt_count": cb.attempt_count,
            "max_attempts": cb.max_attempts,
            "notes": cb.notes,
            "created_at": cb.created_at.isoformat() if cb.created_at else None,
        }
        for cb in callbacks
    ]


@voice_ai_router.post("/callbacks")
async def create_callback(
    body: CreateCallbackRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Schedule a new callback (manually or from the dashboard)."""
    scheduled_at = datetime.fromisoformat(body.scheduled_at)

    callback = await create_callback_from_conversation(
        user_id=user.id,
        contact_phone=body.contact_phone,
        scheduled_at=scheduled_at,
        db=db,
        contact_name=body.contact_name,
        contact_email=body.contact_email,
        property_address=body.property_address,
        notes=body.notes,
        agent_id=body.agent_id,
        phone_number_id=body.phone_number_id,
        callback_type=body.callback_type,
        timezone=body.timezone,
    )

    return {
        "id": callback.id,
        "status": callback.status,
        "scheduled_at": callback.scheduled_at.isoformat(),
        "message": "Callback scheduled successfully",
    }


@voice_ai_router.patch("/callbacks/{callback_id}")
async def update_callback(
    callback_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    status: Optional[str] = None,
    scheduled_at: Optional[str] = None,
    notes: Optional[str] = None,
):
    """Update a scheduled callback (reschedule, cancel, add notes)."""
    result = await db.execute(
        select(ScheduledCallback).where(
            and_(
                ScheduledCallback.id == callback_id,
                ScheduledCallback.user_id == user.id,
            )
        )
    )
    callback = result.scalar_one_or_none()
    if not callback:
        raise HTTPException(status_code=404, detail="Callback not found")

    if status:
        callback.status = status
    if scheduled_at:
        callback.scheduled_at = datetime.fromisoformat(scheduled_at)
    if notes:
        callback.notes = notes
    callback.updated_at = datetime.utcnow()

    await db.commit()
    return {"id": callback.id, "status": callback.status, "message": "Updated"}


@voice_ai_router.delete("/callbacks/{callback_id}")
async def cancel_callback(
    callback_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a scheduled callback."""
    result = await db.execute(
        select(ScheduledCallback).where(
            and_(
                ScheduledCallback.id == callback_id,
                ScheduledCallback.user_id == user.id,
            )
        )
    )
    callback = result.scalar_one_or_none()
    if not callback:
        raise HTTPException(status_code=404, detail="Callback not found")

    callback.status = "cancelled"
    callback.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "Callback cancelled"}


# ════════════════════════════════════════════════════════════════════════
# CALL CAMPAIGNS
# ════════════════════════════════════════════════════════════════════════


@voice_ai_router.get("/campaigns")
async def list_campaigns(
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all campaigns for the current user."""
    query = select(CallCampaign).where(CallCampaign.user_id == user.id)
    if status:
        query = query.where(CallCampaign.status == status)
    query = query.order_by(CallCampaign.created_at.desc())

    result = await db.execute(query)
    campaigns = result.scalars().all()

    return [
        {
            "id": c.id,
            "name": c.name,
            "agent_id": c.agent_id,
            "persona_id": c.persona_id,
            "phone_number_id": c.phone_number_id,
            "status": c.status,
            "total_contacts": c.total_contacts,
            "calls_made": c.calls_made,
            "calls_answered": c.calls_answered,
            "calls_no_answer": c.calls_no_answer,
            "calls_failed": c.calls_failed,
            "leads_qualified": c.leads_qualified,
            "appointments_set": c.appointments_set,
            "calling_window_start": c.calling_window_start,
            "calling_window_end": c.calling_window_end,
            "calling_days": c.calling_days,
            "seconds_between_calls": c.seconds_between_calls,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in campaigns
    ]


@voice_ai_router.post("/campaigns")
async def create_campaign(
    body: CreateCampaignRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new calling campaign (starts in draft status)."""
    campaign = CallCampaign(
        user_id=user.id,
        name=body.name,
        agent_id=body.agent_id,
        persona_id=body.agent_id,
        phone_number_id=body.phone_number_id,
        calling_window_start=body.calling_window_start,
        calling_window_end=body.calling_window_end,
        calling_days=body.calling_days,
        timezone=body.timezone,
        seconds_between_calls=body.seconds_between_calls,
        status="draft",
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)

    return {
        "id": campaign.id,
        "name": campaign.name,
        "status": campaign.status,
        "message": "Campaign created in draft status. Add contacts then start it.",
    }


@voice_ai_router.post("/campaigns/{campaign_id}/contacts")
async def add_campaign_contacts(
    campaign_id: str,
    body: AddCampaignContactsBulkRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add contacts to a campaign (bulk)."""
    # Verify ownership
    result = await db.execute(
        select(CallCampaign).where(
            and_(
                CallCampaign.id == campaign_id,
                CallCampaign.user_id == user.id,
            )
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.status not in ("draft", "paused"):
        raise HTTPException(
            status_code=400,
            detail="Can only add contacts to draft or paused campaigns",
        )

    added = 0
    for contact_data in body.contacts:
        contact = CampaignContact(
            campaign_id=campaign_id,
            contact_name=contact_data.contact_name,
            contact_phone=contact_data.contact_phone,
            contact_email=contact_data.contact_email,
            property_address=contact_data.property_address,
            context_notes=contact_data.context_notes,
            status="pending",
        )
        db.add(contact)
        added += 1

    campaign.total_contacts += added
    await db.commit()

    return {"message": f"Added {added} contacts to campaign", "total": campaign.total_contacts}


@voice_ai_router.get("/campaigns/{campaign_id}/contacts")
async def list_campaign_contacts(
    campaign_id: str,
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List contacts in a campaign with their call results."""
    # Verify ownership
    result = await db.execute(
        select(CallCampaign).where(
            and_(
                CallCampaign.id == campaign_id,
                CallCampaign.user_id == user.id,
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Campaign not found")

    query = select(CampaignContact).where(
        CampaignContact.campaign_id == campaign_id
    )
    if status:
        query = query.where(CampaignContact.status == status)

    result = await db.execute(query)
    contacts = result.scalars().all()

    return [
        {
            "id": c.id,
            "contact_name": c.contact_name,
            "contact_phone": c.contact_phone,
            "contact_email": c.contact_email,
            "property_address": c.property_address,
            "status": c.status,
            "attempt_count": c.attempt_count,
            "outcome": c.outcome,
            "deal_eagerness": c.deal_eagerness,
            "called_at": c.called_at.isoformat() if c.called_at else None,
        }
        for c in contacts
    ]


@voice_ai_router.post("/campaigns/{campaign_id}/start")
async def start_campaign_endpoint(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a campaign — begins making calls."""
    # Verify ownership
    result = await db.execute(
        select(CallCampaign).where(
            and_(
                CallCampaign.id == campaign_id,
                CallCampaign.user_id == user.id,
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Campaign not found")

    try:
        campaign = await start_campaign(campaign_id, db)
        return {
            "id": campaign.id,
            "status": campaign.status,
            "total_contacts": campaign.total_contacts,
            "message": "Campaign started! Calls will begin within the calling window.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@voice_ai_router.post("/campaigns/{campaign_id}/pause")
async def pause_campaign_endpoint(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Pause a running campaign."""
    result = await db.execute(
        select(CallCampaign).where(
            and_(
                CallCampaign.id == campaign_id,
                CallCampaign.user_id == user.id,
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Campaign not found")

    try:
        campaign = await pause_campaign(campaign_id, db)
        return {"id": campaign.id, "status": "paused", "message": "Campaign paused"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@voice_ai_router.get("/campaigns/{campaign_id}/stats")
async def campaign_stats_endpoint(
    campaign_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get detailed campaign stats."""
    # Verify ownership
    result = await db.execute(
        select(CallCampaign).where(
            and_(
                CallCampaign.id == campaign_id,
                CallCampaign.user_id == user.id,
            )
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Campaign not found")

    stats = await get_campaign_stats(campaign_id, db)
    return stats
