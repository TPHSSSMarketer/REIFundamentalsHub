"""Background tasks — email sequence processor and credit reset."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import TYPE_CHECKING

from sqlalchemy import and_, select

from rei.models.user import (
    EmailDomain,
    EmailSequence,
    EmailSequenceEnrollment,
    EmailSequenceStep,
    EmailSubscriber,
    User,
)
from rei.services.email_provider import EmailRequest, email_provider

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from rei.config import Settings

logger = logging.getLogger(__name__)


def _build_unsubscribe_url(subscriber_id: str, jwt_secret: str, hub_url: str) -> str:
    import hashlib
    import hmac as _hmac

    token = _hmac.new(
        jwt_secret.encode(), subscriber_id.encode(), hashlib.sha256
    ).hexdigest()
    return f"{hub_url}/api/email/unsubscribe/{token}?sid={subscriber_id}"


def _append_canspam_footer(html: str, from_name: str, unsubscribe_url: str) -> str:
    footer = (
        '<div style="margin-top:40px;padding-top:20px;border-top:1px solid #e0e0e0;'
        'font-size:12px;color:#999999;text-align:center;">'
        f"<p>You are receiving this because you subscribed via {from_name}.</p>"
        f"<p>REIFundamentals Hub</p>"
        f'<p><a href="{unsubscribe_url}" style="color:#999999;">Unsubscribe</a></p>'
        "</div>"
    )
    if "</body>" in html:
        return html.replace("</body>", f"{footer}</body>")
    return html + footer


async def process_sequence_steps(db: AsyncSession, settings: Settings) -> None:
    """Send due sequence emails for all active enrollments."""
    now = datetime.utcnow()

    result = await db.execute(
        select(EmailSequenceEnrollment).where(
            and_(
                EmailSequenceEnrollment.status == "active",
                EmailSequenceEnrollment.next_send_at <= now,
            )
        )
    )
    enrollments = result.scalars().all()

    if not enrollments:
        logger.info("Sequence processor: no enrollments to process")
        return

    for enrollment in enrollments:
        # Get the sequence
        seq_result = await db.execute(
            select(EmailSequence).where(EmailSequence.id == enrollment.sequence_id)
        )
        seq = seq_result.scalar_one_or_none()
        if not seq or not seq.is_active:
            continue

        # Get the current step
        step_result = await db.execute(
            select(EmailSequenceStep).where(
                EmailSequenceStep.sequence_id == seq.id,
                EmailSequenceStep.step_number == enrollment.current_step,
            )
        )
        step = step_result.scalar_one_or_none()
        if not step:
            enrollment.status = "completed"
            enrollment.completed_at = now
            continue

        # Get subscriber
        sub_result = await db.execute(
            select(EmailSubscriber).where(
                EmailSubscriber.id == enrollment.subscriber_id
            )
        )
        sub = sub_result.scalar_one_or_none()
        if not sub or sub.status != "subscribed":
            enrollment.status = "completed"
            enrollment.completed_at = now
            continue

        # Get domain
        dom_result = await db.execute(
            select(EmailDomain).where(EmailDomain.id == seq.from_domain_id)
        )
        domain = dom_result.scalar_one_or_none()
        if not domain:
            continue

        # Get user for credit tracking
        user_result = await db.execute(select(User).where(User.id == seq.user_id))
        user = user_result.scalar_one_or_none()
        if not user:
            continue

        unsub_url = _build_unsubscribe_url(
            sub.id, settings.jwt_secret, settings.hub_url
        )
        html = _append_canspam_footer(step.html_content, domain.from_name, unsub_url)

        req = EmailRequest(
            to_email=sub.email,
            to_name=f"{sub.first_name or ''} {sub.last_name or ''}".strip()
            or sub.email,
            from_email=domain.from_email,
            from_name=domain.from_name,
            subject=step.subject,
            html_content=html,
            plain_text=step.plain_text or "",
            metadata={
                "campaign_id": "",
                "subscriber_id": sub.id,
                "unsubscribe_url": unsub_url,
            },
        )

        resp = await email_provider.send(req, settings)
        if resp.success:
            user.email_credits_used += 1
            logger.info(
                "Sequence step %d sent to %s for sequence %s",
                enrollment.current_step,
                sub.email,
                seq.id,
            )

        # Advance to next step
        next_step_result = await db.execute(
            select(EmailSequenceStep)
            .where(
                EmailSequenceStep.sequence_id == seq.id,
                EmailSequenceStep.step_number > enrollment.current_step,
            )
            .order_by(EmailSequenceStep.step_number)
            .limit(1)
        )
        next_step = next_step_result.scalar_one_or_none()

        if next_step:
            enrollment.current_step = next_step.step_number
            enrollment.next_send_at = now + timedelta(days=next_step.delay_days)
        else:
            enrollment.status = "completed"
            enrollment.completed_at = now

    await db.commit()
    logger.info("Sequence processor run complete: %d enrollments processed", len(enrollments))


async def reset_email_credits(db: AsyncSession, settings: Settings) -> None:
    """Reset email credits for users whose reset date has passed."""
    now = datetime.utcnow()

    result = await db.execute(
        select(User).where(
            User.email_credits_reset_at <= now,
            User.email_credits_used > 0,
        )
    )
    users = result.scalars().all()

    if not users:
        # Also reset users who never had a reset date set but have used credits
        result2 = await db.execute(
            select(User).where(
                User.email_credits_reset_at.is_(None),
                User.email_credits_used > 0,
            )
        )
        users = result2.scalars().all()

    for user in users:
        user.email_credits_used = 0
        user.email_credits_reset_at = now + timedelta(days=30)
        logger.info("Reset email credits for user %s (%s)", user.id, user.email)

    if users:
        await db.commit()
        logger.info("Email credit reset complete: %d users reset", len(users))
