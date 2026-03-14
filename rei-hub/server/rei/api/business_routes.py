"""Multi-business management API routes.

Provides CRUD operations for businesses, WordPress sites, audience segments,
content types, and module settings. Includes ownership validation to ensure
users can only access their own businesses.
"""

from __future__ import annotations

import logging
from typing import Optional, List
from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from rei.api.deps import get_db, get_current_user, workspace_user_id
from rei.models.user import User
from rei.models.business import (
    Business, BusinessWordPressSite, BusinessSocialConnection,
    AudienceSegment, ContentType, ModuleBusinessSetting,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["businesses"])


# ── Schemas ───────────────────────────────────────────────────────────────


class CreateBusinessRequest(BaseModel):
    name: str
    description: Optional[str] = None
    mission_statement: Optional[str] = None


class UpdateBusinessRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    mission_statement: Optional[str] = None
    is_primary: Optional[bool] = None


class BusinessResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    mission_statement: Optional[str]
    is_active: bool
    is_primary: bool
    created_at: datetime
    updated_at: datetime


class CreateWordPressSiteRequest(BaseModel):
    label: str
    wp_url: str
    wp_username: str
    wp_app_password: str


class UpdateWordPressSiteRequest(BaseModel):
    label: Optional[str] = None
    wp_url: Optional[str] = None
    wp_username: Optional[str] = None
    wp_app_password: Optional[str] = None


class WordPressSiteResponse(BaseModel):
    id: str
    business_id: str
    label: str
    wp_url: str
    wp_username: str
    wp_app_password: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CreateAudienceSegmentRequest(BaseModel):
    name: str
    description: Optional[str] = None
    pain_points: Optional[str] = None
    goals: Optional[str] = None
    tone: Optional[str] = None
    demographics: Optional[str] = None
    persona_id: Optional[str] = None
    phone_number_id: Optional[str] = None


class UpdateAudienceSegmentRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    pain_points: Optional[str] = None
    goals: Optional[str] = None
    tone: Optional[str] = None
    demographics: Optional[str] = None
    persona_id: Optional[str] = None
    phone_number_id: Optional[str] = None


class AudienceSegmentResponse(BaseModel):
    id: str
    business_id: str
    name: str
    description: Optional[str]
    pain_points: Optional[str]
    goals: Optional[str]
    tone: Optional[str]
    demographics: Optional[str]
    sort_order: int
    created_at: datetime
    updated_at: datetime


class CreateContentTypeRequest(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None


class UpdateContentTypeRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class ContentTypeResponse(BaseModel):
    id: str
    business_id: str
    name: str
    description: Optional[str]
    color: Optional[str]
    sort_order: int
    created_at: datetime
    updated_at: datetime


class ModuleBusinessSettingResponse(BaseModel):
    id: str
    user_id: int
    business_id: str
    module: str
    is_enabled: bool
    created_at: datetime
    updated_at: datetime


class UpdateModuleSettingRequest(BaseModel):
    business_id: str
    module: str
    is_enabled: bool


# ── Helpers ───────────────────────────────────────────────────────────────


async def verify_business_ownership(
    business_id: str,
    user_id: int,
    db: AsyncSession,
) -> Business:
    """Verify that the business belongs to the user. Raises 404 if not found or not owned."""
    result = await db.execute(
        select(Business).where(
            Business.id == business_id,
            Business.user_id == user_id,
        )
    )
    business = result.scalar_one_or_none()
    if business is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found",
        )
    return business


async def verify_wordpress_ownership(
    site_id: str,
    user_id: int,
    db: AsyncSession,
) -> BusinessWordPressSite:
    """Verify that the WordPress site belongs to the user's business."""
    result = await db.execute(
        select(BusinessWordPressSite).where(
            BusinessWordPressSite.id == site_id,
            BusinessWordPressSite.user_id == user_id,
        )
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="WordPress site not found",
        )
    return site


async def verify_audience_ownership(
    audience_id: str,
    user_id: int,
    db: AsyncSession,
) -> AudienceSegment:
    """Verify that the audience segment belongs to the user's business."""
    result = await db.execute(
        select(AudienceSegment).where(
            AudienceSegment.id == audience_id,
            AudienceSegment.user_id == user_id,
        )
    )
    audience = result.scalar_one_or_none()
    if audience is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audience segment not found",
        )
    return audience


async def verify_content_type_ownership(
    type_id: str,
    user_id: int,
    db: AsyncSession,
) -> ContentType:
    """Verify that the content type belongs to the user's business."""
    result = await db.execute(
        select(ContentType).where(
            ContentType.id == type_id,
            ContentType.user_id == user_id,
        )
    )
    content_type = result.scalar_one_or_none()
    if content_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content type not found",
        )
    return content_type


def _business_to_dict(business: Business) -> dict:
    """Convert Business model to response dict."""
    return {
        "id": business.id,
        "name": business.name,
        "description": business.description,
        "mission_statement": business.mission_statement,
        "is_active": business.is_active,
        "is_primary": business.is_primary,
        "created_at": business.created_at,
        "updated_at": business.updated_at,
    }


def _wordpress_site_to_dict(site: BusinessWordPressSite) -> dict:
    """Convert BusinessWordPressSite model to response dict."""
    return {
        "id": site.id,
        "business_id": site.business_id,
        "label": site.label,
        "wp_url": site.wp_url_encrypted,
        "wp_username": site.wp_username_encrypted,
        "wp_app_password": site.wp_app_password_encrypted,
        "is_active": site.is_active,
        "created_at": site.created_at,
        "updated_at": site.updated_at,
    }


