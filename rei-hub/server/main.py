"""REI Hub API — FastAPI entry point."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from rei.api.admin_routes import admin_router
from rei.api.auth_routes import auth_router
from rei.api.billing_routes import billing_router
from rei.api.plugin_routes import plugin_router
from rei.config import get_settings
from rei.database import async_session_factory
from rei.migrations.create_tables import create_tables
from rei.tasks.trial_reminder import send_trial_reminders

logger = logging.getLogger(__name__)
settings = get_settings()

_TRIAL_REMINDER_INTERVAL_SECS = 60 * 60 * 24  # 24 hours


async def _trial_reminder_loop() -> None:
    """Run trial reminder checks every 24 hours."""
    while True:
        try:
            async with async_session_factory() as db:
                await send_trial_reminders(db, settings)
        except Exception:
            logger.exception("Trial reminder task error")
        await asyncio.sleep(_TRIAL_REMINDER_INTERVAL_SECS)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup and launch background tasks."""
    await create_tables()
    task = asyncio.create_task(_trial_reminder_loop())
    yield
    task.cancel()


app = FastAPI(
    title="REI Hub API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(admin_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(plugin_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "rei-hub"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
