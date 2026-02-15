"""Stripe integration — subscription billing for Helm SaaS.

Handles:
- Creating checkout sessions for new subscriptions
- Adding plugin upsells to existing subscriptions
- Managing billing portal sessions
- Processing webhooks (payment events → tenant activation)
"""

from __future__ import annotations

import logging

import httpx

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

STRIPE_API = "https://api.stripe.com/v1"


class StripeClient:
    """Stripe API client for subscription billing."""

    def __init__(self) -> None:
        self._secret_key = settings.stripe_secret_key
        self._webhook_secret = settings.stripe_webhook_secret

    @property
    def is_configured(self) -> bool:
        return bool(self._secret_key)

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._secret_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        }

    # ── Checkout Sessions ─────────────────────────────────────────────────

    async def create_checkout_session(
        self,
        price_id: str,
        tenant_id: str,
        customer_email: str | None = None,
        customer_id: str | None = None,
        success_url: str | None = None,
        cancel_url: str | None = None,
    ) -> dict | None:
        """Create a Stripe Checkout Session for a new subscription.

        Returns the session object including ``url`` for redirect.
        """
        if not self.is_configured:
            logger.warning("Stripe not configured")
            return None

        data: dict[str, str] = {
            "mode": "subscription",
            "line_items[0][price]": price_id,
            "line_items[0][quantity]": "1",
            "success_url": success_url or settings.billing_success_url + "?session_id={CHECKOUT_SESSION_ID}",
            "cancel_url": cancel_url or settings.billing_cancel_url,
            "metadata[tenant_id]": tenant_id,
            "metadata[price_id]": price_id,
            "subscription_data[metadata][tenant_id]": tenant_id,
        }

        if customer_id:
            data["customer"] = customer_id
        elif customer_email:
            data["customer_email"] = customer_email

        return await self._post("/checkout/sessions", data)

    async def create_base_plan_checkout(
        self,
        tenant_id: str,
        customer_email: str,
        **kwargs,
    ) -> dict | None:
        """Create checkout for the base Helm subscription."""
        if not settings.stripe_base_plan_price_id:
            logger.warning("Stripe base plan price ID not configured")
            return None
        return await self.create_checkout_session(
            price_id=settings.stripe_base_plan_price_id,
            tenant_id=tenant_id,
            customer_email=customer_email,
            **kwargs,
        )

    async def create_rei_plugin_checkout(
        self,
        tenant_id: str,
        customer_id: str,
        **kwargs,
    ) -> dict | None:
        """Create checkout for the REI plugin upsell (added to existing subscription)."""
        if not settings.stripe_rei_plugin_price_id:
            logger.warning("Stripe REI plugin price ID not configured")
            return None
        return await self.create_checkout_session(
            price_id=settings.stripe_rei_plugin_price_id,
            tenant_id=tenant_id,
            customer_id=customer_id,
            **kwargs,
        )

    # ── Subscription Management ───────────────────────────────────────────

    async def get_subscription(self, subscription_id: str) -> dict | None:
        """Fetch a subscription by ID."""
        return await self._get(f"/subscriptions/{subscription_id}")

    async def cancel_subscription(self, subscription_id: str, at_period_end: bool = True) -> dict | None:
        """Cancel a subscription (default: at end of current billing period)."""
        data = {"cancel_at_period_end": "true" if at_period_end else "false"}
        return await self._post(f"/subscriptions/{subscription_id}", data)

    async def add_subscription_item(
        self, subscription_id: str, price_id: str
    ) -> dict | None:
        """Add a line item (e.g. plugin upsell) to an existing subscription."""
        data = {
            "subscription": subscription_id,
            "price": price_id,
            "quantity": "1",
        }
        return await self._post("/subscription_items", data)

    async def remove_subscription_item(self, item_id: str) -> dict | None:
        """Remove a line item from a subscription."""
        return await self._delete(f"/subscription_items/{item_id}")

    # ── Customer Management ───────────────────────────────────────────────

    async def create_customer(
        self, email: str, name: str = "", metadata: dict | None = None
    ) -> dict | None:
        """Create a Stripe Customer."""
        data: dict[str, str] = {"email": email}
        if name:
            data["name"] = name
        if metadata:
            for k, v in metadata.items():
                data[f"metadata[{k}]"] = str(v)
        return await self._post("/customers", data)

    async def get_customer(self, customer_id: str) -> dict | None:
        """Fetch a customer by ID."""
        return await self._get(f"/customers/{customer_id}")

    # ── Billing Portal ────────────────────────────────────────────────────

    async def create_portal_session(
        self, customer_id: str, return_url: str | None = None
    ) -> dict | None:
        """Create a Stripe Billing Portal session for self-serve management."""
        data: dict[str, str] = {"customer": customer_id}
        if return_url:
            data["return_url"] = return_url
        return await self._post("/billing_portal/sessions", data)

    # ── Webhook Verification ──────────────────────────────────────────────

    def verify_webhook(self, payload: bytes, sig_header: str) -> dict | None:
        """Verify and parse a Stripe webhook event.

        Uses the Stripe-Signature header and the webhook signing secret.
        Returns the event dict if valid, None if verification fails.
        """
        import hashlib
        import hmac
        import time

        if not self._webhook_secret:
            logger.warning("Stripe webhook secret not configured — skipping verification")
            import json
            try:
                return json.loads(payload)
            except Exception:
                return None

        # Parse Stripe signature header: t=timestamp,v1=signature
        parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
        timestamp = parts.get("t", "")
        signature = parts.get("v1", "")

        if not timestamp or not signature:
            logger.warning("Invalid Stripe signature header format")
            return None

        # Check timestamp tolerance (5 minutes)
        try:
            if abs(time.time() - int(timestamp)) > 300:
                logger.warning("Stripe webhook timestamp too old")
                return None
        except ValueError:
            return None

        # Compute expected signature
        signed_payload = f"{timestamp}.".encode() + payload
        expected = hmac.new(
            self._webhook_secret.encode(),
            signed_payload,
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, signature):
            logger.warning("Stripe webhook signature mismatch")
            return None

        import json
        try:
            return json.loads(payload)
        except Exception:
            return None

    # ── HTTP Helpers ──────────────────────────────────────────────────────

    async def _get(self, path: str) -> dict | None:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.get(f"{STRIPE_API}{path}", headers=self._headers)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Stripe GET %s failed: %s", path, exc)
            return None

    async def _post(self, path: str, data: dict) -> dict | None:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(f"{STRIPE_API}{path}", headers=self._headers, data=data)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Stripe POST %s failed: %s", path, exc)
            return None

    async def _delete(self, path: str) -> dict | None:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.delete(f"{STRIPE_API}{path}", headers=self._headers)
                resp.raise_for_status()
                return resp.json()
        except httpx.HTTPError as exc:
            logger.error("Stripe DELETE %s failed: %s", path, exc)
            return None


# Singleton
stripe_client = StripeClient()
