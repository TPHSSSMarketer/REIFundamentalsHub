"""Negotiation messages API routes — chat thread for cases."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.negotiation import NegotiationCase, NegotiationMessage
from rei.models.user import User

logger = logging.getLogger(__name__)

negotiation_messages_router = APIRouter(prefix="/api/negotiations", tags=["negotiations"])


# ── Pydantic schemas ──────────────────────────────────────────────────


class SendMessageBody(BaseModel):
    content: str


# ── Helper functions ─────────────────────────────────────────────────


def _message_to_dict(m: NegotiationMessage) -> dict:
    """Convert NegotiationMessage to camelCase dict.

    Returns: id, caseId, senderId, senderRole, content, readAt, createdAt
    All datetime fields as isoformat strings.
    """
    return {
        "id": m.id,
        "caseId": m.case_id,
        "senderId": m.sender_id,
        "senderRole": m.sender_role,
        "content": m.content,
        "readAt": m.read_at.isoformat() if m.read_at else None,
        "createdAt": m.created_at.isoformat() if m.created_at else None,
    }


# ── Endpoints ─────────────────────────────────────────────────────────


@negotiation_messages_router.get("/cases/{case_id}/messages")
async def get_messages(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get chat messages for a negotiation case.

    Verify user owns the case OR is superadmin.
    Return all messages ordered by created_at asc.
    Auto-mark messages from OTHER party as read (set read_at = now where read_at is None and sender_id != current user).
    """
    # Verify case exists and user has access
    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Check authorization: superadmin can see any case, user can only see own
    if not user.is_superadmin and case.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Fetch messages ordered chronologically
    messages_result = await db.execute(
        select(NegotiationMessage)
        .where(NegotiationMessage.case_id == case_id)
        .order_by(NegotiationMessage.created_at.asc())
    )
    messages = messages_result.scalars().all()

    # Auto-mark messages from OTHER party as read
    # Update messages where read_at is None and sender_id != current user
    unread_from_other = [m for m in messages if m.read_at is None and m.sender_id != user.id]

    if unread_from_other:
        now = datetime.utcnow()
        for msg in unread_from_other:
            msg.read_at = now
            db.add(msg)
        await db.commit()

    return [_message_to_dict(m) for m in messages]


@negotiation_messages_router.post("/cases/{case_id}/messages")
async def send_message(
    case_id: str,
    body: SendMessageBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message in the case chat thread.

    Verify user owns the case OR is superadmin.
    sender_id = current user ID
    sender_role = "admin" if user.is_superadmin else "user"

    Returns created message dict.
    """
    # Verify case exists and user has access
    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Check authorization: superadmin can message any case, user can only message own
    if not user.is_superadmin and case.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Determine sender role
    sender_role = "admin" if user.is_superadmin else "user"

    # Create the message
    message = NegotiationMessage(
        case_id=case_id,
        sender_id=user.id,
        sender_role=sender_role,
        content=body.content,
    )

    db.add(message)
    await db.commit()
    await db.refresh(message)

    # Notify other party (Telegram to admin, email to user)
    try:
        from rei.services.negotiation_notifications import notify_new_message
        from rei.config import get_settings
        # Get the other party's email
        case = await db.get(NegotiationCase, message.case_id)
        if sender_role == "user":
            recipient_email = ""  # admin gets Telegram, not email
        else:
            owner = await db.get(User, case.user_id) if case else None
            recipient_email = owner.email if owner else ""
        await notify_new_message(
            case_id=str(message.case_id),
            sender_role=sender_role,
            recipient_email=recipient_email,
            settings=get_settings(),
        )
    except Exception as e:
        logger.warning("Failed to send message notification: %s", e)

    return _message_to_dict(message)


@negotiation_messages_router.patch("/messages/{message_id}/read")
async def mark_message_read(
    message_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark a message as read.

    Set read_at = now.
    Returns updated message dict.
    """
    result = await db.execute(
        select(NegotiationMessage).where(NegotiationMessage.id == message_id)
    )
    message = result.scalar_one_or_none()

    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    # Set read_at
    message.read_at = datetime.utcnow()

    db.add(message)
    await db.commit()
    await db.refresh(message)

    return _message_to_dict(message)
