"""AI Admin Assistant — Orchestrator Service.

This is the brain of the admin assistant. It:
1. Takes user messages and processes them through the AI
2. Builds comprehensive system prompts with trust context
3. Parses tool calls from AI responses
4. Executes tools and records actions
5. Maintains session state and conversation history

The orchestrator follows a trust-based model:
- LOW risk tools (read-only): execute immediately
- MEDIUM risk tools (write): ask user for confirmation by default
- HIGH risk tools (delete, spend): always ask for confirmation

Tool calling works via inline markers [TOOL_CALL: tool_name({...})] that
the AI includes in its response text. The orchestrator extracts these,
validates them against trust settings, and executes them.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings
from rei.models.admin_assistant import AdminActionLog, AdminMessage, AdminSession
from rei.models.user import User
from rei.services.admin_tools_definitions import (
    ALL_TOOLS,
    TOOLS_BY_NAME,
    get_risk_level,
    get_tools_for_ai,
)
from rei.services.admin_trust_service import (
    get_all_trust_settings,
    get_trust_level,
    should_auto_approve,
)
from rei.services.ai_service import ai_complete

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT — The orchestrator's instructions
# ═══════════════════════════════════════════════════════════════════════════

ORCHESTRATOR_SYSTEM_PROMPT = """You are an AI administrative assistant for REIFundamentals Hub, a real estate investing business platform.
Your job is to help users manage their CRM, analyze their pipeline, send communications, and automate business tasks.

YOU HAVE ACCESS TO POWERFUL TOOLS across these domains:
- CRM: Manage contacts, deals, and portfolio properties
- Phone/SMS: Send messages, schedule callbacks, view call history
- Analytics: Dashboard stats, pipeline reports, lead conversion analysis
- Calendar/Tasks: Create reminders, follow-up tasks, view upcoming events
- Email: Send campaigns, view performance stats, manage subscriber lists

CRITICAL INSTRUCTIONS FOR TOOL CALLING:

When you want to execute a tool, format it EXACTLY like this:
[TOOL_CALL: tool_name({"param1": "value1", "param2": "value2"})]

Examples:
- [TOOL_CALL: get_contacts({"tag": "hot_leads", "limit": 10})]
- [TOOL_CALL: send_sms({"contact_phone": "+1-555-0100", "message": "Hi Sarah, quick follow-up..."})]
- [TOOL_CALL: get_pipeline_summary({})]

TRUST & SAFETY MODEL:

You have three risk levels:
1. LOW (read-only): Get contacts, view reports, analyze stats — EXECUTE IMMEDIATELY
2. MEDIUM (write): Send messages, create tasks, update records — PROPOSE FIRST, then execute if approved
3. HIGH (dangerous): Bulk operations, spend credits, delete records — ALWAYS PROPOSE and wait for explicit approval

YOUR BEHAVIOR:
- For LOW risk tools: Use them directly to gather information and help the user
- For MEDIUM risk tools: Explain what you want to do BEFORE the tool call (e.g., "I'll send an SMS to Sarah...") then use [TOOL_CALL: ...]
- For HIGH risk tools: ALWAYS ask the user to approve first. Explain the action, wait for their OK, then execute
- Never use multiple HIGH-risk tools in one response — ask for approval one at a time

WHEN YOU SEE TOOL RESULTS:
After a tool executes, the system will show you the result. Use this to inform your next response:
- Summarize findings for the user in natural language
- If the tool failed, offer an alternative approach
- Ask clarifying questions if needed
- Suggest next steps based on the data

ERROR RECOVERY (CRITICAL):
If a tool call fails or returns an error:
- Do NOT silently drop the conversation or reset to your greeting
- Do NOT re-introduce yourself after a tool failure
- Instead, acknowledge what went wrong in plain language
- Try an alternative approach (e.g., create the deal with what you have instead of looking it up first)
- If you cannot complete the request, tell the user what happened and what you need from them
- NEVER lose the conversation context — always continue from where you left off

