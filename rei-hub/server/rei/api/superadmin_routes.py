"""SuperAdmin routes — credential management for all integration providers."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_db
from rei.middleware.superadmin_gate import require_superadmin
from rei.models.credentials import KNOWN_PROVIDERS
from rei.models.user import User
from rei.services import credentials_service

logger = logging.getLogger(__name__)

superadmin_router = APIRouter(prefix="/superadmin", tags=["superadmin"])


# ── Pydantic schemas ────────────────────────────────────────────────────


class CredentialFieldInfo(BaseModel):
    name: str
    label: str
    type: str  # "secret" or "text"


class CredentialStatus(BaseModel):
    provider_name: str
    configured: bool
    last_updated: Optional[str] = None
    fields: list[CredentialFieldInfo]
    configured_fields: dict[str, bool]  # field_name -> has_value


class CredentialStatusList(BaseModel):
    credentials: list[CredentialStatus]


class UpdateCredentialRequest(BaseModel):
    """Dynamic config: pass field_name: value pairs."""
    config: dict[str, str]


class UpdateCredentialResponse(BaseModel):
    provider_name: str
    configured: bool
    message: str


class TestCredentialResponse(BaseModel):
    status: str  # "connected" or "error"
    message: str


# ── Endpoints ────────────────────────────────────────────────────────────


@superadmin_router.get("/credentials", response_model=CredentialStatusList)
async def list_credentials(
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """List all known providers and whether their credentials are configured.

    Never returns actual credential values — only configured/not booleans.
    """
    statuses = await credentials_service.get_all_credential_statuses(db)
    return CredentialStatusList(
        credentials=[
            CredentialStatus(
                provider_name=s["provider_name"],
                configured=s["configured"],
                last_updated=s["last_updated"],
                fields=[
                    CredentialFieldInfo(**f)
                    for f in s["fields"]
                ],
                configured_fields=s["configured_fields"],
            )
            for s in statuses
        ]
    )


@superadmin_router.put(
    "/credentials/{provider_name}",
    response_model=UpdateCredentialResponse,
)
async def update_credentials(
    provider_name: str,
    body: UpdateCredentialRequest,
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Save or update credentials for a specific provider.

    Accepts a JSON body with config: {field_name: value}.
    Values are encrypted before storage.
    """
    if provider_name not in KNOWN_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {provider_name}. "
            f"Valid providers: {', '.join(KNOWN_PROVIDERS.keys())}",
        )

    # Validate field names
    valid_fields = {f["name"] for f in KNOWN_PROVIDERS[provider_name]}
    invalid = set(body.config.keys()) - valid_fields
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid fields for {provider_name}: {', '.join(invalid)}. "
            f"Valid fields: {', '.join(valid_fields)}",
        )

    row = await credentials_service.save_provider_credentials(
        db=db,
        provider_name=provider_name,
        config=body.config,
        user_id=user.id,
    )

    return UpdateCredentialResponse(
        provider_name=provider_name,
        configured=True,
        message=f"Credentials for {provider_name} saved successfully.",
    )


@superadmin_router.delete("/credentials/{provider_name}")
async def delete_credentials(
    provider_name: str,
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Remove all credentials for a provider."""
    if provider_name not in KNOWN_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider_name}")

    deleted = await credentials_service.delete_provider_credentials(db, provider_name)
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"No credentials found for {provider_name}",
        )

    return {"message": f"Credentials for {provider_name} removed."}


@superadmin_router.get(
    "/credentials/{provider_name}/test",
    response_model=TestCredentialResponse,
)
async def test_credentials(
    provider_name: str,
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Test connectivity for a provider using stored credentials."""
    if provider_name not in KNOWN_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider_name}")

    creds = await credentials_service.get_provider_credentials(db, provider_name)
    if not creds:
        return TestCredentialResponse(
            status="error",
            message=f"No credentials configured for {provider_name}.",
        )

    result = await credentials_service.test_provider_connection(
        provider_name, creds
    )
    return TestCredentialResponse(**result)


@superadmin_router.get("/providers")
async def list_providers(
    user: User = Depends(require_superadmin),
):
    """Return the list of known providers and their field definitions.

    Useful for the frontend to dynamically build credential forms.
    """
    return {
        "providers": {
            name: fields for name, fields in KNOWN_PROVIDERS.items()
        }
    }
