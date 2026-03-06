"""Email template service — CRUD for custom templates + rendering with fallback to defaults."""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.email_template import AdminEmailTemplate

logger = logging.getLogger(__name__)

# ── Default templates (extracted from hardcoded email.py) ─────────────────
# These serve as fallbacks when no custom template exists in the DB,
# and as the "Reset to Default" source in the admin UI.

DEFAULT_TEMPLATES: dict[str, dict] = {
    "welcome": {
        "display_name": "Welcome Email",
        "category": "Onboarding",
        "description": "Sent after a new user registers and starts their 7-day trial.",
        "subject": "Welcome to REIFundamentals Hub — your 7-day trial has started",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p>Your free trial is active until <strong>{{trial_date}}</strong>.</p>"
            "<p>Explore your pipeline, contacts, markets, and portfolio tools.</p>"
            "<p>When ready, upgrade at any time from the Billing page.</p>"
        ),
        "variables": ["name", "trial_date", "hub_url"],
        "cta_text": "Go to Dashboard",
        "cta_url_template": "{{hub_url}}/pipeline",
    },
    "trial_ending": {
        "display_name": "Trial Ending Reminder",
        "category": "Onboarding",
        "description": "Sent 3 days before the trial expires.",
        "subject": "Your REIFundamentals Hub trial ends in 3 days",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p>Your trial ends on <strong>{{trial_date}}</strong>.</p>"
            "<p>To keep access upgrade before then.</p>"
        ),
        "variables": ["name", "trial_date", "hub_url"],
        "cta_text": "Upgrade Now",
        "cta_url_template": "{{hub_url}}/billing",
    },
    "subscription_active": {
        "display_name": "Subscription Confirmed",
        "category": "Billing",
        "description": "Sent after successful checkout.",
        "subject": "You're now subscribed to REIFundamentals Hub {{plan}} plan",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p>Your <strong>{{plan}}</strong> subscription is now active.</p>"
            "<p>Billing interval: {{interval}}.</p>"
        ),
        "variables": ["name", "plan", "interval", "hub_url"],
        "cta_text": "Go to Dashboard",
        "cta_url_template": "{{hub_url}}/pipeline",
    },
    "payment_failed": {
        "display_name": "Payment Failed",
        "category": "Billing",
        "description": "Sent when a recurring payment fails.",
        "subject": "Action required — payment failed for REIFundamentals Hub",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p>We couldn't process your payment.</p>"
            "<p>Please update your billing info to avoid losing access.</p>"
        ),
        "variables": ["name", "hub_url"],
        "cta_text": "Update Billing",
        "cta_url_template": "{{hub_url}}/billing",
    },
    "ai_usage_reminder": {
        "display_name": "AI Usage Alert",
        "category": "AI Credits",
        "description": "Sent when AI usage reaches 75%, 90%, or 95% of the monthly allowance.",
        "subject": "AI usage alert — {{pct_remaining}}% of your monthly allowance remaining",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p>You've used <strong>{{pct_used}}%</strong> of your monthly AI allowance "
            "on the <strong>{{plan}}</strong> plan — only {{pct_remaining}}% remaining.</p>"
            "<p>When your allowance runs out, AI requests will draw from your universal "
            "credits (with a small markup). To avoid running out entirely:</p>"
            "<p><strong>Option 1:</strong> Buy credits — works for AI, phone, SMS, and fax<br>"
            "<strong>Option 2:</strong> Link your own API keys in Settings &gt; AI Provider "
            "— they'll kick in automatically as a free fallback when credits are exhausted</p>"
        ),
        "variables": ["name", "pct_used", "pct_remaining", "plan", "hub_url"],
        "cta_text": "Buy Credits",
        "cta_url_template": "{{hub_url}}/billing",
    },
    "subscription_canceled": {
        "display_name": "Subscription Canceled",
        "category": "Billing",
        "description": "Sent when a subscription is canceled.",
        "subject": "Your REIFundamentals Hub subscription has been canceled",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p>Your subscription has been canceled.</p>"
            "<p>You can reactivate at any time from the billing page.</p>"
        ),
        "variables": ["name", "hub_url"],
        "cta_text": "Reactivate",
        "cta_url_template": "{{hub_url}}/billing",
    },
    "pof_request": {
        "display_name": "Proof of Funds Request",
        "category": "Leads",
        "description": "Sent to a buyer requesting proof of funds verification.",
        "subject": "Proof of Funds request for {{property_address}}",
        "body_html": (
            "<p>Hi {{buyer_name}},</p>"
            "<p><strong>{{requestor_name}}</strong> has requested proof of funds "
            "for the property at <strong>{{property_address}}</strong>.</p>"
            "<p>Click the button below to securely verify your funds via Plaid. "
            "This link expires in 72 hours.</p>"
        ),
        "variables": ["buyer_name", "requestor_name", "property_address", "verify_url"],
        "cta_text": "Verify Funds",
        "cta_url_template": "{{verify_url}}",
    },
    "pof_completed": {
        "display_name": "Proof of Funds Completed",
        "category": "Leads",
        "description": "Sent to the requestor when a buyer completes POF verification.",
        "subject": "Proof of Funds verified for {{property_address}}",
        "body_html": (
            "<p>Hi {{requestor_name}},</p>"
            "<p><strong>{{buyer_name}}</strong> has verified proof of funds for "
            "<strong>{{property_address}}</strong>.</p>"
            "<p>Verified amount: <strong>{{verified_amount}}</strong></p>"
        ),
        "variables": [
            "requestor_name", "buyer_name", "property_address",
            "verified_amount", "certificate_url",
        ],
        "cta_text": "View Certificate",
        "cta_url_template": "{{certificate_url}}",
    },
    "lead_notification": {
        "display_name": "New Lead Notification",
        "category": "Leads",
        "description": "Sent to the site owner when a new lead submits a form.",
        "subject": "New lead from {{site_name}}: {{lead_name}}",
        "body_html": (
            "<p>Hi {{owner_name}},</p>"
            "<p>A new lead just submitted a form on <strong>{{site_name}}</strong>:</p>"
            "<p><strong>Name:</strong> {{lead_name}}<br>"
            "<strong>Email:</strong> {{lead_email}}<br>"
            "<strong>Phone:</strong> {{lead_phone}}<br>"
            "<strong>Address:</strong> {{lead_address}}</p>"
        ),
        "variables": [
            "owner_name", "lead_name", "lead_email", "lead_phone",
            "lead_address", "site_name", "hub_url",
        ],
        "cta_text": "View in CRM",
        "cta_url_template": "{{hub_url}}/contacts",
    },
    "buyer_match": {
        "display_name": "Buyer Match Notification",
        "category": "Leads",
        "description": "Sent when a deal matches a buyer's criteria.",
        "subject": "New property match: {{property_address}}",
        "body_html": (
            "<p>Hi {{buyer_name}},</p>"
            "<p>A property matching your criteria is now under contract:</p>"
            "<p><strong>Address:</strong> {{property_address}}<br>"
            "<strong>Price:</strong> {{price}}<br>"
            "<strong>Type:</strong> {{property_type}}</p>"
        ),
        "variables": ["buyer_name", "property_address", "price", "property_type", "hub_url"],
        "cta_text": "View Details",
        "cta_url_template": "{{hub_url}}/pipeline",
    },
    "phone_credits_low": {
        "display_name": "Phone & SMS Credits Low",
        "category": "Billing",
        "description": "Sent when phone/SMS credits drop below a warning threshold.",
        "subject": "Your phone & SMS credits are running low — {{credits_remaining}} remaining",
        "body_html": (
            "<p>Hi {{name}},</p>"
            "<p>Your phone &amp; SMS credit balance is down to "
            "<strong>{{credits_remaining}}</strong>.</p>"
            "<p>These credits are used for phone calls, SMS messages, fax, "
            "and AI usage when your plan allowance is exhausted.</p>"
            "<p>Top up now to avoid any interruption in service.</p>"
        ),
        "variables": ["name", "credits_remaining", "hub_url"],
        "cta_text": "Buy Credits",
        "cta_url_template": "{{hub_url}}/billing",
    },
}

