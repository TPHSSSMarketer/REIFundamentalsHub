"""Email template admin routes — manage customizable email templates."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings, Settings
from rei.middleware.superadmin_gate import require_superadmin
from rei.models.user import User
from rei.services import email_template_service
from rei.services.email_template_service import (
    DEFAULT_TEMPLATES,
    SAMPLE_VARIABLES,
)

logger = logging.getLogger(__name__)

email_template_router = APIRouter(
    prefix="/superadmin/email-templates",
    tags=["email-templates"],
)


# ── Schemas ───────────────────────────────────────────────────────────────


class TemplateUpdate(BaseModel):
    subject: str
    body_html: str


class PreviewRequest(BaseModel):
    subject: str
    body_html: str


# ── Endpoints ─────────────────────────────────────────────────────────────


@email_template_router.get("")
async def list_templates(
    _user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """List all email template types with current content and status."""
    return await email_template_service.get_all_template_statuses(db)


@email_template_router.get("/{template_type}")
async def get_template(
    template_type: str,
    _user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Get a single template with its default, custom version, and variables."""
    if template_type not in DEFAULT_TEMPLATES:
        raise HTTPException(404, f"Unknown template type: {template_type}")

    default = DEFAULT_TEMPLATES[template_type]
    custom = await email_template_service.get_template(db, template_type)

    return {
        "template_type": template_type,
        "display_name": default["display_name"],
        "category": default["category"],
        "description": default["description"],
        "variables": default["variables"],
        "cta_text": default.get("cta_text", ""),
        "cta_url_template": default.get("cta_url_template", ""),
        "default_subject": default["subject"],
        "default_body_html": default["body_html"],
        "is_custom": custom is not None and custom.is_active,
        "subject": custom.subject if custom and custom.is_active else default["subject"],
        "body_html": custom.body_html if custom and custom.is_active else default["body_html"],
        "updated_at": custom.updated_at.isoformat() if custom else None,
    }


@email_template_router.put("/{template_type}")
async def save_template(
    template_type: str,
    body: TemplateUpdate,
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Save a custom template (creates or updates)."""
    if template_type not in DEFAULT_TEMPLATES:
        raise HTTPException(404, f"Unknown template type: {template_type}")

    if not body.subject.strip():
        raise HTTPException(400, "Subject line cannot be empty")
    if not body.body_html.strip():
        raise HTTPException(400, "Email body cannot be empty")

    await email_template_service.save_template(
        db, template_type, body.subject.strip(), body.body_html.strip(), user.id
    )
    return {"ok": True, "message": f"Template '{template_type}' saved"}


@email_template_router.delete("/{template_type}")
async def reset_template(
    template_type: str,
    _user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Reset a template to default (deletes custom version)."""
    if template_type not in DEFAULT_TEMPLATES:
        raise HTTPException(404, f"Unknown template type: {template_type}")

    deleted = await email_template_service.delete_template(db, template_type)
    if deleted:
        return {"ok": True, "message": f"Template '{template_type}' reset to default"}
    return {"ok": True, "message": "Already using default"}


@email_template_router.post("/{template_type}/preview")
async def preview_template(
    template_type: str,
    body: PreviewRequest,
    _user: User = Depends(require_superadmin),
):
    """Render a template with sample data for live preview."""
    if template_type not in DEFAULT_TEMPLATES:
        raise HTTPException(404, f"Unknown template type: {template_type}")

    from rei.services.email import _build_html, _cta_button

    rendered = email_template_service.render_preview(
        body.subject, body.body_html, template_type
    )

    # Build full HTML with wrapper + CTA button
    default = DEFAULT_TEMPLATES[template_type]
    cta_text = default.get("cta_text", "")
    cta_url_tpl = default.get("cta_url_template", "")
    cta_url = email_template_service._substitute(cta_url_tpl, SAMPLE_VARIABLES)
    cta_html = _cta_button(cta_text, cta_url) if cta_text else ""

    full_html = _build_html(rendered["body_html"] + cta_html)

    return {
        "subject": rendered["subject"],
        "html": full_html,
    }


@email_template_router.post("/{template_type}/test")
async def test_template(
    template_type: str,
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Send a test email using the current template to the logged-in admin."""
    if template_type not in DEFAULT_TEMPLATES:
        raise HTTPException(404, f"Unknown template type: {template_type}")

    settings = get_settings()

    from rei.services.email import send_email, _build_html, _cta_button

    # Get current template content (custom or default)
    custom = await email_template_service.get_template(db, template_type)
    default = DEFAULT_TEMPLATES[template_type]

    if custom and custom.is_active:
        subject_tpl = custom.subject
        body_tpl = custom.body_html
    else:
        subject_tpl = default["subject"]
        body_tpl = default["body_html"]

    # Render with sample data
    subject = email_template_service._substitute(subject_tpl, SAMPLE_VARIABLES)
    body_html = email_template_service._substitute(body_tpl, SAMPLE_VARIABLES)

    # Add CTA button
    cta_text = default.get("cta_text", "")
    cta_url_tpl = default.get("cta_url_template", "")
    cta_url = email_template_service._substitute(cta_url_tpl, SAMPLE_VARIABLES)
    cta_html = _cta_button(cta_text, cta_url) if cta_text else ""

    full_html = _build_html(body_html + cta_html)

    success = await send_email(
        to_email=user.email,
        to_name=user.full_name or user.email,
        subject=f"[TEST] {subject}",
        html_content=full_html,
        settings=settings,
    )

    if success:
        return {"ok": True, "sent_to": user.email}
    raise HTTPException(500, "Failed to send test email. Check email provider configuration.")
