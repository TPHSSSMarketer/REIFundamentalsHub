"""JWT helpers — create tokens, hash/verify passwords, cookie utilities."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import HTTPException, Response, status
from jose import JWTError, jwt
from passlib.context import CryptContext

from rei.config import get_settings

settings = get_settings()

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def create_access_token(
    data: dict,
    expires_delta: timedelta | None = None,
    token_type: str = "access",
) -> str:
    """Create a JWT token — either short-lived access or long-lived refresh.

    Args:
        data: Claims to encode (must include "sub" with user ID).
        expires_delta: Custom expiry. If None, uses config defaults.
        token_type: "access" (default, short-lived) or "refresh" (long-lived).
    """
    to_encode = data.copy()

    # JWT spec requires "sub" to be a string — python-jose enforces this on decode
    if "sub" in to_encode and not isinstance(to_encode["sub"], str):
        to_encode["sub"] = str(to_encode["sub"])

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    elif token_type == "refresh":
        expire = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    else:  # access
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)

    to_encode.update({"exp": expire, "type": token_type})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── CSRF ──────────────────────────────────────────────────────────────────


def generate_csrf_token() -> str:
    """Generate a cryptographically secure CSRF token."""
    return secrets.token_urlsafe(32)


# ── Cookie helpers ────────────────────────────────────────────────────────────


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    csrf_token: str,
) -> None:
    """Set HttpOnly access_token + refresh_token cookies, plus a readable CSRF cookie."""
    _s = get_settings()
    domain = _s.cookie_domain or None

    # Access token — short-lived, HttpOnly (JS cannot read)
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=_s.access_token_expire_minutes * 60,
        httponly=True,
        secure=_s.cookie_secure,
        samesite=_s.cookie_same_site,
        path="/",
        domain=domain,
    )

    # Refresh token — long-lived, HttpOnly (JS cannot read)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=_s.refresh_token_expire_days * 86400,
        httponly=True,
        secure=_s.cookie_secure,
        samesite=_s.cookie_same_site,
        path="/",
        domain=domain,
    )

    # CSRF token — NOT HttpOnly so the frontend can read and send it back
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        max_age=_s.refresh_token_expire_days * 86400,  # same lifespan as refresh
        httponly=False,
        secure=_s.cookie_secure,
        samesite=_s.cookie_same_site,
        path="/",
        domain=domain,
    )


def clear_auth_cookies(response: Response) -> None:
    """Delete all auth cookies (for logout)."""
    _s = get_settings()
    domain = _s.cookie_domain or None

    for key in ("access_token", "refresh_token", "csrf_token"):
        response.delete_cookie(
            key=key,
            path="/",
            domain=domain,
            secure=_s.cookie_secure,
            samesite=_s.cookie_same_site,
        )
