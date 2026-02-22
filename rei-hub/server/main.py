"""REI Hub API — FastAPI entry point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from datetime import datetime, timedelta

from sqlalchemy import select

from rei.api.admin_routes import admin_router
from rei.api.auth_routes import auth_router
from rei.api.billing_routes import billing_router
from rei.api.documents_routes import documents_router
from rei.api.email_marketing_routes import email_marketing_router
from rei.api.onboarding_routes import onboarding_router
from rei.api.phone_routes import phone_router
from rei.api.plaid_routes import plaid_router
from rei.api.plugin_routes import plugin_router
from rei.config import get_settings
from rei.database import async_session_factory
from rei.migrations.create_tables import create_tables
from rei.models.user import User
from rei.tasks.sequence_processor import process_sequence_steps, reset_email_credits
from rei.tasks.trial_reminder import send_trial_reminders

logger = logging.getLogger(__name__)
settings = get_settings()

_TRIAL_REMINDER_INTERVAL_SECS = 60 * 60 * 24  # 24 hours
_SEQUENCE_PROCESSOR_INTERVAL_SECS = 60 * 60  # 1 hour
_CREDIT_RESET_INTERVAL_SECS = 60 * 60 * 24  # 24 hours
_PHONE_USAGE_RESET_INTERVAL_SECS = 60 * 60  # 1 hour


async def _trial_reminder_loop() -> None:
    """Run trial reminder checks every 24 hours."""
    while True:
        try:
            async with async_session_factory() as db:
                await send_trial_reminders(db, settings)
        except Exception:
            logger.exception("Trial reminder task error")
        await asyncio.sleep(_TRIAL_REMINDER_INTERVAL_SECS)


async def _sequence_processor_loop() -> None:
    """Process email sequence steps every hour."""
    while True:
        try:
            async with async_session_factory() as db:
                await process_sequence_steps(db, settings)
        except Exception:
            logger.exception("Sequence processor task error")
        await asyncio.sleep(_SEQUENCE_PROCESSOR_INTERVAL_SECS)


async def _credit_reset_loop() -> None:
    """Reset email credits every 24 hours."""
    while True:
        try:
            async with async_session_factory() as db:
                await reset_email_credits(db, settings)
        except Exception:
            logger.exception("Credit reset task error")
        await asyncio.sleep(_CREDIT_RESET_INTERVAL_SECS)


async def _phone_usage_reset_loop() -> None:
    """Reset phone minutes/SMS allotments monthly. Credits NEVER reset."""
    while True:
        try:
            async with async_session_factory() as db:
                now = datetime.utcnow()
                result = await db.execute(
                    select(User).where(
                        User.phone_usage_reset_at != None,  # noqa: E711
                        User.phone_usage_reset_at <= now,
                    )
                )
                users = result.scalars().all()
                for user in users:
                    user.phone_minutes_used = 0
                    user.phone_sms_used = 0
                    user.phone_usage_reset_at = now + timedelta(days=30)
                    # NEVER touch phone_credits_cents
                await db.commit()
        except Exception:
            logger.exception("Phone usage reset task error")
        await asyncio.sleep(_PHONE_USAGE_RESET_INTERVAL_SECS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup and launch background tasks."""
    await create_tables()
    task_trial = asyncio.create_task(_trial_reminder_loop())
    task_seq = asyncio.create_task(_sequence_processor_loop())
    task_credits = asyncio.create_task(_credit_reset_loop())
    task_phone = asyncio.create_task(_phone_usage_reset_loop())
    yield
    task_trial.cancel()
    task_seq.cancel()
    task_credits.cancel()
    task_phone.cancel()


app = FastAPI(
    title="REI Hub API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
if settings.environment == "development":
    _cors_origins = ["http://localhost:5173", "http://localhost:3000"]
else:
    _cors_origins = [settings.hub_url]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(admin_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(plaid_router, prefix="/api")
app.include_router(plugin_router, prefix="/api")
app.include_router(email_marketing_router, prefix="/api")
app.include_router(onboarding_router, prefix="/api")
app.include_router(phone_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "environment": settings.environment, "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
