"""Tests for the Telegram bot integration."""

from __future__ import annotations

from helm.integrations.telegram import TelegramBot
from helm.models.schemas import AssistantMode


def test_telegram_not_configured_when_empty():
    bot = TelegramBot()
    bot._token = ""
    assert bot.is_configured is False


def test_telegram_configured_when_token_set():
    bot = TelegramBot()
    bot._token = "123456:ABC-DEF"
    assert bot.is_configured is True


def test_detect_mode_business():
    bot = TelegramBot()
    assert bot._detect_mode("/business hello") == AssistantMode.BUSINESS


def test_detect_mode_real_estate():
    bot = TelegramBot()
    assert bot._detect_mode("/re what is my cap rate") == AssistantMode.REAL_ESTATE
    assert bot._detect_mode("/realestate show portfolio") == AssistantMode.REAL_ESTATE


def test_detect_mode_personal():
    bot = TelegramBot()
    assert bot._detect_mode("/personal what are my tasks") == AssistantMode.PERSONAL


def test_detect_mode_defaults_to_business():
    bot = TelegramBot()
    assert bot._detect_mode("just a regular message") == AssistantMode.BUSINESS
