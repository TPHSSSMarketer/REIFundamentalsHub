"""Pydantic schemas for API request / response validation."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────


class AssistantMode(str, Enum):
    """Which personality / tool-set Helm is operating in.

    Core modes are BUSINESS and PERSONAL.  Plugins may add additional
    modes (e.g. REAL_ESTATE is added by the REI plugin).
    """

    BUSINESS = "business"
    PERSONAL = "personal"
    # Plugin modes — kept as enum values for API stability.
    # The REI plugin registers its own prompt/style for this mode.
    REAL_ESTATE = "real_estate"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


# ── Chat ─────────────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    message: str
    mode: AssistantMode = AssistantMode.BUSINESS
    conversation_id: str | None = None


class ChatResponse(BaseModel):
    conversation_id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    reply: str
    mode: AssistantMode
    model_tier: str = ""
    model_used: str = ""
    sources: list[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ── Personal Assistant ───────────────────────────────────────────────────────


class TaskItem(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    title: str
    description: str = ""
    due_date: datetime | None = None
    priority: str = "medium"
    completed: bool = False
    category: str = "general"


class DailyBriefing(BaseModel):
    greeting: str
    date: str
    weather_summary: str = ""
    tasks_today: list[TaskItem] = Field(default_factory=list)
    insights: list[str] = Field(default_factory=list)


# ── Auth ─────────────────────────────────────────────────────────────────────


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str = ""


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── RE schemas (backward compat — canonical location is helm.plugins.rei.schemas)

from helm.plugins.rei.schemas import (  # noqa: E402, F401
    DealAnalysisRequest,
    DealAnalysisResponse,
    PortfolioOverview,
    PropertySummary,
)
