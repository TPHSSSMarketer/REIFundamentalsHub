"""Direct Mail Provider abstraction — provider-agnostic interface for sending mail.

Currently implements Thanks.io. Designed to easily add Lob, PostGrid, etc.
"""

from __future__ import annotations

import base64
import logging
from abc import ABC, abstractmethod
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ── Abstract Provider ─────────────────────────────────────


class DirectMailProvider(ABC):
    """Abstract base class for direct mail providers."""

    provider_name: str = "unknown"

    @abstractmethod
    async def send_postcard(
        self,
        recipient_name: str,
        address_line1: str,
        city: str,
        state: str,
        zip_code: str,
        message: str,
        front_image_url: Optional[str] = None,
        front_image_b64: Optional[str] = None,
        return_name: Optional[str] = None,
        return_address: Optional[str] = None,
        return_city: Optional[str] = None,
        return_state: Optional[str] = None,
        return_zip: Optional[str] = None,
    ) -> dict:
        """Send a postcard.

        Returns: { 'provider_id': str, 'status': str, 'cost': float }
        """

    @abstractmethod
    async def send_letter(
        self,
        recipient_name: str,
        address_line1: str,
        city: str,
        state: str,
        zip_code: str,
        letter_html: str,
        return_name: Optional[str] = None,
        return_address: Optional[str] = None,
        return_city: Optional[str] = None,
        return_state: Optional[str] = None,
        return_zip: Optional[str] = None,
    ) -> dict:
        """Send a letter.

        Returns: { 'provider_id': str, 'status': str, 'cost': float }
        """

    @abstractmethod
    async def get_status(self, provider_id: str) -> dict:
        """Check delivery status of a sent mail piece.

        Returns: { 'status': str, 'tracking_events': list }
        """


# ── Thanks.io Implementation ─────────────────────────────


