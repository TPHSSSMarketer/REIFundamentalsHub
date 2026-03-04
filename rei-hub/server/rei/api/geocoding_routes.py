"""Geocoding API Routes — Convert addresses to coordinates.

Provides a geocoding endpoint and auto-geocoding for deals, markets,
and portfolio properties.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.crm import CrmDeal, CrmPortfolioProperty
from rei.models.user import SavedMarket, User
from rei.services.geocoding_service import geocode_address, geocode_city_state

logger = logging.getLogger(__name__)

geocoding_router = APIRouter(prefix="/geocoding", tags=["geocoding"])


# ── Schemas ──────────────────────────────────────────────────────────────


class GeocodeRequest(BaseModel):
    address: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""


class GeocodeResponse(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    source: Optional[str] = None
    success: bool = False


# ── Endpoints ────────────────────────────────────────────────────────────


@geocoding_router.post("/geocode", response_model=GeocodeResponse)
async def geocode(
    body: GeocodeRequest,
    user: User = Depends(get_current_user),
):
    """Geocode any address to lat/lng coordinates."""
    result = await geocode_address(
        address=body.address,
        city=body.city,
        state=body.state,
        zip_code=body.zip_code,
    )
    if result:
        return GeocodeResponse(
            latitude=result["latitude"],
            longitude=result["longitude"],
            source=result["source"],
            success=True,
        )
    return GeocodeResponse(success=False)


@geocoding_router.post("/market/{market_id}")
async def geocode_market(
    market_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Auto-geocode a saved market by its city + state."""
    result = await db.execute(
        select(SavedMarket).where(
            SavedMarket.id == market_id,
            SavedMarket.user_id == user.id,
        )
    )
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    coords = await geocode_city_state(market.city, market.state)
    if coords:
        market.latitude = coords["latitude"]
        market.longitude = coords["longitude"]
        await db.commit()
        return {
            "id": market.id,
            "latitude": coords["latitude"],
            "longitude": coords["longitude"],
            "source": coords["source"],
        }
    return {"id": market.id, "latitude": None, "longitude": None, "source": None}


@geocoding_router.post("/deal/{deal_id}")
async def geocode_deal(
    deal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Auto-geocode a deal by its address."""
    result = await db.execute(
        select(CrmDeal).where(
            CrmDeal.id == deal_id,
            CrmDeal.user_id == user.id,
        )
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    coords = await geocode_address(
        address=deal.address or "",
        city=deal.city or "",
        state=deal.state or "",
        zip_code=deal.zip or "",
    )
    if coords:
        deal.latitude = coords["latitude"]
        deal.longitude = coords["longitude"]
        await db.commit()
        return {
            "id": deal.id,
            "latitude": coords["latitude"],
            "longitude": coords["longitude"],
            "source": coords["source"],
        }
    return {"id": deal.id, "latitude": None, "longitude": None, "source": None}


@geocoding_router.post("/property/{property_id}")
async def geocode_property(
    property_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Auto-geocode a portfolio property by its address."""
    result = await db.execute(
        select(CrmPortfolioProperty).where(
            CrmPortfolioProperty.id == property_id,
            CrmPortfolioProperty.user_id == user.id,
        )
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    coords = await geocode_address(
        address=prop.address or "",
        city=prop.city or "",
        state=prop.state or "",
        zip_code=prop.zip or "",
    )
    if coords:
        prop.latitude = coords["latitude"]
        prop.longitude = coords["longitude"]
        await db.commit()
        return {
            "id": prop.id,
            "latitude": coords["latitude"],
            "longitude": coords["longitude"],
            "source": coords["source"],
        }
    return {"id": prop.id, "latitude": None, "longitude": None, "source": None}


@geocoding_router.post("/batch/markets")
async def batch_geocode_markets(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Geocode all markets that don't have coordinates yet."""
    result = await db.execute(
        select(SavedMarket).where(
            SavedMarket.user_id == user.id,
            SavedMarket.latitude.is_(None),
        )
    )
    markets = result.scalars().all()

    geocoded = 0
    for market in markets:
        coords = await geocode_city_state(market.city, market.state)
        if coords:
            market.latitude = coords["latitude"]
            market.longitude = coords["longitude"]
            geocoded += 1

    if geocoded > 0:
        await db.commit()

    return {"total": len(markets), "geocoded": geocoded}
