"""Onboarding routes — status, step saves, completion, skip."""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db
from rei.config import get_settings
from rei.models.user import EmailDomain, PhoneNumber, User
from rei.services import twilio_service
from rei.services.email_provider import email_provider

logger = logging.getLogger(__name__)
settings = get_settings()

onboarding_router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# ── Schemas ────────────────────────────────────────────────────────────


class StepBody(BaseModel):
    """Unified body for all onboarding steps. Only relevant fields are used."""

    # Step 1 — Company Info
    company_name: Optional[str] = None
    company_address: Optional[str] = None
    company_city: Optional[str] = None
    company_state: Optional[str] = None
    company_zip: Optional[str] = None
    company_phone: Optional[str] = None
    company_website: Optional[str] = None
    # Step 2 — Investing Profile
    investing_experience: Optional[str] = None
    deal_types: Optional[str] = None  # JSON list
    primary_market: Optional[str] = None
    # Step 3 — Storage
    storage_provider: Optional[str] = None
    # Step 4 — Phone
    phone_number: Optional[str] = None
    area_code: Optional[str] = None
    # Step 5 — Email Domain
    domain: Optional[str] = None
    from_name: Optional[str] = None
    from_email: Optional[str] = None


# ── GET /api/onboarding/status ─────────────────────────────────────────


@onboarding_router.get("/status")
async def onboarding_status(
    user: User = Depends(get_current_user),
):
    return {
        "completed": user.onboarding_completed,
        "current_step": user.onboarding_step,
        "user": {
            "company_name": user.company_name,
            "company_address": user.company_address,
            "company_city": user.company_city,
            "company_state": user.company_state,
            "company_zip": user.company_zip,
            "company_phone": user.company_phone,
            "company_website": user.company_website,
            "investing_experience": user.investing_experience,
            "deal_types": user.deal_types,
            "primary_market": user.primary_market,
            "storage_provider": user.storage_provider,
            "email": user.email,
            "full_name": user.full_name,
        },
    }


# ── PATCH /api/onboarding/step/{step_number} ──────────────────────────


@onboarding_router.patch("/step/{step_number}")
async def save_step(
    step_number: int,
    body: StepBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if step_number < 1 or step_number > 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Step number must be between 1 and 6",
        )

    result: dict = {"success": True, "next_step": step_number + 1}

    if step_number == 1:
        if not body.company_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Company name is required",
            )
        user.company_name = body.company_name
        user.company_address = body.company_address
        user.company_city = body.company_city
        user.company_state = body.company_state
        user.company_zip = body.company_zip
        user.company_phone = body.company_phone
        user.company_website = body.company_website

    elif step_number == 2:
        user.investing_experience = body.investing_experience
        user.deal_types = body.deal_types
        user.primary_market = body.primary_market

    elif step_number == 3:
        user.storage_provider = body.storage_provider

    elif step_number == 4:
        if not body.phone_number:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Phone number is required for this step",
            )

        # Create subaccount if needed
        if not user.twilio_subaccount_sid:
            try:
                sub = await twilio_service.create_subaccount(
                    f"REIHub-{user.id}-{user.email}", settings
                )
                user.twilio_subaccount_sid = sub["sid"]
                user.twilio_subaccount_auth_token = sub["auth_token"]
                await db.flush()
            except Exception:
                logger.exception("Failed to create Twilio subaccount during onboarding")
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Failed to provision phone system. Please try again.",
                )

        # Purchase number
        try:
            base = settings.hub_url
            voice_url = f"{base}/api/phone/webhook/voice"
            sms_url = f"{base}/api/phone/webhook/sms"
            fax_url = f"{base}/api/phone/webhook/fax"

            purchase_result = await twilio_service.purchase_number(
                body.phone_number,
                f"REIHub-{user.company_name or user.email}",
                voice_url,
                sms_url,
                fax_url,
                user.twilio_subaccount_sid,
                settings,
            )

            phone = PhoneNumber(
                user_id=user.id,
                number=body.phone_number,
                friendly_name=f"REIHub-{user.company_name or user.email}",
                twilio_sid=purchase_result["sid"],
                number_type="local",
                capabilities=json.dumps(["voice", "sms"]),
                is_primary=True,
                monthly_cost=0.00,
            )
            db.add(phone)

            # Format friendly number
            raw = body.phone_number.replace("+1", "")
            friendly = (
                f"({raw[:3]}) {raw[3:6]}-{raw[6:]}"
                if len(raw) == 10
                else body.phone_number
            )

            result["number_purchased"] = body.phone_number
            result["friendly_number"] = friendly
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to purchase phone number during onboarding")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to purchase phone number. Please try again.",
            )

    elif step_number == 5:
        if not body.domain or not body.from_name or not body.from_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Domain, from_name, and from_email are required",
            )
        try:
            domain_result = await email_provider.add_domain(body.domain, settings)

            domain_record = EmailDomain(
                user_id=user.id,
                domain=body.domain,
                from_name=body.from_name,
                from_email=body.from_email,
                provider=settings.email_provider,
                provider_domain_id=domain_result.domain_id,
                dns_records=json.dumps(domain_result.dns_records),
                status=domain_result.status,
            )
            db.add(domain_record)

            result["dns_records"] = domain_result.dns_records
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to add email domain during onboarding")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to configure email domain. Please try again.",
            )

    # Step 6 has no body — handled by /complete

    # Update step progress
    if step_number > user.onboarding_step:
        user.onboarding_step = step_number

    await db.commit()
    return result


# ── POST /api/onboarding/complete ──────────────────────────────────────


@onboarding_router.post("/complete")
async def complete_onboarding(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Mark onboarding as completed FIRST and commit immediately
    # so it persists even if later steps (seeding, Twilio) fail.
    user.onboarding_completed = True
    user.onboarding_step = 6
    await db.commit()

    # Seed default checklists for all deal types (best-effort)
    from rei.api.documents_routes import seed_default_checklists

    try:
        await seed_default_checklists(user.id, db)
    except Exception:
        logger.exception("Failed to seed default checklists during onboarding")
        # Rollback the failed seed so the session is clean
        await db.rollback()

    # Provision Twilio subaccount if not done yet (best-effort)
    if not user.twilio_subaccount_sid:
        try:
            sub = await twilio_service.create_subaccount(
                f"REIHub-{user.id}-{user.email}", settings
            )
            user.twilio_subaccount_sid = sub["sid"]
            user.twilio_subaccount_auth_token = sub["auth_token"]
            await db.commit()
        except Exception:
            logger.exception("Failed to create Twilio subaccount on completion")
            await db.rollback()

    return {"success": True, "redirect": "/dashboard"}


# ── POST /api/onboarding/skip ─────────────────────────────────────────


@onboarding_router.post("/skip")
async def skip_onboarding(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.onboarding_completed = True
    await db.commit()
    return {"success": True}
