"""Square Payments Routes — Payment processing integration."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from rei.api.deps import get_current_user, get_db
from rei.models.user import User
from rei.services.square_service import create_payment, list_payments, get_locations
from sqlalchemy.ext.asyncio import AsyncSession

square_router = APIRouter(prefix="/square", tags=["square"])


class CreatePaymentBody(BaseModel):
    amount_cents: int
    source_id: str
    description: Optional[str] = ""


@square_router.post("/payments")
async def create_square_payment(
    body: CreatePaymentBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a payment via Square."""
    if body.amount_cents <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    result = await create_payment(
        amount_cents=body.amount_cents,
        source_id=body.source_id,
        description=body.description or "",
        db=db,
    )
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="Square payment service unavailable. Check API credentials in Admin Settings.",
        )
    return result


@square_router.get("/payments")
async def list_square_payments(
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List recent Square payments."""
    result = await list_payments(limit=limit, db=db)
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="Square payment service unavailable. Check API credentials in Admin Settings.",
        )
    return result


@square_router.get("/locations")
async def list_square_locations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List available Square locations (for configuration)."""
    result = await get_locations(db=db)
    if result is None:
        raise HTTPException(
            status_code=503,
            detail="Square service unavailable. Check API credentials in Admin Settings.",
        )
    return result
