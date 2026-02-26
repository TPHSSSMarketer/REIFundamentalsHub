"""Middleware to require superadmin access for sensitive endpoints."""

from __future__ import annotations

from fastapi import Depends, HTTPException

from rei.api.deps import get_current_user
from rei.models.user import User


async def require_superadmin(user: User = Depends(get_current_user)) -> User:
    """Raise 403 if user is not a superadmin."""
    if not getattr(user, "is_superadmin", False):
        raise HTTPException(status_code=403, detail="SuperAdmin access required")
    return user
