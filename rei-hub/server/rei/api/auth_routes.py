"""Auth routes — register, login, me, refresh, logout, Google OAuth."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from rei.api.auth import (
    clear_auth_cookies,
    create_access_token,
    decode_token,
    generate_csrf_token,
    hash_password,
    set_auth_cookies,
    verify_password,
)
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


# ── Helper to build token triplet and set cookies ─────────────────


def _issue_tokens_and_cookies(
    response: JSONResponse | RedirectResponse,
    user_id: int,
) -> tuple[str, str, str]:
    """Create access + refresh + CSRF tokens and set them as cookies on the response."""
    access_token = create_access_token(data={"sub": user_id}, token_type="access")
    refresh_token = create_access_token(data={"sub": user_id}, token_type="refresh")
    csrf_token = generate_csrf_token()
    set_auth_cookies(response, access_token, refresh_token, csrf_token)
    return access_token, refresh_token, csrf_token


# ── Register ──────────────────────────────────────────────────────


@auth_router.post("/register", response_model=TokenResponse)
async def register(body: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Register a new user with a 7-day starter trial."""
    # Rate limit: 5 registrations per hour per IP
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(rl_ip_key(ip, "register"), max_requests=5, window_seconds=3600):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please try again later.",
        )

    # Check for existing email — use generic message to prevent email enumeration
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Please check your details and try again.",
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

    # Build response with cookies
    response_data = TokenResponse(
        access_token="",  # Will be overwritten below
        user_id=user.id,
        email=user.email,
        plan="starter",
    )
    response = JSONResponse(content=response_data.model_dump(), status_code=201)
    access_token, _, _ = _issue_tokens_and_cookies(response, user.id)

    # Also include access_token in JSON body for backward compat (mobile / API)
    body_data = response_data.model_dump()
    body_data["access_token"] = access_token
    final = JSONResponse(content=body_data, status_code=201)
    response.body = final.body
    response.headers["content-length"] = str(len(final.body))

    asyncio.create_task(send_welcome_email(user, get_settings()))

    return response


# ── Login ─────────────────────────────────────────────────────────


@auth_router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT (+ set HttpOnly cookies)."""
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

    # Build response with cookies
    response_data = {
        "access_token": "",
        "token_type": "bearer",
        "user_id": user.id,
        "email": user.email,
        "plan": plan,
    }
    response = JSONResponse(content=response_data)
    access_token, _, _ = _issue_tokens_and_cookies(response, user.id)

    # Include access_token in JSON body for backward compat
    response_data["access_token"] = access_token
    final = JSONResponse(content=response_data)
    response.body = final.body
    response.headers["content-length"] = str(len(final.body))

    # Audit log successful login
    try:
        await db.run_sync(lambda s: audit_log(
            s, action="login", user_id=user.id, user_email=user.email,
            ip_address=ip,
        ))
    except Exception:
        pass

    return response


# ── Me ────────────────────────────────────────────────────────────


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
        is_superadmin=getattr(current_user, "is_superadmin", False),
        loan_servicing_enabled=getattr(current_user, "loan_servicing_enabled", False),
        loan_servicing_onboarding_complete=getattr(current_user, "loan_servicing_onboarding_complete", False),
        bank_negotiation_enabled=getattr(current_user, "bank_negotiation_enabled", False),
        company_name=getattr(current_user, "company_name", None),
    )


# ── Refresh ───────────────────────────────────────────────────────


@auth_router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Refresh tokens using the refresh_token HttpOnly cookie."""
    # Only accept refresh token from HttpOnly cookie — not from request body
    # This ensures the token is never accessible to JavaScript
    token: str | None = request.cookies.get("refresh_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not found",
        )

    payload = decode_token(token)

    # Accept both "refresh" type and None (old tokens without type claim)
    token_type = payload.get("type")
    if token_type is not None and token_type != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type. Expected refresh token.",
        )

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

    # Build response with new cookies
    response_data = {
        "access_token": "",
        "token_type": "bearer",
        "user_id": user.id,
        "email": user.email,
        "plan": plan,
    }
    response = JSONResponse(content=response_data)
    access_token, _, _ = _issue_tokens_and_cookies(response, user.id)

    response_data["access_token"] = access_token
    final = JSONResponse(content=response_data)
    response.body = final.body
    response.headers["content-length"] = str(len(final.body))

    return response


# ── Logout ────────────────────────────────────────────────────────


@auth_router.post("/logout")
async def logout():
    """Clear all auth cookies to log the user out."""
    response = JSONResponse(content={"message": "Logged out successfully"})
    clear_auth_cookies(response)
    return response


# ── Google OAuth ──────────────────────────────────────────────────


@auth_router.get("/google/url")
async def google_oauth_url(request: Request):
    """Return the Google OAuth consent URL for login with CSRF state parameter."""
    import secrets
    import urllib.parse

    # Generate cryptographic state token to prevent CSRF on OAuth flow
    state = secrets.token_urlsafe(32)

    params = {
        "client_id": settings.google_login_client_id,
        "redirect_uri": settings.google_login_redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "state": state,
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)

    # Return state so the frontend can store it; also set it as a short-lived cookie
    response = JSONResponse(content={"url": auth_url, "state": state})
    response.set_cookie(
        key="oauth_state",
        value=state,
        max_age=600,  # 10 minutes
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain or None,
    )
    return response


