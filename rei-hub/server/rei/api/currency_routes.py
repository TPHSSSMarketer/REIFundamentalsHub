"""Currency Conversion Routes — Frankfurter API integration."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from rei.api.deps import get_current_user
from rei.models.user import User
from rei.services.currency_service import (
    convert_currency,
    get_available_currencies,
    get_latest_rates,
)

currency_router = APIRouter(prefix="/currency", tags=["currency"])


@currency_router.get("/convert")
async def convert(
    amount: float = Query(..., description="Amount to convert"),
    from_currency: str = Query("USD", alias="from", description="Source currency"),
    to_currency: str = Query("EUR", alias="to", description="Target currency"),
    user: User = Depends(get_current_user),
):
    """Convert an amount between currencies."""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    result = await convert_currency(amount, from_currency, to_currency)
    if result is None:
        raise HTTPException(status_code=503, detail="Currency conversion service unavailable")
    return result


@currency_router.get("/rates")
async def rates(
    base: str = Query("USD", description="Base currency"),
    user: User = Depends(get_current_user),
):
    """Get latest exchange rates for a base currency."""
    result = await get_latest_rates(base)
    if result is None:
        raise HTTPException(status_code=503, detail="Exchange rate service unavailable")
    return result


@currency_router.get("/currencies")
async def currencies(
    user: User = Depends(get_current_user),
):
    """Get list of available currencies."""
    result = await get_available_currencies()
    if result is None:
        raise HTTPException(status_code=503, detail="Currency service unavailable")
    return result
