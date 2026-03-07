"""Direct Mail routes — templates, campaigns, AI copy, send via Thanks.io."""

from __future__ import annotations

import base64
import json
import logging
import os
import tempfile
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.direct_mail import DirectMailCampaign, DirectMailTemplate
from rei.models.leads_pipeline import Lead, MarketingTouch
from rei.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["direct-mail"])

# ── Temp Image Storage (for serving to Thanks.io / Lob) ─────────

TEMP_IMAGE_DIR = os.path.join(tempfile.gettempdir(), "rei_mail_images")
os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)


def _save_temp_image(image_b64: str) -> str:
    """Save a base64 PNG image to a temp file. Returns the filename (UUID)."""
    filename = f"{uuid.uuid4().hex}.png"
    filepath = os.path.join(TEMP_IMAGE_DIR, filename)
    img_bytes = base64.b64decode(image_b64)
    with open(filepath, "wb") as f:
        f.write(img_bytes)
    return filename


@router.get("/direct-mail/images/{filename}")
async def serve_temp_image(filename: str):
    """Serve a temporary postcard image for mail provider pickup.

    Thanks.io and Lob require a publicly accessible URL for front images.
    This endpoint serves base64 images saved during campaign send.
    """
    # Sanitize filename to prevent path traversal
    safe_name = os.path.basename(filename)
    filepath = os.path.join(TEMP_IMAGE_DIR, safe_name)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(filepath, media_type="image/png")


# ── Pydantic Schemas ──────────────────────────────────────


class TemplateBody(BaseModel):
    name: str
    mail_type: str  # postcard or letter
    front_html: Optional[str] = None
    front_image_b64: Optional[str] = None
    back_copy_template: Optional[str] = None
    letter_html_template: Optional[str] = None


class GenerateCopyBody(BaseModel):
    lead_id: str
    mail_type: str  # postcard or letter
    campaign_type: Optional[str] = None
    # e.g. "motivated_seller", "cash_offer", "we_buy_houses"
    custom_instructions: Optional[str] = None


class GenerateFrontImageBody(BaseModel):
    campaign_type: str  # motivated_seller, cash_offer, etc.
    custom_prompt: Optional[str] = None


class CreateCampaignBody(BaseModel):
    name: str
    mail_type: str  # postcard or letter
    template_id: Optional[int] = None
    copy_text: Optional[str] = None
    front_image_b64: Optional[str] = None
    # Recipient selection
    lead_ids: Optional[list[str]] = None
    # OR filter criteria
    list_id: Optional[int] = None
    status_filter: Optional[str] = None
    tag_filter: Optional[str] = None


# ── Template CRUD ─────────────────────────────────────────


@router.get("/direct-mail/templates")
async def get_templates(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    result = await db.execute(
        select(DirectMailTemplate)
        .where(DirectMailTemplate.user_id == uid)
        .order_by(DirectMailTemplate.created_at.desc())
    )
    templates = result.scalars().all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "mail_type": t.mail_type,
            "front_html": t.front_html,
            "front_image_b64": t.front_image_b64,
            "back_copy_template": t.back_copy_template,
            "letter_html_template": t.letter_html_template,
            "is_default": t.is_default,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in templates
    ]


