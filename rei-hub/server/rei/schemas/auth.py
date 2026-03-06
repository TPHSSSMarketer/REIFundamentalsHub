"""Pydantic request/response schemas for auth endpoints."""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    email: str
    plan: str | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    is_active: bool
    is_verified: bool
    plan: str | None = None
    is_superadmin: bool = False
    loan_servicing_enabled: bool = False
    loan_servicing_onboarding_complete: bool = False
    bank_negotiation_enabled: bool = False
    company_name: str | None = None


class RefreshRequest(BaseModel):
    token: str
