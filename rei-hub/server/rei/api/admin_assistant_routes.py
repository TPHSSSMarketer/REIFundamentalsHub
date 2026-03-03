"""AI Admin Assistant API Routes — Chat, actions, trust, skills, and scheduled tasks.

Provides a complete REST + WebSocket API for the autonomous AI Admin Assistant.

Register in main.py:
    from rei.api.admin_assistant_routes import admin_assistant_router
    app.include_router(admin_assistant_router, prefix="/api")

Endpoints organized by feature:
- Chat sessions & messages (REST)
- WebSocket endpoint for real-time chat
- Action log & approval workflow
- Trust settings management
- Skill library (system + user-created)
- Scheduled task management
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.auth import decode_token
from rei.api.deps import get_current_user, get_db
from rei.models.user import User
from rei.models.admin_assistant import (
    AdminSession,
    AdminMessage,
    AdminActionLog,
    AdminTrustSetting,
    AdminSkill,
    AdminScheduledTask,
)
from rei.config import Settings
from rei.services.admin_orchestrator_service import (
    process_message,
    create_session,
    list_sessions,
    get_session_messages,
)
from rei.services.admin_trust_service import (
    get_all_trust_settings,
    update_trust_level,
    set_all_automatic,
    reset_to_defaults,
)
from rei.services.admin_tools_service import (
    execute_approved_action,
    reject_action,
)
from rei.services.admin_skill_service import (
    get_skill_library,
    create_skill,
    update_skill,
    delete_skill,
    execute_skill,
)
from rei.services.admin_task_scheduler import (
    list_scheduled_tasks,
    create_scheduled_task,
    update_scheduled_task,
    delete_scheduled_task,
    run_task_now,
)

logger = logging.getLogger(__name__)
admin_assistant_router = APIRouter(prefix="/assistant", tags=["assistant"])

# Get settings singleton
from rei.config import get_settings
settings = get_settings()


# ────────────────────────────────────────────────────────────────────────────
# PYDANTIC SCHEMAS
# ────────────────────────────────────────────────────────────────────────────


class CreateSessionRequest(BaseModel):
    title: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str


class ApproveActionRequest(BaseModel):
    message: Optional[str] = None


class RejectActionRequest(BaseModel):
    reason: Optional[str] = None


class UpdateTrustRequest(BaseModel):
    action_type: str
    trust_level: str  # "auto", "ask", "never"


class SetAllAutomaticRequest(BaseModel):
    enabled: bool


class CreateSkillRequest(BaseModel):
    name: str
    description: str
    category: str = "general"
    action_steps: list = []
    icon: Optional[str] = None


class UpdateSkillRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    action_steps: Optional[list] = None
    icon: Optional[str] = None
    enabled: Optional[bool] = None


class CreateTaskRequest(BaseModel):
    skill_id: str
    name: str
    cron_expression: str
    timezone: Optional[str] = "America/New_York"
    description: Optional[str] = None


class UpdateTaskRequest(BaseModel):
    name: Optional[str] = None
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    enabled: Optional[bool] = None
    description: Optional[str] = None


# ════════════════════════════════════════════════════════════════════════════
# CHAT SESSIONS & MESSAGES
# ════════════════════════════════════════════════════════════════════════════


@admin_assistant_router.post("/sessions")
async def create_session_endpoint(
    body: CreateSessionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new chat session."""
    session = await create_session(user.id, body.title or "New Conversation", db)
    return {
        "id": session.id,
        "title": session.title,
        "created_at": session.created_at.isoformat() if session.created_at else None,
    }


