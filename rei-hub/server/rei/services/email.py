"""Transactional email service — sends via the configured email provider.

Uses the same adapter pattern as the marketing email system so that
switching providers (Resend ↔ SendGrid) is a single env-var change.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from rei.services.email_provider import EmailRequest, get_email_provider

if TYPE_CHECKING:
    from rei.config import Settings
    from rei.models.user import User

logger = logging.getLogger(__name__)


# ── Shared HTML template ────────────────────────────────────────────────


def _build_html(body_html: str) -> str:
    """Wrap body content in the shared email template."""
    return f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:24px;color:#1a1a2e;">REIFundamentals Hub</h1>
        </td></tr>
        <tr><td style="color:#333333;font-size:16px;line-height:1.6;">
          {body_html}
        </td></tr>
        <tr><td style="padding-top:32px;font-size:12px;color:#999999;">
          REIFundamentals Hub &middot; Unsubscribe
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _cta_button(text: str, url: str) -> str:
    """Return an HTML CTA button."""
    return (
        f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">'
        f"<tr><td>"
        f'<a href="{url}" style="display:inline-block;background-color:#1a1a2e;color:#ffffff;'
        f"text-decoration:none;font-size:16px;font-weight:bold;padding:12px 24px;"
        f'border-radius:6px;">{text}</a>'
        f"</td></tr></table>"
    )


def _format_date(dt) -> str:
    """Format a datetime for display in emails."""
    if dt is None:
        return "N/A"
    return dt.strftime("%B %d, %Y")


# ── Helpers ─────────────────────────────────────────────────────────────

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_tags(html: str) -> str:
    """Crude HTML → plain-text conversion for the plain_text field."""
    return _TAG_RE.sub("", html).strip()


# ── Core send function ──────────────────────────────────────────────────


async def send_email(
    to_email: str,
    to_name: str,
    subject: str,
    html_content: str,
    settings: Settings,
) -> bool:
    """Send a transactional email via the configured provider.

    Uses the same adapter as the marketing email system so switching
    between Resend and SendGrid is a single env-var change.
    Returns True on success, False on failure.
    """
    # Check that at least one provider key is configured
    has_key = bool(
        (settings.email_provider == "resend" and settings.resend_api_key)
        or (settings.email_provider == "sendgrid" and settings.sendgrid_api_key)
    )
    if not has_key:
        logger.info("Email provider not configured, skipping send to %s", to_email)
        return True

    try:
        provider = get_email_provider(settings)
        request = EmailRequest(
            to_email=to_email,
            to_name=to_name or "",
            from_email=settings.email_from,
            from_name=settings.email_from_name,
            subject=subject,
            html_content=html_content,
            plain_text=_strip_tags(html_content),
            metadata={},
        )
        response = await provider.send(request, settings)
        if response.success:
            logger.info("Email sent to %s: %s (via %s)", to_email, subject, response.provider)
            return True
        logger.error("Email send failed for %s: %s", to_email, response.error)
        return False
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False


# ── Template-aware helper ──────────────────────────────────────────────


async def _send_with_template(
    template_type: str,
    to_email: str,
    to_name: str,
    variables: dict,
    default_subject: str,
    default_body: str,
    cta_text: str,
    cta_url: str,
    settings: Settings,
    db=None,
) -> bool:
    """Send an email, checking for a custom template first.

    If a custom template exists and is active, it's used instead of the
    hardcoded default. Otherwise falls back to default_subject/default_body.
    """
    subject = default_subject
    body_html = default_body

    if db:
        try:
            from rei.services.email_template_service import render_template

            custom = await render_template(template_type, db, variables)
            if custom:
                subject = custom["subject"]
                body_html = custom["body_html"]
                # Custom templates may override CTA
                if custom.get("cta_text"):
                    cta_text = custom["cta_text"]
                if custom.get("cta_url"):
                    cta_url = custom["cta_url"]
        except Exception:
            logger.warning("Failed to load custom template %s, using default", template_type)

    cta_html = _cta_button(cta_text, cta_url) if cta_text and cta_url else ""
    return await send_email(
        to_email=to_email,
        to_name=to_name,
        subject=subject,
        html_content=_build_html(body_html + cta_html),
        settings=settings,
    )


# ── Specific email functions ────────────────────────────────────────────


async def send_welcome_email(user: User, settings: Settings, db=None) -> bool:
    """Welcome email sent after registration."""
    name = user.full_name or user.email
    trial_date = _format_date(user.trial_ends_at)
    hub_url = settings.hub_url

    return await _send_with_template(
        template_type="welcome",
        to_email=user.email,
        to_name=name,
        variables={"name": name, "trial_date": trial_date, "hub_url": hub_url},
        default_subject="Welcome to REIFundamentals Hub — your 7-day trial has started",
        default_body=(
            f"<p>Hi {name},</p>"
            f"<p>Your free trial is active until <strong>{trial_date}</strong>.</p>"
            f"<p>Explore your pipeline, contacts, markets, and portfolio tools.</p>"
            f"<p>When ready, upgrade at any time from the Billing page.</p>"
        ),
        cta_text="Go to Dashboard",
        cta_url=f"{hub_url}/pipeline",
        settings=settings,
        db=db,
    )


async def send_trial_ending_email(user: User, settings: Settings, db=None) -> bool:
    """Reminder sent 3 days before trial expires."""
    name = user.full_name or user.email
    trial_date = _format_date(user.trial_ends_at)
    hub_url = settings.hub_url

    return await _send_with_template(
        template_type="trial_ending",
        to_email=user.email,
        to_name=name,
        variables={"name": name, "trial_date": trial_date, "hub_url": hub_url},
        default_subject="Your REIFundamentals Hub trial ends in 3 days",
        default_body=(
            f"<p>Hi {name},</p>"
            f"<p>Your trial ends on <strong>{trial_date}</strong>.</p>"
            f"<p>To keep access upgrade before then.</p>"
        ),
        cta_text="Upgrade Now",
        cta_url=f"{hub_url}/billing",
        settings=settings,
        db=db,
    )


async def send_subscription_active_email(user: User, settings: Settings, db=None) -> bool:
    """Confirmation after successful checkout."""
    name = user.full_name or user.email
    plan = user.plan or "starter"
    interval = user.billing_interval or "monthly"
    hub_url = settings.hub_url

    return await _send_with_template(
        template_type="subscription_active",
        to_email=user.email,
        to_name=name,
        variables={"name": name, "plan": plan, "interval": interval, "hub_url": hub_url},
        default_subject=f"You're now subscribed to REIFundamentals Hub {plan} plan",
        default_body=(
            f"<p>Hi {name},</p>"
            f"<p>Your <strong>{plan}</strong> subscription is now active.</p>"
            f"<p>Billing interval: {interval}.</p>"
        ),
        cta_text="Go to Dashboard",
        cta_url=f"{hub_url}/pipeline",
        settings=settings,
        db=db,
    )


async def send_payment_failed_email(user: User, settings: Settings, db=None) -> bool:
    """Alert when a payment fails."""
    name = user.full_name or user.email
    hub_url = settings.hub_url

    return await _send_with_template(
        template_type="payment_failed",
        to_email=user.email,
        to_name=name,
        variables={"name": name, "hub_url": hub_url},
        default_subject="Action required — payment failed for REIFundamentals Hub",
        default_body=(
            f"<p>Hi {name},</p>"
            f"<p>We couldn't process your payment.</p>"
            f"<p>Please update your billing info to avoid losing access.</p>"
        ),
        cta_text="Update Billing",
        cta_url=f"{hub_url}/billing",
        settings=settings,
        db=db,
    )


async def send_ai_usage_reminder_email(
    to_email: str,
    full_name: str,
    pct_used: int,
    plan: str,
    settings: Settings,
    db=None,
) -> bool:
    """Send a reminder when AI usage hits 75%, 90%, or 95% of the monthly allowance."""
    name = full_name or to_email
    pct_remaining = 100 - pct_used
    hub_url = settings.hub_url

    return await _send_with_template(
        template_type="ai_usage_reminder",
        to_email=to_email,
        to_name=name,
        variables={
            "name": name, "pct_used": str(pct_used),
            "pct_remaining": str(pct_remaining), "plan": plan, "hub_url": hub_url,
        },
        default_subject=f"AI usage alert — {pct_remaining}% of your monthly allowance remaining",
        default_body=(
            f"<p>Hi {name},</p>"
            f"<p>You've used <strong>{pct_used}%</strong> of your monthly AI allowance "
            f"on the <strong>{plan}</strong> plan — only {pct_remaining}% remaining.</p>"
            f"<p>When your allowance runs out, AI requests will draw from your universal "
            f"credits (with a small markup). To avoid running out entirely:</p>"
            f"<p><strong>Option 1:</strong> Buy credits — works for AI, phone, SMS, and fax<br>"
            f"<strong>Option 2:</strong> Link your own API keys in Settings &gt; AI Provider "
            f"— they'll kick in automatically as a free fallback when credits are exhausted</p>"
        ),
        cta_text="Buy Credits",
        cta_url=f"{hub_url}/billing",
        settings=settings,
        db=db,
    )


async def send_subscription_canceled_email(user: User, settings: Settings, db=None) -> bool:
    """Notification when a subscription is canceled."""
    name = user.full_name or user.email
    hub_url = settings.hub_url

    return await _send_with_template(
        template_type="subscription_canceled",
        to_email=user.email,
        to_name=name,
        variables={"name": name, "hub_url": hub_url},
        default_subject="Your REIFundamentals Hub subscription has been canceled",
        default_body=(
            f"<p>Hi {name},</p>"
            f"<p>Your subscription has been canceled.</p>"
            f"<p>You can reactivate at any time from the billing page.</p>"
        ),
        cta_text="Reactivate",
        cta_url=f"{hub_url}/billing",
        settings=settings,
        db=db,
    )


# ── Proof of Funds request emails ─────────────────────────────────────


async def send_pof_request_email(
    buyer_email: str,
    buyer_name: str,
    requestor_name: str,
    property_address: str,
    required_amount: float,
    request_link: str,
    expires_at: str,
    settings: Settings,
    db=None,
) -> bool:
    """Email sent to a buyer requesting proof of funds."""
    return await _send_with_template(
        template_type="pof_request",
        to_email=buyer_email,
        to_name=buyer_name,
        variables={
            "buyer_name": buyer_name, "requestor_name": requestor_name,
            "property_address": property_address, "verify_url": request_link,
        },
        default_subject=f"{requestor_name} is requesting Proof of Funds",
        default_body=(
            f"<p>Hi {buyer_name},</p>"
            f"<p><strong>{requestor_name}</strong> is requesting proof of funds "
            f"for the following property:</p>"
            f"<p style=\"margin-left:16px;\">"
            f"<strong>Property:</strong> {property_address}<br>"
            f"<strong>Required Amount:</strong> ${required_amount:,.0f}"
            f"</p>"
            f"<p>Click below to securely verify your bank balance via Plaid. "
            f"You do not need a REI Hub account.</p>"
            f"<p style=\"margin-top:24px;font-size:13px;color:#666666;\">"
            f"This link expires in 72 hours ({expires_at}).</p>"
        ),
        cta_text="Verify My Funds",
        cta_url=request_link,
        settings=settings,
        db=db,
    )


async def send_pof_completed_email(
    requestor_email: str,
    requestor_name: str,
    buyer_name: str,
    property_address: str,
    verified_amount_display: str,
    certificate_link: str,
    settings: Settings,
    db=None,
) -> bool:
    """Email sent to the requestor when buyer completes POF verification."""
    return await _send_with_template(
        template_type="pof_completed",
        to_email=requestor_email,
        to_name=requestor_name,
        variables={
            "requestor_name": requestor_name, "buyer_name": buyer_name,
            "property_address": property_address,
            "verified_amount": verified_amount_display,
            "certificate_url": certificate_link,
        },
        default_subject=f"Proof of Funds Verified \u2014 {buyer_name}",
        default_body=(
            f"<p>Hi {requestor_name},</p>"
            f"<p><strong>{buyer_name}</strong> has verified their proof of funds.</p>"
            f"<p style=\"margin-left:16px;\">"
            f"<strong>Property:</strong> {property_address}<br>"
            f"<strong>{verified_amount_display}</strong>"
            f"</p>"
            f"<p>View the full certificate in your REI Hub dashboard.</p>"
        ),
        cta_text="View Certificate",
        cta_url=certificate_link,
        settings=settings,
        db=db,
    )


# ── Lead Capture Notifications ─────────────────────────────────────────


async def send_lead_notification_email(
    to_email: str,
    to_name: str,
    lead_name: str,
    lead_email: str,
    lead_phone: str,
    lead_address: str,
    site_name: str,
    settings: Settings,
    db=None,
) -> bool:
    """Notify the site owner when a new lead submits a form."""
    details = []
    if lead_name:
        details.append(f"<strong>Name:</strong> {lead_name}")
    if lead_email:
        details.append(f"<strong>Email:</strong> {lead_email}")
    if lead_phone:
        details.append(f"<strong>Phone:</strong> {lead_phone}")
    if lead_address:
        details.append(f"<strong>Address:</strong> {lead_address}")
    details_html = "<br>".join(details) if details else "<em>No details provided</em>"

    hub_url = settings.hub_url

    return await _send_with_template(
        template_type="lead_notification",
        to_email=to_email,
        to_name=to_name or "",
        variables={
            "owner_name": to_name or "there", "lead_name": lead_name or "",
            "lead_email": lead_email or "", "lead_phone": lead_phone or "",
            "lead_address": lead_address or "", "site_name": site_name, "hub_url": hub_url,
        },
        default_subject=f"New Lead from {site_name}",
        default_body=(
            f"<p>Hi {to_name or 'there'},</p>"
            f"<p>You have a <strong>new lead</strong> from your site "
            f"<strong>{site_name}</strong>!</p>"
            f'<div style="background:#f8fafc;border:1px solid #e2e8f0;'
            f'border-radius:8px;padding:16px;margin:16px 0;">'
            f"{details_html}"
            f"</div>"
            f"<p>Log in to your dashboard to follow up.</p>"
        ),
        cta_text="View in CRM",
        cta_url=f"{hub_url}/contacts",
        settings=settings,
        db=db,
    )


# ── Buyer Match Notifications ──────────────────────────────────────────


async def send_buyer_match_notification(
    buyer_email: str,
    buyer_name: str,
    deal: "CrmDeal",  # noqa: F821  — imported lazily to avoid circular
    settings: Settings,
    db=None,
) -> bool:
    """Notify a buyer that a deal matching their criteria is now under contract."""
    address = deal.address or "Unknown address"
    city = deal.city or ""
    state = deal.state or ""
    location = f"{city}, {state}".strip(", ") if city or state else ""

    price = deal.purchase_price or deal.asking_price or deal.offer_price
    price_str = f"${price:,.0f}" if price else "TBD"
    prop_type = (deal.property_type or "Property").replace("_", " ").title()
    condition = (getattr(deal, "property_condition", None) or "").replace("_", " ").title()

    details = [
        f"<strong>Address:</strong> {address}",
    ]
    if location:
        details.append(f"<strong>Location:</strong> {location}")
    details.append(f"<strong>Price:</strong> {price_str}")
    details.append(f"<strong>Type:</strong> {prop_type}")
    if condition:
        details.append(f"<strong>Condition:</strong> {condition}")

    beds = getattr(deal, "bedrooms", None)
    baths = getattr(deal, "bathrooms", None)
    sqft = getattr(deal, "square_footage", None)
    specs = []
    if beds:
        specs.append(f"{beds} bed")
    if baths:
        specs.append(f"{baths} bath")
    if sqft:
        specs.append(f"{sqft:,} sqft")
    if specs:
        details.append(f"<strong>Details:</strong> {' / '.join(specs)}")

    details_html = "<br>".join(details)
    hub_url = settings.hub_url

    return await _send_with_template(
        template_type="buyer_match",
        to_email=buyer_email,
        to_name=buyer_name or "",
        variables={
            "buyer_name": buyer_name or "there",
            "property_address": address, "price": price_str,
            "property_type": prop_type, "hub_url": hub_url,
        },
        default_subject=f"Deal Match: {address} ({price_str}) — Under Contract",
        default_body=(
            f"<p>Hi {buyer_name or 'there'},</p>"
            f"<p>Great news! A new deal that matches your buying criteria "
            f"is now <strong>under contract</strong>:</p>"
            f'<div style="background:#f0fdf4;border:1px solid #bbf7d0;'
            f'border-radius:8px;padding:16px;margin:16px 0;">'
            f"{details_html}"
            f"</div>"
            f"<p>If you're interested in this property, please reach out "
            f"as soon as possible to discuss next steps.</p>"
            f"<p style='color:#64748b;font-size:13px;margin-top:24px;'>"
            f"You're receiving this because your buyer criteria matched this deal. "
            f"Contact us to update your preferences.</p>"
        ),
        cta_text="View Details",
        cta_url=f"{hub_url}/pipeline",
        settings=settings,
        db=db,
    )
