"""Database engine, session factory, ORM models, and table creation."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Integer,
    String,
    Text,
    ForeignKey,
)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from helm.config import get_settings

settings = get_settings()

# Pre-import aiosqlite so SQLAlchemy's dialect loader resolves correctly on
# Python 3.13+ where internal sqlite3 module changes can cause silent fallback
# to the synchronous pysqlite driver.
if "aiosqlite" in settings.database_url:
    try:
        import aiosqlite  # noqa: F401
    except ImportError as exc:
        raise ImportError(
            "aiosqlite is required for async SQLite. Install with: pip install aiosqlite"
        ) from exc

engine = create_async_engine(settings.database_url, echo=settings.app_debug)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _uuid() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ── Tenants ─────────────────────────────────────────────────────────────────


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    ghl_location_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    ghl_access_token: Mapped[str | None] = mapped_column(Text)
    ghl_refresh_token: Mapped[str | None] = mapped_column(Text)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(64))
    whatsapp_phone: Mapped[str | None] = mapped_column(String(32))
    system_prompt: Mapped[str | None] = mapped_column(Text)
    gating_config: Mapped[dict | None] = mapped_column(JSON, default=dict)
    agent_config: Mapped[dict | None] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    # Relationships
    conversations: Mapped[list[Conversation]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    memories: Mapped[list[Memory]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    goals: Mapped[list[Goal]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    checkin_state: Mapped[CheckinState | None] = relationship(back_populates="tenant", uselist=False, cascade="all, delete-orphan")


# ── Conversations ───────────────────────────────────────────────────────────


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("tenants.id"))
    title: Mapped[str] = mapped_column(String(255), default="New conversation")
    channel: Mapped[str] = mapped_column(String(32), default="web")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    tenant: Mapped[Tenant | None] = relationship(back_populates="conversations")
    messages: Mapped[list[Message]] = relationship(back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    conversation_id: Mapped[str] = mapped_column(String(32), ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


# ── Semantic Memory ─────────────────────────────────────────────────────────


class Memory(Base):
    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("tenants.id"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64), default="general")
    embedding_json: Mapped[str | None] = mapped_column(Text)  # JSON-serialized float list
    metadata_json: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    tenant: Mapped[Tenant | None] = relationship(back_populates="memories")


# ── Goals ───────────────────────────────────────────────────────────────────


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("tenants.id"))
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active")
    target_date: Mapped[str | None] = mapped_column(String(16))
    progress_notes: Mapped[dict | None] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    tenant: Mapped[Tenant | None] = relationship(back_populates="goals")


# ── Check-in State ──────────────────────────────────────────────────────────


class CheckinState(Base):
    __tablename__ = "checkin_state"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("tenants.id"), unique=True)
    last_checkin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_checkin_type: Mapped[str | None] = mapped_column(String(16))
    last_checkin_summary: Mapped[str | None] = mapped_column(Text)
    pending_items: Mapped[dict | None] = mapped_column(JSON, default=list)
    suppressed_items: Mapped[dict | None] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    tenant: Mapped[Tenant | None] = relationship(back_populates="checkin_state")


# ── Agent Execution Logs ────────────────────────────────────────────────────


class AgentLog(Base):
    __tablename__ = "agent_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    tenant_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("tenants.id"))
    agent_name: Mapped[str] = mapped_column(String(64), nullable=False)
    task: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    input_summary: Mapped[str | None] = mapped_column(Text)
    output_summary: Mapped[str | None] = mapped_column(Text)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


# ── Database Lifecycle ──────────────────────────────────────────────────────


async def init_db() -> None:
    """Create all tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db() -> AsyncSession:
    """Yield a database session for dependency injection."""
    async with async_session() as session:
        yield session
