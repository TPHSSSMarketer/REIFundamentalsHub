"""REI Hub API — FastAPI entry point."""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager

# ── Configure logging BEFORE any other imports ──────────────────────────
# Python's default log level is WARNING, which suppresses all INFO/DEBUG.
# This ensures our application logs (orchestrator, AI service, tools, etc.)
# are visible in Railway's Deploy Logs.
_log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,  # Railway captures stderr as [err] log lines
)

import sentry_sdk

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from datetime import datetime, timedelta

from sqlalchemy import select

from rei.api.admin_routes import admin_router
from rei.api.ai_routes import ai_router
from rei.api.content_hub_routes import content_hub_router
from rei.api.analytics_routes import router as analytics_router
from rei.api.audit_routes import audit_router
from rei.api.auth_routes import auth_router
from rei.api.deal_liens_routes import deal_liens_router
from rei.api.negotiation_requests_routes import negotiation_requests_router
from rei.api.negotiation_cases_routes import negotiation_cases_router
from rei.api.negotiation_activity_routes import negotiation_activity_router
from rei.api.negotiation_messages_routes import negotiation_messages_router
from rei.api.billing_routes import billing_router
from rei.api.calendar_routes import calendar_router
from rei.api.contacts_routes import contacts_router
from rei.api.crm_buyer_criteria_routes import crm_buyer_criteria_router
from rei.api.crm_contacts_routes import crm_contacts_router
from rei.api.crm_deal_files_routes import crm_deal_files_router
from rei.api.crm_deal_matches_routes import crm_deal_matches_router
from rei.api.crm_deals_routes import crm_deals_router
from rei.api.crm_portfolio_routes import crm_portfolio_router
from rei.api.deals_routes import deals_router
from rei.api.documents_routes import documents_router
from rei.api.email_marketing_routes import email_marketing_router
from rei.api.lead_capture_routes import lead_capture_router, lead_capture_public_router
from rei.api.leads_pipeline_routes import router as leads_pipeline_router
from rei.api.direct_mail_routes import router as direct_mail_router
from rei.api.loan_routes_payments import router as loan_payments_router
from rei.api.loan_routes_properties import router as loan_properties_router
from rei.api.geocoding_routes import geocoding_router
from rei.api.market_analysis_routes import market_analysis_router
from rei.api.currency_routes import currency_router
from rei.api.square_routes import square_router
from rei.api.social_media_routes import social_media_router
from rei.api.markets_routes import markets_router
from rei.api.onboarding_routes import onboarding_router
from rei.api.payment_portal_routes import payment_portal_router
from rei.api.phone_routes import phone_router
from rei.api.voice_ai_routes import voice_ai_router
from rei.api.plaid_routes import plaid_router
from rei.api.superadmin_routes import superadmin_router
from rei.api.team_routes import team_router
from rei.api.ticket_routes import ticket_router
from rei.api.cloud_storage_routes import cloud_storage_router
from rei.api.flow_builder_routes import flow_builder_router
from rei.api.webchat_routes import webchat_router, webchat_public_router
from rei.api.admin_assistant_routes import admin_assistant_router
from rei.api.underwriting_routes import underwriting_router
from rei.api.user_preferences_routes import user_preferences_router
from rei.api.property_routes import property_router
from rei.api.email_template_routes import email_template_router
from rei.api.integrations_routes import integrations_router
from rei.api.telegram_webhook_routes import telegram_webhook_router
from rei.config import get_settings
from rei.database import async_session_factory
from rei.migrations.create_tables import create_tables
from rei.models.user import User
from rei.models.lead_capture import LeadCaptureDailyStats, LeadCaptureSite, LeadSubmission  # noqa: F401
from rei.models.user_integrations import UserWordPressIntegration  # noqa: F401
from rei.tasks.reminder_processor import process_reminders
from rei.tasks.sequence_processor import process_sequence_steps, reset_email_credits
from rei.tasks.state_law_processor import process_pending_state_research
from rei.tasks.tracking_processor import process_pending_tracking
from rei.tasks.trial_reminder import send_trial_reminders

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Sentry error tracking ─────────────────────────────────────────────
# Set SENTRY_DSN in Railway env vars to enable. Leave blank to disable.
_sentry_dsn = os.environ.get("SENTRY_DSN", "")
if _sentry_dsn:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.2,  # 20% of requests get performance tracing
        profiles_sample_rate=0.1,
        send_default_pii=False,  # Don't send user emails/IPs to Sentry
    )
    logger.info("Sentry error tracking enabled (env=%s)", settings.environment)
else:
    logger.info("Sentry DSN not set — error tracking disabled")

