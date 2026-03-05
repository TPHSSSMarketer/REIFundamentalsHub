"""Flow Builder API Routes — CRUD for Conversation Flows, Nodes, Edges, and Personas.

Register in main.py:
    from rei.api.flow_builder_routes import flow_builder_router
    app.include_router(flow_builder_router, prefix="/api")

These endpoints let the frontend:
- Create/edit/delete conversation flows (the master workflow)
- Add/edit/delete nodes within a flow (objectives, statements, switches, etc.)
- Connect nodes with edges (which node leads to which)
- Manage personas (AI personality profiles)
- Clone template flows to get started quickly
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

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.conversation_flow import (
    ConversationFlow,
    FlowEdge,
    FlowExecution,
    FlowNode,
    Persona,
)
from rei.models.user import User

logger = logging.getLogger(__name__)
flow_builder_router = APIRouter(prefix="/flow-builder", tags=["flow-builder"])


# ── Schemas ─────────────────────────────────────────────────────


class CreateFlowRequest(BaseModel):
    name: str
    description: Optional[str] = None
    channel: str = "all"
    persona_id: Optional[str] = None
    tag_filters: Optional[str] = None  # JSON list


class UpdateFlowRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    channel: Optional[str] = None
    persona_id: Optional[str] = None
    start_node_id: Optional[str] = None
    is_active: Optional[bool] = None
    tag_filters: Optional[str] = None
    canvas_data: Optional[str] = None  # JSON for visual builder positions


class CreateNodeRequest(BaseModel):
    node_type: str
    label: str = ""
    # Objective fields
    short_description: Optional[str] = None
    output_variable: Optional[str] = None
    extra_prompt: Optional[str] = None
    sensitivity: int = 50
    max_attempts: int = 3
    skip_if_known: bool = True
    # Statement fields
    message_text: Optional[str] = None
    ai_generate: bool = False
    # Switch fields
    switch_variable: Optional[str] = None
    switch_mode: str = "variable"
    switch_options: Optional[str] = None  # JSON
    # True/False fields
    condition_expression: Optional[str] = None
    # Webhook fields
    webhook_url: Optional[str] = None
    webhook_method: str = "POST"
    webhook_headers: Optional[str] = None
    webhook_body_template: Optional[str] = None
    webhook_response_variable: Optional[str] = None
    webhook_wait_for_response: bool = True
    # Delay fields
    delay_seconds: int = 0
    # Transfer fields
    transfer_to: Optional[str] = None
    # Visual builder position
    position_x: float = 0.0
    position_y: float = 0.0
    sort_order: int = 0


class UpdateNodeRequest(BaseModel):
    label: Optional[str] = None
    short_description: Optional[str] = None
    output_variable: Optional[str] = None
    extra_prompt: Optional[str] = None
    sensitivity: Optional[int] = None
    max_attempts: Optional[int] = None
    skip_if_known: Optional[bool] = None
    message_text: Optional[str] = None
    ai_generate: Optional[bool] = None
    switch_variable: Optional[str] = None
    switch_mode: Optional[str] = None
    switch_options: Optional[str] = None
    condition_expression: Optional[str] = None
    webhook_url: Optional[str] = None
    webhook_method: Optional[str] = None
    webhook_headers: Optional[str] = None
    webhook_body_template: Optional[str] = None
    webhook_response_variable: Optional[str] = None
    webhook_wait_for_response: Optional[bool] = None
    delay_seconds: Optional[int] = None
    transfer_to: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    sort_order: Optional[int] = None


class CreateEdgeRequest(BaseModel):
    from_node_id: str
    to_node_id: str
    label: str = "default"
    sort_order: int = 0


class CreatePersonaRequest(BaseModel):
    name: str
    description: Optional[str] = None
    personality_prompt: str = ""
    tone: str = "professional"
    response_length: str = "medium"
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    min_response_delay_seconds: int = 0
    max_response_delay_seconds: int = 0
    quirks: Optional[str] = None  # JSON
    elevenlabs_voice_id: Optional[str] = None
    elevenlabs_agent_id: Optional[str] = None
    role: Optional[str] = None


class UpdatePersonaRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    personality_prompt: Optional[str] = None
    tone: Optional[str] = None
    response_length: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    min_response_delay_seconds: Optional[int] = None
    max_response_delay_seconds: Optional[int] = None
    quirks: Optional[str] = None
    is_active: Optional[bool] = None
    elevenlabs_voice_id: Optional[str] = None
    elevenlabs_agent_id: Optional[str] = None
    role: Optional[str] = None


# ════════════════════════════════════════════════════════════════
# FLOW ENDPOINTS
# ════════════════════════════════════════════════════════════════


@flow_builder_router.get("/flows")
async def list_flows(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all conversation flows for the current user."""
    result = await db.execute(
        select(ConversationFlow).where(
            ConversationFlow.user_id == workspace_user_id(user)
        ).order_by(ConversationFlow.updated_at.desc())
    )
    flows = result.scalars().all()

    return [
        {
            "id": f.id,
            "name": f.name,
            "description": f.description,
            "channel": f.channel,
            "persona_id": f.persona_id,
            "start_node_id": f.start_node_id,
            "is_active": f.is_active,
            "is_template": f.is_template,
            "tag_filters": json.loads(f.tag_filters) if f.tag_filters else [],
            "total_executions": f.total_executions,
            "total_completions": f.total_completions,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "updated_at": f.updated_at.isoformat() if f.updated_at else None,
        }
        for f in flows
    ]