ADDRESS PARSING:
Users often give partial addresses. You must handle these formats gracefully:
- "214 Little Plains Road, 11743" → address="214 Little Plains Road", zip_code="11743" (city/state resolved from zip)
- "123 Main St, Huntington, NY" → all fields provided
- "45 Oak Ave 11731" → parse the zip from the end
- ALWAYS extract the zip code if one is present, even without a comma separator
- If city/state are not explicitly provided but a zip code is, pass the zip and let the tool resolve the rest

VOICE & MULTI-CHANNEL SUPPORT:
- Users may chat with you through the web app, Telegram, WhatsApp, or Slack
- Voice messages from Telegram are automatically transcribed using OpenAI Whisper before reaching you
- You DO have voice recognition capabilities — voice notes are transcribed to text seamlessly
- If a user mentions voice or asks about voice features, confirm that voice notes ARE supported on Telegram
- You can also send voice responses back if the user enables "voice on" in Telegram
- Never say you don't have voice capabilities — you do, through the Whisper transcription pipeline

CONVERSATION STYLE:
- Be helpful, conversational, and proactive
- Use real estate terminology appropriately (deals, pipeline, properties, investors, etc.)
- When showing data, format it nicely with bullet points, tables, or summaries
- Ask clarifying questions if user requests are ambiguous
- Remember context from earlier in the conversation
- Be honest when you don't have enough information
- Keep responses concise, especially on Telegram where long messages are hard to read

REMEMBER: Your goal is to help the user run their real estate business more efficiently. Be intelligent about suggesting workflows (e.g., "I found 5 stalled deals — should I create follow-up tasks for these?") but don't overwhelm them with options."""


TELEGRAM_FORMATTING_INSTRUCTIONS = """
═══════════════════════════════════════════════════════════════════════════
CRITICAL: TELEGRAM FORMATTING RULES (this message is being sent via Telegram)
═══════════════════════════════════════════════════════════════════════════

You are replying to a Telegram chat. Telegram only supports basic HTML tags.
Follow these rules STRICTLY for all responses:

ALLOWED HTML TAGS (use these for formatting):
  <b>bold text</b>
  <i>italic text</i>
  <code>inline code</code>
  <pre>code block</pre>
  <u>underline</u>
  <s>strikethrough</s>
  <a href="url">link text</a>

NEVER USE (Telegram cannot render these):
  - NO markdown: no **, no ##, no ---, no ```
  - NO tables: no | column | format | ever
  - NO horizontal rules: no --- or ===
  - NO HTML tags like <h1>, <h2>, <table>, <tr>, <td>, <div>, <span>

HOW TO FORMAT DATA NICELY IN TELEGRAM:

Instead of tables, use a clean list format:

<b>Your Pipeline:</b>

<b>1. 153 Vernon Valley Road</b>
   Stage: Analysis
   ARV: $550,000
   Status: In Progress

<b>2. 456 Oak Lane</b>
   Stage: Offer Sent
   ARV: $320,000
   Status: Waiting for response

Instead of headers with ##, use <b>bold text</b> with a blank line above.

Instead of dividers (---), just use a blank line.

For action items, use numbered lists or bullet points with plain text:

<b>What to do today:</b>

1. Complete deal analysis for 153 Vernon Valley
2. Set an offer price (ARV is $550K, no offer yet)
3. Pull comps — want me to run a property lookup?

Keep responses CONCISE. Telegram messages should be easy to scan on a phone.
Aim for short paragraphs and clear structure. No walls of text.
"""


# ═══════════════════════════════════════════════════════════════════════════
# TOOL CALL EXTRACTION & EXECUTION
# ═══════════════════════════════════════════════════════════════════════════


def extract_tool_calls(response_text: str) -> list[dict]:
    """Extract [TOOL_CALL: tool_name({...})] markers from AI response text.

    Returns list of dicts: [{"tool": "name", "params": {...}, "raw": "..."}, ...]
    """
    tool_calls = []
    # Match [TOOL_CALL: tool_name({...})] with proper JSON parsing
    pattern = r'\[TOOL_CALL:\s*(\w+)\s*\(\s*({[^}]*})\s*\)\s*\]'

    for match in re.finditer(pattern, response_text):
        tool_name = match.group(1)
        params_str = match.group(2)

        try:
            params = json.loads(params_str)
        except json.JSONDecodeError:
            logger.warning(f"Failed to parse tool params: {params_str}")
            continue

        tool_calls.append({
            "tool": tool_name,
            "params": params,
            "raw": match.group(0),
        })

    return tool_calls


