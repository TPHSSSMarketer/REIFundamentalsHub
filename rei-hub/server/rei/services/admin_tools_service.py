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

    query = select(CrmContact).where(CrmContact.user_id == user.id)

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
                CrmContact.user_id == user.id,
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
        user_id=user.id,
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
                CrmContact.user_id == user.id,
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
        .where(CrmDeal.user_id == user.id)
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

    query = select(CrmDeal).where(CrmDeal.user_id == user.id)

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
            CrmDeal.user_id == user.id,
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
                CrmDeal.user_id == user.id,
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
        select(CrmPortfolioProperty).where(CrmPortfolioProperty.user_id == user.id)
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
        user_id=user.id,
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
        user_id=user.id,
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

    query = select(CallLog).where(CallLog.user_id == user.id).order_by(
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
            CallLog.user_id == user.id
        )
    )
    call_count, total_seconds = call_result.one()
    call_count = call_count or 0
    total_seconds = total_seconds or 0

    sms_result = await db.execute(
        select(func.count(SmsMessage.id)).where(SmsMessage.user_id == user.id)
    )
    sms_count = sms_result.scalar() or 0

    # Get credit info
    credit_result = await db.execute(
        select(PhoneCredit)
        .where(PhoneCredit.user_id == user.id)
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
        select(func.count(CrmContact.id)).where(CrmContact.user_id == user.id)
    )
    total_contacts = contact_result.scalar() or 0

    # Count deals by status
    deal_result = await db.execute(
        select(func.count(CrmDeal.id)).where(CrmDeal.user_id == user.id)
    )
    total_deals = deal_result.scalar() or 0

    # Get pipeline value
    value_result = await db.execute(
        select(func.sum(CrmDeal.offer_price)).where(CrmDeal.user_id == user.id)
    )
    pipeline_value = value_result.scalar() or 0

    # Get portfolio value
    portfolio_result = await db.execute(
        select(func.sum(CrmPortfolioProperty.current_value)).where(
            CrmPortfolioProperty.user_id == user.id
        )
    )
    portfolio_value = portfolio_result.scalar() or 0

    # Get call stats (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    call_result = await db.execute(
        select(func.count(CallLog.id)).where(
            and_(
                CallLog.user_id == user.id,
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

    # Generic fallback
    return f"Execute {tool_name}"


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
}
