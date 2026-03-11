"""AI Admin Assistant — Trust Service.

Manages per-user, per-action trust preferences that learn from behavior.

Default trust levels:
- LOW risk (read data, summaries): auto-approve
- MEDIUM risk (send messages, update records): ask user
- HIGH risk (make calls, spend credits, delete): always ask

Learning:
- Tracks how many times a user approves each action type
- After TRUST_LEARNING_THRESHOLD approvals, suggests auto-approve
- Users can manually override any action to auto/ask/never
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.admin_assistant import AdminActionLog, AdminTrustSetting

logger = logging.getLogger(__name__)

# After this many approvals of the same action, suggest auto-approve
TRUST_LEARNING_THRESHOLD = 3

# Default trust levels by risk tier
DEFAULT_TRUST_BY_RISK = {
    "LOW": "auto",
    "MEDIUM": "ask",
    "HIGH": "ask",
}


async def get_trust_level(
    user_id: int,
    action_type: str,
    risk_level: str,
    db: AsyncSession,
) -> str:
    """Get the trust level for a specific action type.

    Returns "auto", "ask", or "never".
    Creates a default setting if none exists.
    """
    result = await db.execute(
        select(AdminTrustSetting).where(
            and_(
                AdminTrustSetting.user_id == user_id,
                AdminTrustSetting.action_type == action_type,
            )
        )
    )
    setting = result.scalar_one_or_none()

    if setting:
        # If the tool's risk level changed (e.g. MEDIUM→LOW), update stored setting
        if setting.risk_level != risk_level:
            setting.risk_level = risk_level
            new_default = DEFAULT_TRUST_BY_RISK.get(risk_level, "ask")
            # Only upgrade trust (ask→auto), never downgrade (auto→ask)
            if new_default == "auto" and setting.trust_level == "ask":
                setting.trust_level = "auto"
            await db.commit()
        return setting.trust_level

    # First encounter — create default based on risk level
    default_level = DEFAULT_TRUST_BY_RISK.get(risk_level, "ask")
    new_setting = AdminTrustSetting(
        user_id=user_id,
        action_type=action_type,
        risk_level=risk_level,
        trust_level=default_level,
    )
    db.add(new_setting)
    await db.commit()
    return default_level


async def record_approval(
    user_id: int,
    action_type: str,
    risk_level: str,
    approved: bool,
    db: AsyncSession,
) -> Optional[dict]:
    """Record a user's approval or rejection decision and learn from it.

    Returns a suggestion dict if auto-approve threshold is reached:
    {"suggest_auto": True, "action_type": "send_sms", "approval_count": 3}
    """
    result = await db.execute(
        select(AdminTrustSetting).where(
            and_(
                AdminTrustSetting.user_id == user_id,
                AdminTrustSetting.action_type == action_type,
            )
        )
    )
    setting = result.scalar_one_or_none()

    if not setting:
        setting = AdminTrustSetting(
            user_id=user_id,
            action_type=action_type,
            risk_level=risk_level,
            trust_level=DEFAULT_TRUST_BY_RISK.get(risk_level, "ask"),
        )
        db.add(setting)

    if approved:
        setting.approval_count += 1
        setting.last_approved_at = datetime.utcnow()

        # Check if we should suggest auto-approve
        if (
            setting.approval_count >= TRUST_LEARNING_THRESHOLD
            and not setting.suggested_auto
            and setting.trust_level == "ask"
        ):
            setting.suggested_auto = True
            await db.commit()
            return {
                "suggest_auto": True,
                "action_type": action_type,
                "approval_count": setting.approval_count,
            }
    else:
        setting.rejection_count += 1

    setting.updated_at = datetime.utcnow()
    await db.commit()
    return None


async def update_trust_level(
    user_id: int,
    action_type: str,
    new_level: str,
    db: AsyncSession,
) -> bool:
    """Manually update the trust level for an action type.

    new_level must be one of: "auto", "ask", "never"
    Returns True if updated, False if not found.
    """
    if new_level not in ("auto", "ask", "never"):
        raise ValueError(f"Invalid trust level: {new_level}")

    result = await db.execute(
        select(AdminTrustSetting).where(
            and_(
                AdminTrustSetting.user_id == user_id,
                AdminTrustSetting.action_type == action_type,
            )
        )
    )
    setting = result.scalar_one_or_none()

    if not setting:
        return False

    setting.trust_level = new_level
    setting.updated_at = datetime.utcnow()
    await db.commit()
    return True


async def get_all_trust_settings(
    user_id: int,
    db: AsyncSession,
) -> list[dict]:
    """Get all trust settings for a user (for the settings panel)."""
    result = await db.execute(
        select(AdminTrustSetting)
        .where(AdminTrustSetting.user_id == user_id)
        .order_by(AdminTrustSetting.risk_level, AdminTrustSetting.action_type)
    )
    settings = result.scalars().all()

    return [
        {
            "action_type": s.action_type,
            "risk_level": s.risk_level,
            "trust_level": s.trust_level,
            "approval_count": s.approval_count,
            "rejection_count": s.rejection_count,
            "suggested_auto": s.suggested_auto,
            "last_approved_at": s.last_approved_at.isoformat() if s.last_approved_at else None,
        }
        for s in settings
    ]


async def set_all_automatic(
    user_id: int,
    db: AsyncSession,
) -> int:
    """Set all trust settings to auto-approve (master toggle).

    Returns count of settings updated.
    """
    result = await db.execute(
        select(AdminTrustSetting).where(
            AdminTrustSetting.user_id == user_id
        )
    )
    settings = result.scalars().all()
    count = 0
    for s in settings:
        if s.trust_level != "auto":
            s.trust_level = "auto"
            s.updated_at = datetime.utcnow()
            count += 1
    await db.commit()
    return count


async def reset_to_defaults(
    user_id: int,
    db: AsyncSession,
) -> int:
    """Reset all trust settings to defaults based on risk level.

    Returns count of settings reset.
    """
    result = await db.execute(
        select(AdminTrustSetting).where(
            AdminTrustSetting.user_id == user_id
        )
    )
    settings = result.scalars().all()
    count = 0
    for s in settings:
        default = DEFAULT_TRUST_BY_RISK.get(s.risk_level, "ask")
        if s.trust_level != default:
            s.trust_level = default
            s.updated_at = datetime.utcnow()
            count += 1
    await db.commit()
    return count


async def should_auto_approve(
    user_id: int,
    action_type: str,
    risk_level: str,
    db: AsyncSession,
) -> bool:
    """Quick check: should this action be auto-approved?

    Convenience wrapper around get_trust_level.
    """
    level = await get_trust_level(user_id, action_type, risk_level, db)
    return level == "auto"