class ThanksIOProvider(DirectMailProvider):
    """Thanks.io direct mail provider — handwritten-style postcards & letters."""

    provider_name = "thanks_io"
    BASE_URL = "https://api.thanks.io/api/v2"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    async def send_postcard(
        self,
        recipient_name: str,
        address_line1: str,
        city: str,
        state: str,
        zip_code: str,
        message: str,
        front_image_url: Optional[str] = None,
        front_image_b64: Optional[str] = None,
        return_name: Optional[str] = None,
        return_address: Optional[str] = None,
        return_city: Optional[str] = None,
        return_state: Optional[str] = None,
        return_zip: Optional[str] = None,
    ) -> dict:
        payload = {
            "name": recipient_name,
            "address": address_line1,
            "city": city,
            "state": state,
            "zip": zip_code,
            "message": message,
        }

        if front_image_url:
            payload["front_image_url"] = front_image_url
        elif front_image_b64:
            # Convert base64 to data URI for direct submission
            payload["front_image_url"] = f"data:image/png;base64,{front_image_b64}"

        # Add return address if provided
        if return_name:
            payload["return_name"] = return_name
        if return_address:
            payload["return_address"] = return_address
        if return_city:
            payload["return_city"] = return_city
        if return_state:
            payload["return_state"] = return_state
        if return_zip:
            payload["return_zip"] = return_zip

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/postcard/send",
                    headers=self._headers(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

            provider_id = str(data.get("id", ""))
            logger.info("Thanks.io postcard sent: %s", provider_id)
            return {
                "provider_id": provider_id,
                "status": "sent",
                "cost": 0.59,
                "raw_response": data,
            }

        except httpx.HTTPStatusError as exc:
            logger.error("Thanks.io postcard API error: %s - %s", exc.response.status_code, exc.response.text)
            return {
                "provider_id": "",
                "status": "failed",
                "cost": 0.0,
                "error": f"API error {exc.response.status_code}: {exc.response.text[:200]}",
            }
        except Exception as exc:
            logger.error("Thanks.io postcard send failed: %s", exc)
            return {
                "provider_id": "",
                "status": "failed",
                "cost": 0.0,
                "error": str(exc),
            }

    async def send_letter(
        self,
        recipient_name: str,
        address_line1: str,
        city: str,
        state: str,
        zip_code: str,
        letter_html: str,
        return_name: Optional[str] = None,
        return_address: Optional[str] = None,
        return_city: Optional[str] = None,
        return_state: Optional[str] = None,
        return_zip: Optional[str] = None,
    ) -> dict:
        payload = {
            "name": recipient_name,
            "address": address_line1,
            "city": city,
            "state": state,
            "zip": zip_code,
            "letter": letter_html,
        }

        if return_name:
            payload["return_name"] = return_name
        if return_address:
            payload["return_address"] = return_address
        if return_city:
            payload["return_city"] = return_city
        if return_state:
            payload["return_state"] = return_state
        if return_zip:
            payload["return_zip"] = return_zip

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/letter/send",
                    headers=self._headers(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

            provider_id = str(data.get("id", ""))
            logger.info("Thanks.io letter sent: %s", provider_id)
            return {
                "provider_id": provider_id,
                "status": "sent",
                "cost": 0.99,
                "raw_response": data,
            }

        except httpx.HTTPStatusError as exc:
            logger.error("Thanks.io letter API error: %s - %s", exc.response.status_code, exc.response.text)
            return {
                "provider_id": "",
                "status": "failed",
                "cost": 0.0,
                "error": f"API error {exc.response.status_code}: {exc.response.text[:200]}",
            }
        except Exception as exc:
            logger.error("Thanks.io letter send failed: %s", exc)
            return {
                "provider_id": "",
                "status": "failed",
                "cost": 0.0,
                "error": str(exc),
            }

    async def get_status(self, provider_id: str) -> dict:
        """Check delivery status via Thanks.io API."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self.BASE_URL}/orders/{provider_id}",
                    headers=self._headers(),
                )
                resp.raise_for_status()
                data = resp.json()

            return {
                "status": data.get("status", "unknown"),
                "tracking_events": data.get("tracking_events", []),
                "raw_response": data,
            }
        except Exception as exc:
            logger.error("Thanks.io status check failed for %s: %s", provider_id, exc)
            return {"status": "unknown", "error": str(exc)}


# ── Lob Implementation ───────────────────────────────────


class LobProvider(DirectMailProvider):
    """Lob direct mail provider — postcards and letters via Lob.com.

    Lob accepts HTML for both front and back of postcards, and full HTML
    for letters. This makes it ideal for fully designed templates.

    Pricing: ~$0.63/postcard (4x6), ~$1.04/letter (1 page).
    """

    provider_name = "lob"
    BASE_URL = "https://api.lob.com/v1"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _auth(self) -> tuple:
        # Lob uses HTTP Basic auth with API key as username, empty password
        return (self.api_key, "")

    async def send_postcard(
        self,
        recipient_name: str,
        address_line1: str,
        city: str,
        state: str,
        zip_code: str,
        message: str,
        front_image_url: Optional[str] = None,
        front_image_b64: Optional[str] = None,
        return_name: Optional[str] = None,
        return_address: Optional[str] = None,
        return_city: Optional[str] = None,
        return_state: Optional[str] = None,
        return_zip: Optional[str] = None,
    ) -> dict:
        # Lob accepts HTML for both front and back, or a URL for the front
        payload: dict = {
            "to": {
                "name": recipient_name,
                "address_line1": address_line1,
                "address_city": city,
                "address_state": state,
                "address_zip": zip_code,
            },
            "back": f"<html><body style='padding:20px;font-family:Georgia,serif;'>{message}</body></html>",
        }

        # Front can be a URL or inline HTML
        if front_image_url:
            payload["front"] = front_image_url
        elif front_image_b64:
            # Lob also accepts a publicly accessible URL
            payload["front"] = f"data:image/png;base64,{front_image_b64}"
        else:
            payload["front"] = f"<html><body style='padding:40px;'><h1>{message[:100]}</h1></body></html>"

        # Return address
        if return_name:
            payload["from"] = {
                "name": return_name,
                "address_line1": return_address or "",
                "address_city": return_city or "",
                "address_state": return_state or "",
                "address_zip": return_zip or "",
            }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/postcards",
                    auth=self._auth(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

            provider_id = data.get("id", "")
            logger.info("Lob postcard created: %s", provider_id)
            return {
                "provider_id": provider_id,
                "status": "sent",
                "cost": float(data.get("price", 0.63)),
                "raw_response": data,
            }

        except httpx.HTTPStatusError as exc:
            logger.error("Lob postcard API error: %s - %s", exc.response.status_code, exc.response.text)
            return {"provider_id": "", "status": "failed", "cost": 0.0, "error": f"API error {exc.response.status_code}"}
        except Exception as exc:
            logger.error("Lob postcard send failed: %s", exc)
            return {"provider_id": "", "status": "failed", "cost": 0.0, "error": str(exc)}

    async def send_letter(
        self,
        recipient_name: str,
        address_line1: str,
        city: str,
        state: str,
        zip_code: str,
        letter_html: str,
        return_name: Optional[str] = None,
        return_address: Optional[str] = None,
        return_city: Optional[str] = None,
        return_state: Optional[str] = None,
        return_zip: Optional[str] = None,
    ) -> dict:
        payload: dict = {
            "to": {
                "name": recipient_name,
                "address_line1": address_line1,
                "address_city": city,
                "address_state": state,
                "address_zip": zip_code,
            },
            "file": letter_html,  # Lob accepts inline HTML for letters
            "color": False,
        }

        if return_name:
            payload["from"] = {
                "name": return_name,
                "address_line1": return_address or "",
                "address_city": return_city or "",
                "address_state": return_state or "",
                "address_zip": return_zip or "",
            }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/letters",
                    auth=self._auth(),
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

            provider_id = data.get("id", "")
            logger.info("Lob letter created: %s", provider_id)
            return {
                "provider_id": provider_id,
                "status": "sent",
                "cost": float(data.get("price", 1.04)),
                "raw_response": data,
            }

        except httpx.HTTPStatusError as exc:
            logger.error("Lob letter API error: %s - %s", exc.response.status_code, exc.response.text)
            return {"provider_id": "", "status": "failed", "cost": 0.0, "error": f"API error {exc.response.status_code}"}
        except Exception as exc:
            logger.error("Lob letter send failed: %s", exc)
            return {"provider_id": "", "status": "failed", "cost": 0.0, "error": str(exc)}

    async def get_status(self, provider_id: str) -> dict:
        """Check delivery status via Lob API."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                # Try postcards first, then letters
                resp = await client.get(
                    f"{self.BASE_URL}/postcards/{provider_id}",
                    auth=self._auth(),
                )
                if resp.status_code == 404:
                    resp = await client.get(
                        f"{self.BASE_URL}/letters/{provider_id}",
                        auth=self._auth(),
                    )
                resp.raise_for_status()
                data = resp.json()

            return {
                "status": data.get("send_date") and "sent" or data.get("status", "unknown"),
                "tracking_events": data.get("tracking_events", []),
                "raw_response": data,
            }
        except Exception as exc:
            logger.error("Lob status check failed for %s: %s", provider_id, exc)
            return {"status": "unknown", "error": str(exc)}


# ── Factory ───────────────────────────────────────────────


async def get_direct_mail_provider(db, user_id: int) -> DirectMailProvider:
    """Get the configured direct mail provider for a user.

    Checks for Thanks.io first, then Lob. At least one must be configured.
    """
    from rei.services.credentials_service import get_provider_credentials

    # Try Thanks.io first
    try:
        creds = await get_provider_credentials(db, "thanks_io")
        if creds and creds.get("thanks_io_api_key"):
            return ThanksIOProvider(api_key=creds["thanks_io_api_key"])
    except Exception:
        pass

    # Try Lob
    try:
        creds = await get_provider_credentials(db, "lob")
        if creds and creds.get("lob_api_key"):
            return LobProvider(api_key=creds["lob_api_key"])
    except Exception:
        pass

    raise ValueError(
        "No direct mail provider configured. "
        "Add a Thanks.io or Lob API key in Settings > Integrations or Admin > Credentials."
    )
