"""Conversation Flow Engine — The brain that powers dynamic conversations.

HOW THIS WORKS (in plain English for Chris):

Imagine a conversation as a path through a flowchart:
1. Contact sends a message (via web chat, SMS, etc.)
2. The engine looks at WHERE we are in the flow (which node)
3. It builds a CUSTOM AI prompt for just that step
4. It sends the message + prompt to Claude (or whatever AI provider)
5. Claude responds naturally based on the focused prompt
6. The engine checks if the step's goal was achieved
7. If yes → move to the next node. If no → try again.
8. Repeat until the flow is complete.

The KEY INSIGHT from CloseBot:
Instead of one giant system prompt, each step has its own mini-prompt.
This makes the AI WAY more focused and effective at each step.

Example:
  Node 1 prompt: "Your ONLY job right now is to greet the caller warmly and
                   determine if they want to buy or sell a property."
  Node 2 prompt: "The contact wants to SELL. Your job now is to find out
                   the property address and their timeline for selling."
  Node 3 prompt: "You now have their address (123 Main St) and timeline (ASAP).
                   Determine their asking price and motivation for selling."

Each prompt is laser-focused on ONE thing → much better results.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings
from rei.models.conversation_flow import (
    ChatSession,
    ConversationFlow,
    FlowEdge,
    FlowExecution,
    FlowNode,
    Persona,
)
from rei.services.ai_service import ai_complete
from rei.services.rag_service import retrieve_relevant_knowledge

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# PROMPT BUILDER — Builds the focused prompt for each node
# ═══════════════════════════════════════════════════════════════


def _build_persona_prompt(persona: Optional[Persona]) -> str:
    """Build the personality section of the prompt from a Persona."""
    if not persona:
        return (
            "PERSONALITY: You are a helpful, professional real estate assistant. "
            "Keep responses concise and natural — 1-3 sentences."
        )

    prompt = f"PERSONALITY: {persona.personality_prompt}\n"
    prompt += f"TONE: {persona.tone}\n"

    length_map = {
        "short": "Keep responses to 1-2 sentences maximum.",
        "medium": "Keep responses to 2-3 sentences.",
        "long": "You can give more detailed responses, 3-5 sentences.",
    }
    prompt += f"RESPONSE LENGTH: {length_map.get(persona.response_length, length_map['medium'])}\n"

    if persona.quirks:
        try:
            quirks = json.loads(persona.quirks)
            quirk_instructions = []
            if quirks.get("uses_emojis"):
                quirk_instructions.append("Occasionally use relevant emojis.")
            if quirks.get("occasional_typos"):
                quirk_instructions.append("Include an occasional minor typo to feel more human.")
            if quirks.get("says_um"):
                quirk_instructions.append('Use filler words occasionally like "um", "hmm", "well".')
            if quirk_instructions:
                prompt += "STYLE QUIRKS: " + " ".join(quirk_instructions) + "\n"
        except json.JSONDecodeError:
            pass

    return prompt


def _build_variables_context(variables: dict) -> str:
    """Format collected variables as context for the AI.

    This tells the AI what it already knows about the contact,
    so it doesn't re-ask questions.
    """
    if not variables:
        return ""

    context = "INFORMATION COLLECTED SO FAR:\n"
    for key, value in variables.items():
        if value is not None and value != "":
            # Make variable names human-readable
            readable_key = key.replace("_", " ").title()
            context += f"  - {readable_key}: {value}\n"
    return context


def _build_node_prompt(
    node: FlowNode,
    variables: dict,
    persona: Optional[Persona],
    flow_name: str,
) -> str:
    """Build the complete AI prompt for a specific node.

    THIS IS THE SECRET SAUCE — the dynamic prompting algorithm.
    Each node type gets a different kind of prompt.
    """

    # Start with persona
    prompt = _build_persona_prompt(persona) + "\n\n"

    # Add collected variables as context
    vars_context = _build_variables_context(variables)
    if vars_context:
        prompt += vars_context + "\n"

    # ── Objective Node ───────────────────────────────────────────
    if node.node_type == "objective":
        prompt += f"YOUR CURRENT OBJECTIVE: {node.short_description}\n\n"
        prompt += (
            "IMPORTANT: Your ONLY goal right now is to accomplish this objective. "
            "Do NOT move on to other topics. Stay focused on determining this information.\n"
        )
        if node.output_variable:
            prompt += (
                f"Once you have the answer, make sure it's clear. "
                f"The information will be stored as: {node.output_variable}\n"
            )
        if node.extra_prompt:
            prompt += f"\nADDITIONAL CONTEXT: {node.extra_prompt}\n"
        prompt += (
            "\nRules:\n"
            "- Ask naturally, don't interrogate\n"
            "- If they give a partial answer, gently probe for more detail\n"
            "- If they clearly don't want to answer, respect that and note it\n"
            "- NEVER make up information — only record what they actually say\n"
        )

    # ── Statement Node ───────────────────────────────────────────
    elif node.node_type == "statement":
        if node.message_text and not node.ai_generate:
            # Fixed message — just send it
            prompt += (
                "INSTRUCTION: Deliver the following message to the contact. "
                "You may rephrase slightly to sound natural, but keep the core content:\n\n"
                f'"{node.message_text}"\n'
            )
        else:
            # AI-generated message
            prompt += "INSTRUCTION: Generate a natural message based on these guidelines:\n"
            prompt += f"{node.extra_prompt or node.message_text or 'Provide a helpful response.'}\n"

    # ── Conversation Node ────────────────────────────────────────
    elif node.node_type == "conversation":
        prompt += (
            "MODE: Free conversation. Chat naturally with the contact. "
            "Answer their questions, address their concerns, and be helpful.\n"
        )
        if node.extra_prompt:
            prompt += f"GUIDELINES: {node.extra_prompt}\n"

    # ── Switch Node ──────────────────────────────────────────────
    elif node.node_type == "switch":
        if node.switch_mode == "ai":
            prompt += (
                "DECISION REQUIRED: Based on the conversation so far, "
                "determine which of the following categories best fits:\n"
            )
            if node.switch_options:
                try:
                    options = json.loads(node.switch_options)
                    for opt in options:
                        prompt += f'  - "{opt.get("label", "")}": {opt.get("description", "")}\n'
                except json.JSONDecodeError:
                    pass
            prompt += (
                "\nRespond naturally to the contact, then indicate your decision. "
                "Do NOT tell the contact you're making a routing decision.\n"
            )

    # ── Transfer Node ────────────────────────────────────────────
    elif node.node_type == "transfer":
        prompt += (
            "TRANSFER: Let the contact know you're connecting them with "
        )
        if node.transfer_to == "human":
            prompt += "a team member who can help them further.\n"
        else:
            prompt += "another specialist who can assist them.\n"
        prompt += "Be warm and reassuring during the handoff.\n"

    # ── Stop Node ────────────────────────────────────────────────
    elif node.node_type == "stop":
        prompt += "CLOSING: Wrap up the conversation politely.\n"
        if node.message_text:
            prompt += f'Include this in your closing: "{node.message_text}"\n'

    return prompt


# ═══════════════════════════════════════════════════════════════
# RESPONSE EVALUATOR — Did the AI get what it needed?
# ═══════════════════════════════════════════════════════════════


async def _evaluate_objective(
    node: FlowNode,
    contact_message: str,
    ai_response: str,
    conversation_history: list[dict],
    variables: dict,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """Use AI to evaluate whether an objective was achieved.

    Returns:
        {
            "achieved": True/False,
            "extracted_value": "the value extracted" or None,
            "confidence": 0.0-1.0
        }
    """
    eval_prompt = f"""Analyze this conversation exchange and determine if the objective was achieved.

