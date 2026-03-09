"""Negotiation cases API routes — case list, detail, update, and research trigger."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Optional

import base64

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import get_settings
from rei.models.negotiation import NegotiationCase, NegotiationActivity, NegotiationMessage, NegotiationRecipient, DealLien
from rei.models.crm import CrmDeal, DealFile
from rei.models.user import User

logger = logging.getLogger(__name__)

negotiation_cases_router = APIRouter(prefix="/api/negotiations/cases", tags=["negotiations"])


# ── Pydantic schemas ──────────────────────────────────────────────────


class UpdateCaseBody(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None


# ── Helper functions ─────────────────────────────────────────────────


def _utc_iso(dt: Optional[datetime]) -> Optional[str]:
    """Convert a naive-UTC datetime to an ISO string with 'Z' suffix.

    Python's datetime.utcnow() creates naive datetimes. When serialized
    without a timezone indicator, JavaScript's Date() treats them as local
    time instead of UTC, breaking timezone conversions on the frontend.
    """
    if dt is None:
        return None
    return dt.isoformat() + "Z"


def _case_to_dict(c: NegotiationCase) -> dict:
    """Convert NegotiationCase to camelCase dict."""
    return {
        "id": c.id,
        "requestId": c.request_id,
        "dealId": c.deal_id,
        "userId": c.user_id,
        "serviceType": c.service_type,
        "status": c.status,
        "priority": c.priority,
        "propertyAddress": c.property_address,
        "assignedAt": _utc_iso(c.assigned_at),
        "resolvedAt": _utc_iso(c.resolved_at),
        "createdAt": _utc_iso(c.created_at),
        "updatedAt": _utc_iso(c.updated_at),
    }


def _activity_to_dict(a: NegotiationActivity, is_admin: bool = False) -> dict:
    """Convert NegotiationActivity to camelCase dict with two-note visibility system.

    Always include: id, caseId, activityType, sendMethod, trackingStatus, uspsDeliveredDate,
    uspsSignedBy, createdBy, createdAt
    If is_admin: include adminNote, uspsTrackingNumber, uspsSignatureTrackingNumber, attachmentsJson
    If not is_admin: include userSummary (instead of adminNote), NO tracking numbers, NO attachments
    """
    result = {
        "id": a.id,
        "caseId": a.case_id,
        "activityType": a.activity_type,
        "sendMethod": a.send_method,
        "trackingStatus": a.tracking_status,
        "uspsDeliveredDate": _utc_iso(a.usps_delivered_date),
        "uspsSignedBy": a.usps_signed_by,
        "createdBy": a.created_by,
        "createdAt": _utc_iso(a.created_at),
    }

    if is_admin:
        result["adminNote"] = a.admin_note
        result["uspsTrackingNumber"] = a.usps_tracking_number
        result["uspsSignatureTrackingNumber"] = a.usps_signature_tracking_number
        attachments = None
        if a.attachments_json:
            try:
                attachments = json.loads(a.attachments_json)
            except (json.JSONDecodeError, TypeError):
                attachments = None
        result["attachmentsJson"] = attachments
    else:
        result["userSummary"] = a.user_summary

    return result


# ── Endpoints ─────────────────────────────────────────────────────────


@negotiation_cases_router.get("")
async def list_cases(
    status: Optional[str] = Query(None),
    service_type: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List negotiation cases.

    If user.is_superadmin: list ALL cases
    Else: list only user's own cases

    Support query params: status, service_type
    Order by created_at desc
    """
    query = select(NegotiationCase)

    # Filter by user unless superadmin
    if not user.is_superadmin:
        query = query.where(NegotiationCase.user_id == user.id)

    # Apply optional filters
    if status is not None:
        query = query.where(NegotiationCase.status == status)
    if service_type is not None:
        query = query.where(NegotiationCase.service_type == service_type)

    # Order by created_at desc
    query = query.order_by(NegotiationCase.created_at.desc())

    result = await db.execute(query)
    cases = result.scalars().all()

    return [_case_to_dict(c) for c in cases]


