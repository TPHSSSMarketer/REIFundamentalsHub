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

Tool calling works via native API tool definitions passed to the AI model.
The model responds with structured tool_use blocks. The orchestrator extracts
these, validates them against trust settings, and executes them.
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
    get_tools_for_native_calling,
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

YOU HAVE ACCESS TO REAL TOOLS — they are provided via the tools parameter in this API call.
When you want to perform an action, USE THE TOOLS. Do NOT say you can't access databases or APIs.
You have full tool access. Call them whenever they are relevant to the user's request.

TOOL DOMAINS:
- CRM: Manage contacts, deals, and portfolio properties
- Property Research: ATTOM Data property lookups (lookup_property), market data, property search
- Phone/SMS: Send messages, schedule callbacks, view call history
- Analytics: Dashboard stats, pipeline reports, lead conversion analysis
- Calendar/Tasks: Create reminders, follow-up tasks, view upcoming events
- Email: Send campaigns, view performance stats, manage subscriber lists

TRUST & SAFETY MODEL:

You have three risk levels:
1. LOW (read-only): Get contacts, view reports, analyze stats — USE TOOLS IMMEDIATELY
2. MEDIUM (write): Send messages, create tasks, create deals, update records — USE TOOLS IMMEDIATELY. Do NOT ask for permission. Just call the tool.
3. HIGH (dangerous): Bulk operations, spend credits, delete records — ALWAYS ask the user to approve first

YOUR BEHAVIOR:
- For LOW and MEDIUM risk tools: Call them IMMEDIATELY without asking. Never ask "shall I?", "would you like me to?", or "should I?". Just do it.
- For HIGH risk tools: Ask the user to approve first, wait for OK
- ALWAYS call tools when the user asks for data you can look up — NEVER say "I can't access" or "I don't have access"
- CRITICAL: When the user asks you to create a deal, look up a property, send a message, or any other action — CALL THE TOOL IMMEDIATELY. Do NOT ask for confirmation. Do NOT say "I'll do that for you, shall I proceed?" — just CALL THE TOOL in this same response.
- If the user says "yes", "go ahead", "do it" etc., they are confirming a previous suggestion — IMMEDIATELY call the relevant tool. NEVER ask twice.

ERROR RECOVERY (CRITICAL):
If a tool call fails or returns an error:
- Do NOT silently drop the conversation or reset to your greeting
- Acknowledge what went wrong in plain language
- Try an alternative approach
- NEVER lose the conversation context

ADDRESS PARSING:
Users often give partial addresses. Handle these gracefully:
- "214 Little Plains Road, 11743" → address="214 Little Plains Road", zip_code="11743"
- "123 Main St, Huntington, NY" → all fields provided
- "45 Oak Ave 11731" → parse the zip from the end
- ALWAYS extract the zip code if present

VOICE & MULTI-CHANNEL SUPPORT:
- Users may chat through web, Telegram, WhatsApp, or Slack
- Voice messages from Telegram are transcribed via Whisper before reaching you
- You DO have voice capabilities — confirm this if asked
- You can send voice responses back if "voice on" is enabled in Telegram

