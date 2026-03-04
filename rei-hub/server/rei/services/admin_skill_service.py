"""AI Admin Assistant — Skill Management Service.

Manages system and user-created skills. Skills are reusable automation
templates — named sequences of tool calls that accomplish specific goals.

Skills can be:
- System skills: Pre-built, available to all users, read-only
- User skills: Created by the user, customizable

Each skill contains:
- name, description, category
- action_steps: JSON array of tool calls executed in sequence
- icon: UI icon name (lucide-react)
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.admin_assistant import AdminSkill
from rei.models.user import User
from rei.services import admin_tools_service

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════
# RETRIEVAL — Get skills from the library
# ═══════════════════════════════════════════════════════════════════


async def get_skill_library(user_id: int, db: AsyncSession) -> list[dict]:
    """Get the complete skill library for a user.

    Returns system skills + user's custom skills in dict format.

    Args:
        user_id: The user's ID
        db: AsyncSession for database access

    Returns:
        List of skill dicts with full details
    """
    # Fetch system skills + user's custom skills
    result = await db.execute(
        select(AdminSkill).where(
            (AdminSkill.is_system.is_(True))
            | (AdminSkill.user_id == user_id)
        )
    )
    skills = result.scalars().all()

    return [_skill_to_dict(skill) for skill in skills]


async def get_skill(
    skill_id: str,
    user_id: int,
    db: AsyncSession,
) -> Optional[dict]:
    """Get a single skill by ID.

    Verifies the user owns it or it's a system skill.

    Args:
        skill_id: The skill ID
        user_id: The user's ID
        db: AsyncSession for database access

    Returns:
        Skill dict, or None if not found / user doesn't own it
    """
    result = await db.execute(
        select(AdminSkill).where(AdminSkill.id == skill_id)
    )
    skill = result.scalar_one_or_none()

    if not skill:
        logger.warning(f"Skill {skill_id} not found")
        return None

    # Check ownership: user must own it or it's a system skill
    if skill.user_id is not None and skill.user_id != user_id:
        logger.warning(
            f"User {user_id} attempted to access skill {skill_id} "
            f"owned by user {skill.user_id}"
        )
        return None

    return _skill_to_dict(skill)


# ═══════════════════════════════════════════════════════════════════
# CREATE — Build new custom skills
# ═══════════════════════════════════════════════════════════════════


async def create_skill(
    user_id: int,
    name: str,
    description: str,
    category: str,
    action_steps: list[dict],
    icon: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> dict:
    """Create a new custom skill for the user.

    Args:
        user_id: The user's ID
        name: Skill name
        description: Skill description
        category: Category for UI grouping
        action_steps: List of action step dicts
        icon: Optional lucide-react icon name
        db: AsyncSession for database access

    Returns:
        Created skill dict

    Raises:
        ValueError: If parameters are invalid
    """
    if not db:
        raise ValueError("Database session required")

    if not name or not name.strip():
        raise ValueError("Skill name cannot be empty")
    if not description or not description.strip():
        raise ValueError("Skill description cannot be empty")
    if not action_steps:
        raise ValueError("At least one action step is required")

    # Serialize action_steps as JSON
    action_steps_json = json.dumps(action_steps)

    skill = AdminSkill(
        user_id=user_id,
        name=name,
        description=description,
        category=category,
        action_steps=action_steps_json,
        icon=icon,
        is_system=False,
        enabled=True,
    )

    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    logger.info(
        f"Created skill '{name}' (id={skill.id}) for user {user_id}"
    )
    return _skill_to_dict(skill)


# ═══════════════════════════════════════════════════════════════════
# UPDATE — Modify custom skills
# ═══════════════════════════════════════════════════════════════════


async def update_skill(
    skill_id: str,
    user_id: int,
    updates: dict,
    db: AsyncSession,
) -> dict:
    """Update a custom skill.

    Cannot edit system skills. Only the owner can update.

    Args:
        skill_id: The skill ID
        user_id: The user's ID
        updates: Dict with fields to update
                 (name, description, category, action_steps, icon, enabled)
        db: AsyncSession for database access

    Returns:
        Updated skill dict

    Raises:
        PermissionError: If user doesn't own the skill or it's a system skill
        ValueError: If skill not found
    """
    result = await db.execute(
        select(AdminSkill).where(AdminSkill.id == skill_id)
    )
    skill = result.scalar_one_or_none()

    if not skill:
        raise ValueError(f"Skill {skill_id} not found")

    # System skills cannot be edited
    if skill.is_system:
        raise PermissionError("System skills cannot be edited")

    # User must own the skill
    if skill.user_id != user_id:
        raise PermissionError(
            f"User {user_id} does not own skill {skill_id}"
        )

    # Apply updates
    if "name" in updates:
        if not updates["name"] or not updates["name"].strip():
            raise ValueError("Skill name cannot be empty")
        skill.name = updates["name"]

    if "description" in updates:
        if not updates["description"] or not updates["description"].strip():
            raise ValueError("Skill description cannot be empty")
        skill.description = updates["description"]

    if "category" in updates:
        skill.category = updates["category"]

    if "action_steps" in updates:
        if not updates["action_steps"]:
            raise ValueError("At least one action step is required")
        skill.action_steps = json.dumps(updates["action_steps"])

    if "icon" in updates:
        skill.icon = updates["icon"]

    if "enabled" in updates:
        skill.enabled = updates["enabled"]

    await db.commit()
    await db.refresh(skill)

    logger.info(f"Updated skill '{skill.name}' (id={skill_id})")
    return _skill_to_dict(skill)


# ═══════════════════════════════════════════════════════════════════
# DELETE — Remove custom skills
# ═══════════════════════════════════════════════════════════════════


async def delete_skill(
    skill_id: str,
    user_id: int,
    db: AsyncSession,
) -> bool:
    """Delete a custom skill.

    Cannot delete system skills. Only the owner can delete.

    Args:
        skill_id: The skill ID
        user_id: The user's ID
        db: AsyncSession for database access

    Returns:
        True if deleted, False otherwise

    Raises:
        PermissionError: If user doesn't own the skill or it's a system skill
    """
    result = await db.execute(
        select(AdminSkill).where(AdminSkill.id == skill_id)
    )
    skill = result.scalar_one_or_none()

    if not skill:
        logger.warning(f"Skill {skill_id} not found for deletion")
        return False

    # System skills cannot be deleted
    if skill.is_system:
        raise PermissionError("System skills cannot be deleted")

    # User must own the skill
    if skill.user_id != user_id:
        raise PermissionError(
            f"User {user_id} does not own skill {skill_id}"
        )

    await db.delete(skill)
    await db.commit()

    logger.info(f"Deleted skill '{skill.name}' (id={skill_id})")
    return True


# ═══════════════════════════════════════════════════════════════════
# EXECUTION — Run a skill's action steps
# ═══════════════════════════════════════════════════════════════════


async def execute_skill(
    skill_id: str,
    user: User,
    db: AsyncSession,
    settings: dict,
) -> dict:
    """Execute a skill by running its action_steps sequence.

    Calls execute_tool for each step in sequence. Tracks results and
    pending actions.

    Args:
        skill_id: The skill ID
        user: The User object from auth
        db: AsyncSession for database access
        settings: App settings (for tool execution)

    Returns:
        {
            "status": "completed" | "partial" | "failed",
            "skill_id": str,
            "skill_name": str,
            "results": [
                {"tool": str, "status": "executed"|"pending"|"rejected", "result": dict}
            ],
            "pending_actions": [action_ids],
            "error_message": str (if status is "failed"),
        }

    Raises:
        ValueError: If skill not found
    """
    # Fetch the skill
    result = await db.execute(
        select(AdminSkill).where(AdminSkill.id == skill_id)
    )
    skill = result.scalar_one_or_none()

    if not skill:
        raise ValueError(f"Skill {skill_id} not found")

    # Check ownership: user must own it or it's a system skill
    if skill.user_id is not None and skill.user_id != user.id:
        raise ValueError(f"User {user.id} does not have access to skill {skill_id}")

    # Check if enabled
    if not skill.enabled:
        return {
            "status": "failed",
            "skill_id": skill_id,
            "skill_name": skill.name,
            "results": [],
            "pending_actions": [],
            "error_message": f"Skill '{skill.name}' is disabled",
        }

    # Parse action steps
    try:
        action_steps = json.loads(skill.action_steps)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse action_steps for skill {skill_id}: {e}")
        return {
            "status": "failed",
            "skill_id": skill_id,
            "skill_name": skill.name,
            "results": [],
            "pending_actions": [],
            "error_message": f"Invalid action steps configuration: {str(e)}",
        }

    if not action_steps:
        return {
            "status": "failed",
            "skill_id": skill_id,
            "skill_name": skill.name,
            "results": [],
            "pending_actions": [],
            "error_message": "Skill has no action steps",
        }

    # Execute each step in sequence
    results = []
    pending_actions = []
    completed_count = 0
    failed_count = 0
    pending_count = 0
    prev_result = None

    for i, step in enumerate(action_steps):
        try:
            tool_name = step.get("tool")
            params = step.get("params", {})

            if not tool_name:
                logger.warning(
                    f"Skill {skill_id} step {i}: missing tool name"
                )
                failed_count += 1
                results.append({
                    "tool": f"step_{i}",
                    "status": "failed",
                    "result": {"error": "Missing tool name"},
                })
                break

            # Interpolate {{prev_result}} in params if available
            if prev_result is not None:
                try:
                    params_str = json.dumps(params)
                    params_str = params_str.replace(
                        "{{prev_result}}", json.dumps(prev_result)
                    )
                    params = json.loads(params_str)
                except (json.JSONDecodeError, TypeError) as e:
                    logger.warning(
                        f"Skill {skill_id} step {i}: failed to interpolate {{{{prev_result}}}}: {e}"
                    )
                    failed_count += 1
                    results.append({
                        "tool": tool_name,
                        "status": "failed",
                        "result": {"error": f"Failed to interpolate prev_result: {str(e)}"},
                    })
                    break

            # Execute the tool
            tool_result = await admin_tools_service.execute_tool(
                tool_name=tool_name,
                params=params,
                user=user,
                db=db,
                settings=settings,
            )

            status = tool_result.get("status", "failed")
            if status == "executed":
                completed_count += 1
                # Track result for next step's interpolation
                prev_result = tool_result.get("result") or tool_result.get("message")
            elif status == "pending":
                pending_count += 1
                action_id = tool_result.get("action_id")
                if action_id:
                    pending_actions.append(action_id)
                # Stop executing remaining steps on pending
                results.append({
                    "tool": tool_name,
                    "status": status,
                    "result": tool_result.get("result") or tool_result.get("message"),
                })
                break
            elif status == "rejected":
                failed_count += 1
                # Stop executing remaining steps on rejection
                results.append({
                    "tool": tool_name,
                    "status": status,
                    "result": tool_result.get("result") or tool_result.get("message"),
                })
                break

            results.append({
                "tool": tool_name,
                "status": status,
                "result": tool_result.get("result") or tool_result.get("message"),
            })

        except Exception as e:
            logger.exception(f"Error executing step {i} in skill {skill_id}: {e}")
            failed_count += 1
            results.append({
                "tool": step.get("tool", f"step_{i}"),
                "status": "failed",
                "result": {"error": str(e)},
            })
            break

    # Determine overall status
    if failed_count > 0 and completed_count == 0 and pending_count == 0:
        overall_status = "failed"
    elif pending_count > 0 or (completed_count > 0 and failed_count > 0):
        overall_status = "partial"
    else:
        overall_status = "completed"

    # Update skill usage tracking
    skill.total_runs += 1
    from datetime import datetime
    skill.last_run_at = datetime.utcnow()
    await db.commit()

    logger.info(
        f"Executed skill '{skill.name}' (id={skill_id}) "
        f"for user {user.id}: {overall_status} "
        f"({completed_count} completed, {pending_count} pending, {failed_count} failed)"
    )

    return {
        "status": overall_status,
        "skill_id": skill_id,
        "skill_name": skill.name,
        "results": results,
        "pending_actions": pending_actions,
    }


# ═══════════════════════════════════════════════════════════════════
# HELPERS — Internal utilities
# ═══════════════════════════════════════════════════════════════════


def _skill_to_dict(skill: AdminSkill) -> dict:
    """Convert a skill model to a dict."""
    # Parse action_steps JSON
    try:
        action_steps = json.loads(skill.action_steps)
    except (json.JSONDecodeError, TypeError):
        action_steps = []

    return {
        "id": skill.id,
        "user_id": skill.user_id,
        "name": skill.name,
        "description": skill.description,
        "category": skill.category,
        "is_system": skill.is_system,
        "action_steps": action_steps,
        "icon": skill.icon,
        "enabled": skill.enabled,
        "total_runs": skill.total_runs,
        "last_run_at": skill.last_run_at.isoformat() if skill.last_run_at else None,
        "created_at": skill.created_at.isoformat() if skill.created_at else None,
        "updated_at": skill.updated_at.isoformat() if skill.updated_at else None,
    }
