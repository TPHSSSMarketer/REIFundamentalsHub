"""AI Admin Assistant — Tool Executor Service.

Receives tool calls from the orchestrator and executes them against
the platform's actual data. Each tool call goes through:

1. Look up risk level from tool definitions
2. Check trust level (auto/ask/never)
3. Log the proposed action in AdminActionLog
4. If auto-approved → execute immediately and return result
5. If needs approval → return pending status for user to approve
6. If never → reject and return explanation

Tool implementations query the database directly using SQLAlchemy,
reusing existing model patterns from the codebase.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.admin_assistant import AdminActionLog
from rei.models.crm import CrmContact, CrmDeal, CrmPortfolioProperty
from rei.models.user import (
    CallLog,
    ConversationLog,
    PhoneCredit,
    ScheduledCallback,
    SmsMessage,
    User,
)
from rei.services import admin_trust_service
from rei.services.admin_tools_definitions import TOOLS_BY_NAME, get_risk_level

logger = logging.getLogger(__name__)


def _ws_uid(user: User) -> int:
    """Return the workspace-owner user ID (same logic as deps.workspace_user_id).

    Team members share their owner's data; standalone users use their own ID.
    Using this everywhere ensures deals/contacts created by the assistant
    are visible in the subscriber's Pipeline and CRM views.
    """
    return user.owner_id if user.owner_id is not None else user.id


def _safe_int(val) -> int | None:
    """Convert a value to int, returning None if not possible."""
    if val is None or val == "":
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> float | None:
    """Convert a value to float, returning None if not possible."""
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


# ══════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT — Tool Execution with Trust System
# ══════════════════════════════════════════════════════════════════


async def execute_tool(
    tool_name: str,
    params: dict,
    user: User,
    db: AsyncSession,
    settings: dict,
    session_id: Optional[str] = None,
) -> dict:
    """Main entry point for tool execution.

    Executes the full trust pipeline:
    1. Validate tool exists
    2. Get risk level
    3. Check trust setting
    4. Log proposed action
    5. Execute if approved or auto-approved
    6. Return result

    Args:
        tool_name: Name of the tool to execute
        params: Tool parameters (dict)
        user: The User object from auth
        db: AsyncSession for database access
        settings: App settings (for Twilio config, etc.)
        session_id: Optional chat session ID that triggered this

    Returns:
        {
            "status": "executed" | "pending" | "rejected",
            "result": {...},      # if executed
            "action_id": str,     # always present
            "message": str,       # if pending/rejected
        }
    """
    # Validate tool exists
    if tool_name not in TOOLS_BY_NAME:
        logger.warning(f"Tool not found: {tool_name}")
        return {
            "status": "rejected",
            "action_id": "",
            "message": f"Tool '{tool_name}' not found",
        }

    tool_def = TOOLS_BY_NAME[tool_name]
    risk_level = get_risk_level(tool_name)

    # Build human-readable action name
    action_name = _build_action_name(tool_name, params)

    try:
        # Check trust level for this action
        trust_level = await admin_trust_service.get_trust_level(
            user.id, tool_name, risk_level, db
        )

        # Create action log entry
        action_log = AdminActionLog(
            user_id=user.id,
            session_id=session_id,
            action_type=tool_name,
            action_name=action_name,
            risk_level=risk_level,
            proposed_details=json.dumps(params),
            execution_status="pending",
        )
        db.add(action_log)
        await db.commit()
        action_id = action_log.id

        # Check if action is blocked ("never")
        if trust_level == "never":
            action_log.approved = False
            action_log.approval_method = "rejected"
            action_log.approval_message = "User has disabled this action type"
            action_log.execution_status = "rejected"
            action_log.approved_at = datetime.utcnow()
            await db.commit()

            logger.info(
                f"Action {action_id} rejected by trust setting for user {user.id}"
            )
            return {
                "status": "rejected",
                "action_id": action_id,
                "message": f"You have disabled {tool_name}. Enable it in settings to proceed.",
            }

        # If auto-approve, execute immediately
        if trust_level == "auto":
            action_log.approved = True
            action_log.approval_method = "auto"
            action_log.execution_status = "executing"
            action_log.approved_at = datetime.utcnow()
            await db.commit()

            logger.info(
                f"Action {action_id} auto-approved for user {user.id}: {tool_name}"
            )

            # Execute the tool
            try:
                result = await _execute_tool_internal(
                    tool_name, params, user, db, settings
                )
                action_log.execution_status = "success"
                action_log.result_data = json.dumps(result)
                action_log.executed_at = datetime.utcnow()
                await db.commit()

                logger.info(f"Action {action_id} executed successfully")
                return {
                    "status": "executed",
                    "action_id": action_id,
                    "result": result,
                }
            except Exception as e:
                error_msg = str(e)
                action_log.execution_status = "failed"
                action_log.error_message = error_msg
                action_log.executed_at = datetime.utcnow()
                await db.commit()

                logger.error(f"Action {action_id} failed: {error_msg}")
                return {
                    "status": "executed",
                    "action_id": action_id,
                    "result": {"error": error_msg},
                }

        # Otherwise, needs user approval
        logger.info(
            f"Action {action_id} pending approval for user {user.id}: {tool_name}"
        )
        return {
            "status": "pending",
            "action_id": action_id,
            "message": f"Awaiting approval to {action_name}",
        }

    except Exception as e:
        logger.exception(f"Error executing tool {tool_name}: {str(e)}")
        return {
            "status": "rejected",
            "action_id": "",
            "message": f"Error: {str(e)}",
        }


async def execute_approved_action(
    action_id: str,
    user: User,
    db: AsyncSession,
    settings: dict,
) -> dict:
    """Execute a pending action after user approval.

    Args:
        action_id: The AdminActionLog ID
        user: The approving User
        db: AsyncSession
        settings: App settings

    Returns:
        {
            "status": "executed" | "rejected",
            "result": {...},
            "message": str,
        }
    """
    # Fetch the action log
    result = await db.execute(
        select(AdminActionLog).where(
            and_(
                AdminActionLog.id == action_id,
                AdminActionLog.user_id == user.id,
            )
        )
    )
    action_log = result.scalar_one_or_none()

    if not action_log:
        logger.warning(f"Action {action_id} not found for user {user.id}")
        return {
            "status": "rejected",
            "message": "Action not found",
        }

    if action_log.execution_status != "pending":
        logger.warning(
            f"Action {action_id} is not pending: {action_log.execution_status}"
        )
        return {
            "status": "rejected",
            "message": f"Action is not pending (status: {action_log.execution_status})",
        }

    # Mark as approved
    action_log.approved = True
    action_log.approval_method = "user"
    action_log.execution_status = "executing"
    action_log.approved_at = datetime.utcnow()
    await db.commit()

    # Parse params
    try:
        params = json.loads(action_log.proposed_details or "{}")
    except json.JSONDecodeError:
        params = {}

    # Execute the tool
    try:
        result = await _execute_tool_internal(
            action_log.action_type, params, user, db, settings
        )
        action_log.execution_status = "success"
        action_log.result_data = json.dumps(result)
        action_log.executed_at = datetime.utcnow()
        await db.commit()

        # Record approval for learning
        await admin_trust_service.record_approval(
            user.id,
            action_log.action_type,
            action_log.risk_level,
            approved=True,
            db=db,
        )

        logger.info(f"Action {action_id} executed successfully after approval")
        return {
            "status": "executed",
            "result": result,
        }
    except Exception as e:
        error_msg = str(e)
        action_log.execution_status = "failed"
        action_log.error_message = error_msg
        action_log.executed_at = datetime.utcnow()
        await db.commit()

        logger.error(f"Action {action_id} failed during execution: {error_msg}")
        return {
            "status": "executed",
            "result": {"error": error_msg},
        }


async def reject_action(
    action_id: str,
    user: User,
    db: AsyncSession,
    reason: Optional[str] = None,
) -> dict:
    """Reject a pending action.

    Args:
        action_id: The AdminActionLog ID
        user: The rejecting User
        db: AsyncSession
        reason: Optional reason for rejection

    Returns:
        {"status": "rejected", "message": str}
    """
    result = await db.execute(
        select(AdminActionLog).where(
            and_(
                AdminActionLog.id == action_id,
                AdminActionLog.user_id == user.id,
            )
        )
    )
    action_log = result.scalar_one_or_none()

    if not action_log:
        return {
            "status": "rejected",
            "message": "Action not found",
        }

    if action_log.execution_status != "pending":
        return {
            "status": "rejected",
            "message": f"Action is not pending (status: {action_log.execution_status})",
        }

    # Mark as rejected
    action_log.approved = False
    action_log.approval_method = "rejected"
    action_log.approval_message = reason or "User rejected"
    action_log.execution_status = "rejected"
    action_log.approved_at = datetime.utcnow()
    await db.commit()

    # Record rejection for learning
    await admin_trust_service.record_approval(
        user.id,
        action_log.action_type,
        action_log.risk_level,
        approved=False,
        db=db,
    )

    logger.info(f"Action {action_id} rejected by user {user.id}")
    return {
        "status": "rejected",
        "message": "Action rejected",
    }


# ══════════════════════════════════════════════════════════════════
# TOOL DISPATCHER — Routes to individual tool handlers
# ══════════════════════════════════════════════════════════════════

# Forward declarations for handler functions (defined below)
TOOL_HANDLERS = {}  # Will be populated at bottom of file


async def _execute_tool_internal(
    tool_name: str,
    params: dict,
    user: User,
    db: AsyncSession,
    settings: dict,
) -> dict:
    """Route tool calls to their handlers using dict-based dispatcher.

    This is the main dispatcher that routes each tool to its handler function.
    Each handler returns a dict with the result data.

    Raises:
        ValueError: If tool is not implemented or params are invalid
    """
    # Get the handler for this tool
    handler = TOOL_HANDLERS.get(tool_name)

    if not handler:
        raise ValueError(f"Unknown tool: {tool_name}")

    # Call the handler with appropriate parameters
    if handler.get("needs_settings"):
        return await handler["fn"](params, user, db, settings)
    else:
        return await handler["fn"](params, user, db)


# ══════════════════════════════════════════════════════════════════
# CRM TOOL HANDLERS
# ══════════════════════════════════════════════════════════════════


async def _get_contacts(params: dict, user: User, db: AsyncSession) -> dict:
    """Get contacts from CRM with optional filtering."""
    search = params.get("search", "").lower()
    tag = params.get("tag", "").lower()
    role = params.get("role", "").lower()
    limit = params.get("limit", 25)

    query = select(CrmContact).where(CrmContact.user_id == _ws_uid(user))

    # Apply filters
    if role:
        query = query.where(CrmContact.role.ilike(f"%{role}%"))

    result = await db.execute(query.limit(limit))
    contacts = result.scalars().all()

    # Filter by search in memory (cheaper than additional DB query)
    if search:
        contacts = [
            c
            for c in contacts
            if any(
                search in str(getattr(c, attr, "")).lower()
                for attr in ["name", "phone", "email"]
            )
        ]

    # Filter by tag (stored as JSON string)
    if tag:
        import json

        contacts = [
            c
            for c in contacts
            if tag in json.loads(c.tags_json or "[]")
        ]

    return {
        "contacts": [
            {
                "id": c.id,
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "role": c.role,
                "interaction_count": c.interaction_count,
                "last_contacted_at": c.last_contacted_at.isoformat()
                if c.last_contacted_at
                else None,
            }
            for c in contacts
        ],
        "count": len(contacts),
    }


async def _get_contact_details(params: dict, user: User, db: AsyncSession) -> dict:
    """Get full details for a specific contact."""
    contact_id = params.get("contact_id")
    if not contact_id:
        raise ValueError("contact_id is required")

    result = await db.execute(
        select(CrmContact).where(
            and_(
                CrmContact.id == contact_id,
                CrmContact.user_id == _ws_uid(user),
            )
        )
    )
    contact = result.scalar_one_or_none()

    if not contact:
        return {"error": "Contact not found"}

    import json

    return {
        "id": contact.id,
        "name": contact.name,
        "phone": contact.phone,
        "email": contact.email,
        "role": contact.role,
        "company": contact.company,
        "tags": json.loads(contact.tags_json or "[]"),
        "notes": contact.notes,
        "rating": contact.rating,
        "interaction_count": contact.interaction_count,
        "last_contacted_at": contact.last_contacted_at.isoformat()
        if contact.last_contacted_at
        else None,
        "created_at": contact.created_at.isoformat(),
    }


async def _create_contact(params: dict, user: User, db: AsyncSession) -> dict:
    """Create a new contact in the CRM."""
    import json
    import uuid

    name = params.get("name")
    if not name:
        raise ValueError("name is required")

    contact = CrmContact(
        id=str(uuid.uuid4()),
        user_id=_ws_uid(user),
        name=name,
        phone=params.get("phone"),
        email=params.get("email"),
        role=params.get("role", "other"),
        tags_json=json.dumps(params.get("tags", [])),
    )
    db.add(contact)
    await db.commit()

    return {
        "id": contact.id,
        "name": contact.name,
        "message": "Contact created successfully",
    }


async def _update_contact(params: dict, user: User, db: AsyncSession) -> dict:
    """Update an existing contact."""
    import json

    contact_id = params.get("contact_id")
    if not contact_id:
        raise ValueError("contact_id is required")

    result = await db.execute(
        select(CrmContact).where(
            and_(
                CrmContact.id == contact_id,
                CrmContact.user_id == _ws_uid(user),
            )
        )
    )
    contact = result.scalar_one_or_none()

    if not contact:
        return {"error": "Contact not found"}

    # Update fields
    if "name" in params:
        contact.name = params["name"]
    if "phone" in params:
        contact.phone = params["phone"]
    if "email" in params:
        contact.email = params["email"]
    if "tags" in params:
        contact.tags_json = json.dumps(params["tags"])
    if "notes" in params:
        contact.notes = params["notes"]

    contact.updated_at = datetime.utcnow()
    await db.commit()

    return {
        "id": contact.id,
        "message": "Contact updated successfully",
    }


async def _get_pipeline_summary(params: dict, user: User, db: AsyncSession) -> dict:
    """Get a summary of the deals pipeline: counts and values by stage."""
    # Count deals by stage
    result = await db.execute(
        select(
            CrmDeal.stage,
            func.count(CrmDeal.id).label("count"),
            func.sum(CrmDeal.offer_price).label("total_value"),
        )
        .where(CrmDeal.user_id == _ws_uid(user))
        .group_by(CrmDeal.stage)
    )

    rows = result.all()
    summary = {}
    for stage, count, total_value in rows:
        summary[stage or "unknown"] = {
            "count": count,
            "total_value": float(total_value or 0),
        }

    return {
        "pipeline": summary,
        "total_deals": sum(s["count"] for s in summary.values()),
        "total_pipeline_value": sum(s["total_value"] for s in summary.values()),
    }


async def _get_deals(params: dict, user: User, db: AsyncSession) -> dict:
    """Get deals from the pipeline with optional stage filtering."""
    stage = params.get("stage", "").lower()
    limit = params.get("limit", 25)

    query = select(CrmDeal).where(CrmDeal.user_id == _ws_uid(user))

    if stage:
        query = query.where(CrmDeal.stage.ilike(f"%{stage}%"))

    result = await db.execute(query.limit(limit))
    deals = result.scalars().all()

    return {
        "deals": [
            {
                "id": d.id,
                "title": d.title,
                "address": d.address,
                "stage": d.stage,
                "offer_price": d.offer_price,
                "arv": d.arv,
                "created_at": d.created_at.isoformat(),
                "updated_at": d.updated_at.isoformat(),
            }
            for d in deals
        ],
        "count": len(deals),
    }


async def _get_stalled_deals(params: dict, user: User, db: AsyncSession) -> dict:
    """Find deals stalled in the same stage for more than N days."""
    days_threshold = params.get("days_threshold", 7)
    stage = params.get("stage", "").lower()

    cutoff_date = datetime.utcnow() - timedelta(days=days_threshold)

    query = select(CrmDeal).where(
        and_(
            CrmDeal.user_id == _ws_uid(user),
            CrmDeal.updated_at < cutoff_date,
        )
    )

    if stage:
        query = query.where(CrmDeal.stage.ilike(f"%{stage}%"))

    result = await db.execute(query)
    deals = result.scalars().all()

    return {
        "stalled_deals": [
            {
                "id": d.id,
                "title": d.title,
                "address": d.address,
                "stage": d.stage,
                "days_stalled": (datetime.utcnow() - d.updated_at).days,
                "last_updated": d.updated_at.isoformat(),
            }
            for d in deals
        ],
        "count": len(deals),
    }


async def _update_deal_stage(params: dict, user: User, db: AsyncSession) -> dict:
    """Move a deal to a different pipeline stage."""
    deal_id = params.get("deal_id")
    new_stage = params.get("new_stage")
    notes = params.get("notes")

    if not deal_id or not new_stage:
        raise ValueError("deal_id and new_stage are required")

    result = await db.execute(
        select(CrmDeal).where(
            and_(
                CrmDeal.id == deal_id,
                CrmDeal.user_id == _ws_uid(user),
            )
        )
    )
    deal = result.scalar_one_or_none()

    if not deal:
        return {"error": "Deal not found"}

    old_stage = deal.stage
    deal.stage = new_stage
    deal.updated_at = datetime.utcnow()

    if notes and deal.notes:
        deal.notes = f"{deal.notes}\n\n[{datetime.utcnow().isoformat()}] {notes}"
    elif notes:
        deal.notes = notes

    await db.commit()

    return {
        "id": deal.id,
        "old_stage": old_stage,
        "new_stage": new_stage,
        "message": f"Deal moved from {old_stage} to {new_stage}",
    }


async def _get_portfolio_summary(params: dict, user: User, db: AsyncSession) -> dict:
    """Get summary of owned portfolio properties with values and rental income."""
    result = await db.execute(
        select(CrmPortfolioProperty).where(CrmPortfolioProperty.user_id == _ws_uid(user))
    )
    properties = result.scalars().all()

    total_value = sum(p.current_value or 0 for p in properties)
    total_rental_income = sum(p.monthly_rent or 0 for p in properties)

    return {
        "properties": [
            {
                "id": p.id,
                "address": p.address,
                "purchase_price": p.purchase_price,
                "current_value": p.current_value,
                "monthly_rent": p.monthly_rent,
            }
            for p in properties
        ],
        "count": len(properties),
        "total_portfolio_value": total_value,
        "total_monthly_rental_income": total_rental_income,
    }


# ══════════════════════════════════════════════════════════════════
# PHONE TOOL HANDLERS
# ══════════════════════════════════════════════════════════════════


async def _send_sms(
    params: dict, user: User, db: AsyncSession, settings: dict
) -> dict:
    """Send an SMS text message to a contact."""
    import uuid

    contact_phone = params.get("contact_phone")
    message = params.get("message")
    contact_name = params.get("contact_name", "Unknown")

    if not contact_phone or not message:
        raise ValueError("contact_phone and message are required")

    # Humanize the message to remove AI-sounding language
    from rei.services.admin_humanizer_service import humanize_text
    message = humanize_text(message)

    # Create SmsMessage record (actual Twilio send would be wired later)
    sms = SmsMessage(
        id=str(uuid.uuid4()),
        user_id=_ws_uid(user),
        phone_number_id="",  # Would be set to user's primary phone number
        twilio_message_sid="SIM_PENDING",  # Placeholder
        direction="outbound",
        from_number="+1234567890",  # Would be replaced with actual from_number
        to_number=contact_phone,
        body=message,
        status="queued",
        sent_at=datetime.utcnow(),
    )
    db.add(sms)
    await db.commit()

    return {
        "id": sms.id,
        "to": contact_phone,
        "message": message,
        "status": "queued",
        "note": "SMS queued for delivery (Twilio integration pending)",
    }


async def _schedule_callback(
    params: dict, user: User, db: AsyncSession
) -> dict:
    """Schedule an AI callback to a contact at a specific time."""
    import uuid

    contact_phone = params.get("contact_phone")
    contact_name = params.get("contact_name")
    scheduled_at_str = params.get("scheduled_at")
    persona_id = params.get("persona_id")
    notes = params.get("notes")

    if not contact_phone or not scheduled_at_str:
        raise ValueError("contact_phone and scheduled_at are required")

    # Parse ISO datetime
    try:
        scheduled_at = datetime.fromisoformat(scheduled_at_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        raise ValueError(f"Invalid datetime format: {scheduled_at_str}")

    callback = ScheduledCallback(
        id=str(uuid.uuid4()),
        user_id=_ws_uid(user),
        contact_name=contact_name,
        contact_phone=contact_phone,
        scheduled_at=scheduled_at,
        callback_type="ai",
        persona_id=persona_id,
        notes=notes,
        status="scheduled",
    )
    db.add(callback)
    await db.commit()

    return {
        "id": callback.id,
        "contact_phone": contact_phone,
        "scheduled_at": scheduled_at.isoformat(),
        "status": "scheduled",
        "message": f"Callback scheduled for {contact_name} at {scheduled_at.isoformat()}",
    }


async def _get_call_history(params: dict, user: User, db: AsyncSession) -> dict:
    """Get recent call logs with outcomes and summaries."""
    limit = params.get("limit", 20)
    contact_phone = params.get("contact_phone", "").lower()

    query = select(CallLog).where(CallLog.user_id == _ws_uid(user)).order_by(
        CallLog.created_at.desc()
    )

    result = await db.execute(query.limit(limit))
    calls = result.scalars().all()

    # Filter by phone in memory
    if contact_phone:
        calls = [c for c in calls if contact_phone in (c.from_number + c.to_number).lower()]

    return {
        "calls": [
            {
                "id": c.id,
                "direction": c.direction,
                "from_number": c.from_number,
                "to_number": c.to_number,
                "status": c.status,
                "duration_seconds": c.duration_seconds,
                "started_at": c.started_at.isoformat() if c.started_at else None,
                "notes": c.notes,
            }
            for c in calls
        ],
        "count": len(calls),
    }


async def _get_usage_stats(params: dict, user: User, db: AsyncSession) -> dict:
    """Get phone system usage stats: minutes used, SMS count, credits balance."""
    # Count calls and SMS for the user
    call_result = await db.execute(
        select(func.count(CallLog.id), func.sum(CallLog.duration_seconds)).where(
            CallLog.user_id == _ws_uid(user)
        )
    )
    call_count, total_seconds = call_result.one()
    call_count = call_count or 0
    total_seconds = total_seconds or 0

    sms_result = await db.execute(
        select(func.count(SmsMessage.id)).where(SmsMessage.user_id == _ws_uid(user))
    )
    sms_count = sms_result.scalar() or 0

    # Get credit info
    credit_result = await db.execute(
        select(PhoneCredit)
        .where(PhoneCredit.user_id == _ws_uid(user))
        .order_by(PhoneCredit.created_at.desc())
        .limit(1)
    )
    latest_credit = credit_result.scalar_one_or_none()

    return {
        "call_count": call_count,
        "call_minutes": int(total_seconds / 60),
        "sms_count": sms_count,
        "credits_remaining_cents": latest_credit.credits_remaining_cents
        if latest_credit
        else 0,
        "usage_summary": f"{call_count} calls, {sms_count} SMS messages",
    }


# ══════════════════════════════════════════════════════════════════
# ANALYTICS TOOL HANDLERS
# ══════════════════════════════════════════════════════════════════


async def _get_dashboard_stats(params: dict, user: User, db: AsyncSession) -> dict:
    """Get key business metrics: leads, deals, portfolio value, call volume."""
    # Count contacts
    contact_result = await db.execute(
        select(func.count(CrmContact.id)).where(CrmContact.user_id == _ws_uid(user))
    )
    total_contacts = contact_result.scalar() or 0

    # Count deals by status
    deal_result = await db.execute(
        select(func.count(CrmDeal.id)).where(CrmDeal.user_id == _ws_uid(user))
    )
    total_deals = deal_result.scalar() or 0

    # Get pipeline value
    value_result = await db.execute(
        select(func.sum(CrmDeal.offer_price)).where(CrmDeal.user_id == _ws_uid(user))
    )
    pipeline_value = value_result.scalar() or 0

    # Get portfolio value
    portfolio_result = await db.execute(
        select(func.sum(CrmPortfolioProperty.current_value)).where(
            CrmPortfolioProperty.user_id == _ws_uid(user)
        )
    )
    portfolio_value = portfolio_result.scalar() or 0

    # Get call stats (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    call_result = await db.execute(
        select(func.count(CallLog.id)).where(
            and_(
                CallLog.user_id == _ws_uid(user),
                CallLog.created_at >= thirty_days_ago,
            )
        )
    )
    recent_calls = call_result.scalar() or 0

    return {
        "total_contacts": total_contacts,
        "total_deals": total_deals,
        "pipeline_value": float(pipeline_value or 0),
        "portfolio_value": float(portfolio_value or 0),
        "recent_calls_30d": recent_calls,
    }


# ══════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ══════════════════════════════════════════════════════════════════


def _build_action_name(tool_name: str, params: dict) -> str:
    """Build a human-readable action name from tool and params."""
    if tool_name == "send_sms":
        contact_name = params.get("contact_name", "a contact")
        return f"Send SMS to {contact_name}"

    if tool_name == "update_deal_stage":
        new_stage = params.get("new_stage", "unknown stage")
        return f"Move deal to {new_stage}"

    if tool_name == "schedule_callback":
        contact_name = params.get("contact_name", "a contact")
        return f"Schedule callback with {contact_name}"

    if tool_name == "create_contact":
        name = params.get("name", "new contact")
        return f"Create contact: {name}"

    if tool_name == "update_contact":
        return f"Update contact information"

    if tool_name == "draft_email":
        to = params.get("to_name", params.get("to_email", ""))
        return f"Draft email to {to}"

    if tool_name == "draft_offer_email":
        addr = params.get("property_address", "")
        price = params.get("offer_price", 0)
        return f"Draft offer email for {addr} at ${price:,.0f}"

    if tool_name == "schedule_showing":
        addr = params.get("property_address", "")
        date = params.get("date", "")
        return f"Schedule showing at {addr} on {date}"

    if tool_name == "create_social_post":
        topic = params.get("topic", "")[:50]
        return f"Create social post: {topic}"

    # Generic fallback
    return f"Execute {tool_name}"


# ══════════════════════════════════════════════════════════════════
# PROPERTY RESEARCH TOOL HANDLERS
# ══════════════════════════════════════════════════════════════════


async def _resolve_zips_from_city_state(city: str, state: str) -> list[str]:
    """Resolve a city + state to ALL zip codes. Returns [] if unknown.

    Uses the free zippopotam.us reverse lookup API:
    GET https://api.zippopotam.us/us/{state}/{city}
    Returns all zip codes for that city (cities often have multiple).
    """
    if not city or not state:
        return []
    try:
        import httpx
        city_slug = city.strip().replace(" ", "%20")
        state_slug = state.strip().upper()
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"https://api.zippopotam.us/us/{state_slug}/{city_slug}"
            )
            if resp.status_code == 200:
                data = resp.json()
                places = data.get("places", [])
                zips = [p.get("post code", "") for p in places if p.get("post code")]
                return zips
    except Exception as exc:
        logger.debug("Zip-from-city-state lookup failed for %s, %s: %s", city, state, exc)
    return []


async def _resolve_zip(zip_code: str) -> tuple[str, str]:
    """Resolve a zip code to (city, state). Returns ('', '') if unknown.

    Resolution order:
    1. MarketZipCode table (local DB cache — fast, no API call)
    2. HUD API via fetch_zip_crosswalk (authoritative, caches result)
    3. Free zippopotam.us API (fallback if no HUD key configured)
    """
    if not zip_code:
        return ("", "")

    # 1. Check MarketZipCode table (local cache from HUD or CSV uploads)
    try:
        from rei.database import async_session_factory
        from sqlalchemy import select
        from rei.models.crm import MarketZipCode

        async with async_session_factory() as db:
            result = await db.execute(
                select(MarketZipCode).where(MarketZipCode.zip_code == zip_code)
            )
            cached = result.scalar_one_or_none()
            if cached:
                # market_name is like "Huntington, NY" or "San Antonio-New Braunfels, TX"
                # Extract city and state from it
                state = cached.state or ""
                city = cached.market_name.split(",")[0].strip() if cached.market_name else ""
                if city and state:
                    return (city, state)
    except Exception:
        pass

    # 2. HUD API (authoritative US gov data, auto-caches to MarketZipCode)
    try:
        from rei.services.hud_api import fetch_zip_crosswalk, get_hud_api_key

        api_key = await get_hud_api_key()
        if api_key:
            data = await fetch_zip_crosswalk(zip_code, api_key)
            if data:
                city = data.get("city", "")
                state = data.get("state", "")
                if city and state:
                    # Cache for future lookups
                    try:
                        from rei.models.crm import MarketZipCode as MZC
                        async with async_session_factory() as db:
                            entry = MZC(
                                zip_code=zip_code,
                                market_name=data.get("cbsa") or f"{city}, {state}",
                                state=state,
                            )
                            db.add(entry)
                            await db.commit()
                    except Exception:
                        pass  # Unique constraint — already cached
                    return (city, state)
    except Exception:
        pass

    # 3. Fallback: free zippopotam.us API (no key required)
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"https://api.zippopotam.us/us/{zip_code}")
            if resp.status_code == 200:
                data = resp.json()
                places = data.get("places", [])
                if places:
                    city = places[0].get("place name", "")
                    state = places[0].get("state abbreviation", "")
                    return (city, state)
    except Exception:
        pass

    return ("", "")


async def _lookup_property(params: dict, user: User, db: AsyncSession, settings: dict) -> dict:
    """Look up property data via ATTOM. Resolves city/state from zip if missing."""
    from rei.services.attom_property_service import lookup_property_data

    address = params.get("address", "")
    city = params.get("city", "")
    state = params.get("state", "")
    zip_code = params.get("zip_code", "")

    if not address:
        return {"error": "Street address is required"}

    # Auto-resolve city/state from zip code if missing
    if (not city or not state) and zip_code:
        resolved_city, resolved_state = await _resolve_zip(zip_code)
        if not city:
            city = resolved_city
        if not state:
            state = resolved_state

    if not city or not state:
        return {
            "error": (
                "Could not determine city and state. Please provide them explicitly "
                "or include a valid zip code."
            )
        }

    # Auto-resolve zip codes from city/state if missing.
    # Cities often have multiple zips — try each one until ATTOM returns data.
    if not zip_code and city and state:
        all_zips = await _resolve_zips_from_city_state(city, state)
        logger.info("Resolved zip codes from %s, %s → %s", city, state, all_zips or "(none)")

        if all_zips:
            # Try each zip code until we get a non-empty result
            for candidate_zip in all_zips:
                logger.info("Trying ATTOM lookup with zip %s", candidate_zip)
                result = await lookup_property_data(
                    address=address, city=city, state=state,
                    zip_code=candidate_zip, db=db,
                )
                # Check if we got actual data back (not just empty dicts/lists)
                has_data = (
                    result.get("property_detail")
                    or result.get("tax_assessment")
                    or result.get("sale_history")
                )
                if has_data:
                    return result
            # None of the zips returned data — return the last (empty) result
            return result

    result = await lookup_property_data(
        address=address, city=city, state=state,
        zip_code=zip_code, db=db,
    )
    return result


async def _get_market_data(params: dict, user: User, db: AsyncSession, settings: dict) -> dict:
    """Get market data for a city/area via ATTOM."""
    from rei.services.attom_service import lookup_market_data

    city = params.get("city", "")
    state = params.get("state", "")

    if not city or not state:
        return {"error": "City and state are required"}

    result = await lookup_market_data(city, state)
    return result


async def _search_properties(params: dict, user: User, db: AsyncSession) -> dict:
    """Search for property listings. Uses AI to generate a listing summary
    based on the criteria (Puppeteer web scraping can be added later)."""
    location = params.get("location", "")
    max_price = params.get("max_price")
    min_beds = params.get("min_beds")
    min_baths = params.get("min_baths")
    prop_type = params.get("property_type", "")
    limit = params.get("limit", 20)

    if not location:
        return {"error": "Location is required"}

    # Build a search description for the user
    criteria = [f"Location: {location}"]
    if max_price:
        criteria.append(f"Max price: ${max_price:,}")
    if min_beds:
        criteria.append(f"Min beds: {min_beds}")
    if min_baths:
        criteria.append(f"Min baths: {min_baths}")
    if prop_type:
        criteria.append(f"Type: {prop_type}")

    return {
        "status": "search_criteria_set",
        "criteria": criteria,
        "message": (
            f"Property search criteria set for {location}. "
            "Note: Live web scraping (Zillow/Realtor.com) is coming soon. "
            "For now, I can look up specific properties by address using the "
            "lookup_property tool, or pull market data with get_market_data."
        ),
        "limit": limit,
    }


# ══════════════════════════════════════════════════════════════════
# DEAL MANAGEMENT TOOL HANDLERS
# ══════════════════════════════════════════════════════════════════


async def _create_deal(params: dict, user: User, db: AsyncSession) -> dict:
    """Create a new deal in the pipeline."""
    from rei.models.crm import CrmDeal

    address = params.get("address", "").strip()
    if not address:
        return {"error": "Street address is required to create a deal"}

    city = params.get("city", "").strip()
    state = params.get("state", "").strip()
    zip_code = params.get("zip", "").strip()

    # Require at least zip OR (city + state) for deal creation
    has_location = bool(zip_code) or (bool(city) and bool(state))
    if not has_location:
        return {
            "error": (
                "A zip code OR city and state are required to create a deal. "
                "Please provide at least one of: zip code, or both city and state."
            )
        }

    # Auto-resolve city/state from zip if missing
    if (not city or not state) and zip_code:
        resolved_city, resolved_state = await _resolve_zip(zip_code)
        if not city:
            city = resolved_city
        if not state:
            state = resolved_state

    # Build title from address
    title = address
    if city:
        title = f"{address}, {city}"

    stage = params.get("stage", "lead")
    deal_type = params.get("deal_type", "")
    contact_name = params.get("contact_name", "")
    asking_price = params.get("asking_price")
    arv = params.get("arv")
    notes = params.get("notes", "")

    deal = CrmDeal(
        user_id=_ws_uid(user),
        title=title,
        address=address,
        city=city,
        state=state,
        zip=zip_code,
        stage=stage,
        list_price=asking_price,
        arv=arv,
        contact_name=contact_name or None,
        source=deal_type or None,
        notes=notes or None,
    )

    # ── Auto-populate ATTOM property data into the deal ──
    attom_populated = False
    try:
        from rei.services.attom_property_service import lookup_property_data
        import json as _json

        # Resolve all zips if none provided
        lookup_zip = zip_code
        all_zips = [zip_code] if zip_code else []
        if not zip_code and city and state:
            all_zips = await _resolve_zips_from_city_state(city, state)
            lookup_zip = all_zips[0] if all_zips else ""

        attom_data = None
        for candidate_zip in (all_zips or [lookup_zip]):
            result = await lookup_property_data(
                address=address, city=city, state=state,
                zip_code=candidate_zip, db=db,
            )
            has_data = (
                result.get("property_detail")
                or result.get("tax_assessment")
                or result.get("sale_history")
            )
            if has_data:
                attom_data = result
                break

        if attom_data:
            pd = attom_data.get("property_detail", {})
            ta = attom_data.get("tax_assessment", {})
            sh = attom_data.get("sale_history", [])

            # Property details
            if pd.get("property_type"):
                deal.property_type = str(pd["property_type"])
            if pd.get("bedrooms"):
                deal.bedrooms = _safe_int(pd["bedrooms"])
            if pd.get("bathrooms_full"):
                deal.bathrooms = _safe_float(pd["bathrooms_full"])
            if pd.get("bathrooms_half"):
                deal.bathrooms_half = _safe_int(pd["bathrooms_half"])
            if pd.get("square_footage"):
                deal.square_footage = _safe_int(pd["square_footage"])
            if pd.get("year_built"):
                deal.year_built = _safe_int(pd["year_built"])
            if pd.get("lot_size_sqft"):
                deal.lot_size = str(pd["lot_size_sqft"])
            if pd.get("lot_size_acres"):
                deal.lot_size_acres = _safe_float(pd["lot_size_acres"])
            if pd.get("stories"):
                deal.stories = _safe_int(pd["stories"])
            if pd.get("total_rooms"):
                deal.total_rooms = _safe_int(pd["total_rooms"])
            if pd.get("occupancy_status"):
                deal.occupancy_status = str(pd["occupancy_status"])
            if pd.get("garage_type"):
                deal.garage = str(pd["garage_type"])

            # ATTOM identifiers
            if pd.get("attom_id"):
                deal.attom_id = str(pd["attom_id"])
            if pd.get("apn"):
                deal.apn = str(pd["apn"])
            if pd.get("fips"):
                deal.fips = str(pd["fips"])
            if pd.get("county"):
                deal.county = str(pd["county"])
            if pd.get("subdivision"):
                deal.subdivision = str(pd["subdivision"])
            if pd.get("school_district"):
                deal.school_district = str(pd["school_district"])
            if pd.get("legal_description"):
                deal.legal_description = str(pd["legal_description"])
            if pd.get("zoning"):
                deal.zoning = str(pd["zoning"])
            if pd.get("absentee_owner"):
                deal.absentee_owner = str(pd["absentee_owner"])

            # Construction details
            if pd.get("construction_type"):
                deal.construction_type = str(pd["construction_type"])
            if pd.get("exterior_walls"):
                deal.exterior_walls = str(pd["exterior_walls"])
            if pd.get("roof_type"):
                deal.roof_type = str(pd["roof_type"])
            if pd.get("foundation_type"):
                deal.foundation_type = str(pd["foundation_type"])
            if pd.get("basement_type"):
                deal.basement_type = str(pd["basement_type"])
            if pd.get("basement_size"):
                deal.basement_sqft = _safe_int(pd["basement_size"])
            if pd.get("heating"):
                deal.heating = str(pd["heating"])
            if pd.get("cooling"):
                deal.cooling = str(pd["cooling"])
            if pd.get("water"):
                deal.water_type = str(pd["water"])
            if pd.get("sewer"):
                deal.sewer_type = str(pd["sewer"])
            if pd.get("pool_type") and pd["pool_type"] != "NO POOL":
                deal.pool = str(pd["pool_type"])
            if pd.get("fireplace"):
                deal.fireplace_count = _safe_int(pd["fireplace"])
            if pd.get("parking_spaces"):
                deal.parking_spaces = _safe_int(pd["parking_spaces"])

            # Geocoding
            if pd.get("latitude"):
                deal.latitude = _safe_float(pd["latitude"])
            if pd.get("longitude"):
                deal.longitude = _safe_float(pd["longitude"])

            # Tax assessment
            if ta.get("market_total_value"):
                deal.market_value = _safe_float(ta["market_total_value"])
            if ta.get("market_land_value"):
                deal.market_land_value = _safe_float(ta["market_land_value"])
            if ta.get("market_improvement_value"):
                deal.market_improvement_value = _safe_float(ta["market_improvement_value"])
            if ta.get("assessed_total_value"):
                deal.assessed_value = _safe_float(ta["assessed_total_value"])
            if ta.get("assessed_land_value"):
                deal.assessed_land_value = _safe_float(ta["assessed_land_value"])
            if ta.get("assessed_improvement_value"):
                deal.assessed_improvement_value = _safe_float(ta["assessed_improvement_value"])
            if ta.get("tax_amount"):
                deal.property_tax_annual = _safe_float(ta["tax_amount"])
            if ta.get("tax_year"):
                deal.tax_year = _safe_int(ta["tax_year"])

            # Most recent sale
            if sh:
                latest = sh[0]
                if latest.get("sale_date"):
                    deal.last_sale_date = str(latest["sale_date"])
                if latest.get("sale_price"):
                    deal.last_sale_price = _safe_float(latest["sale_price"])
                if latest.get("buyer_name"):
                    deal.last_sale_buyer = str(latest["buyer_name"])
                if latest.get("seller_name"):
                    deal.last_sale_seller = str(latest["seller_name"])

            # Owner / Mailing Address
            oi = attom_data.get("owner_info", {})
            if oi.get("owner_name"):
                deal.owner_name = str(oi["owner_name"])
            if oi.get("owner_name2"):
                deal.owner_name2 = str(oi["owner_name2"])
            if oi.get("owner_type"):
                deal.owner_type = str(oi["owner_type"])
            if oi.get("mailing_address"):
                deal.mailing_address = str(oi["mailing_address"])
            elif oi.get("mailing_line1"):
                deal.mailing_address = str(oi["mailing_line1"])
            if oi.get("mailing_city"):
                deal.mailing_city = str(oi["mailing_city"])
            if oi.get("mailing_state"):
                deal.mailing_state = str(oi["mailing_state"])
            if oi.get("mailing_zip"):
                deal.mailing_zip = str(oi["mailing_zip"])

            # Additional property fields
            if pd.get("census_tract"):
                deal.census_tract = str(pd["census_tract"])
            if pd.get("municipality"):
                deal.municipality = str(pd["municipality"])
            if pd.get("county_use_code"):
                deal.county_use_code = str(pd["county_use_code"])
            if pd.get("tax_code_area"):
                deal.tax_code_area = str(pd["tax_code_area"])
            if pd.get("lot_number"):
                deal.lot_number = str(pd["lot_number"])
            if pd.get("parking_type"):
                deal.parking_type = str(pd["parking_type"])
            if pd.get("geo_accuracy"):
                deal.geo_accuracy = str(pd["geo_accuracy"])

            # Appraised values
            if ta.get("appraised_total_value"):
                deal.appraised_total_value = _safe_float(ta["appraised_total_value"])
            if ta.get("appraised_land_value"):
                deal.appraised_land_value = _safe_float(ta["appraised_land_value"])
            if ta.get("appraised_improvement_value"):
                deal.appraised_improvement_value = _safe_float(ta["appraised_improvement_value"])

            # Calculated values
            if ta.get("calc_total_value"):
                deal.calc_total_value = _safe_float(ta["calc_total_value"])
            if ta.get("calc_land_value"):
                deal.calc_land_value = _safe_float(ta["calc_land_value"])
            if ta.get("calc_improvement_value"):
                deal.calc_improvement_value = _safe_float(ta["calc_improvement_value"])

            # Tax per sqft
            if ta.get("tax_per_sqft"):
                deal.tax_per_sqft = _safe_float(ta["tax_per_sqft"])

            # Lot detail
            if pd.get("lot_depth"):
                deal.lot_depth = str(pd["lot_depth"])
            if pd.get("lot_frontage"):
                deal.lot_frontage = str(pd["lot_frontage"])

            # Building sizes
            if pd.get("building_size"):
                deal.building_size = _safe_int(pd["building_size"])
            if pd.get("gross_size"):
                deal.gross_size = _safe_int(pd["gross_size"])

            # Full sale history (save all transactions, not just the most recent)
            if sh and len(sh) > 0:
                deal.sale_history_json = _json.dumps(sh, default=str)

            # Lien/mortgage records
            lien_data = attom_data.get("lien_records", [])
            if lien_data:
                deal.lien_records_json = _json.dumps(lien_data, default=str)

            # Store raw ATTOM JSON
            deal.attom_raw_data = _json.dumps(attom_data, default=str)

            attom_populated = True
            logger.info("Auto-populated ATTOM data into deal for %s", address)

    except Exception as e:
        logger.warning("ATTOM auto-population failed (non-fatal): %s", e)

    db.add(deal)
    await db.commit()

    return {
        "status": "created",
        "deal_id": deal.id,
        "title": title,
        "address": address,
        "city": city,
        "state": state,
        "zip": zip_code,
        "stage": stage,
        "asking_price": asking_price,
        "contact_name": contact_name,
        "attom_populated": attom_populated,
        "message": f"Deal created: {title}" + (f", {state} {zip_code}" if state else ""),
    }


async def _add_deal_note(params: dict, user: User, db: AsyncSession) -> dict:
    """Add a note to a deal via DealFile with file_type='document'."""
    from rei.models.crm import DealFile

    deal_id = params.get("deal_id", "")
    note_text = params.get("note", "")
    category = params.get("category", "general")

    if not deal_id or not note_text:
        return {"error": "deal_id and note are required"}

    # Verify the deal belongs to this user
    deal = await db.get(CrmDeal, deal_id)
    if not deal or deal.user_id != _ws_uid(user):
        return {"error": "Deal not found"}

    import uuid
    new_file = DealFile(
        id=str(uuid.uuid4()),
        user_id=_ws_uid(user),
        deal_id=deal_id,
        file_type="document",
        category=category,
        file_name=f"Note - {category} - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}",
        notes=note_text,
    )
    db.add(new_file)
    await db.commit()

    return {
        "success": True,
        "message": f"Note added to deal {deal_id}",
        "note_preview": note_text[:200],
    }


async def _upload_deal_photo(params: dict, user: User, db: AsyncSession) -> dict:
    """Upload a photo to a deal."""
    from rei.models.crm import DealFile

    deal_id = params.get("deal_id", "")
    photo_data = params.get("photo_data", "")
    category = params.get("photo_category", "miscellaneous")
    notes = params.get("notes", "")

    if not deal_id or not photo_data:
        return {"error": "deal_id and photo_data are required"}

    deal = await db.get(CrmDeal, deal_id)
    if not deal or deal.user_id != _ws_uid(user):
        return {"error": "Deal not found"}

    import uuid
    new_file = DealFile(
        id=str(uuid.uuid4()),
        user_id=_ws_uid(user),
        deal_id=deal_id,
        file_type="photo",
        category=category,
        file_name=f"Photo - {category} - {datetime.utcnow().strftime('%Y-%m-%d %H:%M')}.jpg",
        mime_type="image/jpeg",
        file_content=photo_data,
        notes=notes,
    )
    db.add(new_file)
    await db.commit()

    return {
        "success": True,
        "message": f"Photo uploaded to deal {deal_id} (category: {category})",
    }


async def _get_deal_details(params: dict, user: User, db: AsyncSession) -> dict:
    """Get full deal details including files and notes."""
    from rei.models.crm import DealFile

    deal_id = params.get("deal_id", "")
    if not deal_id:
        return {"error": "deal_id is required"}

    deal = await db.get(CrmDeal, deal_id)
    if not deal or deal.user_id != _ws_uid(user):
        return {"error": "Deal not found"}

    # Get files (without content to keep response small)
    files_result = await db.execute(
        select(DealFile).where(
            DealFile.deal_id == deal_id,
            DealFile.user_id == _ws_uid(user),
        )
    )
    files = files_result.scalars().all()

    return {
        "id": deal.id,
        "property_address": deal.address,
        "city": deal.city,
        "state": deal.state,
        "zip_code": deal.zip_code,
        "stage": deal.stage,
        "asking_price": deal.asking_price,
        "offer_price": deal.offer_price,
        "arv": deal.arv,
        "repair_estimate": deal.repair_estimate,
        "contact_name": deal.contact_name,
        "contact_phone": deal.contact_phone,
        "contact_email": deal.contact_email,
        "notes": deal.notes,
        "created_at": deal.created_at.isoformat() if deal.created_at else None,
        "files": [
            {
                "id": f.id,
                "file_type": f.file_type,
                "category": f.category,
                "file_name": f.file_name,
                "notes": f.notes,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in files
        ],
        "file_count": len(files),
        "photo_count": sum(1 for f in files if f.file_type == "photo"),
    }


async def _search_deals(params: dict, user: User, db: AsyncSession) -> dict:
    """Search deals by text across address, contact, and notes."""
    query_text = params.get("query", "").lower()
    limit = params.get("limit", 10)

    if not query_text:
        return {"error": "query is required"}

    result = await db.execute(
        select(CrmDeal).where(CrmDeal.user_id == _ws_uid(user)).limit(100)
    )
    all_deals = result.scalars().all()

    # Text search across multiple fields
    matches = []
    for d in all_deals:
        searchable = " ".join(filter(None, [
            d.address, d.city, d.state,
            d.contact_name, d.contact_phone, d.contact_email,
            d.notes, d.stage,
        ])).lower()
        if query_text in searchable:
            matches.append({
                "id": d.id,
                "property_address": d.address,
                "city": d.city,
                "state": d.state,
                "stage": d.stage,
                "asking_price": d.asking_price,
                "contact_name": d.contact_name,
            })
        if len(matches) >= limit:
            break

    return {"deals": matches, "count": len(matches)}


# ══════════════════════════════════════════════════════════════════
# CONTENTHUB TOOL HANDLERS
# ══════════════════════════════════════════════════════════════════


async def _create_social_post(params: dict, user: User, db: AsyncSession, settings: dict) -> dict:
    """Generate social media content via AI and save to ContentHub."""
    from rei.services.ai_service import ai_complete
    from rei.services.content_hub_service import save_waterfall_content

    topic = params.get("topic", "")
    deal_id = params.get("deal_id")
    tone = params.get("tone", "professional")
    platforms = params.get("platforms", ["facebook", "instagram", "linkedin"])

    if not topic:
        return {"error": "topic is required"}

    # If a deal_id is provided, pull property details for context
    deal_context = ""
    if deal_id:
        deal = await db.get(CrmDeal, deal_id)
        if deal and deal.user_id == _ws_uid(user):
            deal_context = (
                f"\nProperty details: {deal.address}, {deal.city}, {deal.state} {deal.zip_code}"
                f"\nAsking: ${deal.asking_price:,.0f}" if deal.asking_price else ""
                f"\nARV: ${deal.arv:,.0f}" if deal.arv else ""
                f"\nStage: {deal.stage}"
            )

    platform_list = ", ".join(platforms)
    prompt = (
        f"Create engaging social media posts for a real estate investor.\n"
        f"Topic: {topic}{deal_context}\n"
        f"Tone: {tone}\n"
        f"Platforms: {platform_list}\n\n"
        f"For each platform, write a post optimized for that platform's style and character limits. "
        f"Include relevant hashtags. Return as JSON:\n"
        f'{{"posts": [{{"platform": "facebook", "content": "...", "hashtags": ["..."]}}]}}'
    )

    ai_result = await ai_complete(
        messages=[{"role": "user", "content": prompt}],
        user_id=user.id,
        db=db,
        settings=settings,
        task_type="general",
        max_tokens=2000,
        temperature=0.7,
    )

    content = ai_result.get("content", "")

    # Save to ContentHub
    try:
        entry_id = await save_waterfall_content(
            user_id=_ws_uid(user),
            topic=topic,
            waterfall_output=content,
            source_article_id=None,
            tags=[tone] + platforms,
            db=db,
        )
    except Exception as exc:
        logger.warning("Failed to save to ContentHub: %s", exc)
        entry_id = None

    return {
        "content": content,
        "entry_id": entry_id,
        "topic": topic,
        "platforms": platforms,
        "message": "Social media content created and saved to ContentHub.",
    }


async def _list_content(params: dict, user: User, db: AsyncSession) -> dict:
    """List ContentHub entries."""
    from rei.services.content_hub_service import list_content_entries

    platform = params.get("platform")
    limit = params.get("limit", 10)

    entries = await list_content_entries(
        user_id=_ws_uid(user), db=db,
        platform=platform, limit=limit,
    )
    return {"entries": entries, "count": len(entries)}


# ══════════════════════════════════════════════════════════════════
# EMAIL COMPOSE TOOL HANDLERS
# ══════════════════════════════════════════════════════════════════


async def _draft_email(params: dict, user: User, db: AsyncSession, settings: dict) -> dict:
    """Draft and send a personalized email."""
    from rei.services.email import send_email
    from rei.services.admin_humanizer_service import humanize_text

    to_email = params.get("to_email", "")
    to_name = params.get("to_name", "")
    subject = params.get("subject", "")
    body = params.get("body", "")

    if not to_email or not subject or not body:
        return {"error": "to_email, subject, and body are required"}

    # Humanize the body to remove AI-sounding language
    humanized_body = humanize_text(body)

    # Wrap in simple HTML
    html_body = f"<p>{humanized_body.replace(chr(10), '</p><p>')}</p>"

    success = await send_email(
        to_email=to_email,
        to_name=to_name,
        subject=subject,
        html_content=html_body,
        settings=settings,
    )

    return {
        "success": success,
        "to": f"{to_name} <{to_email}>",
        "subject": subject,
        "body_preview": humanized_body[:200],
        "message": f"Email sent to {to_name}" if success else "Failed to send email",
    }


async def _draft_offer_email(params: dict, user: User, db: AsyncSession, settings: dict) -> dict:
    """Draft and send an offer email for a property."""
    from rei.services.email import send_email
    from rei.services.admin_humanizer_service import humanize_text

    to_email = params.get("to_email", "")
    to_name = params.get("to_name", "")
    address = params.get("property_address", "")
    offer_price = params.get("offer_price", 0)
    closing_days = params.get("closing_days", 30)
    contingencies = params.get("contingencies", "Standard inspection contingency")

    if not to_email or not address or not offer_price:
        return {"error": "to_email, property_address, and offer_price are required"}

    user_name = user.full_name or user.email
    user_company = getattr(user, "company_name", "") or ""

    body = (
        f"Dear {to_name},\n\n"
        f"I am writing to express my interest in purchasing the property at {address}. "
        f"After reviewing the property, I would like to submit a formal offer of ${offer_price:,.0f}.\n\n"
        f"Proposed terms:\n"
        f"- Purchase Price: ${offer_price:,.0f}\n"
        f"- Closing Timeline: {closing_days} days from acceptance\n"
        f"- Contingencies: {contingencies}\n"
        f"- Earnest Money Deposit: To be determined upon acceptance\n\n"
        f"I am a serious buyer with financing in place and can close on schedule. "
        f"Please let me know if you would like to discuss this offer further.\n\n"
        f"Best regards,\n{user_name}"
    )
    if user_company:
        body += f"\n{user_company}"

    humanized = humanize_text(body)
    html_body = f"<p>{humanized.replace(chr(10), '</p><p>')}</p>"

    subject = f"Purchase Offer - {address}"

    success = await send_email(
        to_email=to_email,
        to_name=to_name,
        subject=subject,
        html_content=html_body,
        settings=settings,
    )

    return {
        "success": success,
        "to": f"{to_name} <{to_email}>",
        "subject": subject,
        "offer_price": offer_price,
        "property": address,
        "message": f"Offer email sent to {to_name}" if success else "Failed to send offer email",
    }


# ══════════════════════════════════════════════════════════════════
# CALENDAR & SHOWING TOOL HANDLERS
# ══════════════════════════════════════════════════════════════════


async def _schedule_showing(params: dict, user: User, db: AsyncSession, settings: dict) -> dict:
    """Schedule a property showing as a calendar event."""
    from rei.models.user import CalendarEvent

    address = params.get("property_address", "")
    date_str = params.get("date", "")
    time_str = params.get("time", "")
    duration = params.get("duration_minutes", 30)
    contact_id = params.get("contact_id")
    deal_id = params.get("deal_id")
    notify = params.get("notify_contact", False)
    notes = params.get("notes", "")

    if not address or not date_str or not time_str:
        return {"error": "property_address, date, and time are required"}

    try:
        start_dt = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        end_dt = start_dt + timedelta(minutes=duration)
    except ValueError:
        return {"error": "Invalid date/time format. Use YYYY-MM-DD and HH:MM"}

    import uuid
    event = CalendarEvent(
        id=str(uuid.uuid4()),
        user_id=_ws_uid(user),
        title=f"Showing: {address}",
        description=notes,
        event_type="appointment",
        start_datetime=start_dt,
        end_datetime=end_dt,
        location=address,
        contact_id=contact_id,
        deal_id=deal_id,
    )
    db.add(event)
    await db.commit()

    result = {
        "success": True,
        "event_id": event.id,
        "title": event.title,
        "date": date_str,
        "time": time_str,
        "duration_minutes": duration,
        "address": address,
    }

    # Optionally send SMS notification to the contact
    if notify and contact_id:
        contact = await db.get(CrmContact, contact_id)
        if contact and contact.phone:
            try:
                from rei.services.twilio_service import send_sms
                msg = (
                    f"Hi {contact.name}, this is a confirmation for our showing "
                    f"at {address} on {start_dt.strftime('%B %d at %I:%M %p')}. "
                    f"Please let me know if this still works for you."
                )
                await send_sms(
                    to=contact.phone,
                    body=msg,
                    user=user,
                    db=db,
                    settings=settings,
                )
                result["notification_sent"] = True
                result["notification_to"] = contact.name
            except Exception as exc:
                logger.warning("Failed to send showing notification: %s", exc)
                result["notification_sent"] = False
                result["notification_error"] = str(exc)

    return result


async def _get_schedule(params: dict, user: User, db: AsyncSession) -> dict:
    """Get upcoming calendar events and tasks."""
    from rei.models.user import CalendarEvent, Task

    days_ahead = params.get("days_ahead", 7)
    event_type = params.get("event_type")

    now = datetime.utcnow()
    end = now + timedelta(days=days_ahead)

    # Get calendar events
    event_query = select(CalendarEvent).where(
        CalendarEvent.user_id == _ws_uid(user),
        CalendarEvent.start_datetime >= now,
        CalendarEvent.start_datetime <= end,
    )
    if event_type:
        event_query = event_query.where(CalendarEvent.event_type == event_type)

    events_result = await db.execute(event_query.order_by(CalendarEvent.start_datetime))
    events = events_result.scalars().all()

    # Get tasks due in the same window
    task_query = select(Task).where(
        Task.user_id == _ws_uid(user),
        Task.status.in_(["pending", "in_progress"]),
        Task.due_date <= end,
    )
    tasks_result = await db.execute(task_query.order_by(Task.due_date))
    tasks = tasks_result.scalars().all()

    return {
        "events": [
            {
                "id": e.id,
                "title": e.title,
                "type": e.event_type,
                "start": e.start_datetime.isoformat() if e.start_datetime else None,
                "end": e.end_datetime.isoformat() if e.end_datetime else None,
                "location": e.location,
                "description": e.description,
            }
            for e in events
        ],
        "tasks": [
            {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "priority": t.priority,
                "due_date": t.due_date.isoformat() if t.due_date else None,
                "task_type": t.task_type,
            }
            for t in tasks
        ],
        "event_count": len(events),
        "task_count": len(tasks),
        "period": f"Next {days_ahead} days",
    }


# ══════════════════════════════════════════════════════════════════
# TOOL HANDLER REGISTRY
# ══════════════════════════════════════════════════════════════════

# Populate the tool handlers dict with all available tools
TOOL_HANDLERS = {
    # ── CRM Tools ────────────────────────────────────────────────
    "get_contacts": {"fn": _get_contacts, "needs_settings": False},
    "get_contact_details": {"fn": _get_contact_details, "needs_settings": False},
    "create_contact": {"fn": _create_contact, "needs_settings": False},
    "update_contact": {"fn": _update_contact, "needs_settings": False},
    "get_pipeline_summary": {"fn": _get_pipeline_summary, "needs_settings": False},
    "get_deals": {"fn": _get_deals, "needs_settings": False},
    "get_stalled_deals": {"fn": _get_stalled_deals, "needs_settings": False},
    "update_deal_stage": {"fn": _update_deal_stage, "needs_settings": False},
    "get_portfolio_summary": {"fn": _get_portfolio_summary, "needs_settings": False},
    # ── Phone Tools ──────────────────────────────────────────────
    "send_sms": {"fn": _send_sms, "needs_settings": True},
    "schedule_callback": {"fn": _schedule_callback, "needs_settings": False},
    "get_call_history": {"fn": _get_call_history, "needs_settings": False},
    "get_usage_stats": {"fn": _get_usage_stats, "needs_settings": False},
    # ── Analytics Tools ──────────────────────────────────────────
    "get_dashboard_stats": {"fn": _get_dashboard_stats, "needs_settings": False},
    # ── Property Research Tools ──────────────────────────────────
    "lookup_property": {"fn": _lookup_property, "needs_settings": True},
    "get_market_data": {"fn": _get_market_data, "needs_settings": True},
    "search_properties": {"fn": _search_properties, "needs_settings": False},
    # ── Deal Management Tools ────────────────────────────────────
    "create_deal": {"fn": _create_deal, "needs_settings": False},
    "add_deal_note": {"fn": _add_deal_note, "needs_settings": False},
    "upload_deal_photo": {"fn": _upload_deal_photo, "needs_settings": False},
    "get_deal_details": {"fn": _get_deal_details, "needs_settings": False},
    "search_deals": {"fn": _search_deals, "needs_settings": False},
    # ── ContentHub Tools ─────────────────────────────────────────
    "create_social_post": {"fn": _create_social_post, "needs_settings": True},
    "list_content": {"fn": _list_content, "needs_settings": False},
    # ── Email Compose Tools ──────────────────────────────────────
    "draft_email": {"fn": _draft_email, "needs_settings": True},
    "draft_offer_email": {"fn": _draft_offer_email, "needs_settings": True},
    # ── Calendar & Showing Tools ─────────────────────────────────
    "schedule_showing": {"fn": _schedule_showing, "needs_settings": True},
    "get_schedule": {"fn": _get_schedule, "needs_settings": False},
}
