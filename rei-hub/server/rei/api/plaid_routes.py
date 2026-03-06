"""Plaid routes — Proof of Funds verification and certificate management."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import PofRequest, ProofOfFundsCertificate, User
from rei.services import plaid_service
from rei.services.email import send_pof_completed_email, send_pof_request_email

logger = logging.getLogger(__name__)
plaid_router = APIRouter(prefix="/plaid", tags=["plaid"])


# ── Schemas ─────────────────────────────────────────────────────────────


class ExchangeTokenRequest(BaseModel):
    public_token: str = Field(description="Plaid public token from Link flow")


class VerifyFundsRequest(BaseModel):
    required_amount: float = Field(description="Earnest money amount to verify")
    property_address: str = Field(description="Property address for the certificate")


class PofRequestCreate(BaseModel):
    buyer_email: str = Field(description="Buyer's email address")
    buyer_name: str = Field(description="Buyer's full name")
    property_address: str = Field(description="Property address")
    required_amount: float = Field(description="Required proof of funds amount")
    notes: Optional[str] = Field(default=None, description="Additional context")
    deal_id: Optional[str] = Field(default=None, description="Associated deal ID")


class PublicVerifyRequest(BaseModel):
    public_token: str = Field(description="Plaid public token from Link flow")


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

    # Auto-create POF expiry reminder task
    from rei.api.calendar_routes import auto_pof_expiry_task

    expires_at = datetime.fromisoformat(certificate["expires_at"])
    await auto_pof_expiry_task(
        db=db,
        user_id=current_user.id,
        contact_id=None,
        deal_id=None,
        expires_at=expires_at,
    )

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


# ═══════════════════════════════════════════════════════════════
# POF Requests — Authenticated endpoints
# ═══════════════════════════════════════════════════════════════


@plaid_router.post("/request-pof")
async def create_pof_request(
    body: PofRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a POF request and email the buyer a verification link."""
    settings = get_settings()
    request_token = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(hours=72)

    pof_req = PofRequest(
        requestor_id=current_user.id,
        buyer_email=body.buyer_email,
        buyer_name=body.buyer_name,
        property_address=body.property_address,
        required_amount=body.required_amount,
        request_token=request_token,
        expires_at=expires_at,
        notes=body.notes,
        deal_id=body.deal_id,
    )
    db.add(pof_req)
    await db.commit()
    await db.refresh(pof_req)

    request_link = f"{settings.hub_url}/proof-of-funds/verify/{request_token}"
    requestor_name = current_user.full_name or current_user.email

    asyncio.create_task(
        send_pof_request_email(
            buyer_email=body.buyer_email,
            buyer_name=body.buyer_name,
            requestor_name=requestor_name,
            property_address=body.property_address,
            required_amount=body.required_amount,
            request_link=request_link,
            expires_at=expires_at.strftime("%B %d, %Y %I:%M %p UTC"),
            settings=settings,
        )
    )

    return {
        "request_id": pof_req.id,
        "request_token": request_token,
        "expires_at": expires_at.isoformat(),
    }


@plaid_router.get("/requests")
async def list_pof_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all POF requests made by the current user."""
    result = await db.execute(
        select(PofRequest)
        .where(PofRequest.requestor_id == current_user.id)
        .order_by(PofRequest.created_at.desc())
    )
    requests = result.scalars().all()

    return {
        "requests": [
            {
                "id": r.id,
                "buyer_email": r.buyer_email,
                "buyer_name": r.buyer_name,
                "property_address": r.property_address,
                "required_amount": r.required_amount,
                "status": r.status,
                "request_token": r.request_token,
                "expires_at": r.expires_at.isoformat(),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "certificate_id": r.certificate_id,
                "notes": r.notes,
                "created_at": r.created_at.isoformat(),
            }
            for r in requests
        ]
    }


@plaid_router.get("/requests/{request_id}")
async def get_pof_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a single POF request (must belong to current user)."""
    result = await db.execute(
        select(PofRequest).where(
            PofRequest.id == request_id,
            PofRequest.requestor_id == current_user.id,
        )
    )
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    return {
        "id": req.id,
        "buyer_email": req.buyer_email,
        "buyer_name": req.buyer_name,
        "property_address": req.property_address,
        "required_amount": req.required_amount,
        "status": req.status,
        "request_token": req.request_token,
        "expires_at": req.expires_at.isoformat(),
        "completed_at": req.completed_at.isoformat() if req.completed_at else None,
        "certificate_id": req.certificate_id,
        "notes": req.notes,
        "created_at": req.created_at.isoformat(),
    }


