"""Tests for the database models and persistent storage."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from helm.models.database import (
    AgentLog,
    Base,
    CheckinState,
    Conversation,
    Goal,
    Memory,
    Message,
    Tenant,
)


@pytest.fixture
async def db_session():
    """Create a fresh in-memory database for each test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        yield session

    await engine.dispose()


@pytest.mark.asyncio
async def test_create_tenant(db_session: AsyncSession):
    tenant = Tenant(name="Test Corp")
    db_session.add(tenant)
    await db_session.commit()

    result = await db_session.execute(select(Tenant))
    tenants = result.scalars().all()
    assert len(tenants) == 1
    assert tenants[0].name == "Test Corp"
    assert tenants[0].is_active is True
    assert tenants[0].id is not None


@pytest.mark.asyncio
async def test_tenant_with_ghl_location(db_session: AsyncSession):
    tenant = Tenant(name="RE Investor", ghl_location_id="loc_123")
    db_session.add(tenant)
    await db_session.commit()

    result = await db_session.execute(
        select(Tenant).where(Tenant.ghl_location_id == "loc_123")
    )
    t = result.scalar_one()
    assert t.name == "RE Investor"


@pytest.mark.asyncio
async def test_create_conversation_with_messages(db_session: AsyncSession):
    conv = Conversation(id="conv_1", title="Test chat")
    db_session.add(conv)
    await db_session.flush()

    msg1 = Message(conversation_id="conv_1", role="user", content="Hello")
    msg2 = Message(conversation_id="conv_1", role="assistant", content="Hi there!")
    db_session.add_all([msg1, msg2])
    await db_session.commit()

    result = await db_session.execute(
        select(Message).where(Message.conversation_id == "conv_1")
    )
    messages = result.scalars().all()
    assert len(messages) == 2
    assert messages[0].role == "user"
    assert messages[1].content == "Hi there!"


@pytest.mark.asyncio
async def test_tenant_conversation_relationship(db_session: AsyncSession):
    tenant = Tenant(name="Client A")
    db_session.add(tenant)
    await db_session.flush()

    conv = Conversation(tenant_id=tenant.id, title="Client chat")
    db_session.add(conv)
    await db_session.commit()

    result = await db_session.execute(
        select(Conversation).where(Conversation.tenant_id == tenant.id)
    )
    convos = result.scalars().all()
    assert len(convos) == 1
    assert convos[0].title == "Client chat"


@pytest.mark.asyncio
async def test_create_memory(db_session: AsyncSession):
    mem = Memory(content="User prefers morning meetings", category="preference")
    db_session.add(mem)
    await db_session.commit()

    result = await db_session.execute(select(Memory))
    memories = result.scalars().all()
    assert len(memories) == 1
    assert memories[0].category == "preference"


@pytest.mark.asyncio
async def test_create_goal(db_session: AsyncSession):
    goal = Goal(goal="Buy 10 rental properties this year", status="active")
    db_session.add(goal)
    await db_session.commit()

    result = await db_session.execute(select(Goal).where(Goal.status == "active"))
    goals = result.scalars().all()
    assert len(goals) == 1
    assert "10 rental" in goals[0].goal


@pytest.mark.asyncio
async def test_checkin_state(db_session: AsyncSession):
    tenant = Tenant(name="Test User")
    db_session.add(tenant)
    await db_session.flush()

    state = CheckinState(tenant_id=tenant.id, last_checkin_type="text")
    db_session.add(state)
    await db_session.commit()

    result = await db_session.execute(
        select(CheckinState).where(CheckinState.tenant_id == tenant.id)
    )
    s = result.scalar_one()
    assert s.last_checkin_type == "text"


@pytest.mark.asyncio
async def test_agent_log(db_session: AsyncSession):
    log = AgentLog(
        agent_name="deal-analyzer",
        task="Analyze 123 Oak St",
        status="completed",
        duration_ms=1500,
    )
    db_session.add(log)
    await db_session.commit()

    result = await db_session.execute(select(AgentLog))
    logs = result.scalars().all()
    assert len(logs) == 1
    assert logs[0].agent_name == "deal-analyzer"
    assert logs[0].duration_ms == 1500


@pytest.mark.asyncio
async def test_goal_progress_notes(db_session: AsyncSession):
    goal = Goal(
        goal="Learn Python",
        progress_notes=[{"note": "Started course", "at": "2024-01-01"}],
    )
    db_session.add(goal)
    await db_session.commit()

    result = await db_session.execute(select(Goal))
    g = result.scalar_one()
    assert len(g.progress_notes) == 1
    assert g.progress_notes[0]["note"] == "Started course"
