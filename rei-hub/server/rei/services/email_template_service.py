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
    # ── Negotiations ─────────────────────────────────────────────────────
    "negotiation_request_confirmation": {
        "display_name": "Request Received",
        "category": "Negotiations",
        "description": "Sent to the user when they submit a new negotiation request.",
        "subject": "Negotiation Request Received",
        "body_html": (
            "<p>Hi {{user_name}},</p>"
            "<p>We've received your negotiation request for the following property:</p>"
            '<div style="background:#f8f9fa;padding:12px;border-radius:6px;margin:16px 0;">'
            "<strong>Property:</strong> {{property_address}}<br>"
            "<strong>Services Requested:</strong> {{service_types}}"
            "</div>"
            "<p>Our team will review your request and get back to you shortly with next steps.</p>"
            "<p>Thank you for choosing REIFundamentals!</p>"
        ),
        "variables": ["user_name", "property_address", "service_types", "hub_url"],
        "cta_text": "View Your Deals",
        "cta_url_template": "{{hub_url}}/pipeline",
    },
    "negotiation_request_accepted": {
        "display_name": "Request Accepted",
        "category": "Negotiations",
        "description": "Sent when admin accepts the negotiation request.",
        "subject": "Negotiation Request Accepted",
        "body_html": (
            "<p>Hi there,</p>"
            "<p>Your negotiation request (ID: <strong>{{request_id}}</strong>) "
            "has been <strong>accepted and approved</strong>.</p>"
            "<p>Our team will begin creating cases and starting work on your request. "
            "You'll receive updates as we progress.</p>"
            "<p>Thank you for choosing REIFundamentals!</p>"
        ),
        "variables": ["request_id", "hub_url"],
        "cta_text": "View Your Negotiations",
        "cta_url_template": "{{hub_url}}/pipeline",
    },
    "negotiation_request_info_needed": {
        "display_name": "More Info Needed",
        "category": "Negotiations",
        "description": "Sent when admin needs more information before proceeding.",
        "subject": "More Information Needed for Your Negotiation Request",
        "body_html": (
            "<p>Hi there,</p>"
            "<p>Your negotiation request (ID: <strong>{{request_id}}</strong>) "
            "has been received, but we need more information before we can proceed.</p>"
            "<p>Please log in to your dashboard and check the messages on your deal "
            "to see what additional details our team has requested.</p>"
            "<p>Once we receive your information, we'll proceed with your request.</p>"
        ),
        "variables": ["request_id", "hub_url"],
        "cta_text": "View Details",
        "cta_url_template": "{{hub_url}}/pipeline",
    },
    "negotiation_request_declined": {
        "display_name": "Request Declined",
        "category": "Negotiations",
        "description": "Sent when admin declines the negotiation request.",
        "subject": "Negotiation Request Update",
        "body_html": (
            "<p>Hi there,</p>"
            "<p>Your negotiation request (ID: <strong>{{request_id}}</strong>) "
            "has been received, but unfortunately could not be processed at this time.</p>"
            "<p>If you believe this was in error or have questions, please reach out "
            "to our support team for further assistance.</p>"
        ),
        "variables": ["request_id", "hub_url"],
        "cta_text": "Contact Support",
        "cta_url_template": "{{hub_url}}/pipeline",
    },
    "negotiation_case_update": {
        "display_name": "Case Activity Update",
        "category": "Negotiations",
        "description": "Sent when admin logs a new activity on a case (AI-sanitized summary).",
        "subject": "Case Update",
        "body_html": (
            "<p>Hi there,</p>"
            "<p>There's a new update on your negotiation case "
            "(ID: <strong>{{case_id}}</strong>):</p>"
            '<div style="background:#f8f9fa;padding:16px;border-radius:6px;'
            'margin:16px 0;line-height:1.6;">'
            "{{user_summary}}"
            "</div>"
            "<p>Log in to your dashboard to see the full details and reply if needed.</p>"
            "<p>Thank you for choosing REIFundamentals!</p>"
        ),
        "variables": ["case_id", "user_summary", "hub_url"],
        "cta_text": "View Case",
        "cta_url_template": "{{hub_url}}/pipeline",
    },
    "negotiation_tracking_update": {
        "display_name": "Tracking Status Update",
        "category": "Negotiations",
        "description": "Sent when USPS tracking status changes (delivered, returned, etc.).",
        "subject": "Tracking Update — {{tracking_status}}",
        "body_html": (
            "<p>Hi there,</p>"
            "<p>The tracking status for your negotiation case "
            "(ID: <strong>{{case_id}}</strong>) has been updated:</p>"
            '<div style="background:#f8f9fa;padding:16px;border-radius:6px;margin:16px 0;">'
            "<strong>Current Status:</strong> {{tracking_status}}<br>"
            "<strong>Case Reference:</strong> {{case_id}}"
            "</div>"
            "<p>Log in to your dashboard to view more details about your case.</p>"
            "<p>Thank you for using REIFundamentals!</p>"
        ),
        "variables": ["case_id", "tracking_status", "hub_url"],
        "cta_text": "View Case",
        "cta_url_template": "{{hub_url}}/pipeline",
    },
    "negotiation_new_message": {
        "display_name": "New Message",
        "category": "Negotiations",
        "description": "Sent when admin sends a chat message on a case.",
        "subject": "New Message on Your Case",
        "body_html": (
            "<p>Hi there,</p>"
            "<p>You have a new message regarding your negotiation case "
            "(ID: <strong>{{case_id}}</strong>).</p>"
            "<p>Log in to your dashboard to view and reply to your message.</p>"
            "<p>Thank you for using REIFundamentals!</p>"
        ),
        "variables": ["case_id", "hub_url"],
        "cta_text": "View Messages",
        "cta_url_template": "{{hub_url}}/pipeline",
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
    # Negotiation variables
    "user_name": "Alex Chen",
    "service_types": "Bank/Mortgage, County Tax",
    "request_id": "abc12345",
    "case_id": "def67890",
    "user_summary": "Correspondence was sent to the bank's loss mitigation department via certified mail. We are currently awaiting a formal response, which is expected within 30 business days.",
    "tracking_status": "Delivered",
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
