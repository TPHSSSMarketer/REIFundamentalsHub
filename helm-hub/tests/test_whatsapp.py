"""Tests for the WhatsApp Business Cloud API integration."""

from __future__ import annotations

from helm.integrations.whatsapp import WhatsAppClient
from helm.models.schemas import AssistantMode


def test_whatsapp_not_configured_when_empty():
    client = WhatsAppClient()
    client._phone_number_id = ""
    client._access_token = ""
    assert client.is_configured is False


def test_whatsapp_configured_when_credentials_set():
    client = WhatsAppClient()
    client._phone_number_id = "12345"
    client._access_token = "token"
    assert client.is_configured is True


def test_verify_webhook_success():
    client = WhatsAppClient()
    client._verify_token = "my-secret"

    result = client.verify_webhook("subscribe", "my-secret", "challenge123")
    assert result == "challenge123"


def test_verify_webhook_fails_bad_token():
    client = WhatsAppClient()
    client._verify_token = "my-secret"

    result = client.verify_webhook("subscribe", "wrong-token", "challenge123")
    assert result is None


def test_verify_webhook_fails_bad_mode():
    client = WhatsAppClient()
    client._verify_token = "my-secret"

    result = client.verify_webhook("unsubscribe", "my-secret", "challenge123")
    assert result is None


def test_detect_mode_real_estate():
    client = WhatsAppClient()
    mode, text = client._detect_mode("re: what is my cap rate")
    assert mode == AssistantMode.REAL_ESTATE
    assert text == "what is my cap rate"


def test_detect_mode_personal():
    client = WhatsAppClient()
    mode, text = client._detect_mode("personal: plan my week")
    assert mode == AssistantMode.PERSONAL
    assert text == "plan my week"


def test_detect_mode_business_explicit():
    client = WhatsAppClient()
    mode, text = client._detect_mode("biz: draft proposal")
    assert mode == AssistantMode.BUSINESS
    assert text == "draft proposal"


def test_detect_mode_defaults_to_business():
    client = WhatsAppClient()
    mode, text = client._detect_mode("just a regular message")
    assert mode == AssistantMode.BUSINESS
    assert text == "just a regular message"
