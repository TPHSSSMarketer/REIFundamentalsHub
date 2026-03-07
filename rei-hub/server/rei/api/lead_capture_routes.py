"""LeadHub Website routes — CRUD sites, public form submission, site serving."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import uuid
from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import get_settings
from rei.database import async_session_factory
from rei.models.lead_capture import LeadCaptureDailyStats, LeadCaptureSite, LeadSubmission
from rei.models.user import User
from rei.services.email import send_lead_notification_email
from rei.services.security import check_rate_limit, rl_ip_key

logger = logging.getLogger(__name__)

# Authenticated routes (CRUD)
lead_capture_router = APIRouter(prefix="/leadhub", tags=["leadhub"])
# Public routes (site serving + form submission)
lead_capture_public_router = APIRouter(tags=["leadhub-public"])


# ── Pydantic Models ──────────────────────────────────────────────

class CreateSiteBody(BaseModel):
    name: str
    template_type: str
    config: dict

class UpdateSiteBody(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None

class PublishSiteBody(BaseModel):
    html: str  # Generated HTML from frontend

class UpdateSubmissionBody(BaseModel):
    crm_contact_id: Optional[str] = None
    crm_deal_id: Optional[str] = None

class FormSubmissionBody(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    message: Optional[str] = None
    # Allow any additional fields
    class Config:
        extra = "allow"


def _generate_slug(name: str) -> str:
    """Generate URL-friendly slug from site name."""
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    short_id = uuid.uuid4().hex[:8]
    return f"{slug}-{short_id}"


def _generate_company_slug(company_name: str) -> str:
    """Generate URL-friendly company slug from company name."""
    return re.sub(r'[^a-z0-9]+', '-', company_name.lower()).strip('-')


def _site_to_dict(site: LeadCaptureSite) -> dict:
    return {
        "id": site.id,
        "slug": site.slug,
        "company_slug": site.company_slug,
        "name": site.name,
        "template_type": site.template_type,
        "config": json.loads(site.config_json) if site.config_json else {},
        "status": site.status,
        "total_views": site.total_views or 0,
        "submission_count": len(site.submissions) if site.submissions else 0,
        "has_published_html": bool(site.published_html),
        "created_at": site.created_at.isoformat() if site.created_at else None,
        "updated_at": site.updated_at.isoformat() if site.updated_at else None,
    }


def _submission_to_dict(sub: LeadSubmission) -> dict:
    return {
        "id": sub.id,
        "site_id": sub.site_id,
        "form_data": json.loads(sub.form_data_json) if sub.form_data_json else {},
        "lead_name": sub.lead_name,
        "lead_email": sub.lead_email,
        "lead_phone": sub.lead_phone,
        "lead_address": sub.lead_address,
        "crm_contact_id": sub.crm_contact_id,
        "crm_deal_id": sub.crm_deal_id,
        "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
    }


# ── Analytics helpers ───────────────────────────────────────────


async def _track_page_view(site_id: int, ip: str) -> None:
    """Increment page view counters (runs in background)."""
    try:
        async with async_session_factory() as db:
            # Increment total views on the site
            result = await db.execute(
                select(LeadCaptureSite).where(LeadCaptureSite.id == site_id)
            )
            site = result.scalar_one_or_none()
            if site:
                site.total_views = (site.total_views or 0) + 1

            # Upsert daily stats
            today = date.today()
            stats_result = await db.execute(
                select(LeadCaptureDailyStats).where(
                    LeadCaptureDailyStats.site_id == site_id,
                    LeadCaptureDailyStats.date == today,
                )
            )
            stats = stats_result.scalar_one_or_none()
            if stats:
                stats.page_views += 1
            else:
                stats = LeadCaptureDailyStats(
                    site_id=site_id,
                    date=today,
                    page_views=1,
                    submissions=0,
                    unique_visitors=0,
                )
                db.add(stats)

            # Simple unique visitor tracking via IP hash
            ip_hash = hashlib.sha256(f"{site_id}:{today}:{ip}".encode()).hexdigest()[:16]
            # We store a simple count — for true uniqueness you'd need a separate table
            # For now, increment unique_visitors only if page_views == 1 (first view today)
            # or use a rough heuristic
            if stats.page_views <= 1:
                stats.unique_visitors = 1

            await db.commit()
    except Exception as e:
        logger.warning("Failed to track page view: %s", e)


async def _track_submission(site_id: int) -> None:
    """Increment submission counter for today's daily stats."""
    try:
        async with async_session_factory() as db:
            today = date.today()
            stats_result = await db.execute(
                select(LeadCaptureDailyStats).where(
                    LeadCaptureDailyStats.site_id == site_id,
                    LeadCaptureDailyStats.date == today,
                )
            )
            stats = stats_result.scalar_one_or_none()
            if stats:
                stats.submissions += 1
            else:
                stats = LeadCaptureDailyStats(
                    site_id=site_id,
                    date=today,
                    page_views=0,
                    submissions=1,
                    unique_visitors=0,
                )
                db.add(stats)
            await db.commit()
    except Exception as e:
        logger.warning("Failed to track submission: %s", e)