# Sample data for previews and test emails
SAMPLE_VARIABLES: dict[str, str] = {
    "name": "Alex Chen",
    "trial_date": "March 15, 2026",
    "hub_url": "https://hub.reifundamentalshub.com",
    "plan": "pro",
    "interval": "monthly",
    "pct_used": "90",
    "pct_remaining": "10",
    "buyer_name": "Sarah Martinez",
    "requestor_name": "Alex Chen",
    "property_address": "123 Main St, Dallas, TX 75001",
    "verify_url": "https://hub.reifundamentalshub.com/verify/abc123",
    "verified_amount": "$150,000",
    "certificate_url": "https://hub.reifundamentalshub.com/pof/cert/abc123",
    "owner_name": "Alex Chen",
    "lead_name": "John Wilson",
    "lead_email": "john@example.com",
    "lead_phone": "(555) 123-4567",
    "lead_address": "456 Oak Ave, Fort Worth, TX 76102",
    "site_name": "DFW Cash Home Buyers",
    "price": "$185,000",
    "property_type": "Single Family",
    "credits_remaining": "$4.50",
}


# ── Variable substitution ─────────────────────────────────────────────────

_VAR_RE = re.compile(r"\{\{(\w+)\}\}")


def _substitute(text: str, variables: dict[str, str]) -> str:
    """Replace {{variable}} placeholders with values from the dict."""
    def _replacer(match):
        key = match.group(1)
        return str(variables.get(key, match.group(0)))
    return _VAR_RE.sub(_replacer, text)


