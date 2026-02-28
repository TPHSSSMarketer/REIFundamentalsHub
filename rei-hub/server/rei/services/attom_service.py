"""ATTOM Data API Service — Pull real estate market data for cities.

Uses the ATTOM property data API to fetch:
- Median home prices
- Median rents
- Average days on market
- Inventory counts
- Price change trends

Docs: https://api.gateway.attomdata.com/propertyapi/v1.0.0/
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from rei.config import get_settings

logger = logging.getLogger(__name__)

ATTOM_BASE = "https://api.gateway.attomdata.com/propertyapi/v1.0.0"


async def lookup_market_data(city: str, state: str) -> dict:
    """Fetch market snapshot data from ATTOM for a city + state.

    Returns a dict with:
        median_home_price, median_rent, avg_days_on_market,
        inventory_count, price_change_pct

    Falls back to zeros for any field that can't be retrieved.
    """
    settings = get_settings()
    api_key = settings.attom_api_key

    if not api_key:
        logger.warning("ATTOM API key not configured — returning empty market data")
        return _empty_result()

    headers = {
        "apikey": api_key,
        "Accept": "application/json",
    }

    result = _empty_result()

    async with httpx.AsyncClient(timeout=30, headers=headers) as client:
        # ── 1. Community snapshot (home prices, inventory) ──
        try:
            resp = await client.get(
                f"{ATTOM_BASE}/area/full",
                params={
                    "address1": f"{city}, {state}",
                    "searchtype": "city",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                _parse_area_data(data, result)
            else:
                logger.warning(
                    "ATTOM area/full returned %s for %s, %s: %s",
                    resp.status_code, city, state, resp.text[:200],
                )
        except Exception as e:
            logger.warning("ATTOM area/full failed for %s, %s: %s", city, state, e)

        # ── 2. Sale trends (price changes, days on market) ──
        try:
            resp = await client.get(
                f"{ATTOM_BASE}/sale/snapshot",
                params={
                    "address1": f"{city}, {state}",
                    "searchtype": "city",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                _parse_sale_data(data, result)
            else:
                logger.warning(
                    "ATTOM sale/snapshot returned %s for %s, %s",
                    resp.status_code, city, state,
                )
        except Exception as e:
            logger.warning("ATTOM sale/snapshot failed for %s, %s: %s", city, state, e)

    logger.info(
        "ATTOM lookup complete for %s, %s: price=%s rent=%s dom=%s inv=%s pct=%s",
        city, state,
        result["median_home_price"],
        result["median_rent"],
        result["avg_days_on_market"],
        result["inventory_count"],
        result["price_change_pct"],
    )

    return result


async def refresh_all_markets(db_session) -> int:
    """Refresh ATTOM data for all saved markets across all users.

    Called by a scheduled background task (e.g., daily cron).
    Returns the number of markets updated.
    """
    from sqlalchemy import select
    from rei.models.user import SavedMarket

    result = await db_session.execute(select(SavedMarket))
    markets = result.scalars().all()

    updated = 0
    for market in markets:
        try:
            data = await lookup_market_data(market.city, market.state)

            # Only update fields that ATTOM returned non-zero values for
            if data["median_home_price"] > 0:
                market.median_home_price = data["median_home_price"]
            if data["median_rent"] > 0:
                market.median_rent = data["median_rent"]
            if data["avg_days_on_market"] > 0:
                market.avg_days_on_market = data["avg_days_on_market"]
            if data["inventory_count"] > 0:
                market.inventory_count = data["inventory_count"]
            if data["price_change_pct"] != 0:
                market.price_change_pct = data["price_change_pct"]

            from datetime import datetime
            market.updated_at = datetime.utcnow()
            updated += 1
        except Exception as e:
            logger.error("Failed to refresh market %s (%s, %s): %s",
                         market.id[:8], market.city, market.state, e)

    await db_session.commit()
    logger.info("ATTOM daily refresh complete: %d/%d markets updated", updated, len(markets))
    return updated


# ── Internal Parsing ────────────────────────────────────────────────────


def _empty_result() -> dict:
    return {
        "median_home_price": 0.0,
        "median_rent": 0.0,
        "avg_days_on_market": 0,
        "inventory_count": 0,
        "price_change_pct": 0.0,
    }


def _safe_float(val, default: float = 0.0) -> float:
    try:
        return float(val) if val is not None else default
    except (ValueError, TypeError):
        return default


def _safe_int(val, default: int = 0) -> int:
    try:
        return int(float(val)) if val is not None else default
    except (ValueError, TypeError):
        return default


def _parse_area_data(data: dict, result: dict) -> None:
    """Extract median home price, rent, and inventory from ATTOM area response."""
    try:
        # Navigate through ATTOM response structure
        areas = data.get("area", [])
        if not areas:
            areas = data.get("property", [])
        if not areas and isinstance(data, dict):
            # Try flat structure
            areas = [data]

        for area in areas if isinstance(areas, list) else [areas]:
            # Home value
            avm = area.get("avm", {}) or {}
            if "amount" in avm and "value" in avm["amount"]:
                val = _safe_float(avm["amount"]["value"])
                if val > 0:
                    result["median_home_price"] = val

            # Try assessment
            assessment = area.get("assessment", {}) or {}
            if result["median_home_price"] == 0:
                market_val = _safe_float(assessment.get("assessed", {}).get("assdTtlValue"))
                if market_val > 0:
                    result["median_home_price"] = market_val

            # Rental estimate
            rental = area.get("rental", {}) or {}
            if "rentalestimate" in rental:
                rent_val = _safe_float(rental["rentalestimate"])
                if rent_val > 0:
                    result["median_rent"] = rent_val

            # Try building summary for inventory
            building = area.get("building", {}) or {}
            summary = building.get("summary", {}) or {}
            inventory = _safe_int(summary.get("propCount"))
            if inventory > 0:
                result["inventory_count"] = inventory

    except Exception as e:
        logger.warning("Failed to parse ATTOM area data: %s", e)


def _parse_sale_data(data: dict, result: dict) -> None:
    """Extract sale trends from ATTOM sale snapshot response."""
    try:
        sales = data.get("saletrend", [])
        if not sales:
            sales = data.get("property", [])
        if not sales and isinstance(data, dict):
            sales = [data]

        for sale in sales if isinstance(sales, list) else [sales]:
            # Average days on market
            dom = sale.get("sale", {}) or {}
            avg_dom = _safe_int(dom.get("averageDaysOnMarket"))
            if avg_dom > 0:
                result["avg_days_on_market"] = avg_dom

            # Price change percent
            price_trend = sale.get("saleTrend", {}) or {}
            pct = _safe_float(price_trend.get("medianSalePriceChange"))
            if pct != 0:
                result["price_change_pct"] = round(pct, 1)

            # Median sale price as fallback for home price
            median_price = _safe_float(
                dom.get("medianSalePrice") or price_trend.get("medianSalePrice")
            )
            if median_price > 0 and result["median_home_price"] == 0:
                result["median_home_price"] = median_price

            # Sale count as proxy for inventory
            sale_count = _safe_int(dom.get("saleCount") or price_trend.get("saleCount"))
            if sale_count > 0 and result["inventory_count"] == 0:
                result["inventory_count"] = sale_count

    except Exception as e:
        logger.warning("Failed to parse ATTOM sale data: %s", e)