async def execute_tool(
    tool_name: str,
    params: dict,
    user: User,
    db: AsyncSession,
    settings: Settings,
    session_id: Optional[str] = None,
) -> dict:
    """Execute a tool via the tool service (with trust system)."""
    from rei.services.admin_tools_service import execute_tool as _execute_tool

    result = await _execute_tool(
        tool_name=tool_name,
        params=params,
        user=user,
        db=db,
        settings=settings,
        session_id=session_id,
    )

    # Map to simple success/data format for orchestrator
    return {
        "success": result.get("status") == "executed",
        "data": result.get("result"),
        "error": result.get("message") if result.get("status") != "executed" else None,
        "status": result.get("status", "unknown"),
        "action_id": result.get("action_id", ""),
    }


# ═══════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT BUILDER
# ═══════════════════════════════════════════════════════════════════════════


async def build_system_prompt(
    user_id: int,
    trust_settings: list[dict],
    db: AsyncSession,
    classified_domains: Optional[list[str]] = None,
) -> str:
    """Build the complete system prompt for the orchestrator.

    Includes:
    - Core orchestrator instructions
    - Available tools with descriptions, grouped by domain
    - Trust level context (which actions are auto-approved vs need approval)
    """
    prompt = ORCHESTRATOR_SYSTEM_PROMPT + "\n\n"

    # Build trust context
    prompt += "═" * 77 + "\n"
    prompt += "YOUR TRUST SETTINGS (how the system handles different action types):\n"
    prompt += "═" * 77 + "\n\n"

    # Group by trust level
    auto_approved = []
    needs_approval = []
    blocked = []

    for setting in trust_settings:
        action = setting["action_type"]
        level = setting["trust_level"]

        if level == "auto":
            auto_approved.append(action)
        elif level == "ask":
            needs_approval.append(action)
        elif level == "never":
            blocked.append(action)

    if auto_approved:
        prompt += f"AUTO-APPROVED (execute immediately without asking):\n"
        for action in sorted(auto_approved):
            prompt += f"  - {action}\n"
        prompt += "\n"

    if needs_approval:
        prompt += f"NEEDS USER APPROVAL (propose first, then wait for ok):\n"
        for action in sorted(needs_approval):
            prompt += f"  - {action}\n"
        prompt += "\n"

    if blocked:
        prompt += f"BLOCKED (never execute these without explicit user override):\n"
        for action in sorted(blocked):
            prompt += f"  - {action}\n"
        prompt += "\n"

    # Add tool descriptions — only for classified domains
    from rei.services.admin_tools_definitions import get_tools_for_domains, TOOLS_BY_DOMAIN

    active_domains = classified_domains or ["crm", "phone", "analytics", "calendar", "email"]

    prompt += "\n" + "═" * 77 + "\n"
    prompt += f"AVAILABLE TOOLS ({', '.join(d.upper() for d in active_domains)}):\n"
    prompt += "═" * 77 + "\n\n"

    for domain in active_domains:
        tools = TOOLS_BY_DOMAIN.get(domain, [])
        if not tools:
            continue

        prompt += f"### {domain.upper()} DOMAIN\n\n"
        for tool in tools:
            prompt += f"**{tool['name']}** [{tool['risk_level']}]\n"
            prompt += f"  {tool['description']}\n"
            params = tool.get("parameters", {}).get("properties", {})
            if params:
                prompt += "  Parameters: " + ", ".join(params.keys()) + "\n"
            prompt += "\n"

    return prompt


# ═══════════════════════════════════════════════════════════════════════════
# SESSION & MESSAGE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════