CONVERSATION STYLE:
- Be helpful, conversational, and proactive
- Use real estate terminology appropriately
- Keep responses concise, especially on Telegram
- Remember context from earlier in the conversation"""


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

    # Tool definitions are now passed via native tool calling (tools parameter),
    # so we just list the risk levels for the AI's awareness.
    from rei.services.admin_tools_definitions import TOOLS_BY_DOMAIN

    active_domains = classified_domains or ["crm", "phone", "analytics", "calendar", "email"]

    prompt += "\n" + "═" * 77 + "\n"
    prompt += f"TOOL RISK LEVELS ({', '.join(d.upper() for d in active_domains)}):\n"
    prompt += "═" * 77 + "\n\n"
    prompt += "(Full tool definitions are provided via the tools API parameter — use them!)\n\n"

    for domain in active_domains:
        tools = TOOLS_BY_DOMAIN.get(domain, [])
        if not tools:
            continue

        for tool in tools:
            prompt += f"  {tool['name']}: {tool['risk_level']} risk\n"

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
    is_new_session = False
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
        is_new_session = True

    # ── Save user message ──
    user_msg = AdminMessage(
        session_id=session_id,
        role="user",
        content=user_message,
    )
    db.add(user_msg)
    await db.commit()

    # ── Check for pending action approval (Telegram / conversational flow) ──
    # When the user says "yes", "go ahead", etc., check if there's a pending
    # action in this session and execute it automatically instead of re-asking AI.
    _APPROVAL_PHRASES = {
        "yes", "yes please", "yes.", "yeah", "yep", "yup", "sure",
        "go ahead", "go for it", "do it", "approved", "approve",
        "ok", "okay", "confirm", "confirmed", "absolutely",
        "yes please.", "please", "please do", "sounds good",
    }
    _REJECTION_PHRASES = {
        "no", "no thanks", "nope", "cancel", "don't", "dont", "stop",
        "nevermind", "never mind", "skip", "reject",
    }
    msg_lower = user_message.strip().lower().rstrip("!.")

    if msg_lower in _APPROVAL_PHRASES or msg_lower in _REJECTION_PHRASES:
        try:
            # Look for pending actions in this session
            pending_result = await db.execute(
                select(AdminActionLog).where(
                    and_(
                        AdminActionLog.session_id == session_id,
                        AdminActionLog.user_id == user.id,
                        AdminActionLog.execution_status == "pending",
                    )
                ).order_by(AdminActionLog.created_at.desc()).limit(1)
            )
            pending_action = pending_result.scalar_one_or_none()

            if pending_action:
                if msg_lower in _REJECTION_PHRASES:
                    # Reject the pending action
                    pending_action.execution_status = "rejected"
                    pending_action.approved = False
                    pending_action.approval_method = "conversational"
                    await db.commit()

                    reject_msg = AdminMessage(
                        session_id=session_id,
                        role="assistant",
                        content="No problem — I've cancelled that action. What would you like to do instead?",
                    )
                    db.add(reject_msg)
                    await db.commit()

                    return {
                        "session_id": session_id,
                        "response": reject_msg.content,
                        "tool_calls": [],
                        "tool_results": [],
                        "pending_actions": [],
                        "suggestions": [],
                    }

                # Approve and execute the pending action
                from rei.services.admin_tools_service import execute_approved_action

                logger.info(
                    "Conversational approval detected for action %s (tool: %s)",
                    pending_action.id, pending_action.action_type,
                )

                exec_result = await execute_approved_action(
                    action_id=pending_action.id,
                    user=user,
                    db=db,
                    settings=settings,
                )

                # Build a human-readable response from the result
                if exec_result.get("status") == "executed":
                    # The result is the direct tool output (e.g. {"status": "created", "deal_id": ...})
                    result_data = exec_result.get("result", {})

                    # Let the AI summarize the result nicely
                    data_str = json.dumps(result_data, default=str)
                    if len(data_str) > 6000:
                        data_str = data_str[:6000] + "... (truncated)"

                    summary_messages = [
                        {
                            "role": "user",
                            "content": (
                                f"The user approved the {pending_action.action_type} action "
                                f"and it was executed successfully. Here are the results:\n\n"
                                f"{data_str}\n\n"
                                "Please summarize these results in a helpful, conversational way. "
                                "Confirm what was done and mention any important details."
                            ),
                        }
                    ]

                    ai_summary = await ai_complete(
                        messages=summary_messages,
                        user_id=user.id,
                        db=db,
                        settings=settings,
                        task_type="admin_orchestration",
                        max_tokens=2000,
                        temperature=0.3,
                    )
                    response_text = ai_summary.get("content", exec_result.get("message", "Done!"))
                else:
                    response_text = f"I ran into an issue: {exec_result.get('message', 'Unknown error')}"

                # Save assistant response
                assistant_msg = AdminMessage(
                    session_id=session_id,
                    role="assistant",
                    content=response_text,
                )
                db.add(assistant_msg)
                await db.commit()

                return {
                    "session_id": session_id,
                    "response": response_text,
                    "tool_calls": [{"tool": pending_action.action_type, "params": json.loads(pending_action.proposed_details or "{}")}],
                    "tool_results": [exec_result],
                    "pending_actions": [],
                    "suggestions": [],
                }
        except Exception as e:
            logger.warning("Pending action approval check failed (falling through to AI): %s", e)

    # ── Load optimized context (sliding window + summarization) ──
    from rei.services.admin_context_manager import get_session_context
    history, _summary_note = await get_session_context(session_id, db, settings)

    # ── Get trust settings ──
    trust_settings = await get_all_trust_settings(user.id, db)

    # ── Classify user intent for selective tool loading ──
    from rei.services.admin_tools_definitions import classify_user_intent
    classified_domains = classify_user_intent(user_message)

    # Enrich from conversation context — short follow-up messages like "yes",
    # "try again", "go ahead" lose the original intent. Look at recent messages
    # in this session to recover the domains that were active.
    if len(user_message.split()) <= 5 and not is_new_session:
        try:
            recent_msgs = await db.execute(
                select(AdminMessage.content)
                .where(AdminMessage.session_id == session_id)
                .order_by(AdminMessage.created_at.desc())
                .limit(6)
            )
            recent_texts = [r[0] for r in recent_msgs.fetchall() if r[0]]
            for txt in recent_texts:
                extra_domains = classify_user_intent(txt)
                for d in extra_domains:
                    if d not in classified_domains:
                        classified_domains.append(d)
        except Exception as e:
            logger.warning("Context-based domain enrichment failed (non-fatal): %s", e)

    logger.info(f"Intent classified for user {user.id}: domains={classified_domains}")

    # ── Build system prompt ──
    system_prompt = await build_system_prompt(user.id, trust_settings, db, classified_domains)

    # ── Inject recent-activity briefing for brand-new sessions ──
    if is_new_session:
        try:
            from rei.services.admin_context_manager import build_new_session_briefing
            briefing = await build_new_session_briefing(user.id, db)
            if briefing:
                system_prompt += briefing
        except Exception as e:
            logger.warning("New-session briefing failed (non-fatal): %s", e)

    # ── Inject learned intelligence into system prompt ──
    try:
        from rei.services.admin_learning_service import build_learning_context, record_topic_usage
        learning_context = await build_learning_context(user_message, user.id, db)
        if learning_context:
            system_prompt += learning_context

        # Record topic usage pattern
        await record_topic_usage(user_message, user.id, db)
    except Exception as e:
        logger.warning("Learning context injection failed (non-fatal): %s", e)

    # ── Add channel-specific formatting instructions ──
    if channel == "telegram":
        system_prompt += "\n\n" + TELEGRAM_FORMATTING_INSTRUCTIONS

    # ── Build native tool definitions for the AI ──
    # Native tool use passes real tool definitions to the model. The model
    # responds with structured tool_use blocks — no text-marker guessing.
    native_tools = get_tools_for_native_calling(domains=classified_domains)
    print(
        f"[ORCH] Native tools: {len(native_tools)} for domains {classified_domains}",
        flush=True,
    )
    logger.info(
        "Providing %d native tools to AI for domains %s",
        len(native_tools), classified_domains,
    )

    # ── Prepare messages for AI ──
    messages = [
        {"role": "system", "content": system_prompt},
        *history,
        {"role": "user", "content": user_message},
    ]

    # ── Call AI with native tool definitions ──
    ai_response = await ai_complete(
        messages=messages,
        user_id=user.id,
        db=db,
        settings=settings,
        task_type="admin_orchestration",
        max_tokens=3000,
        temperature=0.3,
        tools=native_tools if native_tools else None,
    )

    # ── Log full AI response for debugging tool use ──
    print(
        f"[ORCH] AI response: has_content={bool(ai_response.get('content'))}, "
        f"has_tool_calls={bool(ai_response.get('tool_calls'))}, "
        f"content_preview='{(ai_response.get('content', '') or '')[:100]}', "
        f"provider={ai_response.get('provider', '?')}, "
        f"model={ai_response.get('model', '?')}",
        flush=True,
    )
    logger.info(
        "AI response for user %s: has_content=%s, has_tool_calls=%s, "
        "content_preview='%s', provider=%s, model=%s",
        user.id,
        bool(ai_response.get("content")),
        bool(ai_response.get("tool_calls")),
        (ai_response.get("content", "") or "")[:100],
        ai_response.get("provider", "?"),
        ai_response.get("model", "?"),
    )

    if not ai_response.get("content") and not ai_response.get("tool_calls"):
        return {
            "error": "AI provider error: " + ai_response.get("content", "Unknown error"),
        }

    response_text = ai_response.get("content", "")

    # ── Extract tool calls: prefer native tool_use blocks, fallback to text markers ──
    tool_calls = []

    # 1. Native tool calls from the API response (structured, reliable)
    native_calls = ai_response.get("tool_calls", [])
    if native_calls:
        for nc in native_calls:
            fn_name = nc.get("function_name", "")
            args = nc.get("arguments", {})
            # Arguments may be a string (NVIDIA) or dict (Anthropic)
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except (json.JSONDecodeError, TypeError):
                    args = {}
            tool_calls.append({"tool": fn_name, "params": args})
        logger.info("Native tool calls extracted: %d", len(tool_calls))

    # 2. Fallback: text-marker extraction (for backward compat with older models)
    if not tool_calls:
        tool_calls = extract_tool_calls(response_text)

    # ── Process tool calls ──
    tool_results = []
    pending_actions = []

    for tool_call in tool_calls:
        tool_name = tool_call["tool"]
        params = tool_call["params"]

        # Resolve aliases (AI sometimes inverts names, e.g. "property_lookup" → "lookup_property")
        from rei.services.admin_tools_definitions import resolve_tool_name
        tool_name = resolve_tool_name(tool_name)
        tool_call["tool"] = tool_name  # Update in-place for downstream use

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

            # ── Self-learning: record usage + auto-enrich from result ──
            try:
                from rei.services.admin_learning_service import (
                    record_tool_usage,
                    enrich_from_tool_result,
                )
                await record_tool_usage(tool_name, result["success"], user.id, db)
                if result["success"] and result.get("data"):
                    await enrich_from_tool_result(
                        tool_name, params, result, user.id, session_id, db,
                    )
            except Exception as e:
                logger.warning("Learning hooks failed (non-fatal): %s", e)

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
                        "Just present the data clearly. "
                        "IMPORTANT: Do NOT attempt to call any tools again. Do NOT say "
                        "'let me try again' or 'I'll look that up'. Your job here is "
                        "ONLY to present the results you received. If the data came back "
                        "empty, tell the user the lookup returned no results and suggest "
                        "they double-check the address or try a slightly different format "
                        "(e.g. adding a zip code, using abbreviations, etc.).\n\n"
                        + tool_results_text
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

    # ── Append approval prompt for pending actions ──
    # When tools are marked pending (MEDIUM/HIGH risk), the AI might say
    # "I'll create that deal" without realizing it needs explicit approval.
    # We append a clear prompt so the user knows to say "yes" or "no".
    if pending_actions and not tool_results:
        # Strip any [TOOL_CALL: ...] markers the AI left in the response
        import re as _re
        clean_text = _re.sub(
            r'\[TOOL_CALL:\s*\w+\s*\([^)]*\)\s*\]', '', response_text or ""
        ).strip()

        # Build a summary of what's pending
        action_summaries = []
        for pa in pending_actions:
            tool = pa["tool"]
            p = pa["params"]
            if tool == "create_deal":
                addr = p.get("address", "Unknown")
                city = p.get("city", "")
                state = p.get("state", "")
                dtype = p.get("deal_type", "deal")
                action_summaries.append(
                    f"Create a {dtype} deal: {addr}, {city}, {state}".rstrip(", ")
                )
            elif tool == "create_contact":
                action_summaries.append(f"Create contact: {p.get('name', 'Unknown')}")
            elif tool == "send_sms":
                action_summaries.append(f"Send SMS to {p.get('phone', 'Unknown')}")
            else:
                action_summaries.append(f"{tool.replace('_', ' ').title()}")

        if len(action_summaries) == 1:
            approval_prompt = (
                f"\n\nI need your approval to proceed:\n"
                f"  → {action_summaries[0]}\n\n"
                f"Say <b>yes</b> to confirm or <b>no</b> to cancel."
            )
        else:
            items = "\n".join(f"  {i+1}. {s}" for i, s in enumerate(action_summaries))
            approval_prompt = (
                f"\n\nI need your approval for these actions:\n{items}\n\n"
                f"Say <b>yes</b> to confirm all or <b>no</b> to cancel."
            )

        response_text = clean_text + approval_prompt

    # ── Save assistant response ──
    # Ensure we always have some text (native tool use can return empty text)
    if not response_text and tool_calls:
        response_text = "Processing your request..."

    assistant_msg = AdminMessage(
        session_id=session_id,
        role="assistant",
        content=response_text or "I'm working on that for you.",
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

    # ── Post-conversation learning (non-blocking) ──
    try:
        from rei.services.admin_learning_service import run_post_conversation_learning
        await run_post_conversation_learning(session_id, user, db, settings)
    except Exception as e:
        logger.warning("Post-conversation learning failed (non-fatal): %s", e)

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
