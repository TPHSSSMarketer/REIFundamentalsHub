"""User integration credentials — per-user WordPress and other integration settings."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from rei.database import Base


class UserWordPressIntegration(Base):
    """Stores encrypted WordPress credentials per user.

    Each user can have one WordPress integration configured.
    Credentials are encrypted in the database using the ai_encryption_key.
    """

    __tablename__ = "user_wordpress_integrations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True
    )

    # Encrypted credentials
    wp_url_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    wp_username_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    wp_app_password_encrypted: Mapped[str] = mapped_column(Text, nullable=False)

    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    configured_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