OBJECTIVE: {node.short_description}
VARIABLE TO EXTRACT: {node.output_variable or "general_info"}

LATEST CONTACT MESSAGE: "{contact_message}"
AI RESPONSE: "{ai_response}"

SENSITIVITY LEVEL: {node.sensitivity}/100 (higher = stricter evaluation)

Respond with ONLY a JSON object:
{{
    "achieved": true or false,
    "extracted_value": "the specific value extracted from the contact's message" or null,
    "confidence": 0.0 to 1.0
}}

Rules:
- If the contact clearly provided the requested information, achieved = true
- If the contact refused, was vague, or changed the subject, achieved = false
- extracted_value should be the SPECIFIC data (e.g. "123 Main St", "sell", "$200,000")
- With sensitivity {node.sensitivity}/100:
  - Under 30: Accept vague or partial answers
  - 30-70: Accept reasonably clear answers
  - Over 70: Only accept very specific, clear answers

Return ONLY the JSON object, nothing else."""

    result = await ai_complete(
        messages=[{"role": "user", "content": eval_prompt}],
        user_id=None,
        db=db,
        settings=settings,
        task_type="general",
        max_tokens=200,
        temperature=0.1,
    )

    try:
        response_text = result.get("content", "")
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]
        return json.loads(response_text.strip())
    except (json.JSONDecodeError, Exception):
        return {"achieved": False, "extracted_value": None, "confidence": 0.0}


async def _evaluate_switch(
    node: FlowNode,
    conversation_history: list[dict],
    variables: dict,
    db: AsyncSession,
    settings: Settings,
) -> str:
    """Use AI to determine which switch branch to take.

    Returns the label of the chosen branch.
    """
    if node.switch_mode == "variable" and node.switch_variable:
        # Simple variable comparison
        value = variables.get(node.switch_variable, "")
        if node.switch_options:
            try:
                options = json.loads(node.switch_options)
                for opt in options:
                    if str(value).lower() == str(opt.get("value", "")).lower():
                        return opt.get("label", "default")
            except json.JSONDecodeError:
                pass
        return "default"

    # AI-powered switch
    options_text = ""
    if node.switch_options:
        try:
            options = json.loads(node.switch_options)
            options_text = "\n".join(
                f'- "{opt.get("label", "")}": {opt.get("description", "")}'
                for opt in options
            )
        except json.JSONDecodeError:
            pass

    # Build recent conversation context
    recent_messages = conversation_history[-6:]  # Last 3 exchanges
    conv_text = "\n".join(
        f"{'Contact' if m.get('role') == 'user' else 'AI'}: {m.get('content', '')}"
        for m in recent_messages
    )

    eval_prompt = f"""Based on this conversation, which category best fits?

