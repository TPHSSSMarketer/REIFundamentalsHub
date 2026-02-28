"""Auth routes — register, login, me, refresh."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from rei.api.auth import create_access_token, decode_token, hash_password, verify_password
from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import Subscription, User
from rei.services.email import send_welcome_email
from rei.services.security import (
    sanitize_text,
    sanitize_email,
    sanitize_phone,
    sanitize_currency,
    sanitize_state_code,
    check_rate_limit,
    rl_key,
    rl_ip_key,
    audit_log,
)
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
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT."""
    ip = request.client.host if request.client else "unknown"

    # Rate limit: 10 attempts per 15 min per IP
    if not check_rate_limit(rl_ip_key(ip, "login"), max_requests=10, window_seconds=900):
        raise HTTPException(
            status_code=429,
            detail="Too many login attempts. Try again in 15 minutes.",
        )

    # Sanitize email
    try:
        email = sanitize_email(body.email)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    result = await db.execute(
        select(User).options(selectinload(User.subscription)).where(User.email == email)
    )
    user = result.scalar_one_or_none()
    if user is None:
        # Audit log failed login
        try:
            await db.run_sync(lambda s: audit_log(
                s, action="failed_login", user_email=body.email,
                ip_address=ip, success=False,
            ))
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not verify_password(body.password, user.hashed_password):
        # Audit log failed login
        try:
            await db.run_sync(lambda s: audit_log(
                s, action="failed_login", user_email=body.email,
                ip_address=ip, success=False,
            ))
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    plan = user.subscription.plan if user.subscription else None

    token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.jwt_expiration_minutes),
    )

    # Audit log successful login
    try:
        await db.run_sync(lambda s: audit_log(
            s, action="login", user_id=user.id, user_email=user.email,
            ip_address=ip,
        ))
    except Exception:
        pass

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


@auth_router.get("/google/url")
async def google_oauth_url():
    """Return the Google OAuth consent URL for login."""
    import urllib.parse

    params = {
        "client_id": settings.google_login_client_id,
        "redirect_uri": settings.google_login_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    return {"url": auth_url}


@auth_router.get("/google/redirect")
async def google_oauth_redirect(request: Request):
    """Redirect browser directly to Google OAuth consent screen (avoids CORS)."""
    import urllib.parse

    callback_url = settings.google_login_redirect_uri

    params = {
        "client_id": settings.google_login_client_id,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    return RedirectResponse(url=auth_url)


@auth_router.get("/google/callback")
async def google_oauth_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback - exchange code, create/login user, redirect to frontend with token."""
    import aiohttp
    import urllib.parse

    frontend_url = "https://hub.reifundamentalshub.com/login"

    code = request.query_params.get("code")
    if not code:
        return RedirectResponse(url=f"{frontend_url}?google_error=missing_code")

    settings = get_settings()

    token_data = {
        "client_id": settings.google_login_client_id,
        "client_secret": settings.google_login_client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": settings.google_login_redirect_uri,
    }

    async with aiohttp.ClientSession() as session:
        async with session.post("https://oauth2.googleapis.com/token", data=token_data) as resp:
            if resp.status != 200:
                return RedirectResponse(url=f"{frontend_url}?google_error=code_exchange_failed")
            tokens = await resp.json()

        access_token = tokens.get("access_token")
        if not access_token:
            return RedirectResponse(url=f"{frontend_url}?google_error=no_access_token")

        async with session.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        ) as resp:
            if resp.status != 200:
                return RedirectResponse(url=f"{frontend_url}?google_error=userinfo_failed")
            user_info = await resp.json()

    google_id = user_info.get("id")
    email = user_info.get("email")
    full_name = user_info.get("name")
    google_avatar_url = user_info.get("picture")

    if not google_id or not email:
        return RedirectResponse(url=f"{frontend_url}?google_error=invalid_user_info")

    result = await db.execute(
        select(User).options(selectinload(User.subscription)).where(User.google_id == google_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        result = await db.execute(
            select(User).options(selectinload(User.subscription)).where(User.email == email)
        )
        user = result.scalar_one_or_none()

    if user is None:
        user = User(
            email=email,
            full_name=full_name or "",
            google_id=google_id,
            google_avatar_url=google_avatar_url,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        await db.flush()

        subscription = Subscription(
            user_id=user.id,
            plan="starter",
            status="active",
        )
        db.add(subscription)
        await db.commit()
        await db.refresh(user)
    else:
        if not user.google_id:
            user.google_id = google_id
        if google_avatar_url:
            user.google_avatar_url = google_avatar_url
        await db.commit()
        await db.refresh(user)

    plan = user.subscription.plan if user.subscription else None
    token = create_access_token(
        data={"sub": user.id},
        expires_delta=timedelta(minutes=settings.jwt_expiration_minutes),
    )

    params = urllib.parse.urlencode({
        "google_token": token,
        "user_id": str(user.id),
        "email": user.email,
        "plan": plan or "",
    })
    return RedirectResponse(url=f"{frontend_url}?{params}")
