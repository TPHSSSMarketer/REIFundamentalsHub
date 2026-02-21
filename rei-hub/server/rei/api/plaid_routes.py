"""Plaid routes — Proof of Funds verification and certificate management."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import ProofOfFundsCertificate, User
from rei.services import plaid_service

logger = logging.getLogger(__name__)
plaid_router = APIRouter(prefix="/plaid", tags=["plaid"])


# ── Schemas ─────────────────────────────────────────────────────────────


class ExchangeTokenRequest(BaseModel):
    public_token: str = Field(description="Plaid public token from Link flow")


class VerifyFundsRequest(BaseModel):
    required_amount: float = Field(description="Earnest money amount to verify")
    property_address: str = Field(description="Property address for the certificate")


# ── POST /plaid/link-token ──────────────────────────────────────────────


@plaid_router.post("/link-token")
async def create_link_token(current_user: User = Depends(get_current_user)):
    """Create a Plaid Link token for the current user."""
    settings = get_settings()

    if not settings.plaid_client_id or not settings.plaid_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Plaid is not configured",
        )

    try:
        link_token = await plaid_service.create_link_token(
            str(current_user.id), settings
        )
    except Exception as e:
        logger.error("Plaid link token error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create Plaid link token",
        ) from e

    return {"link_token": link_token}


# ── POST /plaid/exchange-token ──────────────────────────────────────────


@plaid_router.post("/exchange-token")
async def exchange_token(
    body: ExchangeTokenRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange a Plaid public token and save the access token to the user."""
    settings = get_settings()

    try:
        access_token = await plaid_service.exchange_public_token(
            body.public_token, settings
        )
    except Exception as e:
        logger.error("Plaid token exchange error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to exchange Plaid token",
        ) from e

    current_user.plaid_access_token = access_token
    current_user.plaid_linked_at = datetime.utcnow()
    await db.commit()

    return {"success": True}


# ── GET /plaid/balance ──────────────────────────────────────────────────


def _mask_account_balance(amount: float) -> str:
    """Round balance down to nearest $10k for display."""
    import math

    floored = int(math.floor(amount / 10_000) * 10_000)
    return f"${floored:,}+"


@plaid_router.get("/balance")
async def get_balance(current_user: User = Depends(get_current_user)):
    """Return masked account balances for the linked bank."""
    if not current_user.plaid_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No bank account linked. Connect via Plaid first.",
        )

    settings = get_settings()

    try:
        accounts = await plaid_service.get_balance(
            current_user.plaid_access_token, settings
        )
    except Exception as e:
        logger.error("Plaid balance error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch balances from Plaid",
        ) from e

    masked = []
    for acct in accounts:
        balances = acct.get("balances", {})
        available = balances.get("available") or balances.get("current") or 0.0
        masked.append({
            "account_id": acct.get("account_id"),
            "name": acct.get("name"),
            "type": acct.get("type"),
            "subtype": acct.get("subtype"),
            "available_display": _mask_account_balance(float(available)),
        })

    return {"accounts": masked}


# ── POST /plaid/verify-funds ────────────────────────────────────────────


@plaid_router.post("/verify-funds")
async def verify_funds(
    body: VerifyFundsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify funds and generate a Proof of Funds certificate."""
    if not current_user.plaid_access_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No bank account linked. Connect via Plaid first.",
        )

    settings = get_settings()

    try:
        verification = await plaid_service.verify_funds(
            current_user.plaid_access_token, body.required_amount, settings
        )
    except Exception as e:
        logger.error("Plaid verify funds error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to verify funds via Plaid",
        ) from e

    certificate = plaid_service.generate_pof_certificate(
        current_user, verification, body.property_address, settings
    )

    # Persist certificate
    pof = ProofOfFundsCertificate(
        id=certificate["certificate_id"],
        user_id=current_user.id,
        verified=certificate["verified"],
        buyer_name=certificate["buyer_name"],
        buyer_email=certificate["buyer_email"],
        required_amount=certificate["required_amount"],
        available_balance_display=certificate["available_balance"],
        property_address=certificate["property_address"],
        issued_at=datetime.fromisoformat(certificate["issued_at"]),
        expires_at=datetime.fromisoformat(certificate["expires_at"]),
        certificate_data=json.dumps(certificate),
    )
    db.add(pof)
    await db.commit()

    return certificate


# ── GET /plaid/certificates ─────────────────────────────────────────────


@plaid_router.get("/certificates")
async def list_certificates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all POF certificates for the current user, most recent first."""
    result = await db.execute(
        select(ProofOfFundsCertificate)
        .where(ProofOfFundsCertificate.user_id == current_user.id)
        .order_by(ProofOfFundsCertificate.created_at.desc())
    )
    certs = result.scalars().all()

    return {
        "certificates": [
            json.loads(c.certificate_data) for c in certs
        ]
    }


# ── GET /plaid/certificates/{certificate_id} ───────────────────────────


@plaid_router.get("/certificates/{certificate_id}")
async def get_certificate(
    certificate_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a single POF certificate by ID (must belong to current user)."""
    result = await db.execute(
        select(ProofOfFundsCertificate).where(
            ProofOfFundsCertificate.id == certificate_id,
            ProofOfFundsCertificate.user_id == current_user.id,
        )
    )
    cert = result.scalar_one_or_none()

    if not cert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found",
        )

    return json.loads(cert.certificate_data)


# ── POST /plaid/disconnect ──────────────────────────────────────────────


@plaid_router.post("/disconnect")
async def disconnect_bank(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Clear the user's Plaid access token (disconnect bank)."""
    current_user.plaid_access_token = None
    current_user.plaid_linked_at = None
    await db.commit()
    return {"success": True}