@router.post("/direct-mail/templates")
async def create_template(
    body: TemplateBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    template = DirectMailTemplate(
        user_id=uid,
        name=body.name,
        mail_type=body.mail_type,
        front_html=body.front_html,
        front_image_b64=body.front_image_b64,
        back_copy_template=body.back_copy_template,
        letter_html_template=body.letter_html_template,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return {"id": template.id, "name": template.name}


@router.delete("/direct-mail/templates/{template_id}")
async def delete_template(
    template_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    result = await db.execute(
        select(DirectMailTemplate).where(
            DirectMailTemplate.id == template_id,
            DirectMailTemplate.user_id == uid,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
    await db.commit()
    return {"status": "deleted"}


# ── AI Copy Generation ────────────────────────────────────


@router.post("/direct-mail/generate-copy")
async def generate_mail_copy(
    body: GenerateCopyBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Generate AI-powered mail copy personalized for a lead."""
    from rei.config import get_settings
    from rei.services.ai_service import generate_direct_mail_copy

    settings = get_settings()

    # Fetch the lead
    result = await db.execute(
        select(Lead).where(Lead.id == body.lead_id, Lead.user_id == uid)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Fetch user profile for personalization
    user_result = await db.execute(select(User).where(User.id == uid))
    profile = user_result.scalar_one_or_none()

    try:
        copy_text = await generate_direct_mail_copy(
            lead=lead,
            mail_type=body.mail_type,
            campaign_type=body.campaign_type or "motivated_seller",
            user_profile=profile,
            custom_instructions=body.custom_instructions,
            db=db,
            settings=settings,
        )
        return {"copy_text": copy_text, "lead_id": body.lead_id}
    except Exception as exc:
        logger.error("AI copy generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Copy generation failed: {str(exc)}")


@router.post("/direct-mail/generate-front-image")
async def generate_front_image(
    body: GenerateFrontImageBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Generate an AI image for postcard front using NVIDIA Stable Diffusion."""
    from rei.services.ai_service import generate_postcard_image

    try:
        image_b64 = await generate_postcard_image(
            campaign_type=body.campaign_type,
            custom_prompt=body.custom_prompt,
            db=db,
            user_id=uid,
        )
        return {"image_b64": image_b64}
    except Exception as exc:
        logger.error("Postcard image generation failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(exc)}")


# ── Letter HTML Builder ───────────────────────────────────


def _build_letter_html(
    copy_text: str,
    company_name: str = "",
    company_phone: str = "",
    company_logo_b64: str = "",
    recipient_name: str = "",
) -> str:
    """Wrap plain copy text in a professional letter HTML template with company branding."""
    logo_html = ""
    if company_logo_b64:
        logo_html = f'<img src="data:image/png;base64,{company_logo_b64}" alt="{company_name}" style="max-width:200px;max-height:80px;object-fit:contain;margin-bottom:16px;">'

    # Convert newlines to paragraphs
    paragraphs = "".join(
        f"<p style='margin:0 0 12px 0;line-height:1.6;'>{line}</p>"
        for line in copy_text.split("\n")
        if line.strip()
    )

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Georgia,serif;font-size:14px;color:#333;max-width:600px;margin:0 auto;padding:40px;">
  <div style="text-align:left;margin-bottom:30px;">
    {logo_html}
    <div style="font-weight:bold;font-size:16px;">{company_name}</div>
    {f'<div style="font-size:13px;color:#666;">{company_phone}</div>' if company_phone else ''}
  </div>
  <div style="margin-bottom:20px;">
    <p style="margin:0 0 12px 0;">Dear {recipient_name},</p>
  </div>
  <div>
    {paragraphs}
  </div>
  <div style="margin-top:30px;">
    <p style="margin:0;">Sincerely,</p>
    <p style="margin:8px 0 0 0;font-weight:bold;">{company_name}</p>
    {f'<p style="margin:4px 0 0 0;font-size:13px;color:#666;">{company_phone}</p>' if company_phone else ''}
  </div>
</body>
</html>"""


# ── Campaign CRUD ─────────────────────────────────────────


@router.get("/direct-mail/campaigns")
async def get_campaigns(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    result = await db.execute(
        select(DirectMailCampaign)
        .where(DirectMailCampaign.user_id == uid)
        .order_by(DirectMailCampaign.created_at.desc())
    )
    campaigns = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "mail_type": c.mail_type,
            "status": c.status,
            "total_recipients": c.total_recipients,
            "sent_count": c.sent_count,
            "failed_count": c.failed_count,
            "total_cost": c.total_cost,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "sent_at": c.sent_at.isoformat() if c.sent_at else None,
        }
        for c in campaigns
    ]


@router.post("/direct-mail/campaigns")
async def create_campaign(
    body: CreateCampaignBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Create a direct mail campaign — select recipients + template + copy."""
    # Resolve recipient lead IDs
    lead_ids = body.lead_ids or []

    if not lead_ids and (body.list_id or body.status_filter or body.tag_filter):
        # Build query from filters
        query = select(Lead.id).where(Lead.user_id == uid, Lead.is_deleted == False)
        if body.list_id:
            query = query.where(Lead.list_id == body.list_id)
        if body.status_filter:
            query = query.where(Lead.status == body.status_filter)
        if body.tag_filter:
            query = query.where(Lead.tags_json.contains(body.tag_filter))
        # Only leads with a mailable address
        query = query.where(
            Lead.address.isnot(None),
            Lead.city.isnot(None),
            Lead.state.isnot(None),
            Lead.zip_code.isnot(None),
        )
        result = await db.execute(query)
        lead_ids = [row[0] for row in result.all()]

    if not lead_ids:
        raise HTTPException(status_code=400, detail="No recipients selected or matched filters.")

    # Estimate cost
    cost_per = 0.59 if body.mail_type == "postcard" else 0.99
    estimated_cost = len(lead_ids) * cost_per

    campaign = DirectMailCampaign(
        user_id=uid,
        template_id=body.template_id,
        name=body.name,
        mail_type=body.mail_type,
        recipient_filter_json=json.dumps({
            "lead_ids": lead_ids,
            "list_id": body.list_id,
            "status_filter": body.status_filter,
            "tag_filter": body.tag_filter,
        }),
        copy_text=body.copy_text,
        front_image_b64=body.front_image_b64,
        status="draft",
        total_recipients=len(lead_ids),
        total_cost=estimated_cost,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)

    return {
        "id": campaign.id,
        "name": campaign.name,
        "total_recipients": campaign.total_recipients,
        "estimated_cost": estimated_cost,
        "status": "draft",
    }


# ── Send Campaign ─────────────────────────────────────────


@router.post("/direct-mail/campaigns/{campaign_id}/send")
async def send_campaign(
    campaign_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    """Execute a campaign — send mail to all recipients via Thanks.io."""
    from rei.services.direct_mail_provider import get_direct_mail_provider

    result = await db.execute(
        select(DirectMailCampaign).where(
            DirectMailCampaign.id == campaign_id,
            DirectMailCampaign.user_id == uid,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if campaign.status not in ("draft", "failed"):
        raise HTTPException(status_code=400, detail=f"Campaign is already {campaign.status}.")

    # Get provider
    try:
        provider = await get_direct_mail_provider(db, uid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Get recipient lead IDs
    filter_data = json.loads(campaign.recipient_filter_json or "{}")
    lead_ids = filter_data.get("lead_ids", [])

    if not lead_ids:
        raise HTTPException(status_code=400, detail="No recipients in campaign.")

    # Fetch leads
    leads_result = await db.execute(
        select(Lead).where(Lead.id.in_(lead_ids), Lead.user_id == uid)
    )
    leads = leads_result.scalars().all()

    # Get return address from user profile
    user_result = await db.execute(select(User).where(User.id == uid))
    profile = user_result.scalar_one_or_none()
    return_name = profile.company_name if profile else None
    return_address = profile.company_address if profile else None
    return_city = profile.company_city if profile else None
    return_state = profile.company_state if profile else None
    return_zip = profile.company_zip if profile else None

    # Convert front image from base64 to a publicly accessible URL
    # Thanks.io and Lob require a URL, not a data URI or base64 string
    front_image_url = None
    if campaign.front_image_b64 and campaign.mail_type == "postcard":
        try:
            temp_filename = _save_temp_image(campaign.front_image_b64)
            # Build the URL — use the request's host or fallback to config
            from rei.config import Settings
            settings = Settings()
            server_url = getattr(settings, "server_url", "") or "http://localhost:8001"
            front_image_url = f"{server_url}/api/direct-mail/images/{temp_filename}"
            logger.info("Postcard front image hosted at: %s", front_image_url)
        except Exception as exc:
            logger.warning("Failed to host front image: %s — sending without it", exc)

    campaign.status = "sending"
    await db.commit()

    sent = 0
    failed = 0
    total_cost = 0.0
    now = datetime.utcnow()

    for lead in leads:
        if not (lead.address and lead.city and lead.state and lead.zip_code):
            failed += 1
            continue

        recipient_name = lead.full_name or f"{lead.first_name or ''} {lead.last_name or ''}".strip() or "Resident"

        try:
            if campaign.mail_type == "postcard":
                send_result = await provider.send_postcard(
                    recipient_name=recipient_name,
                    address_line1=lead.address,
                    city=lead.city,
                    state=lead.state,
                    zip_code=lead.zip_code,
                    message=campaign.copy_text or "",
                    front_image_url=front_image_url,
                    return_name=return_name,
                    return_address=return_address,
                    return_city=return_city,
                    return_state=return_state,
                    return_zip=return_zip,
                )
            else:
                send_result = await provider.send_letter(
                    recipient_name=recipient_name,
                    address_line1=lead.address,
                    city=lead.city,
                    state=lead.state,
                    zip_code=lead.zip_code,
                    letter_html=_build_letter_html(
                        copy_text=campaign.copy_text or "",
                        company_name=profile.company_name if profile else "",
                        company_phone=profile.company_phone if profile else "",
                        company_logo_b64=profile.company_logo_b64 if profile else "",
                        recipient_name=recipient_name,
                    ),
                    return_name=return_name,
                    return_address=return_address,
                    return_city=return_city,
                    return_state=return_state,
                    return_zip=return_zip,
                )

            # Record marketing touch
            touch = MarketingTouch(
                user_id=uid,
                lead_id=lead.id,
                campaign_id=campaign.id,
                touch_type=campaign.mail_type,
                delivery_status=send_result.get("status", "pending"),
                cost=send_result.get("cost", 0.0),
                provider_id=send_result.get("provider_id"),
                sent_date=now,
            )
            db.add(touch)

            if send_result.get("status") == "sent":
                sent += 1
                total_cost += send_result.get("cost", 0.0)
                lead.total_mailers_sent = (lead.total_mailers_sent or 0) + 1
                lead.last_mailed_at = now
                if lead.status == "new":
                    lead.status = "mailed"
            else:
                failed += 1

        except Exception as exc:
            logger.error("Failed to send to lead %s: %s", lead.id, exc)
            failed += 1

    campaign.sent_count = sent
    campaign.failed_count = failed
    campaign.total_cost = total_cost
    campaign.status = "sent" if failed == 0 else "partially_sent" if sent > 0 else "failed"
    campaign.sent_at = now
    await db.commit()

    logger.info(
        "Campaign %d sent: %d ok, %d failed, $%.2f total",
        campaign_id, sent, failed, total_cost,
    )
    return {
        "campaign_id": campaign.id,
        "status": campaign.status,
        "sent": sent,
        "failed": failed,
        "total_cost": total_cost,
    }


# ── Campaign Detail ───────────────────────────────────────


@router.get("/direct-mail/campaigns/{campaign_id}")
async def get_campaign_detail(
    campaign_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    uid: int = Depends(workspace_user_id),
):
    result = await db.execute(
        select(DirectMailCampaign).where(
            DirectMailCampaign.id == campaign_id,
            DirectMailCampaign.user_id == uid,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Fetch marketing touches for this campaign
    touches_result = await db.execute(
        select(MarketingTouch).where(MarketingTouch.campaign_id == campaign_id)
    )
    touches = touches_result.scalars().all()

    return {
        "id": campaign.id,
        "name": campaign.name,
        "mail_type": campaign.mail_type,
        "status": campaign.status,
        "copy_text": campaign.copy_text,
        "front_image_b64": campaign.front_image_b64,
        "total_recipients": campaign.total_recipients,
        "sent_count": campaign.sent_count,
        "failed_count": campaign.failed_count,
        "total_cost": campaign.total_cost,
        "created_at": campaign.created_at.isoformat() if campaign.created_at else None,
        "sent_at": campaign.sent_at.isoformat() if campaign.sent_at else None,
        "touches": [
            {
                "lead_id": t.lead_id,
                "status": t.delivery_status,
                "cost": t.cost,
                "provider_id": t.provider_id,
                "sent_date": t.sent_date.isoformat() if t.sent_date else None,
            }
            for t in touches
        ],
    }
