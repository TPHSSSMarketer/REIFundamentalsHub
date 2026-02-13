"""Pydantic schemas for REI-specific API endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


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
