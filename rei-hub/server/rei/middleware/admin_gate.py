"""Admin gating dependency — blocks access unless user is an admin."""

from __future__ import annotations

from fastapi import Depends, HTTPException

from rei.api.deps import get_current_user
from rei.models.user import User


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Raise 403 if the authenticated user is not an admin or superadmin."""
    if not (getattr(user, "is_admin", False) or getattr(user, "is_superadmin", False)):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