@flow_builder_router.post("/flows")
async def create_flow(
    body: CreateFlowRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new conversation flow."""
    flow = ConversationFlow(
        user_id=workspace_user_id(user),
        name=body.name,
        description=body.description,
        channel=body.channel,
        persona_id=body.persona_id,
        tag_filters=body.tag_filters,
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)

    return {"id": flow.id, "name": flow.name, "status": "created"}


@flow_builder_router.get("/flows/{flow_id}")
async def get_flow(
    flow_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a flow with all its nodes and edges (for the visual builder)."""
    result = await db.execute(
        select(ConversationFlow).where(
            and_(
                ConversationFlow.id == flow_id,
                ConversationFlow.user_id == workspace_user_id(user),
            )
        )
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    # Load nodes
    result = await db.execute(
        select(FlowNode).where(FlowNode.flow_id == flow_id)
        .order_by(FlowNode.sort_order)
    )
    nodes = result.scalars().all()

    # Load edges
    result = await db.execute(
        select(FlowEdge).where(FlowEdge.flow_id == flow_id)
    )
    edges = result.scalars().all()

    return {
        "id": flow.id,
        "name": flow.name,
        "description": flow.description,
        "channel": flow.channel,
        "persona_id": flow.persona_id,
        "start_node_id": flow.start_node_id,
        "is_active": flow.is_active,
        "tag_filters": json.loads(flow.tag_filters) if flow.tag_filters else [],
        "canvas_data": json.loads(flow.canvas_data) if flow.canvas_data else {},
        "total_executions": flow.total_executions,
        "total_completions": flow.total_completions,
        "nodes": [
            {
                "id": n.id,
                "node_type": n.node_type,
                "label": n.label,
                "short_description": n.short_description,
                "output_variable": n.output_variable,
                "extra_prompt": n.extra_prompt,
                "sensitivity": n.sensitivity,
                "max_attempts": n.max_attempts,
                "skip_if_known": n.skip_if_known,
                "message_text": n.message_text,
                "ai_generate": n.ai_generate,
                "switch_variable": n.switch_variable,
                "switch_mode": n.switch_mode,
                "switch_options": json.loads(n.switch_options) if n.switch_options else [],
                "condition_expression": n.condition_expression,
                "webhook_url": n.webhook_url,
                "webhook_method": n.webhook_method,
                "delay_seconds": n.delay_seconds,
                "transfer_to": n.transfer_to,
                "position_x": n.position_x,
                "position_y": n.position_y,
                "sort_order": n.sort_order,
            }
            for n in nodes
        ],
        "edges": [
            {
                "id": e.id,
                "from_node_id": e.from_node_id,
                "to_node_id": e.to_node_id,
                "label": e.label,
                "sort_order": e.sort_order,
            }
            for e in edges
        ],
    }


@flow_builder_router.patch("/flows/{flow_id}")
async def update_flow(
    flow_id: str,
    body: UpdateFlowRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a conversation flow."""
    result = await db.execute(
        select(ConversationFlow).where(
            and_(ConversationFlow.id == flow_id, ConversationFlow.user_id == workspace_user_id(user))
        )
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    if body.name is not None:
        flow.name = body.name
    if body.description is not None:
        flow.description = body.description
    if body.channel is not None:
        flow.channel = body.channel
    if body.persona_id is not None:
        flow.persona_id = body.persona_id
    if body.start_node_id is not None:
        flow.start_node_id = body.start_node_id
    if body.is_active is not None:
        flow.is_active = body.is_active
    if body.tag_filters is not None:
        flow.tag_filters = body.tag_filters
    if body.canvas_data is not None:
        flow.canvas_data = body.canvas_data

    flow.updated_at = datetime.utcnow()
    await db.commit()

    return {"id": flow.id, "status": "updated"}


@flow_builder_router.delete("/flows/{flow_id}")
async def delete_flow(
    flow_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation flow and all its nodes/edges."""
    result = await db.execute(
        select(ConversationFlow).where(
            and_(ConversationFlow.id == flow_id, ConversationFlow.user_id == workspace_user_id(user))
        )
    )
    flow = result.scalar_one_or_none()
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")

    await db.delete(flow)
    await db.commit()

    return {"status": "deleted", "id": flow_id}


# ════════════════════════════════════════════════════════════════
# NODE ENDPOINTS
# ════════════════════════════════════════════════════════════════


@flow_builder_router.post("/flows/{flow_id}/nodes")
async def create_node(
    flow_id: str,
    body: CreateNodeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a new node to a flow."""
    # Verify flow ownership
    result = await db.execute(
        select(ConversationFlow).where(
            and_(ConversationFlow.id == flow_id, ConversationFlow.user_id == workspace_user_id(user))
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Flow not found")

    valid_types = [
        "objective", "statement", "conversation", "switch",
        "true_false", "webhook", "delay", "stop", "transfer",
    ]
    if body.node_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid node_type. Must be one of: {valid_types}",
        )

    node = FlowNode(
        flow_id=flow_id,
        node_type=body.node_type,
        label=body.label,
        short_description=body.short_description,
        output_variable=body.output_variable,
        extra_prompt=body.extra_prompt,
        sensitivity=body.sensitivity,
        max_attempts=body.max_attempts,
        skip_if_known=body.skip_if_known,
        message_text=body.message_text,
        ai_generate=body.ai_generate,
        switch_variable=body.switch_variable,
        switch_mode=body.switch_mode,
        switch_options=body.switch_options,
        condition_expression=body.condition_expression,
        webhook_url=body.webhook_url,
        webhook_method=body.webhook_method,
        webhook_headers=body.webhook_headers,
        webhook_body_template=body.webhook_body_template,
        webhook_response_variable=body.webhook_response_variable,
        webhook_wait_for_response=body.webhook_wait_for_response,
        delay_seconds=body.delay_seconds,
        transfer_to=body.transfer_to,
        position_x=body.position_x,
        position_y=body.position_y,
        sort_order=body.sort_order,
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)

    return {"id": node.id, "node_type": node.node_type, "status": "created"}


@flow_builder_router.patch("/flows/{flow_id}/nodes/{node_id}")
async def update_node(
    flow_id: str,
    node_id: str,
    body: UpdateNodeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a node in a flow."""
    # Verify flow ownership
    result = await db.execute(
        select(ConversationFlow).where(
            and_(ConversationFlow.id == flow_id, ConversationFlow.user_id == workspace_user_id(user))
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Flow not found")

    result = await db.execute(
        select(FlowNode).where(
            and_(FlowNode.id == node_id, FlowNode.flow_id == flow_id)
        )
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Update all provided fields
    update_fields = body.model_dump(exclude_none=True)
    for field, value in update_fields.items():
        setattr(node, field, value)

    node.updated_at = datetime.utcnow()
    await db.commit()

    return {"id": node.id, "status": "updated"}


@flow_builder_router.delete("/flows/{flow_id}/nodes/{node_id}")
async def delete_node(
    flow_id: str,
    node_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a node from a flow (also removes connected edges)."""
    result = await db.execute(
        select(ConversationFlow).where(
            and_(ConversationFlow.id == flow_id, ConversationFlow.user_id == workspace_user_id(user))
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Flow not found")

    result = await db.execute(
        select(FlowNode).where(
            and_(FlowNode.id == node_id, FlowNode.flow_id == flow_id)
        )
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    # Delete connected edges
    result = await db.execute(
        select(FlowEdge).where(
            and_(
                FlowEdge.flow_id == flow_id,
                (FlowEdge.from_node_id == node_id) | (FlowEdge.to_node_id == node_id),
            )
        )
    )
    edges = result.scalars().all()
    for edge in edges:
        await db.delete(edge)

    await db.delete(node)
    await db.commit()

    return {"status": "deleted", "id": node_id}


# ════════════════════════════════════════════════════════════════
# EDGE ENDPOINTS
# ════════════════════════════════════════════════════════════════


@flow_builder_router.post("/flows/{flow_id}/edges")
async def create_edge(
    flow_id: str,
    body: CreateEdgeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Connect two nodes with an edge."""
    result = await db.execute(
        select(ConversationFlow).where(
            and_(ConversationFlow.id == flow_id, ConversationFlow.user_id == workspace_user_id(user))
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Flow not found")

    edge = FlowEdge(
        flow_id=flow_id,
        from_node_id=body.from_node_id,
        to_node_id=body.to_node_id,
        label=body.label,
        sort_order=body.sort_order,
    )
    db.add(edge)
    await db.commit()
    await db.refresh(edge)

    return {"id": edge.id, "status": "created"}


@flow_builder_router.delete("/flows/{flow_id}/edges/{edge_id}")
async def delete_edge(
    flow_id: str,
    edge_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove an edge between two nodes."""
    result = await db.execute(
        select(FlowEdge).where(
            and_(FlowEdge.id == edge_id, FlowEdge.flow_id == flow_id)
        )
    )
    edge = result.scalar_one_or_none()
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")

    await db.delete(edge)
    await db.commit()

    return {"status": "deleted", "id": edge_id}


# ════════════════════════════════════════════════════════════════
# PERSONA ENDPOINTS
# ════════════════════════════════════════════════════════════════


@flow_builder_router.get("/personas")
async def list_personas(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all personas: system (platform-level) + user-owned."""
    from sqlalchemy import or_

    result = await db.execute(
        select(Persona).where(
            or_(
                Persona.user_id == workspace_user_id(user),
                and_(Persona.user_id.is_(None), Persona.is_system.is_(True)),
            )
        ).order_by(Persona.is_system.desc(), Persona.created_at.desc())
    )
    personas = result.scalars().all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "tone": p.tone,
            "response_length": p.response_length,
            "personality_prompt": p.personality_prompt,
            "ai_provider": p.ai_provider,
            "ai_model": p.ai_model,
            "elevenlabs_voice_id": p.elevenlabs_voice_id,
            "elevenlabs_agent_id": p.elevenlabs_agent_id,
            "role": p.role,
            "is_active": p.is_active,
            "is_system": p.is_system,
            "cloned_from": p.cloned_from,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in personas
    ]


@flow_builder_router.post("/personas")
async def create_persona(
    body: CreatePersonaRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new persona."""
    persona = Persona(
        user_id=workspace_user_id(user),
        name=body.name,
        description=body.description,
        personality_prompt=body.personality_prompt,
        tone=body.tone,
        response_length=body.response_length,
        ai_provider=body.ai_provider,
        ai_model=body.ai_model,
        min_response_delay_seconds=body.min_response_delay_seconds,
        max_response_delay_seconds=body.max_response_delay_seconds,
        quirks=body.quirks,
        elevenlabs_voice_id=body.elevenlabs_voice_id,
        elevenlabs_agent_id=body.elevenlabs_agent_id,
        role=body.role,
    )
    db.add(persona)
    await db.commit()
    await db.refresh(persona)

    return {"id": persona.id, "name": persona.name, "status": "created"}


@flow_builder_router.patch("/personas/{persona_id}")
async def update_persona(
    persona_id: str,
    body: UpdatePersonaRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a persona. System personas cannot be edited."""
    result = await db.execute(
        select(Persona).where(
            and_(Persona.id == persona_id, Persona.user_id == workspace_user_id(user))
        )
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if persona.is_system:
        raise HTTPException(
            status_code=403,
            detail="System personas cannot be edited. Clone it first to make your own version.",
        )

    update_fields = body.model_dump(exclude_none=True)
    for field, value in update_fields.items():
        setattr(persona, field, value)

    persona.updated_at = datetime.utcnow()
    await db.commit()

    return {"id": persona.id, "status": "updated"}


@flow_builder_router.delete("/personas/{persona_id}")
async def delete_persona(
    persona_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a persona. System personas cannot be deleted."""
    result = await db.execute(
        select(Persona).where(
            and_(Persona.id == persona_id, Persona.user_id == workspace_user_id(user))
        )
    )
    persona = result.scalar_one_or_none()
    if not persona:
        raise HTTPException(status_code=404, detail="Persona not found")
    if persona.is_system:
        raise HTTPException(
            status_code=403,
            detail="System personas cannot be deleted.",
        )

    await db.delete(persona)
    await db.commit()

    return {"status": "deleted", "id": persona_id}


@flow_builder_router.post("/personas/{persona_id}/clone")
async def clone_persona(
    persona_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clone a persona (system or user-owned) into a new user-owned copy."""
    from sqlalchemy import or_

    # Allow cloning system personas (user_id=NULL) or own personas
    result = await db.execute(
        select(Persona).where(
            and_(
                Persona.id == persona_id,
                or_(
                    Persona.user_id == workspace_user_id(user),
                    Persona.user_id.is_(None),
                ),
            )
        )
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Persona not found")

    clone = Persona(
        user_id=workspace_user_id(user),
        name=f"{source.name} (Copy)",
        description=source.description,
        personality_prompt=source.personality_prompt,
        tone=source.tone,
        response_length=source.response_length,
        ai_provider=source.ai_provider,
        ai_model=source.ai_model,
        min_response_delay_seconds=source.min_response_delay_seconds,
        max_response_delay_seconds=source.max_response_delay_seconds,
        quirks=source.quirks,
        elevenlabs_voice_id=source.elevenlabs_voice_id,
        elevenlabs_agent_id=None,  # Don't clone ElevenLabs provisioning — user must re-provision
        role=source.role,
        is_system=False,
        cloned_from=source.id,
    )
    db.add(clone)
    await db.commit()
    await db.refresh(clone)

    return {"id": clone.id, "name": clone.name, "status": "cloned"}


# ════════════════════════════════════════════════════════════════
# EXECUTION HISTORY ENDPOINTS
# ════════════════════════════════════════════════════════════════


@flow_builder_router.get("/executions")
async def list_executions(
    flow_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List flow execution history (conversations that ran through flows)."""
    query = select(FlowExecution).where(FlowExecution.user_id == workspace_user_id(user))

    if flow_id:
        query = query.where(FlowExecution.flow_id == flow_id)
    if status:
        query = query.where(FlowExecution.status == status)

    query = query.order_by(FlowExecution.started_at.desc())
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    executions = result.scalars().all()

    return [
        {
            "id": e.id,
            "flow_id": e.flow_id,
            "channel": e.channel,
            "contact_name": e.contact_name,
            "contact_phone": e.contact_phone,
            "status": e.status,
            "outcome": e.outcome,
            "variables": json.loads(e.variables) if e.variables else {},
            "message_count": len(json.loads(e.messages)) if e.messages else 0,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "completed_at": e.completed_at.isoformat() if e.completed_at else None,
        }
        for e in executions
    ]


@flow_builder_router.get("/executions/{execution_id}")
async def get_execution(
    execution_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full details of a flow execution (including all messages and variables)."""
    result = await db.execute(
        select(FlowExecution).where(
            and_(
                FlowExecution.id == execution_id,
                FlowExecution.user_id == workspace_user_id(user),
            )
        )
    )
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")

    return {
        "id": execution.id,
        "flow_id": execution.flow_id,
        "channel": execution.channel,
        "contact_name": execution.contact_name,
        "contact_phone": execution.contact_phone,
        "contact_email": execution.contact_email,
        "status": execution.status,
        "outcome": execution.outcome,
        "current_node_id": execution.current_node_id,
        "variables": json.loads(execution.variables) if execution.variables else {},
        "messages": json.loads(execution.messages) if execution.messages else [],
        "started_at": execution.started_at.isoformat() if execution.started_at else None,
        "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
    }
