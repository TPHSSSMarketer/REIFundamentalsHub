"""CRM Portfolio Properties CRUD — each subscriber's property portfolio."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.crm import CrmPortfolioProperty, DealFile
from rei.models.user import User

logger = logging.getLogger(__name__)

crm_portfolio_router = APIRouter(prefix="/crm/portfolio", tags=["crm-portfolio"])


# ── Pydantic Schemas ────────────────────────────────────────


class CreatePortfolioBody(BaseModel):
    address: str = ""
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    propertyType: Optional[str] = "single_family"
    units: Optional[int] = 1
    purchaseDate: Optional[str] = None
    purchasePrice: Optional[float] = None
    rehabCost: Optional[float] = None
    currentValue: Optional[float] = None
    loanBalance: Optional[float] = None
    monthlyMortgage: Optional[float] = None
    monthlyRent: Optional[float] = None
    notes: Optional[str] = None
    sourceDealId: Optional[str] = None


class UpdatePortfolioBody(BaseModel):
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip: Optional[str] = None
    propertyType: Optional[str] = None
    units: Optional[int] = None
    purchaseDate: Optional[str] = None
    purchasePrice: Optional[float] = None
    rehabCost: Optional[float] = None
    currentValue: Optional[float] = None
    loanBalance: Optional[float] = None
    monthlyMortgage: Optional[float] = None
    monthlyRent: Optional[float] = None
    notes: Optional[str] = None


# ── Field Mapping ───────────────────────────────────────────

_FIELD_MAP: dict[str, str] = {
    "address": "address",
    "city": "city",
    "state": "state",
    "zip": "zip",
    "propertyType": "property_type",
    "units": "units",
    "purchasePrice": "purchase_price",
    "rehabCost": "rehab_cost",
    "currentValue": "current_value",
    "loanBalance": "loan_balance",
    "monthlyMortgage": "monthly_mortgage",
    "monthlyRent": "monthly_rent",
    "notes": "notes",
    "sourceDealId": "source_deal_id",
}


# ── Helpers ─────────────────────────────────────────────────


def _property_to_dict(p: CrmPortfolioProperty, thumbnail: str | None = None) -> dict:
    return {
        "id": p.id,
        "address": p.address or "",
        "city": p.city,
        "state": p.state,
        "zip": p.zip,
        "propertyType": p.property_type or "single_family",
        "units": p.units or 1,
        "purchaseDate": p.purchase_date.isoformat() if p.purchase_date else None,
        "purchasePrice": p.purchase_price,
        "rehabCost": p.rehab_cost,
        "currentValue": p.current_value,
        "loanBalance": p.loan_balance,
        "monthlyMortgage": p.monthly_mortgage,
        "monthlyRent": p.monthly_rent,
        "notes": p.notes,
        "sourceDealId": p.source_deal_id,
        "frontPhotoThumbnail": thumbnail,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
    }


# ── Endpoints ───────────────────────────────────────────────


@crm_portfolio_router.get("")
async def list_properties(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all portfolio properties for the current subscriber."""
    result = await db.execute(
        select(CrmPortfolioProperty)
        .where(CrmPortfolioProperty.user_id == user.id, CrmPortfolioProperty.is_deleted == False)
        .order_by(CrmPortfolioProperty.created_at.desc())
    )
    props = result.scalars().all()

    # Batch-fetch front photo thumbnails for properties linked to deals
    deal_ids = [p.source_deal_id for p in props if p.source_deal_id]
    front_thumbs: dict[str, str] = {}
    if deal_ids:
        thumb_result = await db.execute(
            select(DealFile.deal_id, DealFile.thumbnail)
            .where(
                DealFile.user_id == user.id,
                DealFile.deal_id.in_(deal_ids),
                DealFile.file_type == "photo",
                DealFile.category == "front",
                DealFile.thumbnail.isnot(None),
            )
            .order_by(DealFile.created_at.desc())
        )
        for row in thumb_result:
            if row.deal_id not in front_thumbs:
                front_thumbs[row.deal_id] = row.thumbnail

    return [
        _property_to_dict(p, front_thumbs.get(p.source_deal_id) if p.source_deal_id else None)
        for p in props
    ]


@crm_portfolio_router.get("/{property_id}")
async def get_property(
    property_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single portfolio property by ID."""
    result = await db.execute(
        select(CrmPortfolioProperty).where(
            CrmPortfolioProperty.id == property_id,
            CrmPortfolioProperty.user_id == user.id,
            CrmPortfolioProperty.is_deleted == False,
        )
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return _property_to_dict(prop)


@crm_portfolio_router.post("", status_code=status.HTTP_201_CREATED)
async def create_property(
    body: CreatePortfolioBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new portfolio property."""
    now = datetime.utcnow()

    prop = CrmPortfolioProperty(
        user_id=user.id,
        address=body.address,
        city=body.city,
        state=body.state,
        zip=body.zip,
        property_type=body.propertyType or "single_family",
        units=body.units or 1,
        purchase_price=body.purchasePrice,
        rehab_cost=body.rehabCost,
        current_value=body.currentValue,
        loan_balance=body.loanBalance,
        monthly_mortgage=body.monthlyMortgage,
        monthly_rent=body.monthlyRent,
        notes=body.notes,
        source_deal_id=body.sourceDealId,
        created_at=now,
        updated_at=now,
    )

    # Parse purchase date
    if body.purchaseDate:
        try:
            prop.purchase_date = datetime.fromisoformat(body.purchaseDate)
        except (ValueError, TypeError):
            pass

    db.add(prop)
    await db.commit()
    await db.refresh(prop)
    return _property_to_dict(prop)


@crm_portfolio_router.patch("/{property_id}")
async def update_property(
    property_id: str,
    body: UpdatePortfolioBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing portfolio property."""
    result = await db.execute(
        select(CrmPortfolioProperty).where(
            CrmPortfolioProperty.id == property_id,
            CrmPortfolioProperty.user_id == user.id,
            CrmPortfolioProperty.is_deleted == False,
        )
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    updates = body.model_dump(exclude_none=True)
    for js_key, db_col in _FIELD_MAP.items():
        if js_key in updates:
            setattr(prop, db_col, updates[js_key])

    if "purchaseDate" in updates:
        try:
            prop.purchase_date = datetime.fromisoformat(updates["purchaseDate"])
        except (ValueError, TypeError):
            pass

    prop.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(prop)
    return _property_to_dict(prop)


@crm_portfolio_router.delete("/{property_id}")
async def delete_property(
    property_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a portfolio property."""
    result = await db.execute(
        select(CrmPortfolioProperty).where(
            CrmPortfolioProperty.id == property_id,
            CrmPortfolioProperty.user_id == user.id,
        )
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    prop.is_deleted = True
    await db.commit()
    return {"detail": "Property deleted"}