async def _send_owner_notification(site: LeadCaptureSite, form_data: dict) -> None:
    """Send email notification to site owner (runs in background)."""
    try:
        settings = get_settings()
        owner = site.owner
        if not owner or not owner.email:
            return

        # Respect subscriber's notification preference
        if not getattr(owner, "lead_email_notifications", True):
            return

        await send_lead_notification_email(
            to_email=owner.email,
            to_name=owner.full_name or "",
            lead_name=form_data.get("name", ""),
            lead_email=form_data.get("email", ""),
            lead_phone=form_data.get("phone", ""),
            lead_address=form_data.get("address", ""),
            site_name=site.name,
            settings=settings,
        )
    except Exception as e:
        logger.warning("Failed to send lead notification email: %s", e)


# ── CRUD Routes (auth required) ─────────────────────────────────


@lead_capture_router.post("/sites")
async def create_site(
    body: CreateSiteBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new lead capture site."""
    slug = _generate_slug(body.name)
    # Ensure slug uniqueness
    existing = await db.execute(
        select(LeadCaptureSite).where(LeadCaptureSite.slug == slug)
    )
    if existing.scalar_one_or_none():
        slug = _generate_slug(body.name)  # Regenerate

    # Generate company slug from company_name in config (if available)
    company_name = body.config.get("company_name", body.name) if isinstance(body.config, dict) else body.name
    company_slug = _generate_company_slug(company_name)

    site = LeadCaptureSite(
        user_id=workspace_user_id(user),
        slug=slug,
        company_slug=company_slug,
        name=body.name,
        template_type=body.template_type,
        config_json=json.dumps(body.config),
        status="draft",
    )
    db.add(site)
    await db.commit()
    await db.refresh(site)
    return _site_to_dict(site)


@lead_capture_router.get("/sites")
async def list_sites(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all lead capture sites for current user."""
    result = await db.execute(
        select(LeadCaptureSite)
        .where(
            LeadCaptureSite.user_id == workspace_user_id(user),
            LeadCaptureSite.is_deleted == False,
        )
        .order_by(LeadCaptureSite.created_at.desc())
    )
    sites = result.scalars().all()
    return [_site_to_dict(s) for s in sites]


@lead_capture_router.put("/sites/{site_id}")
async def update_site(
    site_id: int,
    body: UpdateSiteBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a lead capture site config."""
    result = await db.execute(
        select(LeadCaptureSite).where(
            LeadCaptureSite.id == site_id,
            LeadCaptureSite.user_id == user.id,
            LeadCaptureSite.is_deleted == False,
        )
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    if body.name is not None:
        site.name = body.name
    if body.config is not None:
        site.config_json = json.dumps(body.config)
    site.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(site)
    return _site_to_dict(site)


@lead_capture_router.delete("/sites/{site_id}")
async def delete_site(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a lead capture site."""
    result = await db.execute(
        select(LeadCaptureSite).where(
            LeadCaptureSite.id == site_id,
            LeadCaptureSite.user_id == user.id,
        )
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    site.is_deleted = True
    site.updated_at = datetime.utcnow()
    await db.commit()
    return {"success": True}


@lead_capture_router.post("/sites/{site_id}/publish")
async def publish_site(
    site_id: int,
    body: PublishSiteBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Publish a site — store generated HTML and set status to published."""
    result = await db.execute(
        select(LeadCaptureSite).where(
            LeadCaptureSite.id == site_id,
            LeadCaptureSite.user_id == user.id,
            LeadCaptureSite.is_deleted == False,
        )
    )
    site = result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    site.published_html = body.html
    site.status = "published"
    site.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(site)
    return _site_to_dict(site)


@lead_capture_router.get("/sites/{site_id}/submissions")
async def list_submissions(
    site_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all form submissions for a site."""
    # Verify site ownership
    site_result = await db.execute(
        select(LeadCaptureSite).where(
            LeadCaptureSite.id == site_id,
            LeadCaptureSite.user_id == user.id,
        )
    )
    if not site_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Site not found")

    result = await db.execute(
        select(LeadSubmission)
        .where(LeadSubmission.site_id == site_id)
        .order_by(LeadSubmission.submitted_at.desc())
    )
    subs = result.scalars().all()
    return [_submission_to_dict(s) for s in subs]


@lead_capture_router.patch("/submissions/{submission_id}")
async def update_submission(
    submission_id: int,
    body: UpdateSubmissionBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a submission with CRM contact/deal IDs after frontend sync."""
    # Find the submission and verify ownership through the site
    result = await db.execute(
        select(LeadSubmission).where(LeadSubmission.id == submission_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Verify the site belongs to this user
    site_result = await db.execute(
        select(LeadCaptureSite).where(
            LeadCaptureSite.id == sub.site_id,
            LeadCaptureSite.user_id == user.id,
        )
    )
    if not site_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Submission not found")

    if body.crm_contact_id is not None:
        sub.crm_contact_id = body.crm_contact_id
    if body.crm_deal_id is not None:
        sub.crm_deal_id = body.crm_deal_id

    await db.commit()
    return _submission_to_dict(sub)


@lead_capture_router.delete("/submissions/{submission_id}")
async def delete_submission(
    submission_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a lead submission (hard delete)."""
    result = await db.execute(
        select(LeadSubmission).where(LeadSubmission.id == submission_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Verify the site belongs to this user
    site_result = await db.execute(
        select(LeadCaptureSite).where(
            LeadCaptureSite.id == sub.site_id,
            LeadCaptureSite.user_id == user.id,
        )
    )
    if not site_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Submission not found")

    await db.delete(sub)
    await db.commit()
    return {"detail": "Lead deleted"}


# ── Analytics Routes (auth required) ──────────────────────────────


@lead_capture_router.get("/sites/{site_id}/analytics")
async def get_site_analytics(
    site_id: int,
    days: int = Query(default=30, ge=1, le=365),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get analytics for a lead capture site — views, submissions, conversion rate."""
    # Verify ownership
    site_result = await db.execute(
        select(LeadCaptureSite).where(
            LeadCaptureSite.id == site_id,
            LeadCaptureSite.user_id == user.id,
            LeadCaptureSite.is_deleted == False,
        )
    )
    site = site_result.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    total_views = site.total_views or 0
    total_submissions = len(site.submissions) if site.submissions else 0
    conversion_rate = (total_submissions / total_views * 100) if total_views > 0 else 0.0

    # Fetch daily stats
    start_date = date.today() - timedelta(days=days)
    stats_result = await db.execute(
        select(LeadCaptureDailyStats)
        .where(
            LeadCaptureDailyStats.site_id == site_id,
            LeadCaptureDailyStats.date >= start_date,
        )
        .order_by(LeadCaptureDailyStats.date.asc())
    )
    daily_stats = stats_result.scalars().all()

    return {
        "total_views": total_views,
        "total_submissions": total_submissions,
        "conversion_rate": round(conversion_rate, 2),
        "daily": [
            {
                "date": s.date.isoformat(),
                "views": s.page_views,
                "submissions": s.submissions,
                "unique_visitors": s.unique_visitors,
            }
            for s in daily_stats
        ],
    }


# ── Public Routes (no auth) ─────────────────────────────────────


@lead_capture_public_router.get("/sites/{slug}", response_class=HTMLResponse)
async def serve_site(slug: str, request: Request):
    """Serve a published lead capture website by slug."""
    async with async_session_factory() as db:
        result = await db.execute(
            select(LeadCaptureSite).where(
                LeadCaptureSite.slug == slug,
                LeadCaptureSite.status == "published",
                LeadCaptureSite.is_deleted == False,
            )
        )
        site = result.scalar_one_or_none()

    if not site or not site.published_html:
        return HTMLResponse(
            content="<html><body><h1>Site not found</h1><p>This page does not exist or has been unpublished.</p></body></html>",
            status_code=404,
        )

    # Track page view in background
    ip = request.client.host if request.client else "unknown"
    asyncio.create_task(_track_page_view(site.id, ip))

    return HTMLResponse(content=site.published_html)


@lead_capture_public_router.post("/sites/{slug}/submit")
async def submit_form(slug: str, request: Request):
    """
    PUBLIC endpoint — receive form submission from a published lead capture site.
    No authentication required. Rate limited to 10/min per IP.
    Creates a LeadSubmission record, tracks analytics, and notifies owner.
    """
    # Rate limit: 10 submissions per IP per minute
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(rl_ip_key(ip, "lead_submit"), max_requests=10, window_seconds=60):
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many submissions. Please try again later."},
        )

    try:
        form_data = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"detail": "Invalid form data"},
        )

    async with async_session_factory() as db:
        # Find the site
        result = await db.execute(
            select(LeadCaptureSite).where(
                LeadCaptureSite.slug == slug,
                LeadCaptureSite.status == "published",
                LeadCaptureSite.is_deleted == False,
            )
        )
        site = result.scalar_one_or_none()
        if not site:
            return JSONResponse(
                status_code=404,
                content={"detail": "Site not found"},
            )

        # Create submission record
        submission = LeadSubmission(
            site_id=site.id,
            form_data_json=json.dumps(form_data),
            lead_name=form_data.get("name", ""),
            lead_email=form_data.get("email", ""),
            lead_phone=form_data.get("phone", ""),
            lead_address=form_data.get("address", ""),
            source_ip=ip,
        )
        db.add(submission)
        await db.commit()

        logger.info(
            "Lead captured: site=%s slug=%s name=%s email=%s",
            site.id, slug,
            form_data.get("name", "N/A"),
            form_data.get("email", "N/A"),
        )

        # Track submission in daily stats (background)
        asyncio.create_task(_track_submission(site.id))

        # Send email notification to site owner (background)
        asyncio.create_task(_send_owner_notification(site, form_data))

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Thank you! We'll be in touch soon.",
        },
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )


@lead_capture_public_router.options("/sites/{slug}/submit")
async def submit_form_options(slug: str):
    """CORS preflight for form submission."""
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )


# ── New URL structure: /{company_slug}/sites/{slug} ──────────────


@lead_capture_public_router.get("/{company_slug}/sites/{slug}", response_class=HTMLResponse)
async def serve_site_by_company(company_slug: str, slug: str, request: Request):
    """Serve a published lead capture website by company_slug + slug."""
    async with async_session_factory() as db:
        result = await db.execute(
            select(LeadCaptureSite).where(
                LeadCaptureSite.company_slug == company_slug,
                LeadCaptureSite.slug == slug,
                LeadCaptureSite.status == "published",
                LeadCaptureSite.is_deleted == False,
            )
        )
        site = result.scalar_one_or_none()

    if not site or not site.published_html:
        return HTMLResponse(
            content="<html><body><h1>Site not found</h1><p>This page does not exist or has been unpublished.</p></body></html>",
            status_code=404,
        )

    # Track page view in background
    ip = request.client.host if request.client else "unknown"
    asyncio.create_task(_track_page_view(site.id, ip))

    return HTMLResponse(content=site.published_html)


@lead_capture_public_router.post("/{company_slug}/sites/{slug}/submit")
async def submit_form_by_company(company_slug: str, slug: str, request: Request):
    """
    PUBLIC endpoint — receive form submission via company_slug URL.
    No authentication required. Rate limited to 10/min per IP.
    """
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(rl_ip_key(ip, "lead_submit"), max_requests=10, window_seconds=60):
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many submissions. Please try again later."},
        )

    try:
        form_data = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"detail": "Invalid form data"},
        )

    async with async_session_factory() as db:
        result = await db.execute(
            select(LeadCaptureSite).where(
                LeadCaptureSite.company_slug == company_slug,
                LeadCaptureSite.slug == slug,
                LeadCaptureSite.status == "published",
                LeadCaptureSite.is_deleted == False,
            )
        )
        site = result.scalar_one_or_none()
        if not site:
            return JSONResponse(
                status_code=404,
                content={"detail": "Site not found"},
            )

        submission = LeadSubmission(
            site_id=site.id,
            form_data_json=json.dumps(form_data),
            lead_name=form_data.get("name", ""),
            lead_email=form_data.get("email", ""),
            lead_phone=form_data.get("phone", ""),
            lead_address=form_data.get("address", ""),
            source_ip=ip,
        )
        db.add(submission)
        await db.commit()

        logger.info(
            "Lead captured: site=%s company=%s slug=%s name=%s email=%s",
            site.id, company_slug, slug,
            form_data.get("name", "N/A"),
            form_data.get("email", "N/A"),
        )

        # Track submission in daily stats (background)
        asyncio.create_task(_track_submission(site.id))

        # Send email notification to site owner (background)
        asyncio.create_task(_send_owner_notification(site, form_data))

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "Thank you! We'll be in touch soon.",
        },
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )


@lead_capture_public_router.options("/{company_slug}/sites/{slug}/submit")
async def submit_form_options_by_company(company_slug: str, slug: str):
    """CORS preflight for form submission via company_slug URL."""
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )


# ── Notification Settings ────────────────────────────────────


class NotificationSettingsBody(BaseModel):
    leadEmailNotifications: bool


@lead_capture_router.get("/notification-settings")
async def get_notification_settings(
    user: User = Depends(get_current_user),
):
    """Get the subscriber's lead capture notification preferences."""
    return {
        "leadEmailNotifications": getattr(user, "lead_email_notifications", True),
    }


@lead_capture_router.patch("/notification-settings")
async def update_notification_settings(
    body: NotificationSettingsBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle lead capture email notifications on/off."""
    user.lead_email_notifications = body.leadEmailNotifications
    await db.commit()
    return {
        "leadEmailNotifications": user.lead_email_notifications,
        "detail": "Notification settings updated",
    }