def _audience_to_dict(audience: AudienceSegment) -> dict:
    """Convert AudienceSegment model to response dict."""
    return {
        "id": audience.id,
        "business_id": audience.business_id,
        "name": audience.name,
        "description": audience.description,
        "pain_points": audience.pain_points,
        "goals": audience.goals,
        "tone": audience.tone,
        "demographics": audience.demographics,
        "persona_id": audience.persona_id,
        "phone_number_id": audience.phone_number_id,
        "sort_order": audience.sort_order,
        "created_at": audience.created_at,
        "updated_at": audience.updated_at,
    }


def _content_type_to_dict(content_type: ContentType) -> dict:
    """Convert ContentType model to response dict."""
    return {
        "id": content_type.id,
        "business_id": content_type.business_id,
        "name": content_type.name,
        "description": content_type.description,
        "color": content_type.color,
        "sort_order": content_type.sort_order,
        "created_at": content_type.created_at,
        "updated_at": content_type.updated_at,
    }


def _module_setting_to_dict(setting: ModuleBusinessSetting) -> dict:
    """Convert ModuleBusinessSetting model to response dict."""
    return {
        "id": setting.id,
        "user_id": setting.user_id,
        "business_id": setting.business_id,
        "module": setting.module,
        "is_enabled": setting.is_enabled,
        "created_at": setting.created_at,
        "updated_at": setting.updated_at,
    }


# ── Business CRUD ──────────────────────────────────────────────────────────


