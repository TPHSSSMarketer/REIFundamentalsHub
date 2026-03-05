"""SuperAdmin routes — credential management + HUD market zip codes."""

from __future__ import annotations

import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_db
from rei.config import get_settings
from rei.middleware.superadmin_gate import require_superadmin
from rei.models.credentials import KNOWN_PROVIDERS
from rei.models.crm import MarketZipCode
from rei.models.user import User
from rei.services import credentials_service

logger = logging.getLogger(__name__)

superadmin_router = APIRouter(prefix="/superadmin", tags=["superadmin"])


# ── Bootstrap — one-time SuperAdmin promotion ────────────────────────────


class BootstrapRequest(BaseModel):
    email: str
    bootstrap_key: str


@superadmin_router.post("/bootstrap")
async def bootstrap_superadmin(
    body: BootstrapRequest,
    db: AsyncSession = Depends(get_db),
):
    """Promote a user to SuperAdmin using a one-time bootstrap key.

    Set REI_SUPERADMIN_BOOTSTRAP_KEY in Railway env vars, call this
    endpoint once, then remove the env var.
    """
    settings = get_settings()

    if not settings.superadmin_bootstrap_key:
        raise HTTPException(
            status_code=404,
            detail="Bootstrap is not enabled. Set REI_SUPERADMIN_BOOTSTRAP_KEY in your environment.",
        )

    if body.bootstrap_key != settings.superadmin_bootstrap_key:
        raise HTTPException(status_code=403, detail="Invalid bootstrap key.")

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"No user found with email: {body.email}")

    if user.is_superadmin:
        return {"message": f"{body.email} is already a SuperAdmin.", "promoted": False}

    user.is_superadmin = True
    # SuperAdmin gets top tier, active status, no billing
    user.plan = "team"
    user.subscription_status = "active"
    user.trial_ends_at = None
    user.subscription_ends_at = None
    await db.commit()

    logger.info("User %s promoted to SuperAdmin via bootstrap (Team tier, active, no billing)", body.email)
    return {"message": f"{body.email} has been promoted to SuperAdmin!", "promoted": True}


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


# ── HUD Market Zip Codes ────────────────────────────────────────────────


@superadmin_router.get("/markets/zip-codes")
async def list_market_zip_codes(
    page: int = 1,
    per_page: int = 100,
    search: str = "",
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """List all zip code → market mappings (paginated, searchable)."""
    query = select(MarketZipCode)
    count_query = select(func.count(MarketZipCode.id))

    if search:
        like = f"%{search}%"
        query = query.where(
            (MarketZipCode.zip_code.like(like))
            | (MarketZipCode.market_name.ilike(like))
            | (MarketZipCode.state.ilike(like))
        )
        count_query = count_query.where(
            (MarketZipCode.zip_code.like(like))
            | (MarketZipCode.market_name.ilike(like))
            | (MarketZipCode.state.ilike(like))
        )

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    query = query.order_by(MarketZipCode.state, MarketZipCode.market_name, MarketZipCode.zip_code)
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    rows = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "zip_codes": [
            {
                "id": r.id,
                "zipCode": r.zip_code,
                "marketName": r.market_name,
                "state": r.state,
            }
            for r in rows
        ],
    }


@superadmin_router.post("/markets/zip-codes/upload")
async def upload_zip_codes_csv(
    file: UploadFile = File(...),
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Upload a CSV of zip codes. Columns: zip_code, market_name, state.

    Upserts — existing zip codes are updated, new ones are added.
    """
    content = await file.read()
    text = content.decode("utf-8-sig")  # handle BOM
    reader = csv.DictReader(io.StringIO(text))

    added = 0
    updated = 0
    errors = []

    for i, row in enumerate(reader, start=2):
        zip_code = (row.get("zip_code") or row.get("zip") or "").strip()
        market_name = (row.get("market_name") or row.get("market") or "").strip()
        state = (row.get("state") or "").strip().upper()

        if not zip_code or not market_name:
            errors.append(f"Row {i}: missing zip_code or market_name")
            continue

        # Check if exists
        existing = await db.execute(
            select(MarketZipCode).where(MarketZipCode.zip_code == zip_code)
        )
        entry = existing.scalar_one_or_none()
        if entry:
            entry.market_name = market_name
            entry.state = state or entry.state
            updated += 1
        else:
            db.add(MarketZipCode(
                zip_code=zip_code,
                market_name=market_name,
                state=state,
            ))
            added += 1

    await db.commit()

    return {
        "added": added,
        "updated": updated,
        "errors": errors[:20],  # limit error messages
        "message": f"Processed CSV: {added} added, {updated} updated"
        + (f", {len(errors)} errors" if errors else ""),
    }


@superadmin_router.get("/markets/zip-codes/stats")
async def market_zip_stats(
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Get summary stats about zip code mappings."""
    total_result = await db.execute(select(func.count(MarketZipCode.id)))
    total = total_result.scalar() or 0

    states_result = await db.execute(
        select(func.count(func.distinct(MarketZipCode.state)))
    )
    states = states_result.scalar() or 0

    markets_result = await db.execute(
        select(func.count(func.distinct(MarketZipCode.market_name)))
    )
    markets = markets_result.scalar() or 0

    return {"total_zip_codes": total, "total_states": states, "total_markets": markets}


@superadmin_router.delete("/markets/zip-codes")
async def clear_all_zip_codes(
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Delete all zip code mappings (fresh start before re-import)."""
    await db.execute(delete(MarketZipCode))
    await db.commit()
    return {"message": "All zip code mappings deleted"}


@superadmin_router.post("/markets/zip-codes/lookup")
async def lookup_zip_code(
    zip_code: str,
    user: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    """Look up a single zip code via HUD API and cache it."""
    from rei.services.hud_api import resolve_zip_to_market

    market = await resolve_zip_to_market(zip_code)
    if not market:
        raise HTTPException(status_code=404, detail=f"Could not resolve zip code {zip_code}")

    return {"zipCode": zip_code, "marketName": market}
