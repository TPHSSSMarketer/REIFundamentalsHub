"""REI Hub API — FastAPI entry point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from datetime import datetime, timedelta

from sqlalchemy import select

from rei.services.security import check_rate_limit, rl_ip_key

from rei.api.admin_routes import admin_router
from rei.api.ai_routes import ai_router
from rei.api.analytics_routes import router as analytics_router
from rei.api.audit_routes import audit_router
from rei.api.auth_routes import auth_router
from rei.api.bank_negotiation_routes import router as bank_negotiation_router
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
from rei.api.ticket_routes import ticket_router
from rei.api.cloud_storage_routes import cloud_storage_router
from rei.api.flow_builder_routes import flow_builder_router
from rei.api.webchat_routes import webchat_router, webchat_public_router
from rei.api.admin_assistant_routes import admin_assistant_router
from rei.config import get_settings
from rei.database import async_session_factory
from rei.migrations.create_tables import create_tables
from rei.models.user import User
from rei.models.lead_capture import LeadCaptureDailyStats, LeadCaptureSite, LeadSubmission  # noqa: F401
from rei.tasks.reminder_processor import process_reminders
from rei.tasks.sequence_processor import process_sequence_steps, reset_email_credits
from rei.tasks.state_law_processor import process_pending_state_research
from rei.tasks.tracking_processor import process_pending_tracking
from rei.tasks.trial_reminder import send_trial_reminders

logger = logging.getLogger(__name__)
settings = get_settings()

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

# CORS — allow hub frontend with credentials for HttpOnly cookie auth
if settings.environment == "development":
    _cors_origins = ["http://localhost:5173", "http://localhost:3000"]
else:
    _cors_origins = [settings.hub_url]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,  # Required for HttpOnly cookie auth
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)

# CSRF protection — validates double-submit cookie on state-changing requests
from rei.middleware.csrf import CSRFProtectionMiddleware  # noqa: E402
app.add_middleware(CSRFProtectionMiddleware)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Apply rate limiting based on endpoint and IP address."""
    ip = request.client.host if request.client else "unknown"
    path = request.url.path
    method = request.method

    # Skip health check
    if path == "/health":
        return await call_next(request)

    # Auth endpoints: 5 requests/minute per IP
    if path.startswith("/api/auth/") and method in ["POST"]:
        if not check_rate_limit(rl_ip_key(ip, "auth"), max_requests=5, window_seconds=60):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many authentication attempts. Please try again in 1 minute."},
            )

    # AI endpoints: 20 requests/minute per IP
    if path.startswith("/api/ai/") and method in ["POST"]:
        if not check_rate_limit(rl_ip_key(ip, "ai"), max_requests=20, window_seconds=60):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many AI requests. Please try again in 1 minute."},
            )

    # Lead form submissions: 10 per minute per IP (also rate-limited in the route)
    if path.endswith("/submit") and "/sites/" in path and method == "POST":
        if not check_rate_limit(rl_ip_key(ip, "lead_submit"), max_requests=10, window_seconds=60):
            from fastapi.responses import JSONResponse
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many submissions. Please try again later."},
            )

    # General rate limit: 100 requests/minute per IP
    if not check_rate_limit(rl_ip_key(ip, "general"), max_requests=100, window_seconds=60):
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded. Please try again in 1 minute."},
        )

    response = await call_next(request)
    return response


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "geolocation=(), microphone=(), camera=()"
    )
    # HSTS — enforce HTTPS for 1 year with subdomains + preload
    if settings.environment != "development":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
    # CSP — API server returns JSON, so lock down resources tightly
    if not path.startswith("/sites/") and "/sites/" not in path:
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; frame-ancestors 'none'"
        )
    # Public lead capture sites should be embeddable; API routes should not
    if path.startswith("/sites/") or "/sites/" in path:
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
    else:
        response.headers["X-Frame-Options"] = "DENY"
    return response


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
app.include_router(bank_negotiation_router)
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


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
