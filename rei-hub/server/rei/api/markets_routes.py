"""Markets API Routes — Save, view, and manage real estate markets.

Users can:
- View their saved markets
- Add a new market
- Update market data
- Remove a saved market
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.user import SavedMarket, User

logger = logging.getLogger(__name__)

markets_router = APIRouter(prefix="/markets", tags=["markets"])


# ── Schemas ────────────────────────────────────────────────────────────


class CreateMarketRequest(BaseModel):
    city: str
    state: str
    median_home_price: float = 0
    median_rent: float = 0
    avg_days_on_market: int = 0
    inventory_count: int = 0
    price_change_pct: float = 0
    notes: Optional[str] = None


class UpdateMarketRequest(BaseModel):
    city: Optional[str] = None
    state: Optional[str] = None
    median_home_price: Optional[float] = None
    median_rent: Optional[float] = None
    avg_days_on_market: Optional[int] = None
    inventory_count: Optional[int] = None
    price_change_pct: Optional[float] = None
    notes: Optional[str] = None


class MarketResponse(BaseModel):
    id: str
    city: str
    state: str
    median_home_price: float
    median_rent: float
    avg_days_on_market: int
    inventory_count: int
    price_change_pct: float
    notes: Optional[str]
    rent_to_price_ratio: float
    created_at: str
    updated_at: Optional[str]


# ── Helper functions ────────────────────────────────────────────────────


def _market_to_response(market: SavedMarket) -> MarketResponse:
    """Convert a SavedMarket model to a response dict with computed fields."""
    # Compute rent_to_price_ratio (monthly rent / price)
    rent_to_price_ratio = 0.0
    if market.median_home_price and market.median_home_price > 0:
        rent_to_price_ratio = (market.median_rent / market.median_home_price) * 100

    return MarketResponse(
        id=market.id,
        city=market.city,
        state=market.state,
        median_home_price=market.median_home_price,
        median_rent=market.median_rent,
        avg_days_on_market=market.avg_days_on_market,
        inventory_count=market.inventory_count,
        price_change_pct=market.price_change_pct,
        notes=market.notes,
        rent_to_price_ratio=rent_to_price_ratio,
        created_at=market.created_at.isoformat() if market.created_at else None,
        updated_at=market.updated_at.isoformat() if market.updated_at else None,
    )


# ── User Endpoints ────────────────────────────────────────────────────


@markets_router.get("")
async def list_markets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all saved markets for the current user."""
    query = select(SavedMarket).where(SavedMarket.user_id == user.id)
    query = query.order_by(SavedMarket.created_at.desc())

    result = await db.execute(query)
    markets = result.scalars().all()

    return [_market_to_response(m) for m in markets]


@markets_router.post("")
async def create_market(
    body: CreateMarketRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new saved market."""
    # Validate that city and state are provided
    if not body.city or not body.state:
        raise HTTPException(
            status_code=400,
            detail="City and state are required",
        )

    # Create the market
    market = SavedMarket(
        user_id=user.id,
        city=body.city,
        state=body.state,
        median_home_price=body.median_home_price,
        median_rent=body.median_rent,
        avg_days_on_market=body.avg_days_on_market,
        inventory_count=body.inventory_count,
        price_change_pct=body.price_change_pct,
        notes=body.notes,
    )
    db.add(market)
    await db.commit()
    await db.refresh(market)

    logger.info(f"Market created: {market.id[:8]} ({market.city}, {market.state}) by user {user.id}")

    return _market_to_response(market)


@markets_router.get("/{market_id}")
async def get_market(
    market_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get details of a specific market."""
    result = await db.execute(
        select(SavedMarket).where(
            and_(
                SavedMarket.id == market_id,
                SavedMarket.user_id == user.id,
            )
        )
    )
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    return _market_to_response(market)


@markets_router.patch("/{market_id}")
async def update_market(
    market_id: str,
    body: UpdateMarketRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update market data."""
    result = await db.execute(
        select(SavedMarket).where(
            and_(
                SavedMarket.id == market_id,
                SavedMarket.user_id == user.id,
            )
        )
    )
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    # Update fields if provided
    if body.city is not None:
        market.city = body.city
    if body.state is not None:
        market.state = body.state
    if body.median_home_price is not None:
        market.median_home_price = body.median_home_price
    if body.median_rent is not None:
        market.median_rent = body.median_rent
    if body.avg_days_on_market is not None:
        market.avg_days_on_market = body.avg_days_on_market
    if body.inventory_count is not None:
        market.inventory_count = body.inventory_count
    if body.price_change_pct is not None:
        market.price_change_pct = body.price_change_pct
    if body.notes is not None:
        market.notes = body.notes

    market.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(market)

    logger.info(f"Market updated: {market.id[:8]} ({market.city}, {market.state}) by user {user.id}")

    return _market_to_response(market)


@markets_router.delete("/{market_id}")
async def delete_market(
    market_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved market."""
    result = await db.execute(
        select(SavedMarket).where(
            and_(
                SavedMarket.id == market_id,
                SavedMarket.user_id == user.id,
            )
        )
    )
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    await db.delete(market)
    await db.commit()

    logger.info(f"Market deleted: {market_id[:8]} ({market.city}, {market.state}) by user {user.id}")

    return {
        "id": market_id,
        "message": "Market deleted successfully",
    }
