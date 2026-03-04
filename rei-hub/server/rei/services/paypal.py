"""PayPal Subscriptions API service — uses httpx for all HTTP calls."""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

_PAYPAL_BASE_URLS = {
    "sandbox": "https://api-m.sandbox.paypal.com",
    "live": "https://api-m.paypal.com",
}


def _base_url(settings) -> str:
    """Resolve the PayPal API base URL from settings.paypal_mode."""
    mode = getattr(settings, "paypal_mode", "sandbox")
    # Also honour the legacy paypal_base_url setting if mode is missing
    return _PAYPAL_BASE_URLS.get(mode, getattr(settings, "paypal_base_url", _PAYPAL_BASE_URLS["sandbox"]))


async def get_access_token(settings) -> str:
    """Obtain a PayPal OAuth2 access token.

    Raises ``ValueError`` if PayPal credentials are not configured.
    """
    client_id = getattr(settings, "paypal_client_id", "")
    client_secret = getattr(settings, "paypal_client_secret", "")

    if not client_id or not client_secret:
        raise ValueError("PayPal credentials not configured")

    base = _base_url(settings)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base}/v1/oauth2/token",
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials"},
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["access_token"]


async def create_subscription(
    plan_id: str,
    user_email: str,
    user_id: str,
    return_url: str,
    cancel_url: str,
    settings,
) -> dict:
    """Create a PayPal billing subscription and return the full response dict.

    The approval URL the user should be redirected to is found in
    ``response["links"]`` where ``rel == "approve"``.
    """
    token = await get_access_token(settings)
    base = _base_url(settings)

    payload = {
        "plan_id": plan_id,
        "subscriber": {"email_address": user_email},
        "application_context": {
            "return_url": return_url,
            "cancel_url": cancel_url,
            "brand_name": "REIFundamentals Hub",
            "user_action": "SUBSCRIBE_NOW",
        },
        "custom_id": user_id,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base}/v1/billing/subscriptions",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def get_subscription(subscription_id: str, settings) -> dict:
    """Fetch a PayPal subscription by ID."""
    token = await get_access_token(settings)
    base = _base_url(settings)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{base}/v1/billing/subscriptions/{subscription_id}",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def verify_webhook_signature(
    headers: dict[str, str],
    body: bytes,
    webhook_id: str,
    settings,
) -> bool:
    """Verify a PayPal webhook signature using the Notifications API.

    Returns True if the webhook is genuine, False otherwise.
    """
    if not webhook_id:
        logger.warning("PayPal webhook_id not configured — rejecting webhook")
        return False

    try:
        token = await get_access_token(settings)
        base = _base_url(settings)

        verify_payload = {
            "auth_algo": headers.get("paypal-auth-algo", ""),
            "cert_url": headers.get("paypal-cert-url", ""),
            "transmission_id": headers.get("paypal-transmission-id", ""),
            "transmission_sig": headers.get("paypal-transmission-sig", ""),
            "transmission_time": headers.get("paypal-transmission-time", ""),
            "webhook_id": webhook_id,
            "webhook_event": body if isinstance(body, dict) else {},
        }

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{base}/v1/notifications/verify-webhook-signature",
                json=verify_payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
            if resp.status_code != 200:
                logger.warning(
                    "PayPal webhook signature verification API returned %s: %s",
                    resp.status_code,
                    resp.text,
                )
                return False
            result = resp.json()
            status = result.get("verification_status", "")
            if status == "SUCCESS":
                return True
            logger.warning("PayPal webhook signature verification failed: %s", status)
            return False
    except Exception:
        logger.exception("PayPal webhook signature verification error")
        return False


async def cancel_subscription(subscription_id: str, settings) -> bool:
    """Cancel a PayPal subscription. Returns True on success."""
    token = await get_access_token(settings)
    base = _base_url(settings)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{base}/v1/billing/subscriptions/{subscription_id}/cancel",
            json={"reason": "User requested cancellation"},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
        )
        # PayPal returns 204 on success
        return resp.status_code in (200, 204)
