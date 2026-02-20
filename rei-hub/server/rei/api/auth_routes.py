"""Auth routes — register, login, me, refresh."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from rei.api.auth import create_access_token, decode_token, hash_password, verify_password
from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import Subscription, User
from rei.services.email import send_welcome_email
from rei.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

settings = get_settings()
auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user with a 7-day starter trial."""
    # Check for existing email
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create user
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
    )
    db.add(user)
    await db.flush()

    # Create starter subscription with 7-day trial
    subscription = Subscription(
        user_id=user.id,
        plan="starter",
        status="trialing",
        trial_ends_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(subscription)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(days=7),
    )

    asyncio.create_task(send_welcome_email(user, get_settings()))

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        plan="starter",
    )


@auth_router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT."""
    result = await db.execute(
        select(User).options(selectinload(User.subscription)).where(User.email == body.email)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    plan = user.subscription.plan if user.subscription else None

    token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.jwt_expiration_minutes),
    )

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        email=user.email,
        plan=plan,
    )


@auth_router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    plan = current_user.subscription.plan if current_user.subscription else None

    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        plan=plan,
    )


@auth_router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh an existing JWT — decode, verify user still exists, issue new token."""
    payload = decode_token(body.token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    result = await db.execute(
        select(User).options(selectinload(User.subscription)).where(User.id == int(user_id))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    plan = user.subscription.plan if user.subscription else None

    new_token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.jwt_expiration_minutes),
    )

    return TokenResponse(
        access_token=new_token,
        user_id=user.id,
        email=user.email,
        plan=plan,
    )