async def get_session_messages(
    session_id: str,
    db: AsyncSession,
    limit: int = 20,
) -> list[dict]:
    """Load recent messages from a session formatted for the AI.

    Returns list of dicts: [{"role": "user", "content": "..."}, ...]
    """
    result = await db.execute(
        select(AdminMessage)
        .where(AdminMessage.session_id == session_id)
        .order_by(AdminMessage.created_at.asc())
        .limit(limit)
    )
    messages = result.scalars().all()

    return [
        {"role": msg.role, "content": msg.content}
        for msg in messages
    ]


async def create_session(
    user_id: int,
    title: str,
    db: AsyncSession,
) -> AdminSession:
    """Create a new chat session."""
    session = AdminSession(
        user_id=user_id,
        title=title,
        message_count=0,
    )
    db.add(session)
    await db.commit()
    return session


async def list_sessions(
    user_id: int,
    db: AsyncSession,
    limit: int = 20,
) -> list[dict]:
    """List user's chat sessions, most recent first."""
    result = await db.execute(
        select(AdminSession)
        .where(AdminSession.user_id == user_id)
        .order_by(desc(AdminSession.last_message_at))
        .limit(limit)
    )
    sessions = result.scalars().all()

    return [
        {
            "id": s.id,
            "title": s.title,
            "message_count": s.message_count,
            "last_message_at": s.last_message_at.isoformat() if s.last_message_at else None,
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions
    ]


# ═══════════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATION FUNCTION
# ═══════════════════════════════════════════════════════════════════════════


async def process_message(
    session_id: Optional[str],
    user_message: str,
    user: User,
    db: AsyncSession,
    settings: Settings,
    channel: str = "web",
) -> dict:
    """Main entry point: process a user message through the orchestrator.

    Flow:
    1. Load or create session
    2. Save user message to database
    3. Load recent message history
    4. Build system prompt with trust settings
    5. Call AI to generate response
    6. Extract and validate tool calls
    7. Execute tools (respecting trust settings)
    8. Save assistant response and tool results
    9. Return formatted response to user

    Args:
        session_id: Existing session ID, or None to create new
        user_message: The user's input text
        user: User object
        db: Database session
        settings: App configuration

    Returns:
        {
            "session_id": str,
            "response": str,
            "tool_calls": list[dict],
            "tool_results": list[dict],
            "pending_actions": list[dict],
            "suggestions": list[str],
        }
    """

    # ── Load or create session ──
    if session_id:
        session = await db.get(AdminSession, session_id)
        if not session or session.user_id != user.id:
            return {
                "error": "Session not found or access denied",
            }
    else:
        # Create new session — title from first message
        title = user_message[:50] + ("..." if len(user_message) > 50 else "")
        session = await create_session(user.id, title, db)
        session_id = session.id

    # ── Save user message ──
    user_msg = AdminMessage(
        session_id=session_id,
        role="user",
        content=user_message,
    )
    db.add(user_msg)
    await db.commit()

    # ── Load optimized context (sliding window + summarization) ──
    from rei.services.admin_context_manager import get_session_context
    history, _summary_note = await get_session_context(session_id, db, settings)

    # ── Get trust settings ──
    trust_settings = await get_all_trust_settings(user.id, db)

    # ── Classify user intent for selective tool loading ──
    from rei.services.admin_tools_definitions import classify_user_intent
    classified_domains = classify_user_intent(user_message)
    logger.info(f"Intent classified for user {user.id}: domains={classified_domains}")

    # ── Build system prompt ──
    system_prompt = await build_system_prompt(user.id, trust_settings, db, classified_domains)

    # ── Add channel-specific formatting instructions ──
    if channel == "telegram":
        system_prompt += "\n\n" + TELEGRAM_FORMATTING_INSTRUCTIONS

    # ── Prepare messages for AI ──
    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": user_message},
    ]

    # ── Call AI ──
    ai_response = await ai_complete(
        messages=messages,
        user_id=user.id,
        db=db,
        settings=settings,
        task_type="admin_orchestration",
        max_tokens=3000,
        temperature=0.3,
    )

    if not ai_response.get("content"):
        return {
            "error": "AI provider error: " + ai_response.get("content", "Unknown error"),
        }

    response_text = ai_response["content"]

    # ── Extract tool calls from response ──
    tool_calls = extract_tool_calls(response_text)

    # ── Process tool calls ──
    tool_results = []
    pending_actions = []

    for tool_call in tool_calls:
        tool_name = tool_call["tool"]
        params = tool_call["params"]

        # Validate tool
        if tool_name not in TOOLS_BY_NAME:
            logger.warning(f"AI tried to call unknown tool: {tool_name}")
            continue

        tool_def = TOOLS_BY_NAME[tool_name]
        risk_level = tool_def["risk_level"]

        # Check trust level
        should_auto = await should_auto_approve(user.id, tool_name, risk_level, db)

        if should_auto:
            # Auto-approve and execute
            logger.info(f"Auto-executing tool: {tool_name}")
            result = await execute_tool(tool_name, params, user, db, settings, session_id)

            # Log the action
            action_log = AdminActionLog(
                user_id=user.id,
                session_id=session_id,
                action_type=tool_name,
                action_name=f"{tool_name}({json.dumps(params)[:50]}...)",
                risk_level=risk_level,
                proposed_details=json.dumps(params),
                approved=True,
                approval_method="auto",
                execution_status="executing" if result["success"] else "failed",
                result_data=json.dumps(result),
                executed_at=datetime.utcnow(),
            )
            db.add(action_log)
            await db.commit()

            tool_results.append({
                "tool": tool_name,
                "status": "executed" if result["success"] else "failed",
                "result": result,
            })
        else:
            # Mark as pending — user approval needed
            action_log = AdminActionLog(
                user_id=user.id,
                session_id=session_id,
                action_type=tool_name,
                action_name=f"{tool_name}({json.dumps(params)[:50]}...)",
                risk_level=risk_level,
                proposed_details=json.dumps(params),
                approved=None,  # Pending
                approval_method=None,
                execution_status="pending",
            )
            db.add(action_log)
            await db.commit()

            pending_actions.append({
                "action_id": action_log.id,
                "tool": tool_name,
                "params": params,
                "risk_level": risk_level,
                "description": tool_def["description"],
            })

    # ── Second AI pass: feed tool results back for a human-readable summary ──
    total_tokens = ai_response.get("tokens_used", 0)
    total_input = ai_response.get("input_tokens", 0)
    total_output = ai_response.get("output_tokens", 0)
    total_cost = ai_response.get("cost_cents", 0)

    if tool_results:
        # Build a tool-results message for the AI to summarize
        results_parts = []
        for tr in tool_results:
            tool_name = tr["tool"]
            result_data = tr.get("result", {})
            if tr["status"] == "executed" and result_data.get("success"):
                data = result_data.get("data")
                # Truncate very large results to keep within token limits
                data_str = json.dumps(data, default=str)
                if len(data_str) > 6000:
                    data_str = data_str[:6000] + "... (truncated)"
                results_parts.append(
                    f"[TOOL_RESULT: {tool_name}]\n{data_str}\n[/TOOL_RESULT]"
                )
            elif tr["status"] == "failed":
                error_msg = result_data.get("error", "Unknown error")
                results_parts.append(
                    f"[TOOL_RESULT: {tool_name}]\nERROR: {error_msg}\n[/TOOL_RESULT]"
                )

        if results_parts:
            tool_results_text = "\n\n".join(results_parts)

            # Second AI call — ask the AI to summarize the tool results
            followup_messages = [
                {"role": "system", "content": system_prompt},
                *history,
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": response_text},
                {
                    "role": "user",
                    "content": (
                        "Here are the results from the tools you just called. "
                        "Please summarize these results for the user in a helpful, "
                        "conversational way. Do NOT include any [TOOL_CALL: ...] markers. "
                        "Just present the data clearly.\n\n" + tool_results_text
                    ),
                },
            ]

            followup_response = await ai_complete(
                messages=followup_messages,
                user_id=user.id,
                db=db,
                settings=settings,
                task_type="admin_orchestration",
                max_tokens=3000,
                temperature=0.3,
            )

            if followup_response.get("content"):
                response_text = followup_response["content"]
                total_tokens += followup_response.get("tokens_used", 0)
                total_input += followup_response.get("input_tokens", 0)
                total_output += followup_response.get("output_tokens", 0)
                total_cost += followup_response.get("cost_cents", 0)

            logger.info(
                "Second AI pass completed for user %s with %d tool results",
                user.id, len(tool_results),
            )

    # ── Save assistant response ──
    assistant_msg = AdminMessage(
        session_id=session_id,
        role="assistant",
        content=response_text,
        tool_calls=json.dumps(tool_calls) if tool_calls else None,
        tokens_used=total_tokens,
        input_tokens=total_input,
        output_tokens=total_output,
        cost_cents=total_cost,
        model_used=ai_response.get("model"),
    )
    db.add(assistant_msg)

    # ── Update session metadata ──
    session.message_count += 2  # User + assistant
    session.last_message_at = datetime.utcnow()

    # If first message, set title from user's message
    if session.message_count == 2:
        session.title = user_message[:60] + ("..." if len(user_message) > 60 else "")

    await db.commit()

    # ── Build suggestions for next steps ──
    suggestions = []
    if not tool_calls and not pending_actions:
        # If no tools were used, suggest some common next steps
        if "pipeline" in user_message.lower() or "deal" in user_message.lower():
            suggestions.append("Get pipeline summary")
            suggestions.append("Find stalled deals")
        elif "contact" in user_message.lower():
            suggestions.append("Search contacts")
            suggestions.append("Get contact details")
        elif "follow" in user_message.lower():
            suggestions.append("Create follow-up task")
            suggestions.append("View upcoming tasks")

    return {
        "session_id": session_id,
        "response": response_text,
        "tool_calls": tool_calls,
        "tool_results": tool_results,
        "pending_actions": pending_actions,
        "suggestions": suggestions,
        "tokens_used": total_tokens,
    }


