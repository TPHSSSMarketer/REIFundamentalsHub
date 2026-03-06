"""Email provider abstraction layer.

This is the ONLY file the rest of the app imports for sending marketing emails.
Switching providers = changing one environment variable (EMAIL_PROVIDER).
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import httpx

from rei.config import get_settings

logger = logging.getLogger(__name__)


# ── Standard internal formats ──────────────────────────────────────────


@dataclass
class EmailRequest:
    to_email: str
    to_name: str
    from_email: str
    from_name: str
    subject: str
    html_content: str
    plain_text: str
    metadata: dict = field(default_factory=dict)
    # { campaign_id, subscriber_id, unsubscribe_url }


@dataclass
class EmailResponse:
    success: bool
    message_id: str
    provider: str  # "resend" or "sendgrid"
    error: Optional[str] = None


@dataclass
class DomainResult:
    domain_id: str
    status: str
    dns_records: dict
    # Always in this format regardless of provider:
    # {
    #   spf:   { host, type, value },
    #   dkim:  { host, type, value },
    #   dmarc: { host, type, value }
    # }


@dataclass
class WebhookEvent:
    event_type: str
    # "delivered","opened","clicked","bounced","unsubscribed","complained"
    email: str
    campaign_id: Optional[str] = None
    subscriber_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
    raw_payload: dict = field(default_factory=dict)


# ── Base adapter ───────────────────────────────────────────────────────


class EmailProviderAdapter(ABC):
    @abstractmethod
    async def send(self, req: EmailRequest, settings) -> EmailResponse:
        ...

    @abstractmethod
    async def add_domain(self, domain: str, settings) -> DomainResult:
        ...

    @abstractmethod
    async def verify_domain(self, domain_id: str, settings) -> dict:
        ...

    @abstractmethod
    def parse_webhook(self, payload: dict) -> list[WebhookEvent]:
        ...


# ── Resend Adapter ─────────────────────────────────────────────────────


class ResendAdapter(EmailProviderAdapter):
    SEND_URL = "https://api.resend.com/emails"
    DOMAINS_URL = "https://api.resend.com/domains"

    async def send(self, req: EmailRequest, settings) -> EmailResponse:
        headers_to_send: dict = {
            "X-Campaign-ID": req.metadata.get("campaign_id", ""),
            "X-Subscriber-ID": req.metadata.get("subscriber_id", ""),
        }
        unsubscribe_url = req.metadata.get("unsubscribe_url", "")
        if unsubscribe_url:
            headers_to_send["List-Unsubscribe"] = f"<{unsubscribe_url}>"
            headers_to_send["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

        body = {
            "from": f"{req.from_name} <{req.from_email}>",
            "to": [req.to_email],
            "subject": req.subject,
            "html": req.html_content,
            "text": req.plain_text,
            "headers": headers_to_send,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    self.SEND_URL,
                    json=body,
                    headers={
                        "Authorization": f"Bearer {settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                )
            if resp.status_code in (200, 201):
                data = resp.json()
                return EmailResponse(
                    success=True,
                    message_id=data.get("id", ""),
                    provider="resend",
                )
            logger.error("Resend error %s: %s", resp.status_code, resp.text)
            return EmailResponse(
                success=False,
                message_id="",
                provider="resend",
                error=resp.text,
            )
        except Exception as exc:
            logger.exception("Resend send failed")
            return EmailResponse(
                success=False,
                message_id="",
                provider="resend",
                error=str(exc),
            )

    async def add_domain(self, domain: str, settings) -> DomainResult:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    self.DOMAINS_URL,
                    json={"name": domain},
                    headers={
                        "Authorization": f"Bearer {settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                )
            data = resp.json()
            records = data.get("records", [])
            dns: dict = {}
            for rec in records:
                rec_type = rec.get("record_type", rec.get("type", "")).upper()
                if rec_type == "TXT" and "spf" in rec.get("value", "").lower():
                    dns["spf"] = {
                        "host": rec.get("name", domain),
                        "type": "TXT",
                        "value": rec.get("value", ""),
                    }
                elif rec_type == "CNAME" or "dkim" in rec.get("name", "").lower():
                    dns["dkim"] = {
                        "host": rec.get("name", ""),
                        "type": rec.get("record_type", rec.get("type", "CNAME")),
                        "value": rec.get("value", ""),
                    }
                elif rec_type == "TXT" and "dmarc" in rec.get("name", "").lower():
                    dns["dmarc"] = {
                        "host": rec.get("name", ""),
                        "type": "TXT",
                        "value": rec.get("value", ""),
                    }
            # Ensure all three keys exist
            if "spf" not in dns:
                dns["spf"] = {"host": domain, "type": "TXT", "value": ""}
            if "dkim" not in dns:
                dns["dkim"] = {"host": domain, "type": "CNAME", "value": ""}
            if "dmarc" not in dns:
                dns["dmarc"] = {
                    "host": f"_dmarc.{domain}",
                    "type": "TXT",
                    "value": "v=DMARC1; p=none",
                }

            return DomainResult(
                domain_id=str(data.get("id", "")),
                status=data.get("status", "pending"),
                dns_records=dns,
            )
        except Exception as exc:
            logger.exception("Resend add_domain failed")
            raise RuntimeError(f"Failed to add domain: {exc}") from exc

    async def verify_domain(self, domain_id: str, settings) -> dict:
        url = f"{self.DOMAINS_URL}/{domain_id}/verify"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                )
            data = resp.json()
            status_val = data.get("status", "")
            return {"valid": status_val == "verified" or resp.status_code == 200}
        except Exception as exc:
            logger.exception("Resend verify_domain failed")
            return {"valid": False, "error": str(exc)}

    def parse_webhook(self, payload: dict) -> list[WebhookEvent]:
        EVENT_MAP = {
            "email.sent": "delivered",
            "email.delivered": "delivered",
            "email.opened": "opened",
            "email.clicked": "clicked",
            "email.bounced": "bounced",
            "email.complained": "complained",
        }
        event_type_raw = payload.get("type", "")
        mapped = EVENT_MAP.get(event_type_raw)
        if not mapped:
            return []

        data = payload.get("data", {})
        headers = data.get("headers", {})

        return [
            WebhookEvent(
                event_type=mapped,
                email=data.get("to", [data.get("email", "")])[0]
                if isinstance(data.get("to"), list)
                else data.get("to", data.get("email", "")),
                campaign_id=headers.get("X-Campaign-ID", ""),
                subscriber_id=headers.get("X-Subscriber-ID", ""),
                timestamp=datetime.utcnow(),
                raw_payload=payload,
            )
        ]


# ── SendGrid Adapter ──────────────────────────────────────────────────


class SendGridAdapter(EmailProviderAdapter):
    SEND_URL = "https://api.sendgrid.com/v3/mail/send"
    DOMAINS_URL = "https://api.sendgrid.com/v3/whitelabel/domains"

    async def send(self, req: EmailRequest, settings) -> EmailResponse:
        unsubscribe_url = req.metadata.get("unsubscribe_url", "")
        personalizations_headers: dict = {}
        if unsubscribe_url:
            personalizations_headers["List-Unsubscribe"] = f"<{unsubscribe_url}>"
            personalizations_headers["List-Unsubscribe-Post"] = (
                "List-Unsubscribe=One-Click"
            )

        personalization: dict = {
            "to": [{"email": req.to_email, "name": req.to_name}],
            "subject": req.subject,
        }
        if personalizations_headers:
            personalization["headers"] = personalizations_headers

        body: dict = {
            "personalizations": [personalization],
            "from": {"email": req.from_email, "name": req.from_name},
            "content": [
                {"type": "text/plain", "value": req.plain_text},
                {"type": "text/html", "value": req.html_content},
            ],
            "custom_args": {
                "campaign_id": req.metadata.get("campaign_id", ""),
                "subscriber_id": req.metadata.get("subscriber_id", ""),
            },
            "tracking_settings": {
                "open_tracking": {"enable": True},
                "click_tracking": {"enable": True},
            },
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    self.SEND_URL,
                    json=body,
                    headers={
                        "Authorization": f"Bearer {settings.sendgrid_api_key}",
                        "Content-Type": "application/json",
                    },
                )
            if resp.status_code in (200, 201, 202):
                msg_id = resp.headers.get("X-Message-Id", "")
                return EmailResponse(
                    success=True,
                    message_id=msg_id,
                    provider="sendgrid",
                )
            logger.error("SendGrid error %s: %s", resp.status_code, resp.text)
            return EmailResponse(
                success=False,
                message_id="",
                provider="sendgrid",
                error=resp.text,
            )
        except Exception as exc:
            logger.exception("SendGrid send failed")
            return EmailResponse(
                success=False,
                message_id="",
                provider="sendgrid",
                error=str(exc),
            )

    async def add_domain(self, domain: str, settings) -> DomainResult:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    self.DOMAINS_URL,
                    json={"domain": domain, "automatic_security": True},
                    headers={
                        "Authorization": f"Bearer {settings.sendgrid_api_key}",
                        "Content-Type": "application/json",
                    },
                )
            data = resp.json()
            dns_detail = data.get("dns", {})
            dns: dict = {
                "spf": {
                    "host": dns_detail.get("mail_server", {}).get("host", domain),
                    "type": dns_detail.get("mail_server", {}).get("type", "TXT"),
                    "value": dns_detail.get("mail_server", {}).get("data", ""),
                },
                "dkim": {
                    "host": dns_detail.get("dkim1", {}).get("host", ""),
                    "type": dns_detail.get("dkim1", {}).get("type", "CNAME"),
                    "value": dns_detail.get("dkim1", {}).get("data", ""),
                },
                "dmarc": {
                    "host": f"_dmarc.{domain}",
                    "type": "TXT",
                    "value": dns_detail.get("dkim2", {}).get("data", "v=DMARC1; p=none"),
                },
            }
            return DomainResult(
                domain_id=str(data.get("id", "")),
                status="pending",
                dns_records=dns,
            )
        except Exception as exc:
            logger.exception("SendGrid add_domain failed")
            raise RuntimeError(f"Failed to add domain: {exc}") from exc

    async def verify_domain(self, domain_id: str, settings) -> dict:
        url = f"{self.DOMAINS_URL}/{domain_id}/validate"
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {settings.sendgrid_api_key}",
                        "Content-Type": "application/json",
                    },
                )
            data = resp.json()
            return {"valid": data.get("valid", False)}
        except Exception as exc:
            logger.exception("SendGrid verify_domain failed")
            return {"valid": False, "error": str(exc)}

    def parse_webhook(self, payload: dict) -> list[WebhookEvent]:
        EVENT_MAP = {
            "delivered": "delivered",
            "open": "opened",
            "click": "clicked",
            "bounce": "bounced",
            "unsubscribe": "unsubscribed",
            "spamreport": "complained",
        }
        events: list[WebhookEvent] = []
        items = payload if isinstance(payload, list) else [payload]
        for item in items:
            raw_event = item.get("event", "")
            mapped = EVENT_MAP.get(raw_event)
            if not mapped:
                continue
            events.append(
                WebhookEvent(
                    event_type=mapped,
                    email=item.get("email", ""),
                    campaign_id=item.get("campaign_id", ""),
                    subscriber_id=item.get("subscriber_id", ""),
                    timestamp=datetime.utcfromtimestamp(item.get("timestamp", 0))
                    if item.get("timestamp")
                    else datetime.utcnow(),
                    raw_payload=item,
                )
            )
        return events


# ── Provider factory ───────────────────────────────────────────────────


def get_email_provider(settings) -> EmailProviderAdapter:
    if settings.email_provider == "resend":
        return ResendAdapter()
    elif settings.email_provider == "sendgrid":
        return SendGridAdapter()
    else:
        raise ValueError(f"Unknown email provider: {settings.email_provider}")


# Module-level instance
email_provider = get_email_provider(get_settings())
