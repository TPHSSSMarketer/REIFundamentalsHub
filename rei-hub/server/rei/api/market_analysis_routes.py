"""Market Analysis API Routes — Combined demographics, crime, jobs, and weather data.

Fetches data from multiple free APIs in parallel and returns a combined
market analysis response. Each sub-service fails gracefully — partial
data is returned if some APIs are unavailable.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.user import SavedMarket, User
from rei.services.weather_service import get_current_weather, get_5day_forecast
from rei.services.census_service import get_demographics
from rei.services.crime_service import get_crime_stats
from rei.services.jobs_service import get_job_market

logger = logging.getLogger(__name__)

market_analysis_router = APIRouter(prefix="/market-analysis", tags=["market-analysis"])


# ── Response Schemas ─────────────────────────────────────────────────


class WeatherData(BaseModel):
    temperature_f: Optional[float] = None
    feels_like_f: Optional[float] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    humidity: Optional[int] = None
    wind_speed_mph: Optional[float] = None


class DemographicsData(BaseModel):
    population: Optional[int] = None
    median_household_income: Optional[int] = None
    median_home_value: Optional[int] = None
    total_housing_units: Optional[int] = None
    owner_occupied_percent: Optional[float] = None
    poverty_rate: Optional[float] = None
    median_age: Optional[float] = None
    source: Optional[str] = None


class CrimeData(BaseModel):
    violent_crime: Optional[int] = None
    property_crime: Optional[int] = None
    murder: Optional[int] = None
    robbery: Optional[int] = None
    aggravated_assault: Optional[int] = None
    burglary: Optional[int] = None
    larceny: Optional[int] = None
    motor_vehicle_theft: Optional[int] = None
    violent_crime_rate: Optional[float] = None
    property_crime_rate: Optional[float] = None
    year: Optional[int] = None
    source: Optional[str] = None


class JobsData(BaseModel):
    total_jobs: Optional[int] = None
    average_salary: Optional[float] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    top_categories: Optional[list[str]] = None
    sample_jobs: Optional[list[dict]] = None
    source: Optional[str] = None


class MarketAnalysisResponse(BaseModel):
    market_id: str
    city: str
    state: str
    weather: Optional[WeatherData] = None
    demographics: Optional[DemographicsData] = None
    crime: Optional[CrimeData] = None
    jobs: Optional[JobsData] = None


# ── Endpoints ────────────────────────────────────────────────────────


@market_analysis_router.get("/{market_id}", response_model=MarketAnalysisResponse)
async def get_market_analysis(
    market_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get comprehensive market analysis — demographics, crime, jobs, and weather.

    Calls all 4 data sources in parallel. Each service fails gracefully;
    partial data is returned if some APIs are unavailable.
    """
    result = await db.execute(
        select(SavedMarket).where(
            SavedMarket.id == market_id,
            SavedMarket.user_id == user.id,
        )
    )
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    # Run all API calls in parallel
    weather_task = _safe_call(
        get_current_weather(market.latitude, market.longitude, db=db)
        if market.latitude and market.longitude
        else _noop()
    )
    demographics_task = _safe_call(get_demographics(market.state, db=db))
    crime_task = _safe_call(get_crime_stats(market.state, db=db))
    jobs_task = _safe_call(get_job_market(market.city, market.state, db=db))

    weather_data, demo_data, crime_data, jobs_data = await asyncio.gather(
        weather_task, demographics_task, crime_task, jobs_task
    )

    return MarketAnalysisResponse(
        market_id=market.id,
        city=market.city,
        state=market.state,
        weather=WeatherData(**weather_data) if weather_data else None,
        demographics=DemographicsData(**demo_data) if demo_data else None,
        crime=CrimeData(**crime_data) if crime_data else None,
        jobs=JobsData(**jobs_data) if jobs_data else None,
    )


@market_analysis_router.get("/{market_id}/weather")
async def get_market_weather(
    market_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get just weather data for a market (for the mini-widget on market cards)."""
    result = await db.execute(
        select(SavedMarket).where(
            SavedMarket.id == market_id,
            SavedMarket.user_id == user.id,
        )
    )
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    if not market.latitude or not market.longitude:
        return {"weather": None, "message": "Market has no coordinates. Geocode it first."}

    weather = await get_current_weather(market.latitude, market.longitude, db=db)
    return {"weather": weather}


@market_analysis_router.get("/{market_id}/demographics")
async def get_market_demographics(
    market_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get just demographics data for a market."""
    result = await db.execute(
        select(SavedMarket).where(
            SavedMarket.id == market_id,
            SavedMarket.user_id == user.id,
        )
    )
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    demographics = await get_demographics(market.state, db=db)
    return {"demographics": demographics}


@market_analysis_router.get("/{market_id}/crime")
async def get_market_crime(
    market_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get just crime statistics for a market."""
    result = await db.execute(
        select(SavedMarket).where(
            SavedMarket.id == market_id,
            SavedMarket.user_id == user.id,
        )
    )
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    crime = await get_crime_stats(market.state, db=db)
    return {"crime": crime}


@market_analysis_router.get("/{market_id}/jobs")
async def get_market_jobs(
    market_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get just job market data for a market."""
    result = await db.execute(
        select(SavedMarket).where(
            SavedMarket.id == market_id,
            SavedMarket.user_id == user.id,
        )
    )
    market = result.scalar_one_or_none()
    if not market:
        raise HTTPException(status_code=404, detail="Market not found")

    jobs = await get_job_market(market.city, market.state, db=db)
    return {"jobs": jobs}


# ── Helpers ──────────────────────────────────────────────────────────


async def _safe_call(coro):
    """Wrap an async call to return None on any exception."""
    try:
        return await coro
    except Exception as e:
        logger.warning("Market analysis sub-service failed: %s", e)
        return None


async def _noop():
    """No-op coroutine for when a service can't run (e.g. missing coordinates)."""
    return None
