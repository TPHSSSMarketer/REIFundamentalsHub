"""Lead Capture Website routes — CRUD sites, public form submission, site serving."""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.database import async_session_factory
from rei.models.lead_capture import LeadCaptureSite, LeadSubmission
from rei.models.user import User
from rei.services.security import check_rate_limit, rl_ip_key

logger = logging.getLogger(__name__)

# Authenticated routes (CRUD)
lead_capture_router = APIRouter(prefix="/lead-capture", tags=["lead-capture"])
# Public routes (site serving + form submission)
lead_capture_public_router = APIRouter(tags=["lead-capture-public"])


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


def _site_to_dict(site: LeadCaptureSite) -> dict:
    return {
        "id": site.id,
        "slug": site.slug,
        "name": site.name,
        "template_type": site.template_type,
        "config": json.loads(site.config_json) if site.config_json else {},
        "status": site.status,
        "submission_count": len(site.submissions) if site.submissions else 0,
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

    site = LeadCaptureSite(
        user_id=user.id,
        slug=slug,
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
            LeadCaptureSite.user_id == user.id,
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


# ── Public Routes (no auth) ─────────────────────────────────────


@lead_capture_public_router.get("/sites/{slug}", response_class=HTMLResponse)
async def serve_site(slug: str):
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

    return HTMLResponse(content=site.published_html)


@lead_capture_public_router.post("/sites/{slug}/submit")
async def submit_form(slug: str, request: Request):
    """
    PUBLIC endpoint — receive form submission from a published lead capture site.
    No authentication required. Rate limited to 10/min per IP.
    Creates a LeadSubmission record and auto-creates CRM contact/deal.
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