# ── CRUD functions ────────────────────────────────────────────────────────


async def get_all_template_statuses(db: AsyncSession) -> list[dict]:
    """Return all template types with their current content and status.

    Includes custom templates from the DB merged with defaults for any
    types that don't have a custom version yet.
    """
    # Fetch all custom templates
    result = await db.execute(select(AdminEmailTemplate))
    custom_map: dict[str, AdminEmailTemplate] = {}
    for row in result.scalars().all():
        custom_map[row.template_type] = row

    statuses = []
    for slug, default in DEFAULT_TEMPLATES.items():
        custom = custom_map.get(slug)
        statuses.append({
            "template_type": slug,
            "display_name": default["display_name"],
            "category": default["category"],
            "description": default["description"],
            "variables": default["variables"],
            "cta_text": default.get("cta_text", ""),
            "cta_url_template": default.get("cta_url_template", ""),
            "is_custom": custom is not None and custom.is_active,
            "subject": custom.subject if custom and custom.is_active else default["subject"],
            "body_html": custom.body_html if custom and custom.is_active else default["body_html"],
            "updated_at": custom.updated_at.isoformat() if custom else None,
        })
    return statuses


async def get_template(db: AsyncSession, template_type: str) -> Optional[AdminEmailTemplate]:
    """Fetch a custom template by type, or None if not customized."""
    result = await db.execute(
        select(AdminEmailTemplate).where(AdminEmailTemplate.template_type == template_type)
    )
    return result.scalar_one_or_none()


async def save_template(
    db: AsyncSession,
    template_type: str,
    subject: str,
    body_html: str,
    user_id: int,
) -> AdminEmailTemplate:
    """Create or update a custom template."""
    if template_type not in DEFAULT_TEMPLATES:
        raise ValueError(f"Unknown template type: {template_type}")

    existing = await get_template(db, template_type)
    if existing:
        existing.subject = subject
        existing.body_html = body_html
        existing.is_active = True
        existing.last_updated_by = user_id
        existing.updated_at = datetime.utcnow()
        await db.commit()
        return existing
    else:
        template = AdminEmailTemplate(
            template_type=template_type,
            subject=subject,
            body_html=body_html,
            is_active=True,
            last_updated_by=user_id,
        )
        db.add(template)
        await db.commit()
        await db.refresh(template)
        return template


async def delete_template(db: AsyncSession, template_type: str) -> bool:
    """Remove a custom template (reverts to default)."""
    existing = await get_template(db, template_type)
    if existing:
        await db.delete(existing)
        await db.commit()
        return True
    return False


async def render_template(
    template_type: str,
    db: AsyncSession,
    variables: dict[str, str],
) -> Optional[dict[str, str]]:
    """Render a template with variable substitution.

    Checks for an active custom template first; returns None if no custom
    template exists (caller should fall back to hardcoded default).
    """
    custom = await get_template(db, template_type)
    if not custom or not custom.is_active:
        return None

    default = DEFAULT_TEMPLATES.get(template_type, {})
    cta_text = default.get("cta_text", "")
    cta_url = _substitute(default.get("cta_url_template", ""), variables)

    return {
        "subject": _substitute(custom.subject, variables),
        "body_html": _substitute(custom.body_html, variables),
        "cta_text": cta_text,
        "cta_url": cta_url,
    }


def render_default(template_type: str, variables: dict[str, str]) -> Optional[dict[str, str]]:
    """Render the hardcoded default template (no DB needed)."""
    default = DEFAULT_TEMPLATES.get(template_type)
    if not default:
        return None
    return {
        "subject": _substitute(default["subject"], variables),
        "body_html": _substitute(default["body_html"], variables),
        "cta_text": default.get("cta_text", ""),
        "cta_url": _substitute(default.get("cta_url_template", ""), variables),
    }


def render_preview(
    subject: str,
    body_html: str,
    template_type: str,
) -> dict[str, str]:
    """Render a template with sample data for live preview."""
    return {
        "subject": _substitute(subject, SAMPLE_VARIABLES),
        "body_html": _substitute(body_html, SAMPLE_VARIABLES),
    }