_TRIAL_REMINDER_INTERVAL_SECS = 60 * 60 * 24  # 24 hours
_SEQUENCE_PROCESSOR_INTERVAL_SECS = 60 * 60  # 1 hour
_CREDIT_RESET_INTERVAL_SECS = 60 * 60 * 24  # 24 hours
_PHONE_USAGE_RESET_INTERVAL_SECS = 60 * 60  # 1 hour
_REMINDER_PROCESSOR_INTERVAL_SECS = 60 * 5  # 5 minutes
_STATE_LAW_PROCESSOR_INTERVAL_SECS = 60 * 60  # 1 hour
_TRACKING_PROCESSOR_INTERVAL_SECS = 60 * 60 * 4  # 4 hours


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


async def _reminder_processor_loop() -> None:
    """Process calendar/task reminders every 5 minutes."""
    while True:
        try:
            async with async_session_factory() as db:
                await process_reminders(db, settings)
        except Exception:
            logger.exception("Reminder processor task error")
        await asyncio.sleep(_REMINDER_PROCESSOR_INTERVAL_SECS)


async def _state_law_processor_loop() -> None:
    """Process pending state law research every hour."""
    while True:
        try:
            await process_pending_state_research(async_session_factory, settings)
        except Exception:
            logger.exception("State law processor task error")
        await asyncio.sleep(_STATE_LAW_PROCESSOR_INTERVAL_SECS)


async def _tracking_processor_loop() -> None:
    """Update USPS and fax tracking status every 4 hours."""
    while True:
        try:
            await process_pending_tracking(async_session_factory, settings)
        except Exception:
            logger.exception("Tracking processor task error")
        await asyncio.sleep(_TRACKING_PROCESSOR_INTERVAL_SECS)


async def _admin_task_scheduler_loop() -> None:
    """Execute scheduled admin assistant tasks every 60 seconds."""
    while True:
        try:
            async with async_session_factory() as db:
                from rei.services.admin_task_scheduler import process_due_tasks
                await process_due_tasks(db, settings)
        except Exception:
            logger.exception("Admin task scheduler error")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup and launch background tasks."""
    await create_tables()
    # Seed platform personas on startup (safe to call multiple times)
    try:
        async with async_session_factory() as db:
            from rei.seeds.persona_seeds import seed_platform_personas
            await seed_platform_personas(db)
    except Exception:
        logger.exception("Failed to seed platform personas on startup")
    # Seed system skills for admin assistant
    try:
        from rei.seeds.skill_seeds import seed_system_skills
        async with async_session_factory() as db:
            await seed_system_skills(db)
    except Exception:
        logger.exception("Failed to seed system skills on startup")

    # ── Auto-promote SuperAdmin on startup (one-time bootstrap) ──────
    if settings.superadmin_bootstrap_key and settings.superadmin_bootstrap_email:
        try:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(User).where(User.email == settings.superadmin_bootstrap_email)
                )
                user = result.scalar_one_or_none()
                if user and not user.is_superadmin:
                    user.is_superadmin = True
                    await db.commit()
                    logger.info(
                        "AUTO-BOOTSTRAP: %s promoted to SuperAdmin on startup",
                        settings.superadmin_bootstrap_email,
                    )
                elif user and user.is_superadmin:
                    logger.info(
                        "AUTO-BOOTSTRAP: %s is already SuperAdmin — remove bootstrap env vars",
                        settings.superadmin_bootstrap_email,
                    )
                else:
                    logger.warning(
                        "AUTO-BOOTSTRAP: No user found with email %s — register first",
                        settings.superadmin_bootstrap_email,
                    )
        except Exception:
            logger.exception("SuperAdmin bootstrap failed on startup")

    task_trial = asyncio.create_task(_trial_reminder_loop())
    task_seq = asyncio.create_task(_sequence_processor_loop())
    task_credits = asyncio.create_task(_credit_reset_loop())
    task_phone = asyncio.create_task(_phone_usage_reset_loop())
    task_reminders = asyncio.create_task(_reminder_processor_loop())
    task_state_law = asyncio.create_task(_state_law_processor_loop())
    task_tracking = asyncio.create_task(_tracking_processor_loop())
    task_admin = asyncio.create_task(_admin_task_scheduler_loop())
    yield
    task_trial.cancel()
    task_seq.cancel()
    task_credits.cancel()
    task_phone.cancel()
    task_reminders.cancel()
    task_state_law.cancel()
    task_tracking.cancel()
    task_admin.cancel()


_docs_url = "/docs" if settings.environment == "development" else None
_openapi_url = "/openapi.json" if settings.environment == "development" else None

app = FastAPI(
    title="REI Hub API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url=_docs_url,
    redoc_url=None,  # Disable ReDoc entirely
    openapi_url=_openapi_url,
)

# ── Middleware stack — ALL pure ASGI (no BaseHTTPMiddleware) ───────
#
# IMPORTANT: Starlette's add_middleware uses reversed() internally,
# so the FIRST add_middleware call becomes the OUTERMOST middleware.
# We add them outermost-first: SecurityHeaders → RateLimit → CSRF.
#
# CORS is NOT added via add_middleware — it's manually wrapped around
# the entire app at the bottom of this file to GUARANTEE it is the
# absolute outermost layer. This ensures every response (including
# 403 CSRF rejections, 429 rate limits) gets CORS headers.

from rei.middleware.csrf import CSRFProtectionMiddleware  # noqa: E402
from rei.middleware.rate_limit import RateLimitMiddleware  # noqa: E402
from rei.middleware.security_headers import SecurityHeadersMiddleware  # noqa: E402

# Added first → outermost among these three
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
# Added last → innermost (closest to routes)
app.add_middleware(CSRFProtectionMiddleware)


# ── Global exception handlers ─────────────────────────────────────────
# Catches unhandled errors so users get a clean JSON response instead
# of a raw stack trace. Also reports to Sentry automatically.


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Return consistent JSON for all HTTP errors (404, 403, 422, etc.)."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail or "An error occurred"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all for unexpected 500 errors — log details, return safe response."""
    logger.exception(
        "Unhandled error on %s %s: %s",
        request.method,
        request.url.path,
        exc,
    )
    # Sentry captures this automatically via its FastAPI integration,
    # but we explicitly capture just in case the integration isn't active.
    if _sentry_dsn:
        sentry_sdk.capture_exception(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Our team has been notified."},
    )


