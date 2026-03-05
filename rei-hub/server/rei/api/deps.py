"""FastAPI dependencies — database session and current user."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from rei.database import async_session_factory
from rei.api.auth import decode_token
from rei.models.user import User


async def get_db():
    """Yield an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract current user from either HttpOnly cookie or Bearer header.

    Dual-mode authentication:
      1. Web browsers → access_token HttpOnly cookie (set automatically)
      2. Mobile apps / API clients → Authorization: Bearer <token> header

    This allows both web and mobile clients to authenticate seamlessly.
    """
    token: str | None = None

    # Try 1: HttpOnly cookie (web browsers)
    token = request.cookies.get("access_token")

    # Try 2: Authorization Bearer header (mobile / API clients)
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Decode and validate
    payload = decode_token(token)

    # Only accept access tokens (reject refresh tokens used as access)
    if payload.get("type") not in ("access", None):
        # None allows backward compat with old tokens that lack a "type" claim
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    raw_sub = payload.get("sub")
    if raw_sub is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(
        select(User).options(selectinload(User.subscription)).where(User.id == int(raw_sub))
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
        )
    return user


def workspace_user_id(user: User) -> int:
    """Return the user ID that owns the shared workspace.

    Team members (owner_id is set) share their owner's data.
    Account owners and standalone users use their own ID.
    """
    return user.owner_id if user.owner_id is not None else user.id
