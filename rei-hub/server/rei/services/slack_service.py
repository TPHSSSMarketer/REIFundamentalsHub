"""Slack notification service — send messages via Incoming Webhook.

Setup:
  1. Go to https://api.slack.com/apps → Create New App → From scratch
  2. Select your workspace
  3. Go to "Incoming Webhooks" → Activate → Add New Webhook to Workspace
  4. Pick the channel to post to → Authorize
  5. Copy the Webhook URL and paste it in SuperAdmin → Slack credentials
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)


async def send_slack_message(
    message: str,
    db=None,
) -> bool:
    """Send a message to the configured Slack channel via Incoming Webhook.

    Args:
        message: Plain text message (supports Slack mrkdwn formatting).
        db: Async database session for reading credentials.

    Returns True on success, False if not configured or on error.
    """
    webhook_url = await _get_webhook_url(db)
    if not webhook_url:
        logger.info("Slack not configured — skipping notification")
        return False

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                webhook_url,
                json={"text": message},
                timeout=10,
            )

            if resp.status_code == 200 and resp.text == "ok":
                logger.info("Slack notification sent successfully")
                return True
            else:
                logger.warning(
                    "Slack webhook returned %s: %s", resp.status_code, resp.text[:200]
                )
                return False

    except Exception as e:
        logger.error("Failed to send Slack notification: %s", e)
        return False


async def _get_webhook_url(db) -> str:
    """Read the Slack webhook URL from encrypted provider credentials."""
    if not db:
        return ""
    try:
        from rei.services.credentials_service import get_provider_credentials

        creds = await get_provider_credentials(db, "slack")
        if creds:
            return creds.get("slack_webhook_url", "")
    except Exception as e:
        logger.warning("Could not load Slack credentials: %s", e)
    return ""