CONVERSATION:
{conv_text}

COLLECTED DATA:
{json.dumps(variables, indent=2)}

OPTIONS:
{options_text}

Respond with ONLY the label of the best matching option (one word or short phrase).
If none match well, respond with "default"."""

    result = await ai_complete(
        messages=[{"role": "user", "content": eval_prompt}],
        user_id=None,
        db=db,
        settings=settings,
        task_type="general",
        max_tokens=50,
        temperature=0.1,
    )

    return result.get("content", "default").strip().strip('"')


# ═══════════════════════════════════════════════════════════════
# FLOW NAVIGATION — Moving through the flow
# ═══════════════════════════════════════════════════════════════


async def _get_next_node(
    flow_id: str,
    current_node_id: str,
    edge_label: str,
    db: AsyncSession,
) -> Optional[FlowNode]:
    """Find the next node to move to based on the current node and edge label."""
    # Find the matching edge
    result = await db.execute(
        select(FlowEdge).where(
            and_(
                FlowEdge.flow_id == flow_id,
                FlowEdge.from_node_id == current_node_id,
                FlowEdge.label == edge_label,
            )
        )
    )
    edge = result.scalar_one_or_none()

    # If no specific edge found, try "default"
    if not edge and edge_label != "default":
        result = await db.execute(
            select(FlowEdge).where(
                and_(
                    FlowEdge.flow_id == flow_id,
                    FlowEdge.from_node_id == current_node_id,
                    FlowEdge.label == "default",
                )
            )
        )
        edge = result.scalar_one_or_none()

    if not edge:
        return None

    # Get the target node
    result = await db.execute(
        select(FlowNode).where(FlowNode.id == edge.to_node_id)
    )
    return result.scalar_one_or_none()


# ═══════════════════════════════════════════════════════════════
# MAIN ENGINE — Process an incoming message
# ═══════════════════════════════════════════════════════════════


async def process_message(
    execution_id: str,
    contact_message: str,
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """Process an incoming message through the conversation flow engine.

    CHANNEL GUARD: This engine handles SMS and WebChat channels ONLY.
    ElevenLabs TTS is NEVER activated here — voice calls use phone_routes.py
    which handles TTS via ElevenLabs Conversational AI signed URLs.
    All AI responses here are pure text via ai_complete().

    THIS IS THE MAIN FUNCTION — called every time a contact sends a message.

    Args:
        execution_id: The FlowExecution ID for this conversation
        contact_message: What the contact just said
        db: Database session
        settings: App settings

    Returns:
        {
            "response": "AI's response text",
            "status": "active" | "completed" | "transferred",
            "current_node": "node_id",
            "variables": {...collected data...},
            "node_type": "objective" | "statement" | etc.
        }
    """

    # 1. Load the execution and all related data
    result = await db.execute(
        select(FlowExecution).where(FlowExecution.id == execution_id)
    )
    execution = result.scalar_one_or_none()
    if not execution:
        return {"response": "Session not found.", "status": "error"}

    # Load the flow
    result = await db.execute(
        select(ConversationFlow).where(ConversationFlow.id == execution.flow_id)
    )
    flow = result.scalar_one_or_none()
    if not flow:
        return {"response": "Flow not found.", "status": "error"}

    # Load current node
    current_node = None
    if execution.current_node_id:
        result = await db.execute(
            select(FlowNode).where(FlowNode.id == execution.current_node_id)
        )
        current_node = result.scalar_one_or_none()

    # If no current node, start at the beginning
    if not current_node and flow.start_node_id:
        result = await db.execute(
            select(FlowNode).where(FlowNode.id == flow.start_node_id)
        )
        current_node = result.scalar_one_or_none()
        if current_node:
            execution.current_node_id = current_node.id

    if not current_node:
        return {"response": "Flow has no starting point.", "status": "error"}

    # Load persona
    persona = None
    persona_id = execution.persona_id or flow.persona_id
    if persona_id:
        result = await db.execute(
            select(Persona).where(Persona.id == persona_id)
        )
        persona = result.scalar_one_or_none()

    # Parse existing variables and messages
    variables = json.loads(execution.variables or "{}")
    messages = json.loads(execution.messages or "[]")

    # 2. Add the contact's message to history
    messages.append({
        "role": "user",
        "content": contact_message,
        "timestamp": datetime.utcnow().isoformat(),
    })

    # 3. Retrieve relevant knowledge via RAG (scripts, objection handlers, etc.)
    knowledge = []
    if current_node.node_type in ("objective", "conversation", "statement", "greeting"):
        try:
            knowledge = await retrieve_relevant_knowledge(
                user_id=execution.user_id,
                query=contact_message,
                db=db,
                top_k=5,  # Fewer than chat (7) since node prompts are already focused
            )
        except Exception:
            logger.warning("RAG retrieval failed for flow execution %s — continuing without knowledge", execution_id)

    training = [e for e in knowledge if e.get("entry_type") == "training"]
    situational = [e for e in knowledge if e.get("entry_type") != "training"]

    # 4. Build the focused prompt for this node
    node_prompt = _build_node_prompt(current_node, variables, persona, flow.name)

    # Inject knowledge: training first (sets mindset), then situational after
    if training:
        knowledge_prefix = "CORE TRAINING & APPROACH:\n"
        knowledge_prefix += "Always follow this training to set your mindset, tone, and approach.\n\n"
        for entry in training:
            knowledge_prefix += f"--- {entry['name']} ---\n{entry['content']}\n\n"
        node_prompt = knowledge_prefix + "\n" + node_prompt

    if situational:
        knowledge_suffix = "\nRELEVANT KNOWLEDGE (use naturally if applicable):\n"
        for entry in situational:
            knowledge_suffix += f"--- {entry['name']} ---\n{entry['content']}\n\n"
        node_prompt = node_prompt + knowledge_suffix

    # 5. Build the message list for the AI (system prompt + recent history)
    ai_messages = [
        {"role": "system", "content": node_prompt},
    ]
    # Include recent conversation history (last 10 messages for context)
    for msg in messages[-10:]:
        ai_messages.append({
            "role": msg["role"],
            "content": msg["content"],
        })

    # 5. Call the AI
    ai_result = await ai_complete(
        messages=ai_messages,
        user_id=execution.user_id,
        db=db,
        settings=settings,
        task_type="general",
        max_tokens=500,
        temperature=0.7,
    )
    ai_response = ai_result.get("content", "I'm here to help. Could you tell me more?")

    # 6. Add AI response to history
    messages.append({
        "role": "assistant",
        "content": ai_response,
        "timestamp": datetime.utcnow().isoformat(),
        "node_id": current_node.id,
        "node_type": current_node.node_type,
    })

    # 7. Evaluate the result and decide what to do next
    next_node = None
    edge_label = "default"

    if current_node.node_type == "objective":
        # Check if the objective was achieved
        eval_result = await _evaluate_objective(
            current_node, contact_message, ai_response,
            messages, variables, db, settings,
        )

        if eval_result.get("achieved"):
            # Store the extracted value
            if current_node.output_variable and eval_result.get("extracted_value"):
                variables[current_node.output_variable] = eval_result["extracted_value"]
            next_node = await _get_next_node(flow.id, current_node.id, "default", db)
            execution.current_node_attempts = 0
        else:
            # Not achieved — try again or skip
            execution.current_node_attempts += 1
            if (current_node.max_attempts > 0
                    and execution.current_node_attempts >= current_node.max_attempts):
                # Max attempts reached — skip to next
                next_node = await _get_next_node(flow.id, current_node.id, "default", db)
                execution.current_node_attempts = 0

    elif current_node.node_type == "statement":
        # Statements always advance after delivering the message
        next_node = await _get_next_node(flow.id, current_node.id, "default", db)

    elif current_node.node_type == "switch":
        # Evaluate which branch to take
        edge_label = await _evaluate_switch(
            current_node, messages, variables, db, settings,
        )
        next_node = await _get_next_node(flow.id, current_node.id, edge_label, db)

    elif current_node.node_type == "true_false":
        # Evaluate the condition
        condition = current_node.condition_expression or ""
        # Simple evaluation of conditions like "motivation_level >= 7"
        try:
            # Replace variable names with their values
            eval_condition = condition
            for var_name, var_value in variables.items():
                eval_condition = eval_condition.replace(var_name, repr(var_value))
            result_bool = bool(eval(eval_condition))  # Safe for simple comparisons
            edge_label = "true" if result_bool else "false"
        except Exception:
            edge_label = "false"
        next_node = await _get_next_node(flow.id, current_node.id, edge_label, db)

    elif current_node.node_type == "stop":
        execution.status = "completed"
        execution.completed_at = datetime.utcnow()

    elif current_node.node_type == "transfer":
        execution.status = "transferred"

    elif current_node.node_type == "conversation":
        # Stay on this node unless there's an exit condition
        pass

    # 8. If we have a next node, advance to it
    if next_node:
        execution.current_node_id = next_node.id
        execution.current_node_attempts = 0

        # If the next node is a statement, auto-process it
        # (statements don't need contact input)
        if next_node.node_type == "statement" and not next_node.ai_generate:
            # Build and send the statement
            statement_prompt = _build_node_prompt(next_node, variables, persona, flow.name)
            statement_messages = [{"role": "system", "content": statement_prompt}]
            for msg in messages[-4:]:
                statement_messages.append({"role": msg["role"], "content": msg["content"]})

            stmt_result = await ai_complete(
                messages=statement_messages,
                user_id=execution.user_id,
                db=db,
                settings=settings,
                task_type="general",
                max_tokens=300,
                temperature=0.7,
            )
            statement_text = stmt_result.get("content", next_node.message_text or "")

            messages.append({
                "role": "assistant",
                "content": statement_text,
                "timestamp": datetime.utcnow().isoformat(),
                "node_id": next_node.id,
                "node_type": "statement",
            })
            ai_response = ai_response + "\n\n" + statement_text

            # Move past the statement to whatever comes next
            after_statement = await _get_next_node(flow.id, next_node.id, "default", db)
            if after_statement:
                execution.current_node_id = after_statement.id

    # 9. Save everything back to the database
    execution.variables = json.dumps(variables)
    execution.messages = json.dumps(messages)
    execution.updated_at = datetime.utcnow()

    await db.commit()

    return {
        "response": ai_response,
        "status": execution.status,
        "current_node": execution.current_node_id,
        "variables": variables,
        "node_type": current_node.node_type,
    }


# ═══════════════════════════════════════════════════════════════
# FLOW STARTER — Begin a new conversation through a flow
# ═══════════════════════════════════════════════════════════════


async def start_flow_execution(
    flow_id: str,
    user_id: int,
    db: AsyncSession,
    settings: Settings,
    channel: str = "webchat",
    contact_phone: Optional[str] = None,
    contact_name: Optional[str] = None,
    contact_email: Optional[str] = None,
    chat_session_id: Optional[str] = None,
    persona_id: Optional[str] = None,
) -> dict:
    """Start a new conversation through a flow.

    This creates a FlowExecution and processes the first node
    (which is usually a greeting/statement).

    Returns:
        {
            "execution_id": "uuid",
            "greeting": "Hi! How can I help you today?",
            "status": "active",
            "current_node": "node_id"
        }
    """

    # Load the flow
    result = await db.execute(
        select(ConversationFlow).where(
            and_(
                ConversationFlow.id == flow_id,
                ConversationFlow.user_id == user_id,
                ConversationFlow.is_active == True,
            )
        )
    )
    flow = result.scalar_one_or_none()
    if not flow:
        return {"error": "Flow not found or not active"}

    if not flow.start_node_id:
        return {"error": "Flow has no starting node"}

    # Create the execution
    execution = FlowExecution(
        flow_id=flow_id,
        user_id=user_id,
        current_node_id=flow.start_node_id,
        channel=channel,
        contact_phone=contact_phone,
        contact_name=contact_name,
        contact_email=contact_email,
        chat_session_id=chat_session_id,
        persona_id=persona_id or flow.persona_id,
        status="active",
        variables="{}",
        messages="[]",
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # Update flow stats
    flow.total_executions += 1
    await db.commit()

    # Load the first node to generate a greeting
    result = await db.execute(
        select(FlowNode).where(FlowNode.id == flow.start_node_id)
    )
    first_node = result.scalar_one_or_none()

    greeting = "Hello! How can I help you today?"

    if first_node:
        # Load persona
        persona = None
        pid = persona_id or flow.persona_id
        if pid:
            result = await db.execute(select(Persona).where(Persona.id == pid))
            persona = result.scalar_one_or_none()

        # Generate the greeting based on the first node
        if first_node.node_type == "statement" and first_node.message_text:
            greeting = first_node.message_text
        else:
            # Let AI generate the opening
            prompt = _build_node_prompt(first_node, {}, persona, flow.name)
            ai_messages = [
                {"role": "system", "content": prompt},
                {"role": "user", "content": "[CONVERSATION START - Generate your opening message]"},
            ]

            ai_result = await ai_complete(
                messages=ai_messages,
                user_id=user_id,
                db=db,
                settings=settings,
                task_type="general",
                max_tokens=300,
                temperature=0.7,
            )
            greeting = ai_result.get("content", greeting)

        # Save the greeting to messages
        messages = [{
            "role": "assistant",
            "content": greeting,
            "timestamp": datetime.utcnow().isoformat(),
            "node_id": first_node.id,
            "node_type": first_node.node_type,
        }]
        execution.messages = json.dumps(messages)

        # If first node is a statement, advance to the next node
        if first_node.node_type == "statement":
            next_node = await _get_next_node(flow.id, first_node.id, "default", db)
            if next_node:
                execution.current_node_id = next_node.id

        await db.commit()

    return {
        "execution_id": execution.id,
        "greeting": greeting,
        "status": "active",
        "current_node": execution.current_node_id,
    }