@admin_assistant_router.get("/sessions")
async def list_sessions_endpoint(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all chat sessions for current user."""
    sessions = await list_sessions(user.id, db)
    return [
        {
            "id": s.id,
            "title": s.title,
            "message_count": s.message_count,
            "is_active": s.is_active,
            "last_message_at": s.last_message_at.isoformat() if s.last_message_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in sessions
    ]


@admin_assistant_router.get("/sessions/{session_id}/messages")
async def get_messages(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all messages in a session."""
    # Verify ownership
    result = await db.execute(
        select(AdminSession).where(
            and_(AdminSession.id == session_id, AdminSession.user_id == user.id)
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Session not found")

    messages = await get_session_messages(session_id, db)
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "tool_calls": json.loads(m.tool_calls) if m.tool_calls else None,
            "model_used": m.model_used,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]


@admin_assistant_router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: str,
    body: SendMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message and get assistant response."""
    # Verify session ownership
    result = await db.execute(
        select(AdminSession).where(
            and_(AdminSession.id == session_id, AdminSession.user_id == user.id)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Process message through orchestrator
    response = await process_message(
        user_id=user.id,
        session_id=session_id,
        content=body.content,
        db=db,
        settings=settings,
    )

    return {
        "response": response.get("response", ""),
        "actions_proposed": response.get("actions_proposed", []),
        "pending_approvals": response.get("pending_approvals", 0),
    }


# ════════════════════════════════════════════════════════════════════════════
# WEBSOCKET ENDPOINT
# ════════════════════════════════════════════════════════════════════════════


@admin_assistant_router.websocket("/ws/assistant/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time chat.

    Authentication: Check for access_token in cookie or query param.
    """
    # Extract token from query param or headers
    token = None

    # Try query param first
    token = websocket.query_params.get("token")

    # Try Authorization header
    if not token:
        auth_header = websocket.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # Decode and validate token
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=4001, reason="Invalid token")
            return
    except Exception as e:
        logger.error(f"WebSocket auth failed: {e}")
        await websocket.close(code=4001, reason="Auth failed")
        return

    # Verify session ownership with database
    from rei.database import async_session_factory

    async with async_session_factory() as db:
        result = await db.execute(
            select(AdminSession).where(
                and_(AdminSession.id == session_id, AdminSession.user_id == int(user_id))
            )
        )
        if not result.scalar_one_or_none():
            await websocket.close(code=4003, reason="Session not found")
            return

        await websocket.accept()

        try:
            while True:
                # Receive message from client
                data = await websocket.receive_json()
                content = data.get("content", "").strip()

                if not content:
                    await websocket.send_json(
                        {"error": "Empty message"}
                    )
                    continue

                # Process through orchestrator
                response = await process_message(
                    user_id=int(user_id),
                    session_id=session_id,
                    content=content,
                    db=db,
                    settings=settings,
                )

                # Send response back
                await websocket.send_json(
                    {
                        "response": response.get("response", ""),
                        "actions_proposed": response.get("actions_proposed", []),
                        "pending_approvals": response.get("pending_approvals", 0),
                    }
                )

        except WebSocketDisconnect:
            logger.info(f"WebSocket disconnected: session={session_id}, user={user_id}")
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
            await websocket.close(code=4000, reason=str(e))


# ════════════════════════════════════════════════════════════════════════════
# ACTIONS & APPROVALS
# ════════════════════════════════════════════════════════════════════════════


@admin_assistant_router.get("/actions")
async def list_actions(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List action log with optional status filter."""
    query = select(AdminActionLog).where(AdminActionLog.user_id == user.id)

    if status:
        query = query.where(AdminActionLog.execution_status == status)

    query = query.order_by(desc(AdminActionLog.created_at))
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    actions = result.scalars().all()

    return [
        {
            "id": a.id,
            "action_type": a.action_type,
            "action_name": a.action_name,
            "risk_level": a.risk_level,
            "proposed_details": json.loads(a.proposed_details) if a.proposed_details else None,
            "approved": a.approved,
            "approval_method": a.approval_method,
            "execution_status": a.execution_status,
            "result_data": json.loads(a.result_data) if a.result_data else None,
            "error_message": a.error_message,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "executed_at": a.executed_at.isoformat() if a.executed_at else None,
        }
        for a in actions
    ]


@admin_assistant_router.post("/actions/{action_id}/approve")
async def approve_action(
    action_id: str,
    body: ApproveActionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending action."""
    result = await db.execute(
        select(AdminActionLog).where(
            and_(AdminActionLog.id == action_id, AdminActionLog.user_id == user.id)
        )
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    # Execute the approved action
    exec_result = await execute_approved_action(
        action=action,
        message=body.message,
        db=db,
        settings=settings,
    )

    return {"status": "executed", "result": exec_result}


@admin_assistant_router.post("/actions/{action_id}/reject")
async def reject_action_endpoint(
    action_id: str,
    body: RejectActionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending action."""
    result = await db.execute(
        select(AdminActionLog).where(
            and_(AdminActionLog.id == action_id, AdminActionLog.user_id == user.id)
        )
    )
    action = result.scalar_one_or_none()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found")

    await reject_action(action, body.reason or "", db)

    return {"status": "rejected", "action_id": action_id}


# ════════════════════════════════════════════════════════════════════════════
# TRUST SETTINGS
# ════════════════════════════════════════════════════════════════════════════


@admin_assistant_router.get("/trust")
async def get_trust_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all trust settings for current user."""
    settings_list = await get_all_trust_settings(user.id, db)
    return [
        {
            "action_type": s.action_type,
            "risk_level": s.risk_level,
            "trust_level": s.trust_level,
            "approval_count": s.approval_count,
            "rejection_count": s.rejection_count,
            "last_approved_at": s.last_approved_at.isoformat() if s.last_approved_at else None,
        }
        for s in settings_list
    ]


@admin_assistant_router.put("/trust")
async def update_trust_setting(
    body: UpdateTrustRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update trust level for a specific action type."""
    if body.trust_level not in ("auto", "ask", "never"):
        raise HTTPException(
            status_code=400,
            detail="trust_level must be 'auto', 'ask', or 'never'",
        )

    setting = await update_trust_level(
        user_id=user.id,
        action_type=body.action_type,
        trust_level=body.trust_level,
        db=db,
    )

    return {
        "action_type": setting.action_type,
        "trust_level": setting.trust_level,
        "updated_at": setting.updated_at.isoformat() if setting.updated_at else None,
    }


@admin_assistant_router.post("/trust/auto-all")
async def set_all_automatic_endpoint(
    body: SetAllAutomaticRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set all trust settings to automatic (enabled=True) or ask (enabled=False)."""
    trust_level = "auto" if body.enabled else "ask"
    result = await set_all_automatic(user.id, trust_level, db)

    return {
        "status": "updated",
        "count": result,
        "trust_level": trust_level,
    }


@admin_assistant_router.post("/trust/reset")
async def reset_trust_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reset all trust settings to defaults."""
    result = await reset_to_defaults(user.id, db)

    return {"status": "reset", "count": result}


# ════════════════════════════════════════════════════════════════════════════
# SKILLS
# ════════════════════════════════════════════════════════════════════════════


@admin_assistant_router.get("/skills")
async def list_skills(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List skill library (system + user-created skills)."""
    skills = await get_skill_library(user.id, db)

    return [
        {
            "id": s.id,
            "name": s.name,
            "description": s.description,
            "category": s.category,
            "is_system": s.is_system,
            "action_steps": json.loads(s.action_steps) if s.action_steps else [],
            "icon": s.icon,
            "enabled": s.enabled,
            "total_runs": s.total_runs,
            "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
        }
        for s in skills
    ]


@admin_assistant_router.post("/skills")
async def create_skill_endpoint(
    body: CreateSkillRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new custom skill."""
    skill = await create_skill(
        user_id=user.id,
        name=body.name,
        description=body.description,
        category=body.category,
        action_steps=body.action_steps,
        icon=body.icon,
        db=db,
    )

    return {
        "id": skill.id,
        "name": skill.name,
        "status": "created",
    }


@admin_assistant_router.put("/skills/{skill_id}")
async def update_skill_endpoint(
    skill_id: str,
    body: UpdateSkillRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a skill."""
    # Verify ownership
    result = await db.execute(
        select(AdminSkill).where(
            and_(AdminSkill.id == skill_id, AdminSkill.user_id == user.id)
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Skill not found")

    updates = body.model_dump(exclude_none=True)
    skill = await update_skill(skill_id, updates, db)

    return {
        "id": skill.id,
        "name": skill.name,
        "status": "updated",
    }


@admin_assistant_router.delete("/skills/{skill_id}")
async def delete_skill_endpoint(
    skill_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a custom skill."""
    result = await db.execute(
        select(AdminSkill).where(
            and_(AdminSkill.id == skill_id, AdminSkill.user_id == user.id)
        )
    )
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    if skill.is_system:
        raise HTTPException(
            status_code=403,
            detail="System skills cannot be deleted",
        )

    await delete_skill(skill_id, db)

    return {"status": "deleted", "id": skill_id}


@admin_assistant_router.post("/skills/{skill_id}/run")
async def run_skill(
    skill_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute a skill immediately."""
    result = await db.execute(
        select(AdminSkill).where(AdminSkill.id == skill_id)
    )
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # Verify user can access this skill (system or owned by user)
    if skill.user_id and skill.user_id != user.id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    exec_result = await execute_skill(
        skill_id=skill_id,
        user_id=user.id,
        db=db,
        settings=settings,
    )

    return {
        "skill_id": skill_id,
        "status": "executed",
        "result": exec_result,
    }


# ════════════════════════════════════════════════════════════════════════════
# SCHEDULED TASKS
# ════════════════════════════════════════════════════════════════════════════


@admin_assistant_router.get("/tasks")
async def list_tasks(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all scheduled tasks for current user."""
    tasks = await list_scheduled_tasks(user.id, db)
    return tasks


@admin_assistant_router.post("/tasks")
async def create_task(
    body: CreateTaskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new scheduled task."""
    task = await create_scheduled_task(
        user_id=user.id,
        skill_id=body.skill_id,
        name=body.name,
        cron_expression=body.cron_expression,
        timezone=body.timezone or "America/New_York",
        description=body.description,
        db=db,
    )

    return {
        "id": task.id,
        "name": task.name,
        "cron_expression": task.cron_expression,
        "next_run_at": task.next_run_at.isoformat() if task.next_run_at else None,
        "status": "created",
    }


@admin_assistant_router.put("/tasks/{task_id}")
async def update_task(
    task_id: str,
    body: UpdateTaskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a scheduled task."""
    updates = body.model_dump(exclude_none=True)
    task = await update_scheduled_task(task_id, user.id, updates, db)

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "id": task.id,
        "name": task.name,
        "next_run_at": task.next_run_at.isoformat() if task.next_run_at else None,
        "status": "updated",
    }


@admin_assistant_router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a scheduled task."""
    deleted = await delete_scheduled_task(task_id, user.id, db)

    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found")

    return {"status": "deleted", "id": task_id}


@admin_assistant_router.post("/tasks/{task_id}/run")
async def run_task_now_endpoint(
    task_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute a scheduled task immediately."""
    result = await run_task_now(task_id, user.id, db, settings)

    if result.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Task not found")

    return result
