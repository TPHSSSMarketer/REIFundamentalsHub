"""Multi-business and business-specific configuration models.

Enables users to manage multiple separate businesses with isolated settings,
integrations, content types, and audience segments. Each business is owned by
a user and has its own WordPress sites, social connections, and module enablement.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from rei.database import Base


# ── Business ────────────────────────────────────────────────────────────


class Business(Base):
    """A business entity owned by a user.

    Each user can own multiple businesses. A business contains isolated
    configurations for WordPress sites, social connections, audience segments,
    and content types.
    """
    __tablename__ = "businesses"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mission_statement: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Business WordPress Sites ────────────────────────────────────────────


class BusinessWordPressSite(Base):
    """A WordPress site connected to a business.

    Stores encrypted WordPress credentials (URL, username, app password) for
    each WordPress site managed under a business.
    """
    __tablename__ = "business_wordpress_sites"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    business_id: Mapped[str] = mapped_column(String, ForeignKey("businesses.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    label: Mapped[str] = mapped_column(String, nullable=False)
    wp_url_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    wp_username_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    wp_app_password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Business Social Connections ─────────────────────────────────────────


class BusinessSocialConnection(Base):
    """A social media account connected to a business.

    Stores OAuth tokens and metadata for social media platforms (LinkedIn,
    Twitter/X, Instagram, etc.) connected to a business. Tokens are encrypted.
    """
    __tablename__ = "business_social_connections"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    business_id: Mapped[str] = mapped_column(String, ForeignKey("businesses.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    platform: Mapped[str] = mapped_column(String, nullable=False)
    account_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    account_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    access_token_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    refresh_token_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_data_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Audience Segment ────────────────────────────────────────────────────


class AudienceSegment(Base):
    """A target audience segment for a business.

    Defines a specific audience profile with demographics, pain points, goals,
    and preferred tone for content generation. Used by ContentHub to personalize
    AI-generated content.
    """
    __tablename__ = "audience_segments"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    business_id: Mapped[str] = mapped_column(String, ForeignKey("businesses.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pain_points: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    goals: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tone: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    demographics: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Linked AI persona and phone number for call routing
    persona_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    phone_number_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Content Type ────────────────────────────────────────────────────────


class ContentType(Base):
    """A content type category for a business.

    Allows users to organize their content into custom types (e.g., "Blog Post",
    "Social Clip", "Testimonial"). Each content type can have a color for visual
    organization and a display order.
    """
    __tablename__ = "content_types"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    business_id: Mapped[str] = mapped_column(String, ForeignKey("businesses.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Module Business Settings ────────────────────────────────────────────


class ModuleBusinessSetting(Base):
    """Per-business module enablement setting.

    Controls which modules (lead_center, ai_studio, content_hub) are enabled
    for each business. Allows fine-grained feature management across multiple
    businesses owned by a user.
    """
    __tablename__ = "module_business_settings"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    business_id: Mapped[str] = mapped_column(String, ForeignKey("businesses.id"), nullable=False, index=True)

    module: Mapped[str] = mapped_column(String, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