@auth_router.get("/google/redirect")
async def google_oauth_redirect(request: Request):
    """Redirect browser directly to Google OAuth consent screen (avoids CORS)."""
    import secrets
    import urllib.parse

    callback_url = settings.google_login_redirect_uri

    # Generate cryptographic state token to prevent CSRF on OAuth flow
    state = secrets.token_urlsafe(32)

    params = {
        "client_id": settings.google_login_client_id,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "state": state,
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)

    response = RedirectResponse(url=auth_url, status_code=302)
    response.set_cookie(
        key="oauth_state",
        value=state,
        max_age=600,  # 10 minutes
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain or None,
    )
    return response


@auth_router.get("/google/callback")
async def google_oauth_callback(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Google OAuth callback — verify state, exchange code, create/login user, set cookies and redirect."""
    import aiohttp
    import urllib.parse
    from sqlalchemy.exc import IntegrityError

    frontend_url = settings.hub_url + "/login"

    # ── Verify CSRF state parameter ─────────────────────────────
    state_param = request.query_params.get("state")
    state_cookie = request.cookies.get("oauth_state")
    if not state_param or not state_cookie or state_param != state_cookie:
        logger.warning("Google OAuth state mismatch: param=%s cookie=%s", state_param, state_cookie)
        return RedirectResponse(url=f"{frontend_url}?google_error=state_mismatch", status_code=302)

    code = request.query_params.get("code")
    if not code:
        return RedirectResponse(url=f"{frontend_url}?google_error=missing_code", status_code=302)

    settings_local = get_settings()

    token_data = {
        "client_id": settings_local.google_login_client_id,
        "client_secret": settings_local.google_login_client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": settings_local.google_login_redirect_uri,
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post("https://oauth2.googleapis.com/token", data=token_data) as resp:
                if resp.status != 200:
                    error_body = await resp.text()
                    print(f"GOOGLE TOKEN EXCHANGE FAILED: status={resp.status}, body={error_body}")
                    print(f"GOOGLE TOKEN EXCHANGE redirect_uri={settings_local.google_login_redirect_uri}")
                    return RedirectResponse(url=f"{frontend_url}?google_error=code_exchange_failed", status_code=302)
                tokens = await resp.json()

            access_token = tokens.get("access_token")
            if not access_token:
                return RedirectResponse(url=f"{frontend_url}?google_error=no_access_token", status_code=302)

            async with session.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"}
            ) as resp:
                if resp.status != 200:
                    return RedirectResponse(url=f"{frontend_url}?google_error=userinfo_failed", status_code=302)
                user_info = await resp.json()
    except Exception as e:
        print(f"GOOGLE OAUTH HTTP ERROR: {e}")
        return RedirectResponse(url=f"{frontend_url}?google_error=network_error", status_code=302)

    google_id = user_info.get("id")
    email = user_info.get("email")
    full_name = user_info.get("name")
    google_avatar_url = user_info.get("picture")

    if not google_id or not email:
        return RedirectResponse(url=f"{frontend_url}?google_error=invalid_user_info", status_code=302)

    # --- Find or create user ---
    try:
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
            try:
                user = User(
                    email=email,
                    hashed_password="!!GOOGLE_OAUTH_NO_PASSWORD!!",
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
                    status="trialing",
                    trial_ends_at=datetime.utcnow() + timedelta(days=7),
                )
                db.add(subscription)
                await db.commit()
                await db.refresh(user)
                result = await db.execute(
                    select(User).options(selectinload(User.subscription)).where(User.id == user.id)
                )
                user = result.scalar_one_or_none()
            except IntegrityError:
                await db.rollback()
                result = await db.execute(
                    select(User).options(selectinload(User.subscription)).where(User.email == email)
                )
                user = result.scalar_one_or_none()
                if user is None:
                    print(f"GOOGLE OAUTH: IntegrityError but user not found for email={email}")
                    return RedirectResponse(url=f"{frontend_url}?google_error=db_error", status_code=302)
        else:
            changed = False
            if not user.google_id:
                user.google_id = google_id
                changed = True
            if google_avatar_url:
                user.google_avatar_url = google_avatar_url
                changed = True
            if changed:
                await db.commit()
                await db.refresh(user)
    except Exception as e:
        print(f"GOOGLE OAUTH DB ERROR: {e}")
        return RedirectResponse(url=f"{frontend_url}?google_error=db_error", status_code=302)

    # Redirect to frontend with cookies set (no JWT in URL params!)
    redirect_url = settings_local.hub_url + "/login?auth_success=true"
    response = RedirectResponse(url=redirect_url, status_code=302)
    _issue_tokens_and_cookies(response, user.id)

    # Clear the one-time oauth_state cookie
    response.delete_cookie("oauth_state", domain=settings_local.cookie_domain or None)

    return response
