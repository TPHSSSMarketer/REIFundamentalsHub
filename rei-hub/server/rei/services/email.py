"""Transactional email service — sends via SendGrid HTTP API using httpx."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from rei.config import Settings
    from rei.models.user import User

logger = logging.getLogger(__name__)

SENDGRID_SEND_URL = "https://api.sendgrid.com/v3/mail/send"


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


# ── Core send function ──────────────────────────────────────────────────


async def send_email(
    to_email: str,
    to_name: str,
    subject: str,
    html_content: str,
    settings: Settings,
) -> bool:
    """Send an email via the SendGrid v3 API. Returns True on success, False on failure."""
    if not settings.sendgrid_api_key:
        logger.info("Email not configured, skipping")
        return True

    payload = {
        "personalizations": [
            {
                "to": [{"email": to_email, "name": to_name or ""}],
                "subject": subject,
            }
        ],
        "from": {
            "email": settings.email_from,
            "name": settings.email_from_name,
        },
        "content": [{"type": "text/html", "value": html_content}],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                SENDGRID_SEND_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.sendgrid_api_key}",
                    "Content-Type": "application/json",
                },
            )
        if response.status_code in (200, 201, 202):
            logger.info("Email sent to %s: %s", to_email, subject)
            return True
        logger.error(
            "SendGrid error %s for %s: %s",
            response.status_code,
            to_email,
            response.text,
        )
        return False
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False


# ── Specific email functions ────────────────────────────────────────────


async def send_welcome_email(user: User, settings: Settings) -> bool:
    """Welcome email sent after registration."""
    name = user.full_name or user.email
    trial_date = _format_date(user.trial_ends_at)
    hub_url = settings.hub_url

    body = (
        f"<p>Hi {name},</p>"
        f"<p>Your free trial is active until <strong>{trial_date}</strong>.</p>"
        f"<p>Explore your pipeline, contacts, markets, and portfolio tools.</p>"
        f"<p>When ready, upgrade at any time from the Billing page.</p>"
        f"{_cta_button('Go to Dashboard', f'{hub_url}/pipeline')}"
    )

    return await send_email(
        to_email=user.email,
        to_name=name,
        subject="Welcome to REIFundamentals Hub — your 7-day trial has started",
        html_content=_build_html(body),
        settings=settings,
    )


async def send_trial_ending_email(user: User, settings: Settings) -> bool:
    """Reminder sent 3 days before trial expires."""
    name = user.full_name or user.email
    trial_date = _format_date(user.trial_ends_at)
    hub_url = settings.hub_url

    body = (
        f"<p>Hi {name},</p>"
        f"<p>Your trial ends on <strong>{trial_date}</strong>.</p>"
        f"<p>To keep access upgrade before then.</p>"
        f"{_cta_button('Upgrade Now', f'{hub_url}/billing')}"
    )

    return await send_email(
        to_email=user.email,
        to_name=name,
        subject="Your REIFundamentals Hub trial ends in 3 days",
        html_content=_build_html(body),
        settings=settings,
    )


async def send_subscription_active_email(user: User, settings: Settings) -> bool:
    """Confirmation after successful checkout."""
    name = user.full_name or user.email
    plan = user.plan or "starter"
    interval = user.billing_interval or "monthly"
    hub_url = settings.hub_url

    body = (
        f"<p>Hi {name},</p>"
        f"<p>Your <strong>{plan}</strong> subscription is now active.</p>"
        f"<p>Billing interval: {interval}.</p>"
        f"{_cta_button('Go to Dashboard', f'{hub_url}/pipeline')}"
    )

    return await send_email(
        to_email=user.email,
        to_name=name,
        subject=f"You're now subscribed to REIFundamentals Hub {plan} plan",
        html_content=_build_html(body),
        settings=settings,
    )


async def send_payment_failed_email(user: User, settings: Settings) -> bool:
    """Alert when a payment fails."""
    name = user.full_name or user.email
    hub_url = settings.hub_url

    body = (
        f"<p>Hi {name},</p>"
        f"<p>We couldn't process your payment.</p>"
        f"<p>Please update your billing info to avoid losing access.</p>"
        f"{_cta_button('Update Billing', f'{hub_url}/billing')}"
    )

    return await send_email(
        to_email=user.email,
        to_name=name,
        subject="Action required — payment failed for REIFundamentals Hub",
        html_content=_build_html(body),
        settings=settings,
    )


async def send_subscription_canceled_email(user: User, settings: Settings) -> bool:
    """Notification when a subscription is canceled."""
    name = user.full_name or user.email
    hub_url = settings.hub_url

    body = (
        f"<p>Hi {name},</p>"
        f"<p>Your subscription has been canceled.</p>"
        f"<p>You can reactivate at any time from the billing page.</p>"
        f"{_cta_button('Reactivate', f'{hub_url}/billing')}"
    )

    return await send_email(
        to_email=user.email,
        to_name=name,
        subject="Your REIFundamentals Hub subscription has been canceled",
        html_content=_build_html(body),
        settings=settings,
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
) -> bool:
    """Email sent to a buyer requesting proof of funds."""
    body = (
        f"<p>Hi {buyer_name},</p>"
        f"<p><strong>{requestor_name}</strong> is requesting proof of funds "
        f"for the following property:</p>"
        f"<p style=\"margin-left:16px;\">"
        f"<strong>Property:</strong> {property_address}<br>"
        f"<strong>Required Amount:</strong> ${required_amount:,.0f}"
        f"</p>"
        f"<p>Click below to securely verify your bank balance via Plaid. "
        f"You do not need a REI Hub account.</p>"
        f"{_cta_button('Verify My Funds', request_link)}"
        f"<p style=\"margin-top:24px;font-size:13px;color:#666666;\">"
        f"This link expires in 72 hours ({expires_at}).</p>"
    )

    return await send_email(
        to_email=buyer_email,
        to_name=buyer_name,
        subject=f"{requestor_name} is requesting Proof of Funds",
        html_content=_build_html(body),
        settings=settings,
    )


async def send_pof_completed_email(
    requestor_email: str,
    requestor_name: str,
    buyer_name: str,
    property_address: str,
    verified_amount_display: str,
    certificate_link: str,
    settings: Settings,
) -> bool:
    """Email sent to the requestor when buyer completes POF verification."""
    body = (
        f"<p>Hi {requestor_name},</p>"
        f"<p><strong>{buyer_name}</strong> has verified their proof of funds.</p>"
        f"<p style=\"margin-left:16px;\">"
        f"<strong>Property:</strong> {property_address}<br>"
        f"<strong>{verified_amount_display}</strong>"
        f"</p>"
        f"<p>View the full certificate in your REI Hub dashboard.</p>"
        f"{_cta_button('View Certificate', certificate_link)}"
    )

    return await send_email(
        to_email=requestor_email,
        to_name=requestor_name,
        subject=f"Proof of Funds Verified \u2014 {buyer_name}",
        html_content=_build_html(body),
        settings=settings,
    )
