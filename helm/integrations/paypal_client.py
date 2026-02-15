"""PayPal integration — subscription billing for Helm SaaS.

Handles:
- Creating subscriptions via PayPal
- Managing billing (suspend, cancel, reactivate)
- Processing webhooks (payment events → tenant activation)
"""

from __future__ import annotations

import base64
import logging
import time

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _paypal_api_base() -> str:
    if settings.paypal_mode == "live":
        return "https://api-m.paypal.com"
    return "https://api-m.sandbox.paypal.com"


class PayPalClient:
    """PayPal REST API client for subscription billing."""

    def __init__(self) -> None:
        self._client_id = settings.paypal_client_id
        self._client_secret = settings.paypal_client_secret
        self._webhook_id = settings.paypal_webhook_id
        self._access_token: str = ""
        self._token_expiry: float = 0

    @property
    def is_configured(self) -> bool:
        return bool(self._client_id and self._client_secret)

    # ── Auth ──────────────────────────────────────────────────────────────

    async def _ensure_token(self) -> str | None:
        """Get or refresh the OAuth2 access token."""
        if self._access_token and time.time() < self._token_expiry:
            return self._access_token

        if not self.is_configured:
            return None

        credentials = base64.b64encode(
            f"{self._client_id}:{self._client_secret}".encode()
        ).decode()

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{_paypal_api_base()}/v1/oauth2/token",
                    headers={
                        "Authorization": f"Basic {credentials}",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    data={"grant_type": "client_credentials"},
                )
                resp.raise_for_status()
                data = resp.json()
                self._access_token = data["access_token"]
                self._token_expiry = time.time() + data.get("expires_in", 3600) - 60
                return self._access_token
        except httpx.HTTPError as exc:
            logger.error("PayPal token request failed: %s", exc)
            return None

    @property
    def _api_base(self) -> str:
        return _paypal_api_base()

    # ── Subscriptions ─────────────────────────────────────────────────────

    async def create_subscription(
        self,
        plan_id: str,
        tenant_id: str,
        subscriber_email: str,
        subscriber_name: str = "",
        return_url: str | None = None,
        cancel_url: str | None = None,
    ) -> dict | None:
        """Create a PayPal subscription.

        Returns the subscription object including ``links`` with an
        ``approve`` URL to redirect the user to PayPal.
        """
        payload: dict = {
            "plan_id": plan_id,
            "custom_id": tenant_id,
            "subscriber": {
                "email_address": subscriber_email,
            },
            "application_context": {
                "return_url": return_url or settings.billing_success_url,
                "cancel_url": cancel_url or settings.billing_cancel_url,
                "brand_name": "Helm AI Assistant",
                "user_action": "SUBSCRIBE_NOW",
                "shipping_preference": "NO_SHIPPING",
            },
        }

        if subscriber_name:
            name_parts = subscriber_name.split(" ", 1)
            payload["subscriber"]["name"] = {
                "given_name": name_parts[0],
                "surname": name_parts[1] if len(name_parts) > 1 else "",
            }

        return await self._post("/v1/billing/subscriptions", payload)

    async def create_base_plan_subscription(
        self,
        tenant_id: str,
        subscriber_email: str,
        subscriber_name: str = "",
        **kwargs,
    ) -> dict | None:
        """Create subscription for the Helm base plan."""
        if not settings.paypal_base_plan_id:
            logger.warning("PayPal base plan ID not configured")
            return None
        return await self.create_subscription(
            plan_id=settings.paypal_base_plan_id,
            tenant_id=tenant_id,
            subscriber_email=subscriber_email,
            subscriber_name=subscriber_name,
            **kwargs,
        )

    async def create_rei_plugin_subscription(
        self,
        tenant_id: str,
        subscriber_email: str,
        subscriber_name: str = "",
        **kwargs,
    ) -> dict | None:
        """Create subscription for the REI plugin add-on."""
        if not settings.paypal_rei_plugin_plan_id:
            logger.warning("PayPal REI plugin plan ID not configured")
            return None
        return await self.create_subscription(
            plan_id=settings.paypal_rei_plugin_plan_id,
            tenant_id=tenant_id,
            subscriber_email=subscriber_email,
            subscriber_name=subscriber_name,
            **kwargs,
        )

    async def get_subscription(self, subscription_id: str) -> dict | None:
        """Fetch subscription details."""
        return await self._get(f"/v1/billing/subscriptions/{subscription_id}")

    async def cancel_subscription(self, subscription_id: str, reason: str = "") -> bool:
        """Cancel a PayPal subscription."""
        token = await self._ensure_token()
        if not token:
            return False
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._api_base}/v1/billing/subscriptions/{subscription_id}/cancel",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json={"reason": reason or "Customer requested cancellation"},
                )
                return resp.status_code == 204
        except httpx.HTTPError as exc:
            logger.error("PayPal cancel subscription failed: %s", exc)
            return False

    async def suspend_subscription(self, subscription_id: str, reason: str = "") -> bool:
        """Suspend (pause) a PayPal subscription."""
        token = await self._ensure_token()
        if not token:
            return False
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._api_base}/v1/billing/subscriptions/{subscription_id}/suspend",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json={"reason": reason or "Subscription paused"},
                )
                return resp.status_code == 204
        except httpx.HTTPError as exc:
            logger.error("PayPal suspend subscription failed: %s", exc)
            return False

    async def reactivate_subscription(self, subscription_id: str, reason: str = "") -> bool:
        """Reactivate a suspended PayPal subscription."""
        token = await self._ensure_token()
        if not token:
            return False
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._api_base}/v1/billing/subscriptions/{subscription_id}/activate",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json={"reason": reason or "Subscription reactivated"},
                )
                return resp.status_code == 204
        except httpx.HTTPError as exc:
            logger.error("PayPal reactivate subscription failed: %s", exc)
            return False

    # ── Webhook Verification ──────────────────────────────────────────────

    async def verify_webhook(self, headers: dict, body: bytes) -> dict | None:
        """Verify a PayPal webhook event using the PayPal API.

        Returns the parsed event dict if valid, None otherwise.
        """
        import json

        if not self._webhook_id:
            logger.warning("PayPal webhook ID not configured — accepting unverified")
            try:
                return json.loads(body)
            except Exception:
                return None

        token = await self._ensure_token()
        if not token:
            return None

        verify_payload = {
            "auth_algo": headers.get("PAYPAL-AUTH-ALGO", ""),
            "cert_url": headers.get("PAYPAL-CERT-URL", ""),
            "transmission_id": headers.get("PAYPAL-TRANSMISSION-ID", ""),
            "transmission_sig": headers.get("PAYPAL-TRANSMISSION-SIG", ""),
            "transmission_time": headers.get("PAYPAL-TRANSMISSION-TIME", ""),
            "webhook_id": self._webhook_id,
            "webhook_event": json.loads(body),
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._api_base}/v1/notifications/verify-webhook-signature",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=verify_payload,
                )
                resp.raise_for_status()
                result = resp.json()
                if result.get("verification_status") == "SUCCESS":
                    return json.loads(body)
                logger.warning("PayPal webhook verification failed: %s", result)
                return None
        except Exception as exc:
            logger.error("PayPal webhook verification error: %s", exc)
            return None

    # ── HTTP Helpers ──────────────────────────────────────────────────────

    async def _get(self, path: str) -> dict | None:
        token = await self._ensure_token()
        if not token:
            return None
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(
                    f"{self._api_base}{path}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("PayPal GET %s failed: %s", path, exc)
            return None

    async def _post(self, path: str, payload: dict) -> dict | None:
        token = await self._ensure_token()
        if not token:
            return None
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    f"{self._api_base}{path}",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("PayPal POST %s failed: %s", path, exc)
            return None


# Singleton
paypal_client = PayPalClient()
