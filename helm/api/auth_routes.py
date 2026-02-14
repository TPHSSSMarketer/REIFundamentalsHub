"""Auth routes — login and token management."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status

from helm.config import get_settings

settings = get_settings()
auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/token")
async def login(request: Request):
    """Issue a JWT token. Accepts API key or password auth.

    Body: {"api_key": "..."} or {"username": "admin", "password": "..."}
    """
    data = await request.json()

    # Method 1: API key login
    api_key = data.get("api_key", "")
    if api_key:
        valid_keys = {k.strip() for k in settings.api_keys.split(",") if k.strip()} if settings.api_keys else set()
        if api_key in valid_keys:
            from helm.api.auth import create_access_token
            token = create_access_token(
                data={"sub": "admin", "tenant_id": settings.admin_tenant_id, "is_admin": True},
                expires_delta=timedelta(minutes=settings.jwt_expiration_minutes),
            )
            return {"access_token": token, "token_type": "bearer"}

    # Method 2: Username/password (admin only for now)
    username = data.get("username", "")
    password = data.get("password", "")
    if username and password:
        # Check against admin credentials in settings
        admin_pass = settings.admin_password if hasattr(settings, "admin_password") else ""
        if username == "admin" and admin_pass:
            from helm.api.auth import create_access_token, verify_password
            if not verify_password(password, admin_pass):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
            token = create_access_token(
                data={"sub": "admin", "tenant_id": settings.admin_tenant_id, "is_admin": True},
                expires_delta=timedelta(minutes=settings.jwt_expiration_minutes),
            )
            return {"access_token": token, "token_type": "bearer"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
    )


@auth_router.post("/token/tenant")
async def tenant_token(request: Request):
    """Issue a tenant-scoped JWT token.

    Body: {"tenant_id": "...", "api_key": "..."}
    """
    data = await request.json()
    api_key = data.get("api_key", "")
    tenant_id = data.get("tenant_id", "")

    if not tenant_id:
        raise HTTPException(status_code=400, detail="tenant_id is required")

    valid_keys = {k.strip() for k in settings.api_keys.split(",") if k.strip()} if settings.api_keys else set()
    if api_key not in valid_keys:
        raise HTTPException(status_code=401, detail="Invalid API key")

    from helm.api.auth import create_access_token
    token = create_access_token(
        data={"sub": f"tenant:{tenant_id}", "tenant_id": tenant_id, "is_admin": False},
        expires_delta=timedelta(minutes=settings.jwt_expiration_minutes),
    )
    return {"access_token": token, "token_type": "bearer", "tenant_id": tenant_id}
