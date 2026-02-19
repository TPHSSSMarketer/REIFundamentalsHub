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
from helm.logging_config import setup_logging
from helm.models.database import init_db
from helm.models.supabase_client import init_supabase

settings = get_settings()

setup_logging(
    level=settings.log_level,
    json_output=settings.is_production,
)
logger = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    logger.info("Starting Helm AI Assistant v0.3.0")
    await init_db()
    await init_supabase()
    logger.info("Database initialized")

    # Load persisted conversations into memory
    from helm.assistant.memory import memory
    from helm.models.supabase_client import init_supabase

    loaded = await memory.load_from_db()
    if loaded:
        logger.info("Restored %d conversations from database", loaded)

    # ── Plugin System ─────────────────────────────────────────────────────
    from helm.plugins import plugin_manager

    # Discover and register all plugins (e.g. REI)
    plugin_manager.discover_plugins()
    logger.info(
        "Plugins loaded: %s",
        plugin_manager.loaded_plugins or "(none — Helm running general-purpose)",
    )

    # Let plugins register their agents, output styles, modes, and router signals
    from helm.agents.definitions import register_plugin_agents
    from helm.assistant.output_styles import register_plugin_mode_style, register_plugin_styles
    from helm.assistant.prompts import register_plugin_modes

    # Agents
    plugin_agents = plugin_manager.get_all_agents()
    if plugin_agents:
        register_plugin_agents(plugin_agents)
        logger.info("Plugin agents registered: %s", list(plugin_agents.keys()))

    # Output styles
    plugin_styles = plugin_manager.get_all_output_styles()
    if plugin_styles:
        register_plugin_styles(plugin_styles)
        logger.info("Plugin output styles registered: %s", list(plugin_styles.keys()))

    # Mode prompts
    plugin_modes = plugin_manager.get_all_mode_prompts()
    if plugin_modes:
        register_plugin_modes(plugin_modes)
        logger.info("Plugin modes registered: %s", list(plugin_modes.keys()))

    # Wire mode → style mappings for known plugins
    if "real_estate" in plugin_modes and "re-investor" in plugin_styles:
        register_plugin_mode_style("real_estate", "re-investor")

    # Mount plugin routes onto the main API router
    plugin_manager.mount_routes(router)

    # ── Core Integrations ─────────────────────────────────────────────────
    from helm.integrations.registry import register_all_plugins

    register_all_plugins()

    # Run plugin startup hooks
    await plugin_manager.startup_all(app)

    yield

    # Shutdown
    await plugin_manager.shutdown_all(app)
    logger.info("Shutting down Helm")


app = FastAPI(
    title="Helm AI Assistant",
    description="Your AI-powered command center for business and life.",
    version="0.3.0",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────────────────────
_cors_origins: list[str] = ["*"] if not settings.is_production else []
if settings.cors_origins:
    _cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── API routes ───────────────────────────────────────────────────────────────
app.include_router(router, prefix="/api")

from helm.api.auth_routes import auth_router
app.include_router(auth_router, prefix="/api")

from helm.api.billing_routes import billing_router
app.include_router(billing_router, prefix="/api")

from helm.api.hub_billing_routes import hub_billing_router
app.include_router(hub_billing_router, prefix="/api")

from helm.api.cloud_storage_routes import cloud_storage_router
app.include_router(cloud_storage_router, prefix="/api")

# ── Static frontend ─────────────────────────────────────────────────────────
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    async def serve_frontend():
        return FileResponse(str(FRONTEND_DIR / "index.html"))
