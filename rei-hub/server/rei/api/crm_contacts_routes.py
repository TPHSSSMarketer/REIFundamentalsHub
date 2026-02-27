"""CRM Contacts CRUD — each subscriber's contact list."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.models.crm import CrmContact
from rei.models.user import User

logger = logging.getLogger(__name__)

crm_contacts_router = APIRouter(prefix="/crm/contacts", tags=["crm-contacts"])


# ── Pydantic Schemas ────────────────────────────────────────


class CreateContactBody(BaseModel):
    name: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    role: Optional[str] = "seller"
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[list[str]] = None
    markets: Optional[list[str]] = None
    source: Optional[str] = None
    preferredChannel: Optional[str] = None
    notes: Optional[str] = None
    rating: Optional[float] = None


class UpdateContactBody(BaseModel):
    name: Optional[str] = None
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    role: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    tags: Optional[list[str]] = None
    markets: Optional[list[str]] = None
    source: Optional[str] = None
    preferredChannel: Optional[str] = None
    notes: Optional[str] = None
    rating: Optional[float] = None
    interactionCount: Optional[int] = None
    lastContactedAt: Optional[str] = None


# ── Helpers ─────────────────────────────────────────────────


def _contact_to_dict(c: CrmContact) -> dict:
    return {
        "id": c.id,
        "name": c.name or "",
        "firstName": c.first_name,
        "lastName": c.last_name,
        "role": c.role or "seller",
        "company": c.company,
        "phone": c.phone,
        "email": c.email,
        "tags": json.loads(c.tags_json) if c.tags_json else [],
        "markets": json.loads(c.markets_json) if c.markets_json else [],
        "source": c.source,
        "preferredChannel": c.preferred_channel,
        "notes": c.notes,
        "rating": c.rating,
        "lastContactedAt": c.last_contacted_at.isoformat() if c.last_contacted_at else None,
        "interactionCount": c.interaction_count or 0,
        "dateAdded": c.date_added.isoformat() if c.date_added else None,
        "lastActivity": c.last_activity.isoformat() if c.last_activity else None,
    }


def _build_name(body: CreateContactBody | UpdateContactBody) -> str | None:
    """Build full name from first/last if name not provided."""
    if body.name:
        return body.name
    parts = []
    if body.firstName:
        parts.append(body.firstName)
    if body.lastName:
        parts.append(body.lastName)
    return " ".join(parts) if parts else None


# ── Endpoints ───────────────────────────────────────────────


@crm_contacts_router.get("")
async def list_contacts(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all contacts for the current subscriber."""
    result = await db.execute(
        select(CrmContact)
        .where(CrmContact.user_id == user.id, CrmContact.is_deleted == False)
        .order_by(CrmContact.created_at.desc())
    )
    contacts = result.scalars().all()
    return [_contact_to_dict(c) for c in contacts]


@crm_contacts_router.get("/{contact_id}")
async def get_contact(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single contact by ID."""
    result = await db.execute(
        select(CrmContact).where(
            CrmContact.id == contact_id,
            CrmContact.user_id == user.id,
            CrmContact.is_deleted == False,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return _contact_to_dict(contact)


@crm_contacts_router.post("", status_code=status.HTTP_201_CREATED)
async def create_contact(
    body: CreateContactBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new contact."""
    now = datetime.utcnow()
    name = _build_name(body) or ""

    contact = CrmContact(
        user_id=user.id,
        name=name,
        first_name=body.firstName,
        last_name=body.lastName,
        role=body.role or "seller",
        company=body.company,
        phone=body.phone,
        email=body.email,
        tags_json=json.dumps(body.tags or []),
        markets_json=json.dumps(body.markets or []),
        source=body.source,
        preferred_channel=body.preferredChannel,
        notes=body.notes,
        rating=body.rating,
        interaction_count=0,
        date_added=now,
        last_activity=now,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)
    return _contact_to_dict(contact)


@crm_contacts_router.patch("/{contact_id}")
async def update_contact(
    contact_id: str,
    body: UpdateContactBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing contact."""
    result = await db.execute(
        select(CrmContact).where(
            CrmContact.id == contact_id,
            CrmContact.user_id == user.id,
            CrmContact.is_deleted == False,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Apply updates for any non-None fields
    updates = body.model_dump(exclude_none=True)
    field_map = {
        "name": "name",
        "firstName": "first_name",
        "lastName": "last_name",
        "role": "role",
        "company": "company",
        "phone": "phone",
        "email": "email",
        "source": "source",
        "preferredChannel": "preferred_channel",
        "notes": "notes",
        "rating": "rating",
        "interactionCount": "interaction_count",
    }

    for js_key, db_col in field_map.items():
        if js_key in updates:
            setattr(contact, db_col, updates[js_key])

    if "tags" in updates:
        contact.tags_json = json.dumps(updates["tags"])
    if "markets" in updates:
        contact.markets_json = json.dumps(updates["markets"])
    if "lastContactedAt" in updates:
        try:
            contact.last_contacted_at = datetime.fromisoformat(updates["lastContactedAt"])
        except (ValueError, TypeError):
            pass

    # Build name if first/last changed
    new_name = _build_name(body)
    if new_name:
        contact.name = new_name

    contact.last_activity = datetime.utcnow()
    await db.commit()
    await db.refresh(contact)
    return _contact_to_dict(contact)


@crm_contacts_router.delete("/{contact_id}")
async def delete_contact(
    contact_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a contact."""
    result = await db.execute(
        select(CrmContact).where(
            CrmContact.id == contact_id,
            CrmContact.user_id == user.id,
        )
    )
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    contact.is_deleted = True
    await db.commit()
    return {"detail": "Contact deleted"}
