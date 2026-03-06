"""EmailTemplate model — stores custom email templates editable from the Admin UI."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from rei.database import Base


class AdminEmailTemplate(Base):
    """Custom email template that overrides the hardcoded default.

    Each row represents one email type (e.g. "welcome", "payment_failed").
    If no row exists for a type, the hardcoded default in email.py is used.
    """

    __tablename__ = "admin_email_templates"

    id: Mapped[str] = mapped_column(
        String, primary_key=True, default=lambda: str(uuid.uuid4())
    )
    template_type: Mapped[str] = mapped_column(
        String, unique=True, nullable=False, index=True
    )

    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Audit
    last_updated_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
