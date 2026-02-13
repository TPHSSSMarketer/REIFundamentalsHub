"""Pydantic schemas for API request / response validation."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ── Enums ────────────────────────────────────────────────────────────────────


class AssistantMode(str, Enum):
    """Which personality / tool-set Helm is operating in."""

    BUSINESS = "business"
    PERSONAL = "personal"
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
    sources: list[str] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ── REIFundamentals Hub ──────────────────────────────────────────────────────


class PropertySummary(BaseModel):
    address: str
    city: str
    state: str
    zip_code: str
    property_type: str = ""
    purchase_price: float | None = None
    current_value: float | None = None
    monthly_rent: float | None = None
    cap_rate: float | None = None
    cash_on_cash: float | None = None
    occupancy_status: str = ""


class PortfolioOverview(BaseModel):
    total_properties: int = 0
    total_value: float = 0.0
    total_monthly_income: float = 0.0
    average_cap_rate: float | None = None
    properties: list[PropertySummary] = Field(default_factory=list)


class DealAnalysisRequest(BaseModel):
    address: str
    purchase_price: float
    rehab_cost: float = 0.0
    after_repair_value: float | None = None
    monthly_rent: float | None = None
    strategy: str = "buy_and_hold"


class DealAnalysisResponse(BaseModel):
    verdict: str
    score: float
    cap_rate: float | None = None
    cash_on_cash: float | None = None
    roi_projection: float | None = None
    analysis: str
    risks: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


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
    portfolio_snapshot: PortfolioOverview | None = None
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
