"""Pydantic request/response schemas for billing endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CreateStripeSubscriptionRequest(BaseModel):
    plan: str = Field(description="One of: starter, pro, team, helm_solo, helm_pro")
    billing_cycle: str = Field(description="monthly or annual")
    payment_method_id: str = Field(description="Stripe PaymentMethod ID from frontend")
    add_helm_addon: bool = False


class CreatePayPalSubscriptionRequest(BaseModel):
    plan: str = Field(description="One of: starter, pro, team, helm_solo, helm_pro")
    billing_cycle: str = Field(description="monthly or annual")
    add_helm_addon: bool = False


class SubscriptionStatusResponse(BaseModel):
    plan: str | None = None
    status: str | None = None
    billing_cycle: str | None = None
    trial_ends_at: datetime | None = None
    current_period_end: datetime | None = None
    helm_addon: bool = False
    stripe_subscription_id: str | None = None
    paypal_subscription_id: str | None = None
    monthly_amount: int | None = None
    cancel_at_period_end: bool = False


class CancelSubscriptionResponse(BaseModel):
    message: str
    cancel_at_period_end: bool


class WebhookResponse(BaseModel):
    received: bool
