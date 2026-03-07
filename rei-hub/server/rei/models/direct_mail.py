"""Direct Mail models — Templates and Campaigns.

Manages reusable postcard/letter designs and batch send campaigns
via provider-agnostic mail integration (Thanks.io, Lob, etc.).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from rei.database import Base


# ── Direct Mail Template ──────────────────────────────────


class DirectMailTemplate(Base):
    """Reusable postcard or letter design template."""
    __tablename__ = "direct_mail_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String, nullable=False)
    mail_type: Mapped[str] = mapped_column(String, nullable=False)
    # Types: postcard, letter

    # Postcard fields
    front_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # HTML/design for postcard front (rendered to image for sending)
    front_image_b64: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Rendered/uploaded postcard front image (base64 PNG)
    back_copy_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Template text for postcard back — may contain {{first_name}}, {{address}} etc.

    # Letter fields
    letter_html_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Full HTML letter body — may contain merge tags

    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ── Direct Mail Campaign ──────────────────────────────────


class DirectMailCampaign(Base):
    """A batch direct mail job — selects recipients, applies template, sends."""
    __tablename__ = "direct_mail_campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    template_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("direct_mail_templates.id"), nullable=True
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    mail_type: Mapped[str] = mapped_column(String, nullable=False)
    # Types: postcard, letter

    # Recipient selection criteria (stored as JSON)
    recipient_filter_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # JSON: { list_id, statuses, tags, search }

    # Campaign copy (may be AI-generated)
    copy_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # The actual copy used (after AI generation + user edits)
    front_image_b64: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Front image for this campaign's postcards (base64 PNG)

    # Status tracking
    status: Mapped[str] = mapped_column(String, default="draft")
    # Statuses: draft, sending, sent, partially_sent, failed
    total_recipients: Mapped[int] = mapped_column(Integer, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, default=0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Relationships
    template: Mapped[Optional["DirectMailTemplate"]] = relationship(
        "DirectMailTemplate", lazy="selectin"
    )
