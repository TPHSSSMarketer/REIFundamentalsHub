"""Feature gating dependency — blocks access based on plan features."""

from __future__ import annotations

from datetime import datetime

from fastapi import Depends, HTTPException

from rei.api.deps import get_current_user
from rei.config import PLANS
from rei.models.user import User


def require_feature(feature_slug: str):
    """Return a FastAPI dependency that verifies the user's plan includes *feature_slug*.

    Usage::

        @router.get("/content-hub")
        async def content_hub(user: User = Depends(require_feature("content_hub"))):
            ...
    """

    async def _check(
        user: User = Depends(get_current_user),
    ) -> User:
        plan_key = getattr(user, "plan", "starter") or "starter"
        plan_features = PLANS.get(plan_key, {}).get("features", [])

        sub_status = getattr(user, "subscription_status", "trialing")
        trial_ends = getattr(user, "trial_ends_at", None)

        is_active = sub_status in ("trialing", "active")
        trial_ok = (
            trial_ends is not None and trial_ends > datetime.utcnow()
        )

        if not (is_active or trial_ok):
            raise HTTPException(
                status_code=403,
                detail="Subscription required",
            )

        if feature_slug not in plan_features:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Your {plan_key.title()} plan does not include "
                    f"{feature_slug}. Please upgrade."
                ),
            )

        return user

    return _check
