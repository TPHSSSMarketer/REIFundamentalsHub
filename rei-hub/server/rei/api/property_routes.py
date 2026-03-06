"""Property data routes — standalone ATTOM property lookup for form auto-populate."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.services.attom_property_service import lookup_property_data

property_router = APIRouter(tags=["property"])


class PropertyLookupRequest(BaseModel):
    address: str
    city: str
    state: str
    zip: str = ""


@property_router.post("/property/lookup")
async def lookup_property(
    body: PropertyLookupRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Look up property data from ATTOM for form auto-population.

    Returns mapped fields matching the deal form field names.
    Returns empty dict if ATTOM key is not configured or property not found.
    """
    try:
        raw = await lookup_property_data(
            address=body.address,
            city=body.city,
            state=body.state,
            zip_code=body.zip,
            db=db,
        )
    except Exception:
        return {}

    if not raw:
        return {}

    # Map ATTOM fields to form field names
    detail = raw.get("property_detail", {})
    tax = raw.get("tax_assessment", {})

    mapped = {}

    if detail.get("property_type"):
        mapped["property_type"] = str(detail["property_type"])
    if detail.get("bedrooms"):
        mapped["bedrooms"] = str(detail["bedrooms"])
    if detail.get("bathrooms"):
        mapped["bathrooms"] = str(detail["bathrooms"])
    if detail.get("square_footage"):
        mapped["square_footage"] = str(detail["square_footage"])
    if detail.get("year_built"):
        mapped["year_built"] = str(detail["year_built"])
    if detail.get("lot_size_acres"):
        mapped["lot_size"] = str(detail["lot_size_acres"])
    if tax.get("tax_amount"):
        mapped["property_tax_annual"] = str(tax["tax_amount"])

    # Also include raw ATTOM data for reference
    mapped["_attom_raw"] = raw

    return mapped
