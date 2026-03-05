"""CRM Buyer Criteria CRUD — buyer investment preferences for deal matching."""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.models.crm import BuyerCriteria, CrmContact
from rei.models.user import User

logger = logging.getLogger(__name__)

crm_buyer_criteria_router = APIRouter(prefix="/crm/buyer-criteria", tags=["crm-buyer-criteria"])


# ── Pydantic Schemas ────────────────────────────────────────


class BuyerCriteriaBody(BaseModel):
    propertyTypes: Optional[list[str]] = None
    markets: Optional[list[str]] = None
    conditionsAccepted: Optional[list[str]] = None
    financingTypes: Optional[list[str]] = None
    minBudget: Optional[float] = None
    maxBudget: Optional[float] = None
    timelineToPurchase: Optional[str] = None
    isActive: Optional[bool] = True


# ── Helpers ─────────────────────────────────────────────────


def _criteria_to_dict(bc: BuyerCriteria) -> dict:
    return {
        "id": bc.id,
        "buyerContactId": bc.buyer_contact_id,
        "propertyTypes": json.loads(bc.property_types_json) if bc.property_types_json else [],
        "markets": json.loads(bc.markets_json) if bc.markets_json else [],
        "conditionsAccepted": json.loads(bc.conditions_accepted_json) if bc.conditions_accepted_json else [],
        "financingTypes": json.loads(bc.financing_types_json) if bc.financing_types_json else [],
        "minBudget": bc.min_budget,
        "maxBudget": bc.max_budget,
        "timelineToPurchase": bc.timeline_to_purchase,
        "isActive": bc.is_active,
    }


# ── Endpoints ───────────────────────────────────────────────


@crm_buyer_criteria_router.get("/{buyer_contact_id}")
async def get_criteria(
    buyer_contact_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get buyer criteria for a specific contact."""
    result = await db.execute(
        select(BuyerCriteria).where(
            BuyerCriteria.buyer_contact_id == buyer_contact_id,
            BuyerCriteria.user_id == workspace_user_id(user),
        )
    )
    criteria = result.scalar_one_or_none()
    if not criteria:
        raise HTTPException(status_code=404, detail="Buyer criteria not found")
    return _criteria_to_dict(criteria)


@crm_buyer_criteria_router.post("", status_code=status.HTTP_201_CREATED)
async def create_criteria(
    body: BuyerCriteriaBody,
    buyerContactId: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create buyer criteria for a contact."""
    # Verify the contact exists and belongs to the user
    result = await db.execute(
        select(CrmContact).where(
            CrmContact.id == buyerContactId,
            CrmContact.user_id == workspace_user_id(user),
            CrmContact.is_deleted == False,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    criteria = BuyerCriteria(
        user_id=workspace_user_id(user),
        buyer_contact_id=buyerContactId,
        property_types_json=json.dumps(body.propertyTypes or []),
        markets_json=json.dumps(body.markets or []),
        conditions_accepted_json=json.dumps(body.conditionsAccepted or []),
        financing_types_json=json.dumps(body.financingTypes or []),
        min_budget=body.minBudget,
        max_budget=body.maxBudget,
        timeline_to_purchase=body.timelineToPurchase,
        is_active=body.isActive if body.isActive is not None else True,
    )
    db.add(criteria)
    await db.commit()
    await db.refresh(criteria)
    return _criteria_to_dict(criteria)


@crm_buyer_criteria_router.patch("/{buyer_contact_id}")
async def update_criteria(
    buyer_contact_id: str,
    body: BuyerCriteriaBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update buyer criteria for a contact."""
    result = await db.execute(
        select(BuyerCriteria).where(
            BuyerCriteria.buyer_contact_id == buyer_contact_id,
            BuyerCriteria.user_id == workspace_user_id(user),
        )
    )
    criteria = result.scalar_one_or_none()
    if not criteria:
        raise HTTPException(status_code=404, detail="Buyer criteria not found")

    # Apply updates for any non-None fields
    updates = body.model_dump(exclude_none=True)

    if "propertyTypes" in updates:
        criteria.property_types_json = json.dumps(updates["propertyTypes"])
    if "markets" in updates:
        criteria.markets_json = json.dumps(updates["markets"])
    if "conditionsAccepted" in updates:
        criteria.conditions_accepted_json = json.dumps(updates["conditionsAccepted"])
    if "financingTypes" in updates:
        criteria.financing_types_json = json.dumps(updates["financingTypes"])
    if "minBudget" in updates:
        criteria.min_budget = updates["minBudget"]
    if "maxBudget" in updates:
        criteria.max_budget = updates["maxBudget"]
    if "timelineToPurchase" in updates:
        criteria.timeline_to_purchase = updates["timelineToPurchase"]
    if "isActive" in updates:
        criteria.is_active = updates["isActive"]

    await db.commit()
    await db.refresh(criteria)
    return _criteria_to_dict(criteria)


@crm_buyer_criteria_router.delete("/{buyer_contact_id}")
async def delete_criteria(
    buyer_contact_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hard-delete buyer criteria for a contact."""
    result = await db.execute(
        select(BuyerCriteria).where(
            BuyerCriteria.buyer_contact_id == buyer_contact_id,
            BuyerCriteria.user_id == workspace_user_id(user),
        )
    )
    criteria = result.scalar_one_or_none()
    if not criteria:
        raise HTTPException(status_code=404, detail="Buyer criteria not found")

    await db.delete(criteria)
    await db.commit()
    return {"detail": "Buyer criteria deleted"}
