"""REI Hub API — FastAPI entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from rei.api.auth_routes import auth_router
from rei.config import get_settings
from rei.migrations.create_tables import create_tables

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    await create_tables()
    yield


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
app.include_router(auth_router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "rei-hub"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
