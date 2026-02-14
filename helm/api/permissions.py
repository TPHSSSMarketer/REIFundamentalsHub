"""Permission enforcement for API actions."""

from __future__ import annotations

import logging

from helm.assistant.engine import PermissionTier, check_permission

logger = logging.getLogger(__name__)

# Map GHL tool names to permission actions
GHL_TOOL_PERMISSIONS = {
    # Read-only (AUTO)
    "ghl_search_contacts": "read_contacts",
    "ghl_get_contact": "read_contacts",
    "ghl_get_opportunities": "read_deals",
    "ghl_get_pipelines": "read_deals",
    "ghl_get_tasks": "read_tasks",
    "ghl_get_calendar_events": "read_calendar",
    "ghl_get_conversations": "read_contacts",
    "ghl_get_notes": "read_contacts",
    "ghl_get_custom_fields": "read_contacts",
    # Write operations (CONFIRM)
    "ghl_create_contact": "create_contact",
    "ghl_update_contact": "update_contact",
    "ghl_create_opportunity": "create_deal",
    "ghl_update_opportunity": "update_deal",
    "ghl_create_task": "create_task",
    "ghl_complete_task": "complete_task",
    "ghl_create_calendar_event": "schedule_event",
    "ghl_send_message": "send_message",
    "ghl_add_note": "create_contact",
}


def check_tool_permission(tool_name: str, user: dict | None = None) -> tuple[bool, str]:
    """Check if a GHL tool execution is allowed.

    Returns (allowed, reason).
    - Admin users bypass confirmation requirements.
    - Regular users need confirmation for write ops.
    """
    action = GHL_TOOL_PERMISSIONS.get(tool_name, "read_contacts")
    tier = check_permission(action)

    if tier == PermissionTier.AUTO:
        return True, "auto_approved"

    if tier == PermissionTier.ADMIN:
        return False, f"Action '{action}' requires admin access"

    # CONFIRM tier
    if user and user.get("is_admin"):
        return True, "admin_override"

    # For API calls with confirmed=true, allow it
    return False, f"Action '{action}' requires confirmation. Pass confirmed=true to proceed."


def check_action_permission(action: str, user: dict | None = None) -> tuple[bool, str]:
    """Generic permission check for any action."""
    tier = check_permission(action)

    if tier == PermissionTier.AUTO:
        return True, "auto_approved"

    if tier == PermissionTier.ADMIN:
        if user and user.get("is_admin"):
            return True, "admin_access"
        return False, f"Action '{action}' requires admin access"

    # CONFIRM tier — admin bypasses, others need explicit confirmation
    if user and user.get("is_admin"):
        return True, "admin_override"

    return False, f"Action '{action}' requires confirmation"