@plaid_router.delete("/requests/{request_id}")
async def cancel_pof_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending POF request."""
    result = await db.execute(
        select(PofRequest).where(
            PofRequest.id == request_id,
            PofRequest.requestor_id == current_user.id,
        )
    )
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only pending requests can be canceled",
        )

    await db.delete(req)
    await db.commit()
    return {"success": True}


# ═══════════════════════════════════════════════════════════════
# POF Requests — Public endpoints (no auth)
# ═══════════════════════════════════════════════════════════════


@plaid_router.get("/public/request/{request_token}")
async def get_public_request(
    request_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Return request details for the buyer (no auth required)."""
    result = await db.execute(
        select(PofRequest).where(PofRequest.request_token == request_token)
    )
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    if req.status in ("completed", "expired", "declined"):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail=f"This request has been {req.status}",
        )

    if req.expires_at < datetime.utcnow():
        req.status = "expired"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This request has expired",
        )

    # Look up requestor name
    requestor_result = await db.execute(
        select(User).where(User.id == req.requestor_id)
    )
    requestor = requestor_result.scalar_one_or_none()
    requestor_name = (requestor.full_name or requestor.email) if requestor else "Unknown"

    return {
        "requestor_name": requestor_name,
        "property_address": req.property_address,
        "required_amount": req.required_amount,
        "expires_at": req.expires_at.isoformat(),
        "status": req.status,
        "notes": req.notes,
    }


@plaid_router.post("/public/link-token/{request_token}")
async def create_public_link_token(
    request_token: str,
    db: AsyncSession = Depends(get_db),
):
    """Create a Plaid Link token for a buyer (no auth required)."""
    result = await db.execute(
        select(PofRequest).where(PofRequest.request_token == request_token)
    )
    req = result.scalar_one_or_none()

    if not req or req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found or no longer active",
        )

    if req.expires_at < datetime.utcnow():
        req.status = "expired"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This request has expired",
        )

    settings = get_settings()

    if not settings.plaid_client_id or not settings.plaid_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Plaid is not configured",
        )

    try:
        link_token = await plaid_service.create_link_token(
            request_token, settings
        )
    except Exception as e:
        logger.error("Plaid public link token error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create Plaid link token",
        ) from e

    return {"link_token": link_token}


@plaid_router.post("/public/verify/{request_token}")
async def public_verify(
    request_token: str,
    body: PublicVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Buyer submits Plaid public token to verify funds (no auth required)."""
    result = await db.execute(
        select(PofRequest).where(PofRequest.request_token == request_token)
    )
    req = result.scalar_one_or_none()

    if not req or req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found or no longer active",
        )

    if req.expires_at < datetime.utcnow():
        req.status = "expired"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="This request has expired",
        )

    settings = get_settings()

    # Exchange public token for access token
    try:
        access_token = await plaid_service.exchange_public_token(
            body.public_token, settings
        )
    except Exception as e:
        logger.error("Public Plaid token exchange error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to exchange Plaid token",
        ) from e

    # Verify funds
    try:
        verification = await plaid_service.verify_funds(
            access_token, req.required_amount, settings
        )
    except Exception as e:
        logger.error("Public Plaid verify funds error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to verify funds",
        ) from e

    # Generate certificate using buyer info from the request
    buyer_stub = SimpleNamespace(
        full_name=req.buyer_name,
        email=req.buyer_email,
    )
    certificate = plaid_service.generate_pof_certificate(
        buyer_stub, verification, req.property_address, settings
    )

    # Persist certificate (user_id = requestor who made the request)
    pof = ProofOfFundsCertificate(
        id=certificate["certificate_id"],
        user_id=req.requestor_id,
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

    # Update the request
    req.status = "completed"
    req.completed_at = datetime.utcnow()
    req.certificate_id = certificate["certificate_id"]
    await db.commit()

    # Notify the requestor
    requestor_result = await db.execute(
        select(User).where(User.id == req.requestor_id)
    )
    requestor = requestor_result.scalar_one_or_none()

    if requestor:
        requestor_name = requestor.full_name or requestor.email
        cert_link = (
            f"{settings.hub_url}/proof-of-funds?cert={certificate['certificate_id']}"
        )
        asyncio.create_task(
            send_pof_completed_email(
                requestor_email=requestor.email,
                requestor_name=requestor_name,
                buyer_name=req.buyer_name,
                property_address=req.property_address,
                verified_amount_display=certificate["available_balance"],
                certificate_link=cert_link,
                settings=settings,
            )
        )

    return certificate
