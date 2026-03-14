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


class UpdateAudienceSegmentRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    pain_points: Optional[str] = None
    goals: Optional[str] = None
    tone: Optional[str] = None
    demographics: Optional[str] = None


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

    # Build update dict
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
