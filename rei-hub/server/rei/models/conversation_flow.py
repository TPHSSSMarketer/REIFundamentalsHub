"""Conversation Flow Engine — SQLAlchemy models.

These models power the CloseBot-style conversation flow system:
- ConversationFlow: A complete conversation workflow (like CloseBot's "Job Flow")
- FlowNode: Individual steps in the flow (objectives, statements, switches, etc.)
- FlowEdge: Connections between nodes (which node leads to which)
- FlowExecution: A live conversation running through a flow
- FlowVariable: Data collected during a conversation execution
- ChatSession: A web chat or SMS session tied to a contact
- Persona: Defines HOW the AI talks (tone, style, quirks) — independent of flow logic
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from rei.database import Base


# ═══════════════════════════════════════════════════════════════
# PERSONAS — How the AI talks (independent of flow logic)
# ═══════════════════════════════════════════════════════════════


class Persona(Base):
    """Defines the AI's personality, tone, and speaking style.

    Think of a Persona like a character sheet:
    - Name: "Friendly Grace" or "Direct Marcus"
    - Style: casual, professional, empathetic
    - Quirks: uses emojis, short responses, etc.

    A Persona is separate from what the bot DOES (that's the Flow).
    This means you can A/B test different personalities on the same flow.
    """
    __tablename__ = "personas"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    # NULL = platform-level system persona (available to all users)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # AI personality instructions
    personality_prompt: Mapped[str] = mapped_column(
        Text, default=""
    )
    # Example: "You are warm and empathetic. You use casual language."

    # Response style controls
    tone: Mapped[str] = mapped_column(
        String, default="professional"
    )
    # "professional", "casual", "empathetic", "direct", "friendly"

    response_length: Mapped[str] = mapped_column(
        String, default="medium"
    )
    # "short" (1-2 sentences), "medium" (2-3), "long" (3-5)

    # AI provider override (optional — if not set, uses global)
    ai_provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    ai_model: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Response timing (for SMS — delay to feel natural)
    min_response_delay_seconds: Mapped[int] = mapped_column(Integer, default=0)
    max_response_delay_seconds: Mapped[int] = mapped_column(Integer, default=0)

    # Quirks (JSON string of personality quirks)
    # Example: '{"uses_emojis": true, "occasional_typos": false, "says_um": true}'
    quirks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Voice assignment (ElevenLabs voice ID for TTS)
    elevenlabs_voice_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # ElevenLabs Conversational AI agent ID (provisioned for voice calls)
    elevenlabs_agent_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Role (for voice agent use cases)
    # "lead_qualifier", "appointment_setter", "follow_up", "negotiator", "buyer_intake"
    role: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Platform / system persona support
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    # True = platform-provided starter persona (read-only, can be cloned)
    cloned_from: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # If this persona was cloned from a system persona, stores the original ID

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ═══════════════════════════════════════════════════════════════
# CONVERSATION FLOWS — What the bot DOES (the workflow/logic)
# ═══════════════════════════════════════════════════════════════


class ConversationFlow(Base):
    """A complete conversation workflow — like CloseBot's "Job Flow".

    This is the master container that holds all the nodes (steps).
    Example flow: "Inbound Lead Qualification"
      → Node 1: Greet caller (Statement)
      → Node 2: Determine buy or sell (Objective)
      → Node 3: Branch based on answer (Switch)
      → Node 4a: Qualify buyer (Objective)
      → Node 4b: Qualify seller (Objective)
      → etc.
    """
    __tablename__ = "conversation_flows"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Which channels this flow works on
    channel: Mapped[str] = mapped_column(
        String, default="all"
    )
    # "sms", "webchat", "voice", "all"

    # Optional persona to use with this flow
    persona_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("personas.id"), nullable=True
    )

    # The starting node of the flow (set after creating nodes)
    start_node_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Flow status
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    # Templates are pre-built flows users can clone

    # Tag filters (JSON list) — which contacts trigger this flow
    # Example: '["new_lead", "seller", "follow_up"]'
    tag_filters: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Visual builder metadata (JSON — stores node positions for the UI)
    # Example: '{"node_abc": {"x": 100, "y": 200}, ...}'
    canvas_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Stats
    total_executions: Mapped[int] = mapped_column(Integer, default=0)
    total_completions: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    nodes: Mapped[list["FlowNode"]] = relationship(
        "FlowNode", back_populates="flow", cascade="all, delete-orphan"
    )
    edges: Mapped[list["FlowEdge"]] = relationship(
        "FlowEdge", back_populates="flow", cascade="all, delete-orphan"
    )


class FlowNode(Base):
    """A single step/node in a conversation flow.

    NODE TYPES (modeled after CloseBot):

    1. "objective" — GET info FROM the contact
       - Has a "short_description" that tells the AI WHAT to determine
       - Has an "output_variable" where the answer gets stored
       - Example: short_description="determine if they want to buy or sell"
                  output_variable="buy_or_sell"

    2. "statement" — GIVE info TO the contact
       - Sends a specific message or lets AI generate one from instructions
       - Example: "Thank you for calling! How can I help you today?"

    3. "conversation" — Free-form chat (no specific goal)
       - AI chats naturally using the persona and knowledge base
       - Has an optional exit_condition to move to next node

    4. "switch" — Multi-path routing (like a decision tree)
       - Evaluates a variable or lets AI decide the path
       - Has multiple output edges (one per branch)

    5. "true_false" — Simple yes/no branch
       - Checks a condition and goes left (true) or right (false)

    6. "webhook" — Call an external API mid-conversation
       - Sends data to a URL and optionally waits for response
       - Can store the response in a variable

    7. "delay" — Wait before continuing
       - Pauses the flow for a set amount of time

    8. "stop" — End the conversation
       - Optionally sends a closing message

    9. "transfer" — Hand off to a human or another agent
       - Transfers the conversation to a human agent or another AI agent
    """
    __tablename__ = "flow_nodes"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    flow_id: Mapped[str] = mapped_column(
        ForeignKey("conversation_flows.id", ondelete="CASCADE")
    )
    node_type: Mapped[str] = mapped_column(String, nullable=False)
    # "objective", "statement", "conversation", "switch", "true_false",
    # "webhook", "delay", "stop", "transfer"

    label: Mapped[str] = mapped_column(String, default="")
    # Display name shown in the visual builder

    # ── Objective-specific fields ────────────────────────────────
    short_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # THE most important field for objectives.
    # Tells the AI WHAT to determine, not WHAT to ask.
    # Example: "determine whether the contact wants to buy or sell a property"

    output_variable: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Where the collected answer gets stored
    # Example: "buy_or_sell", "property_address", "motivation_level"

    extra_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Additional context/instructions for this specific step
    # Example: "If they mention foreclosure, mark motivation as high"

    sensitivity: Mapped[int] = mapped_column(Integer, default=50)
    # 0-100: How strict the AI is when deciding if the answer is satisfactory
    # 0 = accepts anything, 100 = very strict

    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    # How many times to try getting an answer before skipping (0 = required)

    skip_if_known: Mapped[bool] = mapped_column(Boolean, default=True)
    # If the variable already has a value, skip this node

    # ── Statement-specific fields ───────────────────────────────
    message_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # The exact message to send (if empty, AI generates from instructions)

    ai_generate: Mapped[bool] = mapped_column(Boolean, default=False)
    # If true, AI generates the message based on extra_prompt

    # ── Switch-specific fields ──────────────────────────────────
    switch_variable: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Which variable to evaluate for switching

    switch_mode: Mapped[str] = mapped_column(String, default="variable")
    # "variable" = compare the variable value
    # "ai" = let AI decide the path based on conversation context

    switch_options: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON list of options for the switch
    # Example: '[{"label": "Buying", "value": "buy"}, {"label": "Selling", "value": "sell"}]'

    # ── True/False specific fields ──────────────────────────────
    condition_expression: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # The condition to evaluate
    # Example: "motivation_level >= 7" or "has_property == true"

    # ── Webhook-specific fields ─────────────────────────────────
    webhook_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    webhook_method: Mapped[str] = mapped_column(String, default="POST")
    webhook_headers: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON object of headers
    webhook_body_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON template with variable placeholders like {{property_address}}
    webhook_response_variable: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )
    # Where to store the webhook response
    webhook_wait_for_response: Mapped[bool] = mapped_column(Boolean, default=True)

    # ── Delay-specific fields ───────────────────────────────────
    delay_seconds: Mapped[int] = mapped_column(Integer, default=0)

    # ── Transfer-specific fields ────────────────────────────────
    transfer_to: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # "human", or an agent_id to transfer to another AI agent

    # ── Visual builder position ─────────────────────────────────
    position_x: Mapped[float] = mapped_column(Float, default=0.0)
    position_y: Mapped[float] = mapped_column(Float, default=0.0)

    # ── Sort order (for linear flows) ───────────────────────────
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    flow: Mapped["ConversationFlow"] = relationship(
        "ConversationFlow", back_populates="nodes"
    )


class FlowEdge(Base):
    """A connection between two nodes in a flow.

    Edges define the path: "after this node, go to that node."
    For switch/true_false nodes, there are multiple edges with different labels.

    Example edges for a switch node:
      - Edge 1: from=switch_node, to=buyer_node, label="buy"
      - Edge 2: from=switch_node, to=seller_node, label="sell"
      - Edge 3: from=switch_node, to=default_node, label="default"
    """
    __tablename__ = "flow_edges"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    flow_id: Mapped[str] = mapped_column(
        ForeignKey("conversation_flows.id", ondelete="CASCADE")
    )
    from_node_id: Mapped[str] = mapped_column(
        ForeignKey("flow_nodes.id", ondelete="CASCADE")
    )
    to_node_id: Mapped[str] = mapped_column(
        ForeignKey("flow_nodes.id", ondelete="CASCADE")
    )

    # Label for the edge (used by switch/true_false nodes)
    label: Mapped[str] = mapped_column(String, default="default")
    # "default", "true", "false", "buy", "sell", etc.

    # Sort order (for switch nodes with multiple edges)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    flow: Mapped["ConversationFlow"] = relationship(
        "ConversationFlow", back_populates="edges"
    )


# ═══════════════════════════════════════════════════════════════
# FLOW EXECUTION — A live conversation running through a flow
# ═══════════════════════════════════════════════════════════════


class FlowExecution(Base):
    """Tracks a live conversation as it moves through a flow.

    When someone starts chatting (via SMS, web chat, or voice), a FlowExecution
    is created. It tracks:
    - Which flow they're on
    - Which node they're currently at
    - All the variables/data collected so far
    - The full message history
    - The outcome when it's done
    """
    __tablename__ = "flow_executions"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    flow_id: Mapped[str] = mapped_column(ForeignKey("conversation_flows.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # The user who OWNS the flow (the investor), not the contact

    # Which chat session this execution belongs to
    chat_session_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("chat_sessions.id"), nullable=True
    )

    # Current position in the flow
    current_node_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # How many times the current node has been attempted
    current_node_attempts: Mapped[int] = mapped_column(Integer, default=0)

    # Status of the execution
    status: Mapped[str] = mapped_column(String, default="active")
    # "active", "paused", "completed", "abandoned", "transferred"

    # Collected variables (JSON object)
    # Example: '{"buy_or_sell": "sell", "property_address": "123 Main St", "motivation_level": 8}'
    variables: Mapped[str] = mapped_column(Text, default="{}")

    # Full message history (JSON array)
    # Example: '[{"role": "assistant", "content": "Hi!", "timestamp": "..."}, ...]'
    messages: Mapped[str] = mapped_column(Text, default="[]")

    # Contact info (denormalized for quick access)
    contact_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Channel this execution is happening on
    channel: Mapped[str] = mapped_column(String, default="webchat")
    # "sms", "webchat", "voice"

    # Persona used for this execution
    persona_id: Mapped[Optional[str]] = mapped_column(
        ForeignKey("personas.id"), nullable=True
    )

    # Outcome tracking
    outcome: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # "qualified", "not_qualified", "appointment_set", "transferred", "abandoned"

    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ═══════════════════════════════════════════════════════════════
# CHAT SESSIONS — Web chat and SMS conversations
# ═══════════════════════════════════════════════════════════════


class ChatSession(Base):
    """A chat conversation (web chat or SMS) between a contact and the system.

    This is the equivalent of a "thread" — it holds the connection info
    and links to the flow execution running inside it.
    """
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # The investor who owns this chat

    # Channel info
    channel: Mapped[str] = mapped_column(String, default="webchat")
    # "webchat", "sms"

    # Contact identifiers
    contact_phone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    contact_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # For web chat: unique visitor ID (stored in browser cookie/localStorage)
    visitor_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # For web chat: which website/page they came from
    referrer_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    page_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Active flow execution (if any)
    active_execution_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Session status
    status: Mapped[str] = mapped_column(String, default="active")
    # "active", "idle", "closed", "transferred_to_human"

    # Metadata
    ip_address: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Human takeover
    is_human_takeover: Mapped[bool] = mapped_column(Boolean, default=False)
    # When true, the AI stops responding and a human takes over

    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