# ═══════════════════════════════════════════════════════════════════════════
# APPROVAL HANDLERS — User responds to pending actions
# ═══════════════════════════════════════════════════════════════════════════


async def approve_action(
    action_id: str,
    user: User,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """User explicitly approves a pending action.

    Returns: {"success": bool, "result": Any, "error": Optional[str]}
    """
    action_log = await db.get(AdminActionLog, action_id)

    if not action_log or action_log.user_id != user.id:
        return {
            "success": False,
            "error": "Action not found or access denied",
        }

    if action_log.execution_status != "pending":
        return {
            "success": False,
            "error": f"Action is already {action_log.execution_status}",
        }

    # Execute the tool
    try:
        params = json.loads(action_log.proposed_details or "{}")
        result = await execute_tool(action_log.action_type, params, user, db, settings)

        # Update the log
        action_log.approved = True
        action_log.approval_method = "user"
        action_log.approved_at = datetime.utcnow()
        action_log.execution_status = "success" if result["success"] else "failed"
        action_log.result_data = json.dumps(result)
        action_log.executed_at = datetime.utcnow()

        await db.commit()

        return {
            "success": result["success"],
            "result": result,
        }

    except Exception as e:
        logger.exception("Failed to execute approved action")
        action_log.approved = True
        action_log.approval_method = "user"
        action_log.execution_status = "failed"
        action_log.error_message = str(e)
        await db.commit()

        return {
            "success": False,
            "error": str(e),
        }


async def reject_action(
    action_id: str,
    user: User,
    rejection_reason: Optional[str],
    db: AsyncSession,
) -> dict:
    """User explicitly rejects a pending action."""
    action_log = await db.get(AdminActionLog, action_id)

    if not action_log or action_log.user_id != user.id:
        return {
            "success": False,
            "error": "Action not found or access denied",
        }

    action_log.approved = False
    action_log.approval_method = "rejected"
    action_log.approval_message = rejection_reason
    action_log.execution_status = "rejected"
    action_log.approved_at = datetime.utcnow()

    await db.commit()

    return {
        "success": True,
        "message": "Action rejected",
    }