# Routes
app.include_router(admin_router, prefix="/api")
app.include_router(ai_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(contacts_router, prefix="/api")
app.include_router(deals_router, prefix="/api")
app.include_router(documents_router, prefix="/api")
app.include_router(plaid_router, prefix="/api")
app.include_router(email_marketing_router, prefix="/api")
app.include_router(onboarding_router, prefix="/api")
app.include_router(phone_router, prefix="/api")
app.include_router(voice_ai_router, prefix="/api")
app.include_router(calendar_router, prefix="/api")
app.include_router(loan_properties_router)
app.include_router(loan_payments_router)
app.include_router(deal_liens_router)
app.include_router(negotiation_requests_router)
app.include_router(negotiation_cases_router)
app.include_router(negotiation_activity_router)
app.include_router(negotiation_messages_router)
app.include_router(analytics_router)
app.include_router(payment_portal_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(superadmin_router, prefix="/api")
app.include_router(ticket_router, prefix="/api")
app.include_router(markets_router, prefix="/api")
app.include_router(geocoding_router, prefix="/api")
app.include_router(market_analysis_router, prefix="/api")
app.include_router(currency_router, prefix="/api")
app.include_router(square_router, prefix="/api")
app.include_router(social_media_router, prefix="/api")
app.include_router(lead_capture_router, prefix="/api")
app.include_router(lead_capture_public_router)
app.include_router(leads_pipeline_router, prefix="/api")
app.include_router(direct_mail_router, prefix="/api")
app.include_router(crm_buyer_criteria_router, prefix="/api")
app.include_router(crm_contacts_router, prefix="/api")
app.include_router(crm_deal_files_router, prefix="/api")
app.include_router(crm_deal_matches_router, prefix="/api")
app.include_router(crm_deals_router, prefix="/api")
app.include_router(crm_portfolio_router, prefix="/api")
app.include_router(cloud_storage_router, prefix="/api")
app.include_router(flow_builder_router, prefix="/api")
app.include_router(webchat_router, prefix="/api")
app.include_router(webchat_public_router)
app.include_router(admin_assistant_router, prefix="/api")
app.include_router(underwriting_router, prefix="/api")
app.include_router(property_router, prefix="/api")
app.include_router(email_template_router, prefix="/api")
app.include_router(team_router, prefix="/api")
app.include_router(content_hub_router, prefix="/api")
app.include_router(user_preferences_router, prefix="/api")
app.include_router(integrations_router, prefix="/api")
app.include_router(telegram_webhook_router)  # No /api prefix — webhook URL is /api/telegram/webhook (built into router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)


# ── CORS — manually wrapped AFTER all routes & middleware ──────────
#
# We wrap the entire app at module level so CORS is the absolute
# outermost layer. This guarantees EVERY response gets CORS headers,
# including 403 CSRF rejections, 429 rate limits, and 500 errors.
#
# This approach is immune to Starlette's add_middleware ordering
# quirks because it operates outside the Starlette middleware stack.

from rei.middleware.cors import CORSMiddleware as PureASGICORS  # noqa: E402

if settings.environment == "development":
    _cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    _cors_origin_regex: str | None = None
else:
    _hub = settings.hub_url.rstrip("/")
    _cors_origins = [_hub]
    _cors_origin_regex = r"https://([a-z0-9-]+\.)?reifundamentalshub\.com"

logger.info("CORS allowed origins: %s  regex: %s", _cors_origins, _cors_origin_regex if settings.environment != "development" else "N/A")

app = PureASGICORS(
    app,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex if settings.environment != "development" else None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)
