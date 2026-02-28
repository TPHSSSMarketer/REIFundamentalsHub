"""Help Ticket API Routes — Submit, view, and manage support tickets.

Users can:
- Submit a new ticket (triggers email + Telegram notification)
- View their own tickets
- Add a reply/update to an existing ticket

Admins can:
- View all tickets across all users
- Update ticket status (in_progress, resolved, closed)
- Add admin notes
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import HelpTicket, User
from rei.services.ticket_notifications import notify_new_ticket

logger = logging.getLogger(__name__)

ticket_router = APIRouter(prefix="/tickets", tags=["tickets"])
settings = get_settings()


# ── Schemas ────────────────────────────────────────────────────────────


class CreateTicketRequest(BaseModel):
    subject: str
    description: str
    category: str = "general"
    priority: str = "normal"
    related_resource_type: Optional[str] = None
    related_resource_id: Optional[str] = None


class UpdateTicketRequest(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    admin_notes: Optional[str] = None


# ── User Endpoints ────────────────────────────────────────────────────


@ticket_router.post("")
async def create_ticket(
    body: CreateTicketRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a new help ticket.

    This creates the ticket and immediately sends:
    1. An email to support@reifundamentalshub.com
    2. A Telegram message to the platform owner
    """
    # Validate category
    valid_categories = [
        "general", "billing", "phone", "ai_voice",
        "technical", "feature_request",
    ]
    if body.category not in valid_categories:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}",
        )

    # Validate priority
    valid_priorities = ["low", "normal", "high", "urgent"]
    if body.priority not in valid_priorities:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid priority. Must be one of: {', '.join(valid_priorities)}",
        )

    # Create the ticket
    ticket = HelpTicket(
        user_id=user.id,
        subject=body.subject,
        description=body.description,
        category=body.category,
        priority=body.priority,
        related_resource_type=body.related_resource_type,
        related_resource_id=body.related_resource_id,
        status="open",
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)

    # Send notifications (email + Telegram)
    notification_result = await notify_new_ticket(ticket, user, settings)

    logger.info(
        f"Ticket created: {ticket.id[:8]} by user {user.id} "
        f"(email={notification_result['email_sent']}, "
        f"telegram={notification_result['telegram_sent']})"
    )

    return {
        "id": ticket.id,
        "subject": ticket.subject,
        "status": ticket.status,
        "priority": ticket.priority,
        "category": ticket.category,
        "created_at": ticket.created_at.isoformat(),
        "message": "Ticket submitted successfully. Our team has been notified.",
        "notifications": notification_result,
    }


@ticket_router.get("")
async def list_my_tickets(
    status: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all tickets submitted by the current user."""
    query = select(HelpTicket).where(HelpTicket.user_id == user.id)
    if status:
        query = query.where(HelpTicket.status == status)
    query = query.order_by(HelpTicket.created_at.desc())

    result = await db.execute(query)
    tickets = result.scalars().all()

    return [
        {
            "id": t.id,
            "subject": t.subject,
            "category": t.category,
            "priority": t.priority,
            "status": t.status,
            "admin_notes": t.admin_notes,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        }
        for t in tickets
    ]


@ticket_router.get("/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get full details of a specific ticket."""
    result = await db.execute(
        select(HelpTicket).where(
            and_(
                HelpTicket.id == ticket_id,
                HelpTicket.user_id == user.id,
            )
        )
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    return {
        "id": ticket.id,
        "subject": ticket.subject,
        "description": ticket.description,
        "category": ticket.category,
        "priority": ticket.priority,
        "status": ticket.status,
        "admin_notes": ticket.admin_notes,
        "related_resource_type": ticket.related_resource_type,
        "related_resource_id": ticket.related_resource_id,
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
    }


# ── Admin Endpoints ──────────────────────────────────────────────────


@ticket_router.get("/admin/all")
async def list_all_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List ALL tickets across all users (admin only).

    Admins see every ticket with user info attached.
    """
    if not getattr(user, "is_admin", False) and not getattr(user, "is_superadmin", False):
        raise HTTPException(status_code=403, detail="Admin access required")

    query = select(HelpTicket)
    if status:
        query = query.where(HelpTicket.status == status)
    if priority:
        query = query.where(HelpTicket.priority == priority)
    query = query.order_by(HelpTicket.created_at.desc())

    result = await db.execute(query)
    tickets = result.scalars().all()

    # Get user info for each ticket
    ticket_list = []
    for t in tickets:
        user_result = await db.execute(
            select(User).where(User.id == t.user_id)
        )
        ticket_user = user_result.scalar_one_or_none()

        ticket_list.append({
            "id": t.id,
            "subject": t.subject,
            "description": t.description,
            "category": t.category,
            "priority": t.priority,
            "status": t.status,
            "admin_notes": t.admin_notes,
            "user_id": t.user_id,
            "user_name": getattr(ticket_user, "full_name", "") or "",
            "user_email": getattr(ticket_user, "email", "") or "",
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "resolved_at": t.resolved_at.isoformat() if t.resolved_at else None,
        })

    return ticket_list


@ticket_router.get("/admin/stats")
async def ticket_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get ticket statistics (admin only)."""
    if not getattr(user, "is_admin", False) and not getattr(user, "is_superadmin", False):
        raise HTTPException(status_code=403, detail="Admin access required")

    stats = {}
    for status_name in ["open", "in_progress", "waiting_on_user", "resolved", "closed"]:
        count_result = await db.execute(
            select(func.count(HelpTicket.id)).where(
                HelpTicket.status == status_name
            )
        )
        stats[status_name] = count_result.scalar() or 0

    stats["total"] = sum(stats.values())
    return stats


@ticket_router.patch("/admin/{ticket_id}")
async def admin_update_ticket(
    ticket_id: str,
    body: UpdateTicketRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a ticket (admin only) — change status, priority, or add notes."""
    if not getattr(user, "is_admin", False) and not getattr(user, "is_superadmin", False):
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(
        select(HelpTicket).where(HelpTicket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if body.status:
        ticket.status = body.status
        if body.status in ("resolved", "closed"):
            ticket.resolved_by = user.id
            ticket.resolved_at = datetime.utcnow()

    if body.priority:
        ticket.priority = body.priority

    if body.admin_notes:
        ticket.admin_notes = body.admin_notes

    ticket.updated_at = datetime.utcnow()
    await db.commit()

    return {
        "id": ticket.id,
        "status": ticket.status,
        "priority": ticket.priority,
        "message": "Ticket updated",
    }