@router.post("/businesses")
async def create_business(
    body: CreateBusinessRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new business for the user.

    If this is the user's first business, auto-create module settings for all 3 modules
    (lead_center, ai_studio, content_hub) with is_enabled=True. Also set is_primary=True
    and update users.current_business_id.
    """
    uid = workspace_user_id(user)

    # Check if this is the first business
    result = await db.execute(
        select(Business).where(
            Business.user_id == uid,
            Business.is_active == True,
        )
    )
    existing_businesses = result.scalars().all()
    is_first_business = len(existing_businesses) == 0

    # Create business
    business = Business(
        id=str(uuid.uuid4()),
        user_id=uid,
        name=body.name,
        description=body.description,
        mission_statement=body.mission_statement,
        is_primary=is_first_business,
    )
    db.add(business)

    # Create default module settings for all 3 modules
    # First business: all modules enabled
    # Additional businesses: content_hub enabled, lead_center + ai_studio disabled (user opts in)
    modules = ["lead_center", "ai_studio", "content_hub"]
    for module in modules:
        enabled = True if is_first_business else (module == "content_hub")
        setting = ModuleBusinessSetting(
            id=str(uuid.uuid4()),
            user_id=uid,
            business_id=business.id,
            module=module,
            is_enabled=enabled,
        )
        db.add(setting)

    # Seed default content types for every new business
    default_content_types = [
        {"name": "Educational Tips", "description": "How-to guides, advice, and educational content", "color": "#3b82f6"},
        {"name": "Market Updates", "description": "Local market data, trends, and neighborhood spotlights", "color": "#10b981"},
        {"name": "Success Stories", "description": "Case studies, testimonials, and before/after deals", "color": "#f59e0b"},
        {"name": "Industry News", "description": "Market analysis, regulatory changes, and investment trends", "color": "#8b5cf6"},
        {"name": "Product Updates", "description": "New features, announcements, and how-to guides", "color": "#ec4899"},
    ]
    for idx, ct in enumerate(default_content_types):
        content_type = ContentType(
            id=str(uuid.uuid4()),
            user_id=uid,
            business_id=business.id,
            name=ct["name"],
            description=ct["description"],
            color=ct["color"],
            sort_order=idx,
        )
        db.add(content_type)

    if is_first_business:
        # Update user's current_business_id
        await db.execute(
            update(User).where(User.id == uid).values(current_business_id=business.id)
        )

    await db.commit()
    await db.refresh(business)

    return _business_to_dict(business)


@router.get("/businesses")
async def list_businesses(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all active businesses for the user."""
    uid = workspace_user_id(user)

    result = await db.execute(
        select(Business)
        .where(Business.user_id == uid, Business.is_active == True)
        .order_by(Business.created_at.desc())
    )
    businesses = result.scalars().all()

    return {
        "businesses": [_business_to_dict(b) for b in businesses],
        "count": len(businesses),
    }


@router.get("/businesses/{business_id}")
async def get_business(
    business_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single business with associated counts."""
    uid = workspace_user_id(user)

    business = await verify_business_ownership(business_id, uid, db)

    # Get counts
    audiences_result = await db.execute(
        select(AudienceSegment).where(AudienceSegment.business_id == business_id)
    )
    audience_count = len(audiences_result.scalars().all())

    content_types_result = await db.execute(
        select(ContentType).where(ContentType.business_id == business_id)
    )
    content_type_count = len(content_types_result.scalars().all())

    business_dict = _business_to_dict(business)
    business_dict["audience_segments_count"] = audience_count
    business_dict["content_types_count"] = content_type_count

    return business_dict


@router.patch("/businesses/{business_id}")
async def update_business(
    business_id: str,
    body: UpdateBusinessRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update business details."""
    uid = workspace_user_id(user)

    business = await verify_business_ownership(business_id, uid, db)

    # Build update dict with non-None values
    update_data = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.description is not None:
        update_data["description"] = body.description
    if body.mission_statement is not None:
        update_data["mission_statement"] = body.mission_statement
    if body.is_primary is not None:
        update_data["is_primary"] = body.is_primary

    if update_data:
        await db.execute(
            update(Business).where(Business.id == business_id).values(**update_data)
        )
        await db.commit()

    await db.refresh(business)
    return _business_to_dict(business)


@router.delete("/businesses/{business_id}")
async def delete_business(
    business_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a business (set is_active=False)."""
    uid = workspace_user_id(user)

    business = await verify_business_ownership(business_id, uid, db)

    await db.execute(
        update(Business).where(Business.id == business_id).values(is_active=False)
    )
    await db.commit()

    return {"status": "deleted", "business_id": business_id}


# ── WordPress Sites ───────────────────────────────────────────────────────


@router.post("/businesses/{business_id}/wordpress")
async def add_wordpress_site(
    business_id: str,
    body: CreateWordPressSiteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add a WordPress site to a business.

    Credentials are stored in encrypted columns (raw values for now).
    """
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    site = BusinessWordPressSite(
        id=str(uuid.uuid4()),
        business_id=business_id,
        user_id=uid,
        label=body.label,
        wp_url_encrypted=body.wp_url,
        wp_username_encrypted=body.wp_username,
        wp_app_password_encrypted=body.wp_app_password,
    )
    db.add(site)
    await db.commit()
    await db.refresh(site)

    return _wordpress_site_to_dict(site)


@router.get("/businesses/{business_id}/wordpress")
async def list_wordpress_sites(
    business_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all WordPress sites for a business."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    result = await db.execute(
        select(BusinessWordPressSite)
        .where(BusinessWordPressSite.business_id == business_id)
        .order_by(BusinessWordPressSite.created_at.desc())
    )
    sites = result.scalars().all()

    return {
        "sites": [_wordpress_site_to_dict(s) for s in sites],
        "count": len(sites),
    }


@router.patch("/businesses/{business_id}/wordpress/{site_id}")
async def update_wordpress_site(
    business_id: str,
    site_id: str,
    body: UpdateWordPressSiteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update WordPress site credentials or label."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)
    site = await verify_wordpress_ownership(site_id, uid, db)

    # Verify site belongs to this business
    if site.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="WordPress site not found in this business",
        )

    # Build update dict
    update_data = {}
    if body.label is not None:
        update_data["label"] = body.label
    if body.wp_url is not None:
        update_data["wp_url_encrypted"] = body.wp_url
    if body.wp_username is not None:
        update_data["wp_username_encrypted"] = body.wp_username
    if body.wp_app_password is not None:
        update_data["wp_app_password_encrypted"] = body.wp_app_password

    if update_data:
        await db.execute(
            update(BusinessWordPressSite).where(BusinessWordPressSite.id == site_id).values(**update_data)
        )
        await db.commit()

    await db.refresh(site)
    return _wordpress_site_to_dict(site)


@router.delete("/businesses/{business_id}/wordpress/{site_id}")
async def delete_wordpress_site(
    business_id: str,
    site_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hard delete a WordPress site."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)
    site = await verify_wordpress_ownership(site_id, uid, db)

    # Verify site belongs to this business
    if site.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="WordPress site not found in this business",
        )

    await db.delete(site)
    await db.commit()

    return {"status": "deleted", "site_id": site_id}


# ── Audience Segments ──────────────────────────────────────────────────────


@router.post("/businesses/{business_id}/audiences")
async def create_audience_segment(
    business_id: str,
    body: CreateAudienceSegmentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new audience segment (customer avatar) for a business."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    audience = AudienceSegment(
        id=str(uuid.uuid4()),
        business_id=business_id,
        user_id=uid,
        name=body.name,
        description=body.description,
        pain_points=body.pain_points,
        goals=body.goals,
        tone=body.tone,
        demographics=body.demographics,
        persona_id=body.persona_id,
        phone_number_id=body.phone_number_id,
    )
    db.add(audience)
    await db.commit()
    await db.refresh(audience)

    return _audience_to_dict(audience)


@router.get("/businesses/{business_id}/audiences")
async def list_audience_segments(
    business_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all audience segments for a business."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    result = await db.execute(
        select(AudienceSegment)
        .where(AudienceSegment.business_id == business_id)
        .order_by(AudienceSegment.sort_order, AudienceSegment.created_at)
    )
    audiences = result.scalars().all()

    return {
        "audiences": [_audience_to_dict(a) for a in audiences],
        "count": len(audiences),
    }


@router.patch("/businesses/{business_id}/audiences/{audience_id}")
async def update_audience_segment(
    business_id: str,
    audience_id: str,
    body: UpdateAudienceSegmentRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an audience segment."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)
    audience = await verify_audience_ownership(audience_id, uid, db)

    # Verify audience belongs to this business
    if audience.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audience segment not found in this business",
        )

    # Build update dict — use body.model_fields_set to detect which fields were
    # explicitly sent (allows clearing persona_id/phone_number_id by sending null)
    update_data = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.description is not None:
        update_data["description"] = body.description
    if body.pain_points is not None:
        update_data["pain_points"] = body.pain_points
    if body.goals is not None:
        update_data["goals"] = body.goals
    if body.tone is not None:
        update_data["tone"] = body.tone
    if body.demographics is not None:
        update_data["demographics"] = body.demographics
    # persona_id and phone_number_id can be set to null (to unlink), so check
    # if the field was explicitly included in the request payload
    if "persona_id" in body.model_fields_set:
        update_data["persona_id"] = body.persona_id
    if "phone_number_id" in body.model_fields_set:
        update_data["phone_number_id"] = body.phone_number_id

    if update_data:
        await db.execute(
            update(AudienceSegment).where(AudienceSegment.id == audience_id).values(**update_data)
        )
        await db.commit()

    await db.refresh(audience)
    return _audience_to_dict(audience)


@router.delete("/businesses/{business_id}/audiences/{audience_id}")
async def delete_audience_segment(
    business_id: str,
    audience_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hard delete an audience segment."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)
    audience = await verify_audience_ownership(audience_id, uid, db)

    # Verify audience belongs to this business
    if audience.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audience segment not found in this business",
        )

    await db.delete(audience)
    await db.commit()

    return {"status": "deleted", "audience_id": audience_id}


# ── Content Types ──────────────────────────────────────────────────────────


@router.post("/businesses/{business_id}/content-types")
async def create_content_type(
    business_id: str,
    body: CreateContentTypeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new content type for a business."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    content_type = ContentType(
        id=str(uuid.uuid4()),
        business_id=business_id,
        user_id=uid,
        name=body.name,
        description=body.description,
        color=body.color,
    )
    db.add(content_type)
    await db.commit()
    await db.refresh(content_type)

    return _content_type_to_dict(content_type)


@router.get("/businesses/{business_id}/content-types")
async def list_content_types(
    business_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all content types for a business."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    result = await db.execute(
        select(ContentType)
        .where(ContentType.business_id == business_id)
        .order_by(ContentType.sort_order, ContentType.created_at)
    )
    content_types = result.scalars().all()

    return {
        "content_types": [_content_type_to_dict(ct) for ct in content_types],
        "count": len(content_types),
    }


@router.patch("/businesses/{business_id}/content-types/{type_id}")
async def update_content_type(
    business_id: str,
    type_id: str,
    body: UpdateContentTypeRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a content type."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)
    content_type = await verify_content_type_ownership(type_id, uid, db)

    # Verify content type belongs to this business
    if content_type.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content type not found in this business",
        )

    # Build update dict
    update_data = {}
    if body.name is not None:
        update_data["name"] = body.name
    if body.description is not None:
        update_data["description"] = body.description
    if body.color is not None:
        update_data["color"] = body.color

    if update_data:
        await db.execute(
            update(ContentType).where(ContentType.id == type_id).values(**update_data)
        )
        await db.commit()

    await db.refresh(content_type)
    return _content_type_to_dict(content_type)


@router.delete("/businesses/{business_id}/content-types/{type_id}")
async def delete_content_type(
    business_id: str,
    type_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hard delete a content type."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)
    content_type = await verify_content_type_ownership(type_id, uid, db)

    # Verify content type belongs to this business
    if content_type.business_id != business_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Content type not found in this business",
        )

    await db.delete(content_type)
    await db.commit()

    return {"status": "deleted", "type_id": type_id}


# ── Module Business Settings ───────────────────────────────────────────────


@router.get("/module-settings")
async def get_module_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all module/business toggles for the user."""
    uid = workspace_user_id(user)

    result = await db.execute(
        select(ModuleBusinessSetting)
        .where(ModuleBusinessSetting.user_id == uid)
        .order_by(ModuleBusinessSetting.business_id, ModuleBusinessSetting.module)
    )
    settings = result.scalars().all()

    return {
        "settings": [_module_setting_to_dict(s) for s in settings],
        "count": len(settings),
    }


@router.patch("/module-settings")
async def update_module_setting(
    body: UpdateModuleSettingRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update module enablement for a business."""
    uid = workspace_user_id(user)

    # Verify business ownership
    await verify_business_ownership(body.business_id, uid, db)

    # Find or create the setting
    result = await db.execute(
        select(ModuleBusinessSetting).where(
            ModuleBusinessSetting.user_id == uid,
            ModuleBusinessSetting.business_id == body.business_id,
            ModuleBusinessSetting.module == body.module,
        )
    )
    setting = result.scalar_one_or_none()

    if setting is None:
        # Create new setting
        setting = ModuleBusinessSetting(
            id=str(uuid.uuid4()),
            user_id=uid,
            business_id=body.business_id,
            module=body.module,
            is_enabled=body.is_enabled,
        )
        db.add(setting)
    else:
        # Update existing setting
        await db.execute(
            update(ModuleBusinessSetting)
            .where(ModuleBusinessSetting.id == setting.id)
            .values(is_enabled=body.is_enabled)
        )

    await db.commit()

    # Re-query to get fresh data after commit
    result = await db.execute(
        select(ModuleBusinessSetting).where(
            ModuleBusinessSetting.user_id == uid,
            ModuleBusinessSetting.business_id == body.business_id,
            ModuleBusinessSetting.module == body.module,
        )
    )
    setting = result.scalar_one()

    return _module_setting_to_dict(setting)


# ── Switch Business ────────────────────────────────────────────────────────


@router.post("/businesses/{business_id}/switch")
async def switch_business(
    business_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set the business as the user's current business."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    # Update user's current_business_id
    await db.execute(
        update(User).where(User.id == uid).values(current_business_id=business_id)
    )
    await db.commit()

    return {"status": "switched", "business_id": business_id}


# ── Business Social Media Connections ───────────────────────────────────────


import json
import hashlib
import secrets
from urllib.parse import urlencode
from datetime import datetime, timedelta
import aiohttp
from pydantic import BaseModel
from typing import Optional as TypingOptional
from rei.services.credentials_service import get_provider_credentials
from rei.config import get_settings

_settings = get_settings()


# ── Helpers ──────────────────────────────────────────────────────────


async def _resolve_cred(field: str, provider: str, db: AsyncSession) -> str:
    """Resolve credential from env config or SuperAdmin credentials DB."""
    val = getattr(_settings, field, "")
    if val:
        logger.debug("Resolved %s from env settings", field)
        return val
    creds = await get_provider_credentials(db, provider)
    if creds:
        resolved = creds.get(field, "")
        if resolved:
            logger.debug("Resolved %s from DB provider %s (len=%d)", field, provider, len(resolved))
        else:
            logger.warning("Field %s not found in DB provider %s. Available keys: %s", field, provider, list(creds.keys()))
        return resolved
    logger.warning("Could not resolve credential %s from env or DB", field)
    return ""


def _generate_pkce():
    """Generate PKCE code verifier and challenge for X/Twitter OAuth."""
    code_verifier = secrets.token_urlsafe(64)[:128]
    code_challenge = hashlib.sha256(code_verifier.encode()).digest()
    import base64
    code_challenge_b64 = base64.urlsafe_b64encode(code_challenge).rstrip(b"=").decode()
    return code_verifier, code_challenge_b64


# Store PKCE verifiers in memory (per business_id). In production, use Redis.
_pkce_store: dict[str, str] = {}


def _social_conn_to_dict(conn: BusinessSocialConnection) -> dict:
    """Convert BusinessSocialConnection model to response dict."""
    return {
        "id": conn.id,
        "business_id": conn.business_id,
        "platform": conn.platform,
        "account_name": conn.account_name,
        "account_id": conn.account_id,
        "is_active": conn.is_active,
        "created_at": conn.created_at,
        "updated_at": conn.updated_at,
    }


class PublishBody(BaseModel):
    content: str
    image_url: TypingOptional[str] = None


# ── Schemas ──────────────────────────────────────────────────────────


class BusinessSocialConnectionResponse(BaseModel):
    id: str
    business_id: str
    platform: str
    account_name: TypingOptional[str]
    account_id: TypingOptional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ── Endpoints ────────────────────────────────────────────────────────


@router.get("/businesses/{business_id}/social")
async def list_business_social_connections(
    business_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all social media connections for a business."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    result = await db.execute(
        select(BusinessSocialConnection)
        .where(BusinessSocialConnection.business_id == business_id)
        .order_by(BusinessSocialConnection.created_at.desc())
    )
    connections = result.scalars().all()

    return {
        "connections": [_social_conn_to_dict(c) for c in connections],
        "count": len(connections),
    }


@router.get("/businesses/{business_id}/social/{platform}/auth-url")
async def get_business_social_auth_url(
    business_id: str,
    platform: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get OAuth URL for a platform, scoped to a business.

    Encodes user_id|business_id in the state parameter.
    """
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    platform = platform.lower()
    state = f"{uid}|{business_id}"

    if platform == "facebook":
        app_id = await _resolve_cred("facebook_app_id", "facebook_oauth", db)
        redirect_uri = await _resolve_cred("facebook_redirect_uri", "facebook_oauth", db)
        if not app_id or not redirect_uri:
            raise HTTPException(
                status_code=503,
                detail="Facebook OAuth not configured. Ask your admin to add Facebook credentials in SuperAdmin Settings.",
            )

        params = {
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "scope": "pages_manage_posts,pages_read_engagement",
            "response_type": "code",
            "state": state,
        }
        url = "https://www.facebook.com/v19.0/dialog/oauth?" + urlencode(params)
        return {"auth_url": url}

    elif platform == "linkedin":
        client_id = await _resolve_cred("linkedin_client_id", "linkedin_oauth", db)
        redirect_uri = await _resolve_cred("linkedin_redirect_uri", "linkedin_oauth", db)
        if not client_id or not redirect_uri:
            raise HTTPException(
                status_code=503,
                detail="LinkedIn OAuth not configured. Ask your admin to add LinkedIn credentials in SuperAdmin Settings.",
            )

        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": "openid profile w_member_social",
            "state": state,
        }
        url = "https://www.linkedin.com/oauth/v2/authorization?" + urlencode(params)
        return {"auth_url": url}

    elif platform == "x":
        client_id = await _resolve_cred("x_twitter_client_id", "x_twitter_oauth", db)
        redirect_uri = await _resolve_cred("x_twitter_redirect_uri", "x_twitter_oauth", db)
        if not client_id or not redirect_uri:
            raise HTTPException(
                status_code=503,
                detail="X (Twitter) OAuth not configured. Ask your admin to add X credentials in SuperAdmin Settings.",
            )

        code_verifier, code_challenge = _generate_pkce()
        _pkce_store[state] = code_verifier

        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": "tweet.read tweet.write users.read offline.access",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        url = "https://twitter.com/i/oauth2/authorize?" + urlencode(params)
        return {"auth_url": url}

    elif platform == "instagram":
        app_id = await _resolve_cred("facebook_app_id", "facebook_oauth", db)
        fb_redirect_uri = await _resolve_cred("facebook_redirect_uri", "facebook_oauth", db)
        if not app_id or not fb_redirect_uri:
            raise HTTPException(
                status_code=503,
                detail="Instagram/Facebook OAuth not configured. Ask your admin to add Facebook credentials in SuperAdmin Settings.",
            )

        redirect_uri = fb_redirect_uri.replace("facebook_code=", "instagram_code=")

        params = {
            "client_id": app_id,
            "redirect_uri": redirect_uri,
            "scope": "pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish",
            "response_type": "code",
            "state": state,
        }
        url = "https://www.facebook.com/v19.0/dialog/oauth?" + urlencode(params)
        return {"auth_url": url}

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")


@router.post("/businesses/{business_id}/social/{platform}/callback")
async def business_social_callback(
    business_id: str,
    platform: str,
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchange OAuth code for tokens and store in BusinessSocialConnection."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    code = payload.get("code", "")
    state = payload.get("state", "")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    platform = platform.lower()

    if platform == "facebook":
        app_id = await _resolve_cred("facebook_app_id", "facebook_oauth", db)
        app_secret = await _resolve_cred("facebook_app_secret", "facebook_oauth", db)
        redirect_uri = await _resolve_cred("facebook_redirect_uri", "facebook_oauth", db)

        async with aiohttp.ClientSession() as session:
            # Exchange code for short-lived user token
            async with session.get(
                "https://graph.facebook.com/v19.0/oauth/access_token",
                params={
                    "client_id": app_id,
                    "redirect_uri": redirect_uri,
                    "client_secret": app_secret,
                    "code": code,
                },
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise HTTPException(status_code=400, detail=f"Facebook token exchange failed: {body}")
                data = await resp.json()
                short_token = data["access_token"]

            # Exchange for long-lived user token (60 days)
            async with session.get(
                "https://graph.facebook.com/v19.0/oauth/access_token",
                params={
                    "grant_type": "fb_exchange_token",
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "fb_exchange_token": short_token,
                },
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.warning("Facebook long-lived token exchange failed: %s", body)
                    long_token = short_token  # fallback to short-lived
                else:
                    data = await resp.json()
                    long_token = data["access_token"]

            # Get user's pages
            async with session.get(
                "https://graph.facebook.com/v19.0/me/accounts",
                params={"access_token": long_token},
            ) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=400, detail="Failed to fetch Facebook Pages")
                pages_data = await resp.json()
                pages = pages_data.get("data", [])

        if not pages:
            raise HTTPException(status_code=400, detail="No Facebook Pages found. You need to be an admin of at least one Facebook Page.")

        page = pages[0]
        account_name = page.get("name", "Facebook Page")
        account_id = page.get("id", "")

        token_data = {
            "page_id": account_id,
            "page_name": account_name,
            "access_token": page["access_token"],
        }

        # Upsert into BusinessSocialConnection
        result = await db.execute(
            select(BusinessSocialConnection).where(
                BusinessSocialConnection.business_id == business_id,
                BusinessSocialConnection.platform == "facebook",
            )
        )
        conn = result.scalar_one_or_none()

        if conn:
            conn.account_name = account_name
            conn.account_id = account_id
            conn.token_data_json = json.dumps(token_data)
            conn.is_active = True
        else:
            conn = BusinessSocialConnection(
                id=str(uuid.uuid4()),
                business_id=business_id,
                user_id=uid,
                platform="facebook",
                account_name=account_name,
                account_id=account_id,
                token_data_json=json.dumps(token_data),
            )
            db.add(conn)

        await db.commit()
        await db.refresh(conn)
        return {"status": "connected", "account_name": account_name}

    elif platform == "linkedin":
        client_id = await _resolve_cred("linkedin_client_id", "linkedin_oauth", db)
        client_secret = await _resolve_cred("linkedin_client_secret", "linkedin_oauth", db)
        redirect_uri = await _resolve_cred("linkedin_redirect_uri", "linkedin_oauth", db)

        if not client_id or not client_secret or not redirect_uri:
            logger.error("LinkedIn callback missing creds: client_id=%s, secret=%s, redirect=%s",
                          bool(client_id), bool(client_secret), bool(redirect_uri))
            raise HTTPException(status_code=503, detail="LinkedIn OAuth credentials incomplete. Check SuperAdmin Settings.")

        async with aiohttp.ClientSession() as session:
            # Exchange code for token
            async with session.post(
                "https://www.linkedin.com/oauth/v2/accessToken",
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error("LinkedIn token exchange failed (HTTP %d): %s", resp.status, body[:500])
                    raise HTTPException(status_code=400, detail=f"LinkedIn token exchange failed: {body}")
                tokens = await resp.json()

            access_token = tokens["access_token"]
            expires_in = tokens.get("expires_in", 5184000)  # default 60 days

            # Get user profile info (sub = member URN)
            async with session.get(
                "https://api.linkedin.com/v2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            ) as resp:
                if resp.status == 200:
                    profile = await resp.json()
                    member_name = profile.get("name", "LinkedIn User")
                    member_sub = profile.get("sub", "")
                else:
                    member_name = "LinkedIn User"
                    member_sub = ""

        account_name = member_name
        account_id = member_sub

        token_data = {
            "access_token": access_token,
            "expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
            "member_sub": member_sub,
            "member_name": member_name,
        }

        # Upsert into BusinessSocialConnection
        result = await db.execute(
            select(BusinessSocialConnection).where(
                BusinessSocialConnection.business_id == business_id,
                BusinessSocialConnection.platform == "linkedin",
            )
        )
        conn = result.scalar_one_or_none()

        if conn:
            conn.account_name = account_name
            conn.account_id = account_id
            conn.token_data_json = json.dumps(token_data)
            conn.token_expires_at = datetime.fromisoformat(token_data["expires_at"])
            conn.is_active = True
        else:
            conn = BusinessSocialConnection(
                id=str(uuid.uuid4()),
                business_id=business_id,
                user_id=uid,
                platform="linkedin",
                account_name=account_name,
                account_id=account_id,
                token_data_json=json.dumps(token_data),
                token_expires_at=datetime.fromisoformat(token_data["expires_at"]),
            )
            db.add(conn)

        await db.commit()
        await db.refresh(conn)
        return {"status": "connected", "account_name": account_name}

    elif platform == "x":
        client_id = await _resolve_cred("x_twitter_client_id", "x_twitter_oauth", db)
        client_secret = await _resolve_cred("x_twitter_client_secret", "x_twitter_oauth", db)
        redirect_uri = await _resolve_cred("x_twitter_redirect_uri", "x_twitter_oauth", db)

        if not client_id or not client_secret or not redirect_uri:
            logger.error("X callback missing creds: client_id=%s, secret=%s, redirect=%s",
                          bool(client_id), bool(client_secret), bool(redirect_uri))
            raise HTTPException(status_code=503, detail="X (Twitter) OAuth credentials incomplete. Check SuperAdmin Settings.")

        code_verifier = _pkce_store.pop(state, "")
        if not code_verifier:
            logger.error("X PKCE verifier not found for state %s. Store has %d entries.", state, len(_pkce_store))
            raise HTTPException(status_code=400, detail="PKCE session expired. Please try connecting again.")

        import base64
        basic_auth = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.x.com/2/oauth2/token",
                data={
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                    "code_verifier": code_verifier,
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": f"Basic {basic_auth}",
                },
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error("X token exchange failed (HTTP %d): %s", resp.status, body[:500])
                    raise HTTPException(status_code=400, detail=f"X token exchange failed: {body}")
                tokens = await resp.json()

            access_token = tokens["access_token"]
            refresh_token = tokens.get("refresh_token", "")

            # Get username
            async with session.get(
                "https://api.x.com/2/users/me",
                headers={"Authorization": f"Bearer {access_token}"},
            ) as resp:
                if resp.status == 200:
                    user_data = await resp.json()
                    x_data = user_data.get("data", {})
                    username = x_data.get("username", "")
                    x_user_id = x_data.get("id", "")
                else:
                    username = ""
                    x_user_id = ""

        account_name = f"@{username}" if username else "X Account"
        account_id = x_user_id

        token_data = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "username": username,
            "user_id": x_user_id,
        }

        # Upsert into BusinessSocialConnection
        result = await db.execute(
            select(BusinessSocialConnection).where(
                BusinessSocialConnection.business_id == business_id,
                BusinessSocialConnection.platform == "x",
            )
        )
        conn = result.scalar_one_or_none()

        if conn:
            conn.account_name = account_name
            conn.account_id = account_id
            conn.token_data_json = json.dumps(token_data)
            conn.is_active = True
        else:
            conn = BusinessSocialConnection(
                id=str(uuid.uuid4()),
                business_id=business_id,
                user_id=uid,
                platform="x",
                account_name=account_name,
                account_id=account_id,
                token_data_json=json.dumps(token_data),
            )
            db.add(conn)

        await db.commit()
        await db.refresh(conn)
        return {"status": "connected", "account_name": account_name}

    elif platform == "instagram":
        app_id = await _resolve_cred("facebook_app_id", "facebook_oauth", db)
        app_secret = await _resolve_cred("facebook_app_secret", "facebook_oauth", db)
        fb_redirect_uri = await _resolve_cred("facebook_redirect_uri", "facebook_oauth", db)
        # Must match the redirect_uri used in the auth URL (instagram_code flag)
        redirect_uri = fb_redirect_uri.replace("facebook_code=", "instagram_code=")

        async with aiohttp.ClientSession() as session:
            # Step 1: Exchange code for user token
            async with session.get(
                "https://graph.facebook.com/v19.0/oauth/access_token",
                params={
                    "client_id": app_id,
                    "redirect_uri": redirect_uri,
                    "client_secret": app_secret,
                    "code": code,
                },
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise HTTPException(status_code=400, detail=f"Facebook/Instagram token exchange failed: {body}")
                data = await resp.json()
                user_token = data["access_token"]

            # Step 2: Get pages and find Instagram Business Account
            async with session.get(
                "https://graph.facebook.com/v19.0/me/accounts",
                params={
                    "access_token": user_token,
                    "fields": "id,name,access_token,instagram_business_account",
                },
            ) as resp:
                if resp.status != 200:
                    raise HTTPException(status_code=400, detail="Failed to fetch Facebook Pages for Instagram")
                pages_data = await resp.json()
                pages = pages_data.get("data", [])

        # Find a page with an Instagram Business Account linked
        ig_account = None
        page_token = None
        for page in pages:
            ig_biz = page.get("instagram_business_account")
            if ig_biz:
                ig_account = ig_biz
                page_token = page["access_token"]
                break

        if not ig_account or not page_token:
            raise HTTPException(
                status_code=400,
                detail="No Instagram Business account found. Make sure your Instagram is a Business account and linked to a Facebook Page.",
            )

        ig_user_id = ig_account["id"]

        # Get IG username
        ig_username = ""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"https://graph.facebook.com/v19.0/{ig_user_id}",
                params={"fields": "username", "access_token": page_token},
            ) as resp:
                if resp.status == 200:
                    ig_data = await resp.json()
                    ig_username = ig_data.get("username", "")

        account_name = f"@{ig_username}" if ig_username else "Instagram"
        account_id = ig_user_id

        token_data = {
            "ig_user_id": ig_user_id,
            "page_access_token": page_token,
            "ig_username": ig_username,
        }

        # Upsert into BusinessSocialConnection
        result = await db.execute(
            select(BusinessSocialConnection).where(
                BusinessSocialConnection.business_id == business_id,
                BusinessSocialConnection.platform == "instagram",
            )
        )
        conn = result.scalar_one_or_none()

        if conn:
            conn.account_name = account_name
            conn.account_id = account_id
            conn.token_data_json = json.dumps(token_data)
            conn.is_active = True
        else:
            conn = BusinessSocialConnection(
                id=str(uuid.uuid4()),
                business_id=business_id,
                user_id=uid,
                platform="instagram",
                account_name=account_name,
                account_id=account_id,
                token_data_json=json.dumps(token_data),
            )
            db.add(conn)

        await db.commit()
        await db.refresh(conn)
        return {"status": "connected", "account_name": account_name}

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")


@router.get("/businesses/{business_id}/social/{platform}/status")
async def get_business_social_status(
    business_id: str,
    platform: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check if a platform is connected for this business."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    platform = platform.lower()

    result = await db.execute(
        select(BusinessSocialConnection).where(
            BusinessSocialConnection.business_id == business_id,
            BusinessSocialConnection.platform == platform,
        )
    )
    conn = result.scalar_one_or_none()

    if not conn or not conn.is_active:
        return {"connected": False}

    return {"connected": True, "account_name": conn.account_name or f"{platform} Account"}


@router.post("/businesses/{business_id}/social/{platform}/disconnect")
async def disconnect_business_social(
    business_id: str,
    platform: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete a social connection (set is_active=False)."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    platform = platform.lower()

    result = await db.execute(
        select(BusinessSocialConnection).where(
            BusinessSocialConnection.business_id == business_id,
            BusinessSocialConnection.platform == platform,
        )
    )
    conn = result.scalar_one_or_none()

    if not conn:
        raise HTTPException(status_code=404, detail=f"{platform} connection not found")

    await db.execute(
        update(BusinessSocialConnection)
        .where(BusinessSocialConnection.id == conn.id)
        .values(is_active=False)
    )
    await db.commit()

    return {"status": "disconnected", "platform": platform}


@router.post("/businesses/{business_id}/social/{platform}/publish")
async def publish_business_social(
    business_id: str,
    platform: str,
    body: PublishBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Publish a post using a business's social connection tokens."""
    uid = workspace_user_id(user)

    await verify_business_ownership(business_id, uid, db)

    platform = platform.lower()

    result = await db.execute(
        select(BusinessSocialConnection).where(
            BusinessSocialConnection.business_id == business_id,
            BusinessSocialConnection.platform == platform,
        )
    )
    conn = result.scalar_one_or_none()

    if not conn or not conn.is_active or not conn.token_data_json:
        raise HTTPException(status_code=400, detail=f"{platform} not connected for this business")

    token_data = json.loads(conn.token_data_json)

    if platform == "facebook":
        page_id = token_data.get("page_id", "")
        access_token = token_data.get("access_token", "")

        post_data = {"message": body.content, "access_token": access_token}
        if body.image_url:
            endpoint = f"https://graph.facebook.com/v19.0/{page_id}/photos"
            post_data["url"] = body.image_url
        else:
            endpoint = f"https://graph.facebook.com/v19.0/{page_id}/feed"

        async with aiohttp.ClientSession() as session:
            async with session.post(endpoint, data=post_data) as resp:
                if resp.status in (200, 201):
                    result = await resp.json()
                    return {"status": "published", "post_id": result.get("id", "")}
                else:
                    body_text = await resp.text()
                    logger.warning("Facebook publish failed: %s", body_text)
                    raise HTTPException(status_code=400, detail="Facebook publish failed. Your token may have expired — try reconnecting.")

    elif platform == "linkedin":
        access_token = token_data.get("access_token", "")
        member_sub = token_data.get("member_sub", "")

        post_body = {
            "author": f"urn:li:person:{member_sub}",
            "lifecycleState": "PUBLISHED",
            "specificContent": {
                "com.linkedin.ugc.ShareContent": {
                    "shareCommentary": {"text": body.content},
                    "shareMediaCategory": "NONE",
                }
            },
            "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.linkedin.com/v2/ugcPosts",
                json=post_body,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "X-Restli-Protocol-Version": "2.0.0",
                },
            ) as resp:
                if resp.status in (200, 201):
                    result = await resp.json()
                    return {"status": "published", "post_id": result.get("id", "")}
                else:
                    body_text = await resp.text()
                    logger.warning("LinkedIn publish failed: %s", body_text)
                    raise HTTPException(status_code=400, detail="LinkedIn publish failed. Your token may have expired — try reconnecting.")

    elif platform == "x":
        access_token = token_data.get("access_token", "")

        tweet_text = body.content[:280]

        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.x.com/2/tweets",
                json={"text": tweet_text},
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
            ) as resp:
                if resp.status in (200, 201):
                    result = await resp.json()
                    tweet_id = result.get("data", {}).get("id", "")
                    return {"status": "published", "post_id": tweet_id}
                else:
                    body_text = await resp.text()
                    logger.warning("X publish failed: %s", body_text)
                    raise HTTPException(status_code=400, detail="X publish failed. Your token may have expired — try reconnecting.")

    elif platform == "instagram":
        if not body.image_url:
            raise HTTPException(status_code=400, detail="Instagram requires an image. Provide an image_url.")

        ig_user_id = token_data.get("ig_user_id", "")
        page_token = token_data.get("page_access_token", "")

        async with aiohttp.ClientSession() as session:
            # Step 1: Create media container
            async with session.post(
                f"https://graph.facebook.com/v19.0/{ig_user_id}/media",
                data={
                    "image_url": body.image_url,
                    "caption": body.content,
                    "access_token": page_token,
                },
            ) as resp:
                if resp.status != 200:
                    body_text = await resp.text()
                    logger.warning("Instagram container creation failed: %s", body_text)
                    raise HTTPException(status_code=400, detail="Instagram publish failed at media creation step.")
                container = await resp.json()
                creation_id = container.get("id")

            if not creation_id:
                raise HTTPException(status_code=400, detail="Instagram did not return a media container ID.")

            # Step 2: Publish the container
            async with session.post(
                f"https://graph.facebook.com/v19.0/{ig_user_id}/media_publish",
                data={
                    "creation_id": creation_id,
                    "access_token": page_token,
                },
            ) as resp:
                if resp.status == 200:
                    result = await resp.json()
                    return {"status": "published", "post_id": result.get("id", "")}
                else:
                    body_text = await resp.text()
                    logger.warning("Instagram publish failed: %s", body_text)
                    raise HTTPException(status_code=400, detail="Instagram publish failed. Try reconnecting.")

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported platform: {platform}")
