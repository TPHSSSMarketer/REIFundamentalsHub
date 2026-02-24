"""Audit log routes — superadmin-only access to security audit trail."""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.audit import AuditLog
from rei.models.user import User

logger = logging.getLogger(__name__)
audit_router = APIRouter(prefix="/audit", tags=["audit"])


def _require_superadmin(user: User) -> None:
    """Raise 403 if the user is not a superadmin."""
    if not getattr(user, "is_superadmin", False):
        raise HTTPException(status_code=403, detail="Super admin access required")


# ── GET /api/audit/logs ───────────────────────────────────────────────────────


@audit_router.get("/logs")
async def list_audit_logs(
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    resource_type: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    success: Optional[bool] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return filtered audit logs, ordered by created_at desc."""
    _require_superadmin(current_user)

    query = select(AuditLog).order_by(AuditLog.created_at.desc())

    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
    if action is not None:
        query = query.where(AuditLog.action == action)
    if resource_type is not None:
        query = query.where(AuditLog.resource_type == resource_type)
    if success is not None:
        query = query.where(AuditLog.success == success)
    if start_date is not None:
        try:
            start_dt = datetime.fromisoformat(start_date)
            query = query.where(AuditLog.created_at >= start_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format")
    if end_date is not None:
        try:
            end_dt = datetime.fromisoformat(end_date)
            query = query.where(AuditLog.created_at <= end_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format")

    query = query.limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "user_email": log.user_email,
            "ip_address": log.ip_address,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "details": log.details,
            "success": log.success,
            "error_message": log.error_message,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


# ── GET /api/audit/logs/export ────────────────────────────────────────────────


@audit_router.get("/logs/export")
async def export_audit_logs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export all audit logs as CSV."""
    _require_superadmin(current_user)

    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc())
    )
    logs = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "timestamp", "user_email", "action", "resource_type",
        "resource_id", "ip_address", "success", "details",
    ])
    for log in logs:
        writer.writerow([
            log.created_at.isoformat() if log.created_at else "",
            log.user_email or "",
            log.action,
            log.resource_type or "",
            log.resource_id or "",
            log.ip_address or "",
            log.success,
            log.details or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )


# ── GET /api/audit/stats ─────────────────────────────────────────────────────


@audit_router.get("/stats")
async def audit_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return audit log statistics for today."""
    _require_superadmin(current_user)

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Total today
    total_result = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.created_at >= today_start
        )
    )
    total_today = total_result.scalar() or 0

    # Failed today
    failed_result = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.created_at >= today_start,
            AuditLog.success.is_(False),
        )
    )
    failed_today = failed_result.scalar() or 0

    # Top actions (all time, top 10)
    top_actions_result = await db.execute(
        select(AuditLog.action, func.count(AuditLog.id).label("count"))
        .group_by(AuditLog.action)
        .order_by(func.count(AuditLog.id).desc())
        .limit(10)
    )
    top_actions = [
        {"action": row[0], "count": row[1]}
        for row in top_actions_result.all()
    ]

    # Recent failures (last 10)
    recent_failures_result = await db.execute(
        select(AuditLog)
        .where(AuditLog.success.is_(False))
        .order_by(AuditLog.created_at.desc())
        .limit(10)
    )
    recent_failures = [
        {
            "id": log.id,
            "action": log.action,
            "user_email": log.user_email,
            "error_message": log.error_message,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in recent_failures_result.scalars().all()
    ]

    return {
        "total_today": total_today,
        "failed_today": failed_today,
        "top_actions": top_actions,
        "recent_failures": recent_failures,
    }
