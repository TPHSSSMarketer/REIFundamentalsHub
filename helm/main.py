"""Helm — Application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from helm.api.routes import router
from helm.config import get_settings
from helm.models.database import init_db

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("Starting Helm AI Assistant v0.2.0")
    await init_db()
    logger.info("Database initialized")

    # Register all integration plugins (each one self-checks if configured)
    from helm.integrations.registry import register_all_plugins

    register_all_plugins()

    yield
    logger.info("Shutting down Helm")


app = FastAPI(
    title="Helm AI Assistant",
    description="Your AI-powered command center for business and life.",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS (dev-friendly, tighten for production) ─────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if not settings.is_production else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routes ───────────────────────────────────────────────────────────────
app.include_router(router, prefix="/api")

# ── Static frontend ─────────────────────────────────────────────────────────
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    async def serve_frontend():
        return FileResponse(str(FRONTEND_DIR / "index.html"))