@negotiation_cases_router.get("/{case_id}")
async def get_case(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get case detail with activities and unread message count.

    Superadmin can see any case; regular user can only see their own.
    Return case dict + activities list + unread message count
    """
    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Check authorization
    if not user.is_superadmin and case.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Fetch activities
    activities_result = await db.execute(
        select(NegotiationActivity)
        .where(NegotiationActivity.case_id == case_id)
        .order_by(NegotiationActivity.created_at.desc())
    )
    activities = activities_result.scalars().all()

    # Count unread messages (messages where read_at is None and sender is not the current user)
    unread_count_result = await db.execute(
        select(func.count(NegotiationMessage.id)).where(
            NegotiationMessage.case_id == case_id,
            NegotiationMessage.read_at.is_(None),
            NegotiationMessage.sender_id != user.id,
        )
    )
    unread_count = unread_count_result.scalar() or 0

    # Fetch deal details for context
    deal_dict = None
    liens_list = []
    if case.deal_id:
        deal_obj = await db.get(CrmDeal, case.deal_id)
        if deal_obj:
            deal_dict = {
                "id": deal_obj.id,
                "address": deal_obj.address,
                "city": deal_obj.city,
                "state": deal_obj.state,
                "zip": deal_obj.zip if hasattr(deal_obj, "zip") else None,
                "propertyType": deal_obj.property_type if hasattr(deal_obj, "property_type") else None,
                "bedrooms": deal_obj.bedrooms if hasattr(deal_obj, "bedrooms") else None,
                "bathrooms": deal_obj.bathrooms if hasattr(deal_obj, "bathrooms") else None,
                "sqft": deal_obj.square_footage if hasattr(deal_obj, "square_footage") else None,
                "listPrice": deal_obj.list_price if hasattr(deal_obj, "list_price") else None,
                "purchasePrice": deal_obj.purchase_price if hasattr(deal_obj, "purchase_price") else None,
                "arv": deal_obj.arv if hasattr(deal_obj, "arv") else None,
                "rehabEstimate": deal_obj.rehab_estimate if hasattr(deal_obj, "rehab_estimate") else None,
                "monthlyRent": deal_obj.monthly_rent if hasattr(deal_obj, "monthly_rent") else None,
            }

        liens_result = await db.execute(
            select(DealLien).where(DealLien.deal_id == case.deal_id).order_by(DealLien.created_at.asc())
        )
        for lien in liens_result.scalars().all():
            liens_list.append({
                "id": lien.id,
                "lienType": lien.lien_type,
                "lienHolder": lien.lien_holder,
                "balance": lien.balance,
                "monthlyPayment": lien.monthly_payment,
                "interestRate": lien.interest_rate,
                "status": lien.status,
                "monthsBehind": lien.months_behind if hasattr(lien, "months_behind") else None,
            })

    return {
        "case": _case_to_dict(case),
        "activities": [_activity_to_dict(a, is_admin=user.is_superadmin) for a in activities],
        "unreadMessageCount": unread_count,
        "deal": deal_dict,
        "liens": liens_list,
    }


@negotiation_cases_router.patch("/{case_id}")
async def update_case(
    case_id: str,
    body: UpdateCaseBody,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update case (admin only).

    Superadmin only.
    If status changes to "resolved", set resolved_at = now
    Create a NegotiationActivity with activity_type="status_change" and admin_note describing the change
    """
    # Authorization check: superadmin only
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    old_status = case.status

    # Update status if provided
    if body.status is not None:
        case.status = body.status

        # If resolving, set resolved_at
        if body.status == "resolved":
            case.resolved_at = datetime.utcnow()

    # Update priority if provided
    if body.priority is not None:
        case.priority = body.priority

    case.updated_at = datetime.utcnow()

    # Create activity for status change
    if body.status is not None and body.status != old_status:
        activity = NegotiationActivity(
            case_id=case_id,
            activity_type="status_change",
            admin_note=f"Status changed from '{old_status}' to '{body.status}'",
            created_by="admin",
        )
        db.add(activity)

    db.add(case)
    await db.commit()
    await db.refresh(case)

    return _case_to_dict(case)


@negotiation_cases_router.post("/{case_id}/research")
async def trigger_research(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger AI contact research — runs synchronously using request DB session.

    Superadmin only.
    Researches all 4 recipients, saves results, logs activity, updates status.
    Returns full results so the frontend can display them immediately.
    Wrapped in a 4-minute timeout so stuck API calls don't hang forever.
    """
    import asyncio
    import json as _json
    from rei.services.contact_research import research_bank_contacts

    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Set status to researching
    case.status = "researching"
    case.updated_at = datetime.utcnow()
    await db.commit()

    try:
        # Get deal + lien info (same session that works for diagnostic test)
        deal = await db.get(CrmDeal, case.deal_id) if case.deal_id else None
        state = deal.state if deal else ""

        # Build full property address for tax lookups
        property_address = ""
        if deal:
            parts = [deal.address, deal.city, deal.state, deal.zip]
            property_address = ", ".join(p for p in parts if p)

        lien_result = await db.execute(
            select(DealLien).where(DealLien.deal_id == case.deal_id).limit(1)
        )
        lien = lien_result.scalar_one_or_none()
        bank_name = lien.lien_holder if lien else "Unknown"

        logger.info(
            "=== Starting AI research for case %s, bank=%s, state=%s, service=%s ===",
            case_id, bank_name, state, case.service_type,
        )

        # Run research — tax recipients included only for county_tax service type
        # 4-minute timeout so stuck API calls don't leave status as "researching" forever
        try:
            results = await asyncio.wait_for(
                research_bank_contacts(
                    bank_name=bank_name,
                    state=state or "",
                    negotiation_id=str(case.id),
                    user_id=user.id,
                    db=db,
                    settings=get_settings(),
                    property_address=property_address,
                    service_type=case.service_type,
                ),
                timeout=240.0,  # 4 minutes max
            )
        except asyncio.TimeoutError:
            raise Exception("Research timed out after 4 minutes. The AI provider may be slow or unreachable. Try again later.")

        logger.info("Research: got %d results", len(results))

        # Delete existing recipients for this case (re-research replaces old data)
        old = await db.execute(
            select(NegotiationRecipient).where(NegotiationRecipient.case_id == case_id)
        )
        for r in old.scalars().all():
            await db.delete(r)

        # Save each recipient to the database
        valid_count = 0
        debug_snippets = []
        for r in results:
            has_data = any(r.get(k) for k in ["name", "mailing_address", "phone", "email"])
            if has_data:
                valid_count += 1

            if r.get("parse_error"):
                raw = r.get("_raw_preview", "n/a")
                prov = r.get("_provider", "?")
                mdl = r.get("_model", "?")
                toks = r.get("_tokens", 0)
                debug_snippets.append(
                    f"{r.get('recipient_type','?')}: PARSE_ERROR "
                    f"[{prov}/{mdl} toks={toks}] raw='{raw[:80]}'"
                )
            elif not has_data:
                debug_snippets.append(f"{r.get('recipient_type','?')}: ALL_NULL")

            recipient = NegotiationRecipient(
                case_id=str(case.id),
                recipient_type=r.get("recipient_type", ""),
                name=r.get("name"),
                title=r.get("title"),
                mailing_address=r.get("mailing_address"),
                mailing_city=r.get("mailing_city"),
                mailing_state=r.get("mailing_state"),
                mailing_zip=r.get("mailing_zip"),
                phone=r.get("phone"),
                fax=r.get("fax"),
                email=r.get("email"),
                confidence=r.get("confidence"),
                sources_json=_json.dumps(r.get("sources", [])),
            )
            db.add(recipient)

        # Log an activity for the research completion
        if valid_count > 0:
            note = f"AI research completed for {bank_name}. Found {valid_count} of {len(results)} recipient contacts with usable data."
            summary = "Contact research has been completed for your case."
        else:
            debug_info = "; ".join(debug_snippets) if debug_snippets else "no debug info"
            note = (
                f"AI research for {bank_name} returned no usable contact data. "
                f"Results: {len(results)} returned, 0 with data. "
                f"Debug: {debug_info}. "
                "Check Admin → AI Provider Settings and server logs."
            )
            summary = "Contact research completed but could not find contact information. Our team will follow up."

        activity = NegotiationActivity(
            case_id=str(case.id),
            activity_type="ai_research",
            admin_note=note,
            user_summary=summary,
            created_by="ai",
        )
        db.add(activity)

        # Update case status to in_progress
        case.status = "in_progress"
        case.updated_at = datetime.utcnow()
        await db.commit()

        logger.info("Research completed for case %s: %d of 4 recipients had data", case_id, valid_count)

        return {
            "detail": f"Research completed. {valid_count} of 4 contacts found.",
            "valid_count": valid_count,
            "total": len(results),
        }

    except Exception as e:
        logger.error("Contact research failed for case %s: %s", case_id, e)
        # Reset status and log error
        try:
            case.status = "intake"
            case.updated_at = datetime.utcnow()

            err_activity = NegotiationActivity(
                case_id=str(case.id),
                activity_type="ai_research",
                admin_note=f"AI research failed: {str(e)[:300]}",
                user_summary="Contact research encountered an issue and will be retried.",
                created_by="system",
            )
            db.add(err_activity)
            await db.commit()
        except Exception as inner_err:
            logger.error("Failed to log research error: %s", inner_err)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Research failed: {str(e)[:200]}",
        )


@negotiation_cases_router.post("/{case_id}/research-agent")
async def trigger_agent_research(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trigger agentic AI contact research — uses tool-calling loop for deeper results.

    Superadmin only.
    Same as trigger_research but uses the agent-based approach where Kimi K2.5
    uses tools (web search, SEC lookup, state registry, etc.) to research
    contacts step by step rather than in a single-shot prompt.
    Wrapped in a 6-minute timeout (agents take longer than single-shot).
    """
    import asyncio
    import json as _json
    from rei.services.contact_research import research_bank_contacts_agent

    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    # Set status to researching
    case.status = "researching"
    case.updated_at = datetime.utcnow()
    await db.commit()

    try:
        # Get deal + lien info
        deal = await db.get(CrmDeal, case.deal_id) if case.deal_id else None
        state = deal.state if deal else ""

        property_address = ""
        if deal:
            parts = [deal.address, deal.city, deal.state, deal.zip]
            property_address = ", ".join(p for p in parts if p)

        lien_result = await db.execute(
            select(DealLien).where(DealLien.deal_id == case.deal_id).limit(1)
        )
        lien = lien_result.scalar_one_or_none()
        bank_name = lien.lien_holder if lien else "Unknown"

        logger.info(
            "=== Starting AGENT research for case %s, bank=%s, state=%s, service=%s ===",
            case_id, bank_name, state, case.service_type,
        )

        # Run agent-based research with 6-minute timeout
        try:
            results = await asyncio.wait_for(
                research_bank_contacts_agent(
                    bank_name=bank_name,
                    state=state or "",
                    negotiation_id=str(case.id),
                    user_id=user.id,
                    db=db,
                    settings=get_settings(),
                    property_address=property_address,
                    service_type=case.service_type,
                ),
                timeout=360.0,  # 6 minutes for agent research
            )
        except asyncio.TimeoutError:
            raise Exception("Agent research timed out after 6 minutes. The AI provider may be slow or unreachable. Try again later.")

        logger.info("Agent research: got %d results", len(results))

        # Delete existing recipients for this case (re-research replaces old data)
        old = await db.execute(
            select(NegotiationRecipient).where(NegotiationRecipient.case_id == case_id)
        )
        for r in old.scalars().all():
            await db.delete(r)

        # Save each recipient to the database
        valid_count = 0
        agent_stats = []
        for r in results:
            has_data = any(r.get(k) for k in ["name", "mailing_address", "phone", "email"])
            if has_data:
                valid_count += 1

            # Track agent metrics
            agent_stats.append({
                "type": r.get("recipient_type", "?"),
                "has_data": has_data,
                "turns": r.get("_agent_turns", 0),
                "tools": r.get("_agent_tools", []),
                "tokens": r.get("_tokens", 0),
            })

            recipient = NegotiationRecipient(
                case_id=str(case.id),
                recipient_type=r.get("recipient_type", ""),
                name=r.get("name"),
                title=r.get("title"),
                mailing_address=r.get("mailing_address"),
                mailing_city=r.get("mailing_city"),
                mailing_state=r.get("mailing_state"),
                mailing_zip=r.get("mailing_zip"),
                phone=r.get("phone"),
                fax=r.get("fax"),
                email=r.get("email"),
                confidence=r.get("confidence"),
                sources_json=_json.dumps(r.get("sources", [])),
            )
            db.add(recipient)

        # Build a detailed admin note showing agent activity
        total_tools = sum(len(s["tools"]) for s in agent_stats)
        total_turns = sum(s["turns"] for s in agent_stats)
        total_tokens = sum(s["tokens"] for s in agent_stats)

        if valid_count > 0:
            note = (
                f"AI Agent research completed for {bank_name}. "
                f"Found {valid_count} of {len(results)} contacts with usable data. "
                f"Agent used {total_tools} tool calls across {total_turns} turns ({total_tokens} tokens)."
            )
            summary = "Contact research has been completed for your case using our advanced AI agent."
        else:
            note = (
                f"AI Agent research for {bank_name} returned no usable contact data. "
                f"Agent used {total_tools} tool calls across {total_turns} turns ({total_tokens} tokens). "
                "Check server logs for details."
            )
            summary = "Contact research completed but could not find contact information. Our team will follow up."

        activity = NegotiationActivity(
            case_id=str(case.id),
            activity_type="ai_research",
            admin_note=note,
            user_summary=summary,
            created_by="ai_agent",
        )
        db.add(activity)

        case.status = "in_progress"
        case.updated_at = datetime.utcnow()
        await db.commit()

        logger.info(
            "Agent research completed for case %s: %d of %d contacts, %d tools, %d turns",
            case_id, valid_count, len(results), total_tools, total_turns,
        )

        return {
            "detail": f"Agent research completed. {valid_count} of {len(results)} contacts found.",
            "valid_count": valid_count,
            "total": len(results),
            "agent_stats": agent_stats,
        }

    except Exception as e:
        logger.error("Agent research failed for case %s: %s", case_id, e)
        try:
            case.status = "intake"
            case.updated_at = datetime.utcnow()

            err_activity = NegotiationActivity(
                case_id=str(case.id),
                activity_type="ai_research",
                admin_note=f"AI Agent research failed: {str(e)[:300]}",
                user_summary="Contact research encountered an issue and will be retried.",
                created_by="system",
            )
            db.add(err_activity)
            await db.commit()
        except Exception as inner_err:
            logger.error("Failed to log agent research error: %s", inner_err)

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Agent research failed: {str(e)[:200]}",
        )


@negotiation_cases_router.post("/{case_id}/research-test")
async def test_research(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Synchronous diagnostic endpoint — runs ONE recipient research inline.

    Superadmin only. Does NOT save results to DB or change case status.
    Returns the raw AI response so admin can see exactly what's happening.
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    from rei.config import get_settings

    # Get deal + lien info
    deal = await db.get(CrmDeal, case.deal_id) if case.deal_id else None
    state = deal.state if deal else ""

    lien_result = await db.execute(
        select(DealLien).where(DealLien.deal_id == case.deal_id).limit(1)
    )
    lien = lien_result.scalar_one_or_none()
    bank_name = lien.lien_holder if lien else "Unknown"

    # Check credentials
    cred_info = {}
    try:
        from rei.services.credentials_service import get_provider_credentials
        nv_creds = await get_provider_credentials(db, "nvidia")
        has_nvidia = bool(nv_creds and nv_creds.get("nvidia_api_key"))
        anth_creds = await get_provider_credentials(db, "anthropic")
        has_anthropic = bool(anth_creds and anth_creds.get("anthropic_api_key"))
        cred_info = {"nvidia_key_found": has_nvidia, "anthropic_key_found": has_anthropic}
    except Exception as e:
        cred_info = {"credential_error": str(e)}

    # Run ONE recipient research (CEO) synchronously
    try:
        from rei.services.contact_research import _research_one_recipient, RECIPIENT_TYPES
        settings = get_settings()

        raw_result = await _research_one_recipient(
            bank_name=bank_name,
            state=state or "",
            recipient_type="ceo",
            config=RECIPIENT_TYPES["ceo"],
            user_id=user.id,
            db=db,
            settings=settings,
        )

        return {
            "status": "ok",
            "bank_name": bank_name,
            "state": state,
            "credentials": cred_info,
            "raw_result": raw_result,
            "has_real_data": any(raw_result.get(k) for k in ["name", "mailing_address", "phone", "email"]),
            "parse_error": raw_result.get("parse_error", False),
        }

    except Exception as e:
        return {
            "status": "error",
            "bank_name": bank_name,
            "state": state,
            "credentials": cred_info,
            "error": str(e),
            "error_type": type(e).__name__,
        }


@negotiation_cases_router.get("/{case_id}/recipients")
async def list_recipients(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List AI-researched recipients for a negotiation case.

    Superadmin only.
    Returns list of recipient dicts with contact info.
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    try:
        result = await db.execute(
            select(NegotiationRecipient)
            .where(NegotiationRecipient.case_id == case_id)
            .order_by(NegotiationRecipient.created_at.asc())
        )
        recipients = result.scalars().all()
    except Exception as e:
        logger.error("Failed to query recipients for case %s: %s", case_id, e)
        return []

    return [
        {
            "id": r.id,
            "caseId": r.case_id,
            "recipientType": r.recipient_type,
            "name": r.name,
            "title": r.title,
            "mailingAddress": r.mailing_address,
            "mailingCity": r.mailing_city,
            "mailingState": r.mailing_state,
            "mailingZip": r.mailing_zip,
            "phone": r.phone,
            "fax": r.fax,
            "email": r.email,
            "confidence": r.confidence,
            "sources": json.loads(r.sources_json) if r.sources_json else [],
            "createdAt": _utc_iso(r.created_at),
            "updatedAt": _utc_iso(r.updated_at),
        }
        for r in recipients
    ]


@negotiation_cases_router.get("/{case_id}/files")
async def list_case_files(
    case_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List deal files associated with a negotiation case.

    Superadmin only.
    Fetches the case's deal_id, then lists all DealFile records for that deal
    (using the case owner's user_id, not the admin's).
    Returns metadata only — no file content (to keep response fast).
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    if not case.deal_id:
        return []

    # Fetch files using the case OWNER's user_id (not the admin's)
    try:
        files_result = await db.execute(
            select(DealFile)
            .where(DealFile.deal_id == case.deal_id, DealFile.user_id == case.user_id)
            .order_by(DealFile.created_at.desc())
        )
        files = files_result.scalars().all()
    except Exception as e:
        logger.error("Failed to query files for case %s: %s", case_id, e)
        return []

    result_list = []
    for f in files:
        try:
            result_list.append({
                "id": f.id,
                "dealId": f.deal_id,
                "fileType": f.file_type,
                "category": f.category,
                "fileName": f.file_name,
                "mimeType": f.mime_type,
                "fileSize": f.file_size,
                "notes": f.notes,
                "transactionPhase": f.transaction_phase,
                "adminOnly": getattr(f, "admin_only", False),
                "hasThumbnail": bool(getattr(f, "thumbnail", None)),
                "createdAt": _utc_iso(f.created_at),
            })
        except Exception as e:
            logger.error("Failed to serialize file %s: %s", getattr(f, "id", "?"), e)

    return result_list


@negotiation_cases_router.get("/{case_id}/files/{file_id}")
async def get_case_file(
    case_id: str,
    file_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download/view a specific deal file from a negotiation case.

    Superadmin only.
    Returns file content (base64) + metadata.
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    file_result = await db.execute(
        select(DealFile).where(
            DealFile.id == file_id,
            DealFile.deal_id == case.deal_id,
            DealFile.user_id == case.user_id,
        )
    )
    file = file_result.scalar_one_or_none()

    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return {
        "id": file.id,
        "fileName": file.file_name,
        "mimeType": file.mime_type,
        "fileType": file.file_type,
        "category": file.category,
        "fileContent": file.file_content,
        "thumbnail": file.thumbnail,
        "notes": file.notes,
        "createdAt": _utc_iso(file.created_at),
    }


@negotiation_cases_router.post("/{case_id}/files", status_code=status.HTTP_201_CREATED)
async def upload_case_file(
    case_id: str,
    file: UploadFile = File(...),
    category: str = Form(default="other"),
    notes: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file to a negotiation case (superadmin only).

    Files uploaded here are automatically marked admin_only=True
    so the subscriber cannot see them. They are stored as base64
    in the deal_files table under the case owner's user_id.
    """
    if not user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    result = await db.execute(
        select(NegotiationCase).where(NegotiationCase.id == case_id)
    )
    case = result.scalar_one_or_none()

    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")

    if not case.deal_id:
        raise HTTPException(status_code=400, detail="Case has no associated deal")

    # Read file content
    file_bytes = await file.read()
    file_b64 = base64.b64encode(file_bytes).decode("utf-8")

    # Determine file_type based on mime
    mime = file.content_type or "application/octet-stream"
    file_type = "photo" if mime.startswith("image/") else "document"

    new_file = DealFile(
        user_id=case.user_id,  # Store under the case owner
        deal_id=case.deal_id,
        file_type=file_type,
        category=category,
        file_name=file.filename or "untitled",
        mime_type=mime,
        file_size=len(file_bytes),
        file_content=file_b64,
        notes=notes,
        admin_only=True,  # Hidden from subscriber
    )

    db.add(new_file)
    await db.commit()
    await db.refresh(new_file)

    return {
        "id": new_file.id,
        "dealId": new_file.deal_id,
        "fileType": new_file.file_type,
        "category": new_file.category,
        "fileName": new_file.file_name,
        "mimeType": new_file.mime_type,
        "fileSize": new_file.file_size,
        "notes": new_file.notes,
        "adminOnly": new_file.admin_only,
        "hasThumbnail": False,
        "createdAt": _utc_iso(new_file.created_at),
    }
