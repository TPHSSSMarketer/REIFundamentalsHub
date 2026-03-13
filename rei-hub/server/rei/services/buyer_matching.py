"""Buyer matching service — find buyers whose criteria match a deal."""

from __future__ import annotations

import json
import logging
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.crm import BuyerCriteria, CrmContact, CrmDeal, MarketZipCode

logger = logging.getLogger(__name__)


class MatchedBuyer(NamedTuple):
    contact_id: str
    name: str
    email: str
    buying_entity: str | None


async def match_buyers_for_deal(
    deal: CrmDeal,
    user_id: int,
    db: AsyncSession,
) -> list[MatchedBuyer]:
    """Find all active buyers whose criteria match the given deal.
    
    Matching rules (all optional — a criteria only needs to match on
    the fields the buyer has actually filled in):
    
    1. Property type: deal.property_type in buyer's property_types_json
    2. Market/location: deal.city or deal.state in buyer's markets_json (case-insensitive)
    3. Budget: deal.purchase_price (or asking_price) <= buyer's max_budget
              and >= buyer's min_budget (if set)
    4. Condition: deal.property_condition in buyer's conditions_accepted_json
    """
    # Get all active buyer criteria for this user
    result = await db.execute(
        select(BuyerCriteria).where(
            BuyerCriteria.user_id == user_id,
            BuyerCriteria.is_active == True,
        )
    )
    all_criteria = result.scalars().all()
    
    if not all_criteria:
        logger.info("No active buyer criteria found for user %s", user_id)
        return []
    
    # Deal attributes for matching
    deal_property_type = (deal.property_type or "").lower().strip()
    deal_city = (deal.city or "").lower().strip()
    deal_state = (deal.state or "").lower().strip()
    deal_zip = (deal.zip or "").strip()
    deal_price = deal.purchase_price or deal.asking_price or deal.offer_price or 0
    deal_condition = (getattr(deal, 'property_condition', None) or "").lower().strip()

    # Resolve zip code to market name via cached HUD data
    deal_market = ""
    if deal_zip:
        zip_result = await db.execute(
            select(MarketZipCode).where(MarketZipCode.zip_code == deal_zip)
        )
        zip_entry = zip_result.scalar_one_or_none()
        if zip_entry:
            deal_market = zip_entry.market_name.lower().strip()

    matched_contact_ids: list[str] = []

    for bc in all_criteria:
        # Parse JSON arrays
        _pt = bc.property_types_json if isinstance(bc.property_types_json, list) else json.loads(bc.property_types_json or "[]")
        prop_types = [t.lower().strip() for t in _pt]
        _mk = bc.markets_json if isinstance(bc.markets_json, list) else json.loads(bc.markets_json or "[]")
        markets = [m.lower().strip() for m in _mk]
        _ca = bc.conditions_accepted_json if isinstance(bc.conditions_accepted_json, list) else json.loads(bc.conditions_accepted_json or "[]")
        conditions = [c.lower().strip() for c in _ca]

        # Check each criteria dimension (skip if buyer hasn't specified)

        # 1. Property type match
        if prop_types and deal_property_type:
            if deal_property_type not in prop_types and "any" not in prop_types:
                continue

        # 2. Market/location match — check city, state, AND zip-to-market name
        if markets:
            location_match = False
            for market in markets:
                if market in deal_city or market in deal_state or deal_city in market or deal_state in market:
                    location_match = True
                    break
                # Also match against the HUD market name (metro area)
                if deal_market and (market in deal_market or deal_market in market):
                    location_match = True
                    break
            if not location_match:
                continue
        
        # 3. Budget match
        if bc.max_budget and deal_price > 0:
            if deal_price > bc.max_budget:
                continue
        if bc.min_budget and deal_price > 0:
            if deal_price < bc.min_budget:
                continue
        
        # 4. Condition match
        if conditions and deal_condition:
            if deal_condition not in conditions and "any" not in conditions:
                continue
        
        # All checks passed — this buyer is a match
        matched_contact_ids.append(bc.buyer_contact_id)
    
    if not matched_contact_ids:
        logger.info("No buyer criteria matched deal %s", deal.id)
        return []
    
    # Fetch contact details for matched buyers
    result = await db.execute(
        select(CrmContact).where(
            CrmContact.id.in_(matched_contact_ids),
            CrmContact.is_deleted == False,
        )
    )
    contacts = result.scalars().all()
    
    matched: list[MatchedBuyer] = []
    for c in contacts:
        if c.email:  # Only include buyers with email addresses
            matched.append(MatchedBuyer(
                contact_id=c.id,
                name=c.name or "",
                email=c.email,
                buying_entity=c.buying_entity,
            ))
    
    logger.info(
        "Matched %d buyers (with email) for deal %s out of %d criteria checked",
        len(matched), deal.id, len(all_criteria),
    )
    return matched
