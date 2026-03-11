"""AI Admin Assistant — SQLAlchemy models.

These models power the autonomous AI Admin Assistant:
- AdminSession: Chat conversation sessions between user and AI assistant
- AdminMessage: Individual messages in a chat session
- AdminActionLog: Audit trail of every action the AI proposes or executes
- AdminTrustSetting: Per-user, per-action trust preferences (auto/ask/never)
- AdminSkill: Reusable automation templates (system + user-created)
- AdminScheduledTask: Recurring tasks that execute skills on a cron schedule
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from rei.database import Base


# ═══════════════════════════════════════════════════════════════
# CHAT SESSIONS — Conversations with the AI Assistant
# ═══════════════════════════════════════════════════════════════


class AdminSession(Base):
    """A chat conversation session between the user and their AI assistant.

    Each session tracks a thread of messages. Users can have multiple
    sessions (like separate conversation topics). The assistant maintains
    context within a session for multi-turn interactions.
    """

    __tablename__ = "admin_sessions"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(
        String, nullable=False, default="New Conversation"
    )
    # Summary of conversation context (for quick resume)
    context_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    last_message_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )


class AdminMessage(Base):
    """An individual message in a chat session.

    Stores both user messages and assistant responses. Assistant messages
    may include tool_calls JSON showing which platform tools the AI used.
    """

    __tablename__ = "admin_messages"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        ForeignKey("admin_sessions.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(
        String, nullable=False
    )  # "user", "assistant", "system"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON array of tool calls the AI made during this response
    # e.g. [{"tool": "get_pipeline_summary", "params": {}, "result": {...}}]
    tool_calls: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Token usage for billing tracking
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0)
    model_used: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )


# ═══════════════════════════════════════════════════════════════
# ACTION LOG — Audit trail of everything the AI does
# ═══════════════════════════════════════════════════════════════


class AdminActionLog(Base):
    """Tracks every action the AI proposes, gets approved/rejected, and executes.

    This is the core of the trust system. Every tool call goes through here:
    1. AI proposes action → log created with approved=NULL (pending)
    2. If auto-approved → approved=True, executed immediately
    3. If needs user approval → stays pending until user approves/rejects
    4. After execution → execution_status updated with result

    The activity log UI reads from this table to show users everything
    their AI assistant has done.
    """

    __tablename__ = "admin_action_logs"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    session_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # Which chat session triggered this (null if from scheduled task)
    # What tool/action was called
    action_type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # e.g. "send_sms", "update_deal_stage", "get_pipeline_summary"
    action_name: Mapped[str] = mapped_column(
        String, nullable=False
    )  # Human-readable: "Send SMS to Sarah Johnson"
    risk_level: Mapped[str] = mapped_column(
        String, nullable=False, default="LOW"
    )  # "LOW", "MEDIUM", "HIGH"
    # JSON object with the proposed action details
    # e.g. {"contact_id": "abc", "message": "Hi Sarah..."}
    proposed_details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Approval status: NULL = pending, True = approved, False = rejected
    approved: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    # How it was approved: "auto" (trust system), "user" (manual), "rejected"
    approval_method: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    approval_message: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # Execution result
    execution_status: Mapped[str] = mapped_column(
        String, nullable=False, default="pending"
    )  # "pending", "approved", "executing", "success", "failed", "rejected"
    # JSON result data from the tool execution
    result_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    executed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )


# ═══════════════════════════════════════════════════════════════
# TRUST SETTINGS — Per-action approval preferences that learn
# ═══════════════════════════════════════════════════════════════


class AdminTrustSetting(Base):
    """Per-user, per-action-type trust preferences.

    The trust system works like this:
    - Each action_type has a risk_level (LOW/MEDIUM/HIGH)
    - Users set trust_level per action: "auto", "ask", "never"
    - Defaults: LOW=auto, MEDIUM=ask, HIGH=ask
    - The system tracks how many times a user approves each action type
    - After N approvals (default 3), it suggests upgrading to auto
    - Users can go fully automatic or lock down specific actions

    This table is lazily populated — entries created on first encounter.
    """

    __tablename__ = "admin_trust_settings"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    action_type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # e.g. "send_sms", "update_deal_stage"
    risk_level: Mapped[str] = mapped_column(
        String, nullable=False, default="MEDIUM"
    )  # "LOW", "MEDIUM", "HIGH"
    # Current trust level: "auto" (execute without asking), "ask" (get approval),
    # "never" (always block)
    trust_level: Mapped[str] = mapped_column(
        String, nullable=False, default="ask"
    )
    # Learning: how many times user has approved this action
    approval_count: Mapped[int] = mapped_column(Integer, default=0)
    rejection_count: Mapped[int] = mapped_column(Integer, default=0)
    # Whether the system has suggested auto-approve (so we don't nag)
    suggested_auto: Mapped[bool] = mapped_column(Boolean, default=False)
    last_approved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ═══════════════════════════════════════════════════════════════
# SKILLS — Reusable automation templates
# ═══════════════════════════════════════════════════════════════


class AdminSkill(Base):
    """Reusable automation templates that the AI can execute.

    Skills are like recipes — a named sequence of tool calls that accomplish
    a specific goal. The platform ships with pre-built skills (is_system=True)
    and users can create their own custom skills.

    Pre-built skills:
    - Follow-Up Scanner: Find contacts needing follow-up
    - Pipeline Health Check: Analyze deal pipeline health
    - Lead Scorer: Score and prioritize leads
    - Daily Summary: Generate daily business summary
    - Campaign Launcher: Launch SMS campaign to tagged contacts
    - Buyer Match: Match buyers to available deals

    action_steps is a JSON array of tool calls to execute in order:
    [
        {"tool": "get_stalled_deals", "params": {"days_threshold": 7}},
        {"tool": "create_follow_up_task", "params_from": "previous_result"}
    ]
    """

    __tablename__ = "admin_skills"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )  # NULL = system-level skill (available to all users)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # Category for UI grouping: "crm", "phone", "analytics", "pipeline", "general"
    category: Mapped[str] = mapped_column(
        String, nullable=False, default="general"
    )
    # System skills are pre-built and available to everyone
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    # JSON array of action steps (tool calls in sequence)
    action_steps: Mapped[str] = mapped_column(
        Text, nullable=False, default="[]"
    )
    # Optional trigger conditions (for future webhook/event triggers)
    trigger_conditions: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )
    # Icon name for the UI (from lucide-react icon set)
    icon: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Usage tracking
    total_runs: Mapped[int] = mapped_column(Integer, default=0)
    last_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ═══════════════════════════════════════════════════════════════
# SCHEDULED TASKS — Recurring jobs that execute skills
# ═══════════════════════════════════════════════════════════════


class AdminScheduledTask(Base):
    """A recurring task that executes a skill on a schedule.

    Users create scheduled tasks by linking a skill to a cron expression.
    The task scheduler loop (every 60s in main.py) checks for due tasks
    and executes their linked skills.

    Example: "Run Daily Summary every weekday at 8am"
    - skill_id → points to "Daily Summary" skill
    - cron_expression → "0 8 * * 1-5"
    - timezone → "America/New_York"
    """

    __tablename__ = "admin_scheduled_tasks"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    skill_id: Mapped[str] = mapped_column(
        String, nullable=False
    )  # FK to admin_skills (not enforced — skills can be deleted)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Standard 5-field cron expression: "minute hour dom month dow"
    # Examples: "0 8 * * 1-5" (weekdays 8am), "0 9 * * *" (daily 9am)
    cron_expression: Mapped[str] = mapped_column(String, nullable=False)
    timezone: Mapped[str] = mapped_column(
        String, nullable=False, default="America/New_York"
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # Execution tracking
    last_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    next_run_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True
    )
    last_run_status: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # "success", "failed", "skipped"
    last_run_result: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # JSON summary of last run
    total_runs: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ═══════════════════════════════════════════════════════════════
# SELF-LEARNING SYSTEM — Platform intelligence that improves over time
# ═══════════════════════════════════════════════════════════════


class ConversationLesson(Base):
    """Lessons automatically extracted from AI conversations.

    When the assistant handles a question well (successful tool use,
    multi-step resolution, or user correction), the system extracts
    a reusable lesson. These lessons are injected into future system
    prompts when similar questions arise, making the assistant smarter
    over time.

    Platform-wide: user_id is NULL (benefits everyone).
    Per-user: user_id is set (personalized learning).
    """

    __tablename__ = "conversation_lessons"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )  # NULL = platform-wide lesson

    # What was learned
    topic: Mapped[str] = mapped_column(
        String, nullable=False
    )  # e.g. "property_lookup", "deal_creation", "market_analysis"
    question_pattern: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # The type of question that triggered this lesson
    lesson_text: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # The actual lesson / best approach
    example_exchange: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # JSON: {"user": "...", "assistant": "..."} — a good example

    # Quality signals
    source_type: Mapped[str] = mapped_column(
        String, nullable=False, default="auto"
    )  # "auto" (AI-extracted), "correction" (user corrected AI), "admin" (manually added)
    times_used: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float] = mapped_column(
        Float, default=0.7
    )  # 0.0–1.0, increases with successful reuse
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Traceability
    source_session_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )  # Which conversation it came from

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class UsagePattern(Base):
    """Tracks how tools, features, and topics are used across the platform.

    Aggregated counts that help the assistant prioritize suggestions,
    pre-load relevant tools, and adapt its behavior to actual usage.

    Platform-wide: user_id is NULL (aggregate across all users).
    Per-user: user_id is set (individual preferences).
    """

    __tablename__ = "usage_patterns"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )  # NULL = platform-wide aggregate

    pattern_type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # "tool_usage", "topic_frequency", "workflow_sequence", "time_preference"

    pattern_key: Mapped[str] = mapped_column(
        String, nullable=False
    )  # e.g. "lookup_property", "deals+property", "morning_pipeline_check"

    # Counts and metrics
    occurrence_count: Mapped[int] = mapped_column(Integer, default=1)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)

    # Optional context (JSON)
    metadata_json: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # Extra data like {"avg_time_of_day": "09:00", "common_params": {...}}

    first_seen: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    last_seen: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )


class AutoEnrichedKnowledge(Base):
    """Knowledge automatically captured from successful tool results.

    When the assistant researches something (property lookup, market data,
    etc.) and gets a good result, the key findings are stored here so
    the same research doesn't need to be repeated. This acts as a
    platform-wide memory of facts the system has learned.

    Examples:
    - Property at 214 Little Plains Rd: 3bd/2ba, assessed $450K, owner John Smith
    - Market trend: Huntington median up 8% YoY as of March 2026
    - Zip 11743 resolves to Huntington, NY (Suffolk County)
    """

    __tablename__ = "auto_enriched_knowledge"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )  # NULL = platform-wide, set = per-user data

    # What was learned
    category: Mapped[str] = mapped_column(
        String, nullable=False
    )  # "property", "market", "contact", "zip_resolution", "deal_outcome"
    entity_key: Mapped[str] = mapped_column(
        String, nullable=False, index=True
    )  # Unique key: "prop:214_little_plains_rd_11743", "market:huntington_ny"
    summary: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # Human-readable summary of the finding
    raw_data: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )  # JSON of the full tool result for reference

    # Quality and freshness
    source_tool: Mapped[str] = mapped_column(
        String, nullable=False
    )  # Which tool produced this: "lookup_property", "get_market_data"
    confidence: Mapped[float] = mapped_column(Float, default=0.8)
    times_referenced: Mapped[int] = mapped_column(Integer, default=0)
    is_stale: Mapped[bool] = mapped_column(
        Boolean, default=False
    )  # Marked stale after expiry_days

    # Traceability
    source_session_id: Mapped[Optional[str]] = mapped_column(
        String, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
