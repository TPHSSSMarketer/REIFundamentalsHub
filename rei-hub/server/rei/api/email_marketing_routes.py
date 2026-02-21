"""Email Marketing routes — domains, lists, campaigns, sequences, webhooks."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import EMAIL_PLAN_LIMITS, OVERAGE_RATE_PER_THOUSAND, get_settings
from rei.models.user import (
    EmailCampaign,
    EmailDomain,
    EmailList,
    EmailSequence,
    EmailSequenceEnrollment,
    EmailSequenceStep,
    EmailSubscriber,
    EmailTemplate,
    User,
)
from rei.services.email_provider import EmailRequest, email_provider

logger = logging.getLogger(__name__)
settings = get_settings()

email_marketing_router = APIRouter(prefix="/email", tags=["email-marketing"])


# ── Pydantic schemas ───────────────────────────────────────────────────


class AddDomainRequest(BaseModel):
    domain: str
    from_name: str
    from_email: str


class CreateListRequest(BaseModel):
    name: str
    description: Optional[str] = None


class AddSubscriberRequest(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    contact_id: Optional[str] = None
    custom_fields: Optional[dict] = None


class ImportSubscribersRequest(BaseModel):
    subscribers: list[dict]


class CreateTemplateRequest(BaseModel):
    name: str
    subject: str
    preview_text: Optional[str] = None
    html_content: str
    plain_text: Optional[str] = None
    category: str = "custom"


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    preview_text: Optional[str] = None
    html_content: Optional[str] = None
    plain_text: Optional[str] = None
    category: Optional[str] = None


class CreateCampaignRequest(BaseModel):
    name: str
    subject: str
    preview_text: Optional[str] = None
    html_content: str
    plain_text: Optional[str] = None
    from_domain_id: str
    list_id: str


class ScheduleCampaignRequest(BaseModel):
    scheduled_at: str


class CreateSequenceRequest(BaseModel):
    name: str
    list_id: str
    from_domain_id: str


class AddSequenceStepRequest(BaseModel):
    step_number: int
    delay_days: int = 0
    subject: str
    html_content: str
    plain_text: Optional[str] = None


class EnrollSubscriberRequest(BaseModel):
    subscriber_id: str


# ── Helpers ────────────────────────────────────────────────────────────


def _generate_unsubscribe_token(subscriber_id: str) -> str:
    """Generate an HMAC token for unsubscribe links."""
    return hmac.new(
        settings.jwt_secret.encode(),
        subscriber_id.encode(),
        hashlib.sha256,
    ).hexdigest()


def _verify_unsubscribe_token(subscriber_id: str, token: str) -> bool:
    expected = _generate_unsubscribe_token(subscriber_id)
    return hmac.compare_digest(expected, token)


def _build_unsubscribe_url(subscriber_id: str) -> str:
    token = _generate_unsubscribe_token(subscriber_id)
    return f"{settings.hub_url}/api/email/unsubscribe/{token}?sid={subscriber_id}"


def _append_canspam_footer(html: str, from_name: str, unsubscribe_url: str) -> str:
    footer = (
        '<div style="margin-top:40px;padding-top:20px;border-top:1px solid #e0e0e0;'
        'font-size:12px;color:#999999;text-align:center;">'
        f"<p>You are receiving this because you subscribed via {from_name}.</p>"
        f"<p>REIFundamentals Hub</p>"
        f'<p><a href="{unsubscribe_url}" style="color:#999999;">Unsubscribe</a></p>'
        "</div>"
    )
    if "</body>" in html:
        return html.replace("</body>", f"{footer}</body>")
    return html + footer


DEFAULT_TEMPLATES = [
    {
        "name": "Motivated Seller Outreach",
        "subject": "We Buy Houses in {{city}} — Cash Offer in 24hrs",
        "category": "motivated_seller",
        "html_content": (
            "<p>Hi {{first_name}},</p>"
            "<p>I noticed your property in {{city}} and wanted to reach out. "
            "We buy houses for cash and can close in as little as 7 days.</p>"
            "<p>If you're open to a no-obligation cash offer, just reply to this email "
            "or give us a call.</p>"
            "<p>Looking forward to hearing from you!</p>"
        ),
        "plain_text": (
            "Hi {{first_name}},\n\n"
            "I noticed your property in {{city}} and wanted to reach out. "
            "We buy houses for cash and can close in as little as 7 days.\n\n"
            "If you're open to a no-obligation cash offer, just reply to this email "
            "or give us a call.\n\nLooking forward to hearing from you!"
        ),
    },
    {
        "name": "Follow Up 1 (Day 3)",
        "subject": "Following up — {{first_name}}, still interested?",
        "category": "follow_up",
        "html_content": (
            "<p>Hi {{first_name}},</p>"
            "<p>I reached out a few days ago about your property in {{city}}. "
            "Just wanted to follow up and see if you had any questions.</p>"
            "<p>We can make the process simple and stress-free. No repairs needed, "
            "no agent fees.</p>"
            "<p>Let me know if you'd like to chat!</p>"
        ),
        "plain_text": (
            "Hi {{first_name}},\n\n"
            "I reached out a few days ago about your property in {{city}}. "
            "Just wanted to follow up and see if you had any questions.\n\n"
            "We can make the process simple and stress-free. No repairs needed, "
            "no agent fees.\n\nLet me know if you'd like to chat!"
        ),
    },
    {
        "name": "Follow Up 2 (Day 7)",
        "subject": "Last chance — our offer on your {{city}} property",
        "category": "follow_up",
        "html_content": (
            "<p>Hi {{first_name}},</p>"
            "<p>This is my final follow-up regarding your {{city}} property. "
            "Our cash offer is still on the table.</p>"
            "<p>If the timing isn't right, no worries at all. But if you change "
            "your mind, we're here to help.</p>"
            "<p>Wishing you all the best!</p>"
        ),
        "plain_text": (
            "Hi {{first_name}},\n\n"
            "This is my final follow-up regarding your {{city}} property. "
            "Our cash offer is still on the table.\n\n"
            "If the timing isn't right, no worries at all. But if you change "
            "your mind, we're here to help.\n\nWishing you all the best!"
        ),
    },
    {
        "name": "Cash Buyer Announcement",
        "subject": "New Deal Available — {{city}} Investment Property",
        "category": "cash_buyer",
        "html_content": (
            "<p>Hi {{first_name}},</p>"
            "<p>We have a new investment property available in {{city}}:</p>"
            "<p><strong>{{property_address}}</strong></p>"
            "<p>This is a great opportunity for cash buyers looking to add to "
            "their portfolio. Reply for details and photos.</p>"
        ),
        "plain_text": (
            "Hi {{first_name}},\n\n"
            "We have a new investment property available in {{city}}:\n\n"
            "{{property_address}}\n\n"
            "This is a great opportunity for cash buyers looking to add to "
            "their portfolio. Reply for details and photos."
        ),
    },
]


async def _ensure_default_templates(user_id: int, db: AsyncSession) -> None:
    """Lazily seed default email templates for a user if none exist."""
    result = await db.execute(
        select(func.count())
        .select_from(EmailTemplate)
        .where(EmailTemplate.user_id == user_id, EmailTemplate.is_default == True)  # noqa: E712
    )
    count = result.scalar()
    if count and count > 0:
        return

    for tpl in DEFAULT_TEMPLATES:
        db.add(
            EmailTemplate(
                user_id=user_id,
                name=tpl["name"],
                subject=tpl["subject"],
                category=tpl["category"],
                html_content=tpl["html_content"],
                plain_text=tpl.get("plain_text", ""),
                is_default=True,
            )
        )
    await db.commit()


# ═══════════════════════════════════════════════════════════════
# Domain endpoints
# ═══════════════════════════════════════════════════════════════


@email_marketing_router.get("/domains")
async def list_domains(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailDomain)
        .where(EmailDomain.user_id == current_user.id)
        .order_by(EmailDomain.created_at.desc())
    )
    domains = result.scalars().all()
    return {
        "domains": [
            {
                "id": d.id,
                "domain": d.domain,
                "from_name": d.from_name,
                "from_email": d.from_email,
                "status": d.status,
                "provider": d.provider,
                "dns_records": json.loads(d.dns_records) if d.dns_records else None,
                "verified_at": d.verified_at.isoformat() if d.verified_at else None,
                "created_at": d.created_at.isoformat(),
            }
            for d in domains
        ],
        "current_provider": settings.email_provider,
    }


@email_marketing_router.post("/domains")
async def add_domain(
    body: AddDomainRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    domain_result = await email_provider.add_domain(body.domain, settings)

    domain = EmailDomain(
        user_id=current_user.id,
        domain=body.domain,
        from_name=body.from_name,
        from_email=body.from_email,
        provider=settings.email_provider,
        provider_domain_id=domain_result.domain_id,
        dns_records=json.dumps(domain_result.dns_records),
        status=domain_result.status,
    )
    db.add(domain)
    await db.commit()
    await db.refresh(domain)

    return {
        "id": domain.id,
        "domain": domain.domain,
        "status": domain.status,
        "dns_records": domain_result.dns_records,
        "message": "Domain added. Add the DNS records below to your domain registrar, then click Verify.",
    }


@email_marketing_router.post("/domains/{domain_id}/verify")
async def verify_domain(
    domain_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailDomain).where(
            EmailDomain.id == domain_id,
            EmailDomain.user_id == current_user.id,
        )
    )
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")

    verify_result = await email_provider.verify_domain(
        domain.provider_domain_id or domain_id, settings
    )

    if verify_result.get("valid"):
        domain.status = "verified"
        domain.verified_at = datetime.utcnow()
        await db.commit()
        return {"verified": True, "message": "Domain verified successfully"}

    return {
        "verified": False,
        "message": "DNS records not yet propagated. This can take up to 48 hours.",
    }


@email_marketing_router.delete("/domains/{domain_id}")
async def delete_domain(
    domain_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailDomain).where(
            EmailDomain.id == domain_id,
            EmailDomain.user_id == current_user.id,
        )
    )
    domain = result.scalar_one_or_none()
    if not domain:
        raise HTTPException(status_code=404, detail="Domain not found")

    await db.delete(domain)
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# List endpoints
# ═══════════════════════════════════════════════════════════════


@email_marketing_router.get("/lists")
async def list_lists(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailList)
        .where(EmailList.user_id == current_user.id)
        .order_by(EmailList.created_at.desc())
    )
    lists = result.scalars().all()
    return {
        "lists": [
            {
                "id": el.id,
                "name": el.name,
                "description": el.description,
                "subscriber_count": el.subscriber_count,
                "created_at": el.created_at.isoformat(),
            }
            for el in lists
        ]
    }


@email_marketing_router.post("/lists")
async def create_list(
    body: CreateListRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    email_list = EmailList(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
    )
    db.add(email_list)
    await db.commit()
    await db.refresh(email_list)
    return {
        "id": email_list.id,
        "name": email_list.name,
        "description": email_list.description,
        "subscriber_count": 0,
    }


@email_marketing_router.delete("/lists/{list_id}")
async def delete_list(
    list_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailList).where(
            EmailList.id == list_id,
            EmailList.user_id == current_user.id,
        )
    )
    email_list = result.scalar_one_or_none()
    if not email_list:
        raise HTTPException(status_code=404, detail="List not found")

    await db.delete(email_list)
    await db.commit()
    return {"success": True}


@email_marketing_router.get("/lists/{list_id}/subscribers")
async def list_subscribers(
    list_id: str,
    page: int = 1,
    per_page: int = 50,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify list ownership
    list_result = await db.execute(
        select(EmailList).where(
            EmailList.id == list_id,
            EmailList.user_id == current_user.id,
        )
    )
    if not list_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="List not found")

    offset = (page - 1) * per_page
    result = await db.execute(
        select(EmailSubscriber)
        .where(EmailSubscriber.list_id == list_id)
        .order_by(EmailSubscriber.subscribed_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    subs = result.scalars().all()

    count_result = await db.execute(
        select(func.count())
        .select_from(EmailSubscriber)
        .where(EmailSubscriber.list_id == list_id)
    )
    total = count_result.scalar() or 0

    return {
        "subscribers": [
            {
                "id": s.id,
                "email": s.email,
                "first_name": s.first_name,
                "last_name": s.last_name,
                "phone": s.phone,
                "status": s.status,
                "subscribed_at": s.subscribed_at.isoformat(),
            }
            for s in subs
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@email_marketing_router.post("/lists/{list_id}/subscribers")
async def add_subscriber(
    list_id: str,
    body: AddSubscriberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify list ownership
    list_result = await db.execute(
        select(EmailList).where(
            EmailList.id == list_id,
            EmailList.user_id == current_user.id,
        )
    )
    email_list = list_result.scalar_one_or_none()
    if not email_list:
        raise HTTPException(status_code=404, detail="List not found")

    # Check duplicate
    dup = await db.execute(
        select(EmailSubscriber).where(
            EmailSubscriber.list_id == list_id,
            EmailSubscriber.email == body.email,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Subscriber already exists in this list")

    sub = EmailSubscriber(
        user_id=current_user.id,
        list_id=list_id,
        email=body.email,
        first_name=body.first_name,
        last_name=body.last_name,
        phone=body.phone,
        contact_id=body.contact_id,
        custom_fields=json.dumps(body.custom_fields) if body.custom_fields else None,
    )
    db.add(sub)
    email_list.subscriber_count += 1
    await db.commit()
    await db.refresh(sub)
    return {"id": sub.id, "email": sub.email, "status": sub.status}


@email_marketing_router.post("/lists/{list_id}/import")
async def import_subscribers(
    list_id: str,
    body: ImportSubscribersRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    list_result = await db.execute(
        select(EmailList).where(
            EmailList.id == list_id,
            EmailList.user_id == current_user.id,
        )
    )
    email_list = list_result.scalar_one_or_none()
    if not email_list:
        raise HTTPException(status_code=404, detail="List not found")

    added = 0
    skipped = 0
    errors = 0

    for row in body.subscribers:
        email_addr = row.get("email", "").strip()
        if not email_addr:
            errors += 1
            continue

        dup = await db.execute(
            select(EmailSubscriber).where(
                EmailSubscriber.list_id == list_id,
                EmailSubscriber.email == email_addr,
            )
        )
        if dup.scalar_one_or_none():
            skipped += 1
            continue

        db.add(
            EmailSubscriber(
                user_id=current_user.id,
                list_id=list_id,
                email=email_addr,
                first_name=row.get("first_name"),
                last_name=row.get("last_name"),
                phone=row.get("phone"),
            )
        )
        added += 1

    email_list.subscriber_count += added
    await db.commit()
    return {"added": added, "skipped": skipped, "errors": errors}


@email_marketing_router.delete("/lists/{list_id}/subscribers/{sub_id}")
async def delete_subscriber(
    list_id: str,
    sub_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailSubscriber).where(
            EmailSubscriber.id == sub_id,
            EmailSubscriber.list_id == list_id,
            EmailSubscriber.user_id == current_user.id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscriber not found")

    # Decrement list count
    list_result = await db.execute(
        select(EmailList).where(EmailList.id == list_id)
    )
    email_list = list_result.scalar_one_or_none()
    if email_list and email_list.subscriber_count > 0:
        email_list.subscriber_count -= 1

    await db.delete(sub)
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# Template endpoints
# ═══════════════════════════════════════════════════════════════


@email_marketing_router.get("/templates")
async def list_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_default_templates(current_user.id, db)

    result = await db.execute(
        select(EmailTemplate)
        .where(EmailTemplate.user_id == current_user.id)
        .order_by(EmailTemplate.created_at.desc())
    )
    templates = result.scalars().all()
    return {
        "templates": [
            {
                "id": t.id,
                "name": t.name,
                "subject": t.subject,
                "preview_text": t.preview_text,
                "html_content": t.html_content,
                "plain_text": t.plain_text,
                "category": t.category,
                "is_default": t.is_default,
                "created_at": t.created_at.isoformat(),
                "updated_at": t.updated_at.isoformat(),
            }
            for t in templates
        ]
    }


@email_marketing_router.post("/templates")
async def create_template(
    body: CreateTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tpl = EmailTemplate(
        user_id=current_user.id,
        name=body.name,
        subject=body.subject,
        preview_text=body.preview_text,
        html_content=body.html_content,
        plain_text=body.plain_text,
        category=body.category,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return {"id": tpl.id, "name": tpl.name, "category": tpl.category}


@email_marketing_router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    body: UpdateTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.user_id == current_user.id,
        )
    )
    tpl = result.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    for field_name in ("name", "subject", "preview_text", "html_content", "plain_text", "category"):
        val = getattr(body, field_name, None)
        if val is not None:
            setattr(tpl, field_name, val)
    tpl.updated_at = datetime.utcnow()
    await db.commit()
    return {"success": True}


@email_marketing_router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailTemplate).where(
            EmailTemplate.id == template_id,
            EmailTemplate.user_id == current_user.id,
        )
    )
    tpl = result.scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(tpl)
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# Campaign endpoints
# ═══════════════════════════════════════════════════════════════


@email_marketing_router.get("/campaigns")
async def list_campaigns(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailCampaign)
        .where(EmailCampaign.user_id == current_user.id)
        .order_by(EmailCampaign.created_at.desc())
    )
    campaigns = result.scalars().all()
    return {
        "campaigns": [
            {
                "id": c.id,
                "name": c.name,
                "subject": c.subject,
                "status": c.status,
                "from_domain_id": c.from_domain_id,
                "list_id": c.list_id,
                "provider_used": c.provider_used,
                "scheduled_at": c.scheduled_at.isoformat() if c.scheduled_at else None,
                "sent_at": c.sent_at.isoformat() if c.sent_at else None,
                "total_sent": c.total_sent,
                "total_delivered": c.total_delivered,
                "total_opened": c.total_opened,
                "total_clicked": c.total_clicked,
                "total_bounced": c.total_bounced,
                "total_unsubscribed": c.total_unsubscribed,
                "created_at": c.created_at.isoformat(),
            }
            for c in campaigns
        ]
    }


@email_marketing_router.post("/campaigns")
async def create_campaign(
    body: CreateCampaignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    campaign = EmailCampaign(
        user_id=current_user.id,
        name=body.name,
        subject=body.subject,
        preview_text=body.preview_text,
        html_content=body.html_content,
        plain_text=body.plain_text or "",
        from_domain_id=body.from_domain_id,
        list_id=body.list_id,
    )
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return {"id": campaign.id, "name": campaign.name, "status": campaign.status}


async def _send_campaign_emails(campaign_id: str, user_id: int) -> None:
    """Background task: send emails for a campaign."""
    from rei.database import async_session_factory

    async with async_session_factory() as db:
        result = await db.execute(
            select(EmailCampaign).where(EmailCampaign.id == campaign_id)
        )
        campaign = result.scalar_one_or_none()
        if not campaign:
            return

        # Get domain
        dom_result = await db.execute(
            select(EmailDomain).where(EmailDomain.id == campaign.from_domain_id)
        )
        domain = dom_result.scalar_one_or_none()
        if not domain:
            return

        # Get subscribers
        subs_result = await db.execute(
            select(EmailSubscriber).where(
                EmailSubscriber.list_id == campaign.list_id,
                EmailSubscriber.status == "subscribed",
            )
        )
        subscribers = subs_result.scalars().all()

        # Get user for credit tracking
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            return

        campaign.status = "sending"
        await db.commit()

        sent_count = 0
        for sub in subscribers:
            unsub_url = _build_unsubscribe_url(sub.id)
            html = _append_canspam_footer(
                campaign.html_content, domain.from_name, unsub_url
            )

            req = EmailRequest(
                to_email=sub.email,
                to_name=f"{sub.first_name or ''} {sub.last_name or ''}".strip() or sub.email,
                from_email=domain.from_email,
                from_name=domain.from_name,
                subject=campaign.subject,
                html_content=html,
                plain_text=campaign.plain_text or "",
                metadata={
                    "campaign_id": campaign.id,
                    "subscriber_id": sub.id,
                    "unsubscribe_url": unsub_url,
                },
            )
            resp = await email_provider.send(req, settings)
            if resp.success:
                sent_count += 1
                user.email_credits_used += 1

        campaign.total_sent = sent_count
        campaign.status = "sent"
        campaign.sent_at = datetime.utcnow()
        await db.commit()


@email_marketing_router.post("/campaigns/{campaign_id}/send")
async def send_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailCampaign).where(
            EmailCampaign.id == campaign_id,
            EmailCampaign.user_id == current_user.id,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Validate domain is verified
    dom_result = await db.execute(
        select(EmailDomain).where(EmailDomain.id == campaign.from_domain_id)
    )
    domain = dom_result.scalar_one_or_none()
    if not domain or domain.status != "verified":
        raise HTTPException(status_code=400, detail="From domain is not verified")

    # Validate list has subscribers
    sub_count = await db.execute(
        select(func.count())
        .select_from(EmailSubscriber)
        .where(
            EmailSubscriber.list_id == campaign.list_id,
            EmailSubscriber.status == "subscribed",
        )
    )
    count = sub_count.scalar() or 0
    if count == 0:
        raise HTTPException(status_code=400, detail="List has no active subscribers")

    # Check email credits
    plan_limit = EMAIL_PLAN_LIMITS.get(current_user.plan, 5000)
    if current_user.email_credits_used + count > plan_limit:
        raise HTTPException(
            status_code=402,
            detail={
                "message": "Email credit limit exceeded",
                "limit": plan_limit,
                "used": current_user.email_credits_used,
                "needed": count,
                "overage_rate": f"${OVERAGE_RATE_PER_THOUSAND:.2f} per 1,000",
            },
        )

    campaign.provider_used = settings.email_provider
    await db.commit()

    background_tasks.add_task(_send_campaign_emails, campaign_id, current_user.id)
    return {"queued": count}


@email_marketing_router.post("/campaigns/{campaign_id}/schedule")
async def schedule_campaign(
    campaign_id: str,
    body: ScheduleCampaignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailCampaign).where(
            EmailCampaign.id == campaign_id,
            EmailCampaign.user_id == current_user.id,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    campaign.scheduled_at = datetime.fromisoformat(body.scheduled_at)
    campaign.status = "scheduled"
    await db.commit()
    return {"scheduled": True, "scheduled_at": campaign.scheduled_at.isoformat()}


@email_marketing_router.get("/campaigns/{campaign_id}/stats")
async def campaign_stats(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailCampaign).where(
            EmailCampaign.id == campaign_id,
            EmailCampaign.user_id == current_user.id,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    total = campaign.total_sent or 1
    return {
        "total_sent": campaign.total_sent,
        "total_delivered": campaign.total_delivered,
        "total_opened": campaign.total_opened,
        "total_clicked": campaign.total_clicked,
        "total_bounced": campaign.total_bounced,
        "total_unsubscribed": campaign.total_unsubscribed,
        "open_rate": round((campaign.total_opened / total) * 100, 1),
        "click_rate": round((campaign.total_clicked / total) * 100, 1),
        "unsubscribe_rate": round((campaign.total_unsubscribed / total) * 100, 2),
    }


@email_marketing_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(
    campaign_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailCampaign).where(
            EmailCampaign.id == campaign_id,
            EmailCampaign.user_id == current_user.id,
        )
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    await db.delete(campaign)
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# Sequence endpoints
# ═══════════════════════════════════════════════════════════════


@email_marketing_router.get("/sequences")
async def list_sequences(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailSequence)
        .where(EmailSequence.user_id == current_user.id)
        .order_by(EmailSequence.created_at.desc())
    )
    sequences = result.scalars().all()

    out = []
    for seq in sequences:
        step_count = await db.execute(
            select(func.count())
            .select_from(EmailSequenceStep)
            .where(EmailSequenceStep.sequence_id == seq.id)
        )
        enrollment_count = await db.execute(
            select(func.count())
            .select_from(EmailSequenceEnrollment)
            .where(EmailSequenceEnrollment.sequence_id == seq.id)
        )
        out.append(
            {
                "id": seq.id,
                "name": seq.name,
                "list_id": seq.list_id,
                "from_domain_id": seq.from_domain_id,
                "is_active": seq.is_active,
                "step_count": step_count.scalar() or 0,
                "enrollment_count": enrollment_count.scalar() or 0,
                "created_at": seq.created_at.isoformat(),
            }
        )
    return {"sequences": out}


@email_marketing_router.post("/sequences")
async def create_sequence(
    body: CreateSequenceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    seq = EmailSequence(
        user_id=current_user.id,
        name=body.name,
        list_id=body.list_id,
        from_domain_id=body.from_domain_id,
    )
    db.add(seq)
    await db.commit()
    await db.refresh(seq)
    return {"id": seq.id, "name": seq.name}


@email_marketing_router.post("/sequences/{sequence_id}/steps")
async def add_sequence_step(
    sequence_id: str,
    body: AddSequenceStepRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    seq_result = await db.execute(
        select(EmailSequence).where(
            EmailSequence.id == sequence_id,
            EmailSequence.user_id == current_user.id,
        )
    )
    if not seq_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Sequence not found")

    step = EmailSequenceStep(
        sequence_id=sequence_id,
        step_number=body.step_number,
        delay_days=body.delay_days,
        subject=body.subject,
        html_content=body.html_content,
        plain_text=body.plain_text,
    )
    db.add(step)
    await db.commit()
    await db.refresh(step)
    return {"id": step.id, "step_number": step.step_number}


@email_marketing_router.post("/sequences/{sequence_id}/activate")
async def activate_sequence(
    sequence_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EmailSequence).where(
            EmailSequence.id == sequence_id,
            EmailSequence.user_id == current_user.id,
        )
    )
    seq = result.scalar_one_or_none()
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found")

    seq.is_active = not seq.is_active
    await db.commit()
    return {"is_active": seq.is_active}


@email_marketing_router.post("/sequences/{sequence_id}/enroll")
async def enroll_subscriber(
    sequence_id: str,
    body: EnrollSubscriberRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify ownership
    seq_result = await db.execute(
        select(EmailSequence).where(
            EmailSequence.id == sequence_id,
            EmailSequence.user_id == current_user.id,
        )
    )
    seq = seq_result.scalar_one_or_none()
    if not seq:
        raise HTTPException(status_code=404, detail="Sequence not found")

    # Get first step to compute next_send_at
    first_step = await db.execute(
        select(EmailSequenceStep)
        .where(EmailSequenceStep.sequence_id == sequence_id)
        .order_by(EmailSequenceStep.step_number)
        .limit(1)
    )
    step = first_step.scalar_one_or_none()
    delay = step.delay_days if step else 0

    enrollment = EmailSequenceEnrollment(
        sequence_id=sequence_id,
        subscriber_id=body.subscriber_id,
        current_step=1,
        next_send_at=datetime.utcnow() + timedelta(days=delay),
    )
    db.add(enrollment)
    await db.commit()
    await db.refresh(enrollment)
    return {"id": enrollment.id, "status": enrollment.status}


# ═══════════════════════════════════════════════════════════════
# Usage endpoint
# ═══════════════════════════════════════════════════════════════


@email_marketing_router.get("/usage")
async def get_usage(
    current_user: User = Depends(get_current_user),
):
    plan_limit = EMAIL_PLAN_LIMITS.get(current_user.plan, 5000)
    used = current_user.email_credits_used
    return {
        "plan": current_user.plan,
        "limit": plan_limit,
        "used": used,
        "remaining": max(0, plan_limit - used),
        "resets_at": current_user.email_credits_reset_at.isoformat()
        if current_user.email_credits_reset_at
        else None,
        "overage_rate": "$1.50 per 1,000",
        "current_provider": settings.email_provider,
    }


# ═══════════════════════════════════════════════════════════════
# Webhook (no auth)
# ═══════════════════════════════════════════════════════════════


@email_marketing_router.post("/webhook/email")
async def email_webhook(request: Request):
    """Accept webhooks from both Resend and SendGrid."""
    try:
        payload = await request.json()
    except Exception:
        return {"ok": True}

    events = email_provider.parse_webhook(payload)

    from rei.database import async_session_factory

    async with async_session_factory() as db:
        for evt in events:
            # Update campaign stats
            if evt.campaign_id:
                camp_result = await db.execute(
                    select(EmailCampaign).where(EmailCampaign.id == evt.campaign_id)
                )
                campaign = camp_result.scalar_one_or_none()
                if campaign:
                    if evt.event_type == "delivered":
                        campaign.total_delivered += 1
                    elif evt.event_type == "opened":
                        campaign.total_opened += 1
                    elif evt.event_type == "clicked":
                        campaign.total_clicked += 1
                    elif evt.event_type == "bounced":
                        campaign.total_bounced += 1
                    elif evt.event_type == "unsubscribed":
                        campaign.total_unsubscribed += 1

            # Update subscriber status
            if evt.subscriber_id:
                sub_result = await db.execute(
                    select(EmailSubscriber).where(
                        EmailSubscriber.id == evt.subscriber_id
                    )
                )
                sub = sub_result.scalar_one_or_none()
                if sub:
                    if evt.event_type == "bounced":
                        sub.status = "bounced"
                    elif evt.event_type == "unsubscribed":
                        sub.status = "unsubscribed"
                        sub.unsubscribed_at = datetime.utcnow()
                    elif evt.event_type == "complained":
                        sub.status = "complained"

        await db.commit()

    return {"ok": True}


# ═══════════════════════════════════════════════════════════════
# Unsubscribe (no auth)
# ═══════════════════════════════════════════════════════════════


@email_marketing_router.get("/unsubscribe/{token}", response_class=HTMLResponse)
async def unsubscribe(token: str, sid: str = ""):
    """One-click unsubscribe handler."""
    if not sid or not _verify_unsubscribe_token(sid, token):
        return HTMLResponse(
            "<html><body><h2>Invalid or expired unsubscribe link.</h2></body></html>",
            status_code=400,
        )

    from rei.database import async_session_factory

    async with async_session_factory() as db:
        result = await db.execute(
            select(EmailSubscriber).where(EmailSubscriber.id == sid)
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.status = "unsubscribed"
            sub.unsubscribed_at = datetime.utcnow()
            await db.commit()

            # Get from_name for the confirmation page
            domain_result = await db.execute(
                select(EmailDomain).where(EmailDomain.user_id == sub.user_id).limit(1)
            )
            domain = domain_result.scalar_one_or_none()
            from_name = domain.from_name if domain else "this sender"
        else:
            from_name = "this sender"

    return HTMLResponse(
        f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:Arial,sans-serif;max-width:500px;margin:80px auto;text-align:center;">
  <h2>You have been successfully unsubscribed.</h2>
  <p>You will no longer receive emails from {from_name}.</p>
</body>
</html>"""
    )
