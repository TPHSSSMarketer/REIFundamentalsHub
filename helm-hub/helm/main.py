"""Helm — Application entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

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

# ── Global Exception Handlers (Phase 2.3) ─────────────────────────────────────
# Prevent raw tracebacks from leaking to clients in production.

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Return clean JSON for HTTP errors (no stack traces)."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return concise validation errors without internal type details."""
    errors = []
    for err in exc.errors():
        field = " → ".join(str(loc) for loc in err.get("loc", []))
        errors.append(f"{field}: {err.get('msg', 'invalid')}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": "Validation error", "details": errors},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all — log full traceback server-side, return generic message to client."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Internal server error"},
    )


# ── Request Body Size Limit Middleware (Phase 3.1) ────────────────────────────
MAX_BODY_SIZE = 25 * 1024 * 1024  # 25 MB (covers file uploads)
MAX_JSON_BODY_SIZE = 1 * 1024 * 1024  # 1 MB for JSON endpoints


@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    """Reject oversized request bodies before they consume memory."""
    content_length = request.headers.get("content-length")
    content_type = request.headers.get("content-type", "")
    if content_length:
        length = int(content_length)
        limit = MAX_BODY_SIZE if "multipart" in content_type else MAX_JSON_BODY_SIZE
        if length > limit:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"error": f"Request body too large ({length:,} bytes, max {limit:,})"},
            )
    return await call_next(request)


# ── HTTPS Redirect Middleware (Phase 3.4 — production only) ───────────────────
if settings.is_production:
    @app.middleware("http")
    async def redirect_to_https(request: Request, call_next):
        """Redirect HTTP → HTTPS in production (respects X-Forwarded-Proto from proxy)."""
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if proto == "http":
            url = request.url.replace(scheme="https")
            return JSONResponse(
                status_code=status.HTTP_301_MOVED_PERMANENTLY,
                headers={"Location": str(url)},
                content={"redirect": str(url)},
            )
        return await call_next(request)


# ── CORS ─────────────────────────────────────────────────────────────────────
if settings.app_env == "development":
    _cors_origins = ["http://localhost:8000", "http://localhost:3000"]
else:
    _cors_origins = [settings.helm_hub_url]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Requested-With"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    # Phase 3.6: API version header for clients
    response.headers["X-API-Version"] = "2026-03-01"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = (
        "geolocation=(), microphone=(), camera=()"
    )
    # SECURITY FIX #12: Content Security Policy — allows Stripe, self assets, and API
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' https://js.stripe.com https://m.stripe.com; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://api.stripe.com https://api.reifundamentalshub.com; "
        "frame-src https://js.stripe.com; "
        "object-src 'none'; "
        "base-uri 'self'"
    )
    return response


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

from helm.api.dashboard_routes import dashboard_router
app.include_router(dashboard_router, prefix="/api")

# ── Static frontend ─────────────────────────────────────────────────────────
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    async def serve_frontend():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/dashboard")
    async def serve_dashboard():
        return FileResponse(str(FRONTEND_DIR / "dashboard.html"))

    @app.get("/billing")
    async def serve_billing():
        return FileResponse(str(FRONTEND_DIR / "billing.html"))
