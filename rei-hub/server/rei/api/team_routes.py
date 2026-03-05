"""Team management routes — invitations, member management, seat allocation."""

from __future__ import annotations

import asyncio
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.api.auth import create_access_token, generate_csrf_token, hash_password, set_auth_cookies
from rei.api.deps import get_current_user, get_db
from rei.config import PLANS, get_settings
from rei.models.user import Invitation, User
from rei.schemas.auth import TokenResponse
from rei.services.email import send_email

logger = logging.getLogger(__name__)
team_router = APIRouter(prefix="/team", tags=["team"])


# ── Schemas ─────────────────────────────────────────────────────────────


class InviteRequest(BaseModel):
    email: str


class AcceptInviteRequest(BaseModel):
    token: str
    email: str
    password: str = Field(min_length=8)
    full_name: str


class MemberInfo(BaseModel):
    user_id: int
    email: str
    full_name: str | None
    created_at: datetime


class MembersResponse(BaseModel):
    members: list[MemberInfo]
    seats_used: int
    max_seats: int


class SeatsResponse(BaseModel):
    max_seats: int
    seats_used: int
    pending_invites: int
    available: int


class InviteResponse(BaseModel):
    ok: bool
    invitation_id: int
    email: str
    expires_at: datetime


class InviteValidationResponse(BaseModel):
    valid: bool
    owner_name: str | None = None
    owner_email: str | None = None
    invitee_email: str | None = None


class PendingInvitation(BaseModel):
    id: int
    email: str
    created_at: datetime
    expires_at: datetime


class PendingInvitesResponse(BaseModel):
    invitations: list[PendingInvitation]


class DeleteMemberResponse(BaseModel):
    ok: bool


class DeleteInviteResponse(BaseModel):
    ok: bool


# ── Helpers ─────────────────────────────────────────────────────────────


def _is_owner(user: User) -> bool:
    """Check if user is an account owner (not a team member)."""
    return user.owner_id is None


def _owner_only(user: User):
    """Raise if user is not an account owner."""
    if not _is_owner(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only account owners can manage team members",
        )


async def _get_plan_max_seats(plan: str) -> int:
    """Get max seats for a plan."""
    return PLANS.get(plan, {}).get("max_seats", 1)


def _plan_allows_team(plan: str) -> bool:
    """Check if a plan allows team members."""
    return plan != "starter"


# ═══════════════════════════════════════════════════════════════
# GET /team/members — List all team members
# ═══════════════════════════════════════════════════════════════


@team_router.get("/members", response_model=MembersResponse)
async def list_members(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all team members under the current owner."""
    _owner_only(user)

    # Query all users where owner_id == user.id
    result = await db.execute(
        select(User).where(User.owner_id == user.id)
    )
    members = result.scalars().all()

    # Get max seats from owner's plan
    max_seats = await _get_plan_max_seats(user.plan)

    member_infos = [
        MemberInfo(
            user_id=m.id,
            email=m.email,
            full_name=m.full_name,
            created_at=m.created_at,
        )
        for m in members
    ]

    return MembersResponse(
        members=member_infos,
        seats_used=user.seats_used,
        max_seats=max_seats,
    )


# ═══════════════════════════════════════════════════════════════
# GET /team/seats — Get seat allocation
# ═══════════════════════════════════════════════════════════════


@team_router.get("/seats", response_model=SeatsResponse)
async def get_seats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return seat allocation info for the current owner."""
    _owner_only(user)

    # Get max seats from plan
    max_seats = await _get_plan_max_seats(user.plan)

    # Count pending invitations
    result = await db.execute(
        select(Invitation).where(
            and_(
                Invitation.owner_id == user.id,
                Invitation.status == "pending",
                Invitation.expires_at > datetime.utcnow(),
            )
        )
    )
    pending = result.scalars().all()
    pending_invites = len(pending)

    seats_used = user.seats_used
    available = max_seats - seats_used

    return SeatsResponse(
        max_seats=max_seats,
        seats_used=seats_used,
        pending_invites=pending_invites,
        available=available,
    )


# ═══════════════════════════════════════════════════════════════
# POST /team/invite — Send team invitation
# ═══════════════════════════════════════════════════════════════


@team_router.post("/invite", response_model=InviteResponse)
async def send_invite(
    body: InviteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a team invitation to an email address."""
    _owner_only(user)

    settings = get_settings()

    # Validation 1: Plan must allow multi-user
    if not _plan_allows_team(user.plan):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your plan does not support team members. Upgrade to Pro or Team.",
        )

    # Validation 2: Get seat count and check capacity
    max_seats = await _get_plan_max_seats(user.plan)
    if user.seats_used >= max_seats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"You have reached the maximum of {max_seats} seats for your plan.",
        )

    # Validation 3: Email not already a team member
    result = await db.execute(
        select(User).where(
            and_(
                User.owner_id == user.id,
                User.email == body.email,
            )
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email is already a team member.",
        )

    # Validation 4: Email not already invited (pending)
    result = await db.execute(
        select(Invitation).where(
            and_(
                Invitation.owner_id == user.id,
                Invitation.email == body.email,
                Invitation.status == "pending",
                Invitation.expires_at > datetime.utcnow(),
            )
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email already has a pending invitation.",
        )

    # Validation 5: Email not an existing account owner
    result = await db.execute(
        select(User).where(
            and_(
                User.email == body.email,
                User.owner_id.is_(None),  # owner_id is NULL means they're an owner
            )
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This email is already an account owner.",
        )

    # Create invitation
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=14)

    invitation = Invitation(
        owner_id=user.id,
        email=body.email,
        token=token,
        status="pending",
        expires_at=expires_at,
    )
    db.add(invitation)
    await db.flush()

    # Increment owner's seats_used
    user.seats_used += 1

    await db.commit()
    await db.refresh(invitation)

    # Send invite email
    invite_url = f"{settings.hub_url}/accept-invite?token={token}"
    expires_str = expires_at.strftime("%B %d, %Y")
    owner_name = user.full_name or user.email

    html_content = (
        f"<p>Hi,</p>"
        f"<p><strong>{owner_name}</strong> has invited you to join their team on REI Fundamentals Hub.</p>"
        f"<p>Click the link below to create your account and get started:</p>"
        f'<p><a href="{invite_url}" style="background:#1B3A6B;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Accept Invitation</a></p>'
        f"<p>This invitation expires on {expires_str}.</p>"
        f"<p>— REI Fundamentals Hub Team</p>"
    )

    asyncio.create_task(
        send_email(
            to_email=body.email,
            to_name="",
            subject=f"{owner_name} invited you to REI Fundamentals Hub",
            html_content=html_content,
            settings=settings,
        )
    )

    return InviteResponse(
        ok=True,
        invitation_id=invitation.id,
        email=body.email,
        expires_at=expires_at,
    )


# ═══════════════════════════════════════════════════════════════
# GET /team/invite/{token} — Validate invitation (PUBLIC)
# ═══════════════════════════════════════════════════════════════


@team_router.get("/invite/{token}", response_model=InviteValidationResponse)
async def validate_invite(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Validate an invitation token (public — no auth required)."""
    result = await db.execute(
        select(Invitation).where(Invitation.token == token)
    )
    invitation = result.scalar_one_or_none()

    if invitation is None:
        return InviteValidationResponse(valid=False)

    # Check expiration and status
    if invitation.status != "pending" or invitation.expires_at <= datetime.utcnow():
        return InviteValidationResponse(valid=False)

    # Get owner info
    owner_result = await db.execute(
        select(User).where(User.id == invitation.owner_id)
    )
    owner = owner_result.scalar_one_or_none()

    if owner is None:
        return InviteValidationResponse(valid=False)

    return InviteValidationResponse(
        valid=True,
        owner_name=owner.full_name or owner.email,
        owner_email=owner.email,
        invitee_email=invitation.email,
    )


# ═══════════════════════════════════════════════════════════════
# POST /team/accept — Accept invitation and create account (PUBLIC)
# ═══════════════════════════════════════════════════════════════


@team_router.post("/accept", response_model=TokenResponse)
async def accept_invite(
    body: AcceptInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    """Accept an invitation and create a team member account."""
    # Validate invitation token
    result = await db.execute(
        select(Invitation).where(Invitation.token == body.token)
    )
    invitation = result.scalar_one_or_none()

    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation.",
        )

    if invitation.status != "pending" or invitation.expires_at <= datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation has expired.",
        )

    # Validate email matches
    if body.email != invitation.email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email does not match the invitation.",
        )

    # Validate password
    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters.",
        )

    # Check if email already exists
    result = await db.execute(
        select(User).where(User.email == body.email)
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists.",
        )

    # Create new user
    hashed_password = hash_password(body.password)
    new_user = User(
        email=body.email,
        hashed_password=hashed_password,
        full_name=body.full_name,
        owner_id=invitation.owner_id,
        plan="starter",  # doesn't matter, they inherit owner's
        subscription_status="active",
        trial_ends_at=None,
        is_active=True,
    )
    db.add(new_user)
    await db.flush()

    # Update invitation
    invitation.status = "accepted"
    invitation.accepted_at = datetime.utcnow()
    invitation.joined_user_id = new_user.id

    await db.commit()
    await db.refresh(new_user)

    # Issue JWT tokens using the same pattern as auth_routes.py
    from fastapi.responses import JSONResponse

    access_token = create_access_token(data={"sub": new_user.id}, token_type="access")
    refresh_token = create_access_token(data={"sub": new_user.id}, token_type="refresh")
    csrf_token = generate_csrf_token()

    # Build response
    response_data = {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": new_user.id,
        "email": new_user.email,
        "plan": "starter",
    }
    response = JSONResponse(content=response_data, status_code=201)
    set_auth_cookies(response, access_token, refresh_token, csrf_token)

    return response


# ═══════════════════════════════════════════════════════════════
# DELETE /team/members/{member_id} — Remove team member
# ═══════════════════════════════════════════════════════════════


@team_router.delete("/members/{member_id}", response_model=DeleteMemberResponse)
async def delete_member(
    member_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a team member (owner only)."""
    _owner_only(user)

    # Fetch the member
    result = await db.execute(
        select(User).where(User.id == member_id)
    )
    member = result.scalar_one_or_none()

    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Team member not found.",
        )

    # Validate member belongs to this owner
    if member.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only remove your own team members.",
        )

    # Delete the member
    await db.delete(member)

    # Decrement owner's seats_used
    user.seats_used -= 1
    if user.seats_used < 1:
        user.seats_used = 1

    await db.commit()

    return DeleteMemberResponse(ok=True)


# ═══════════════════════════════════════════════════════════════
# GET /team/pending — List pending invitations
# ═══════════════════════════════════════════════════════════════


@team_router.get("/pending", response_model=PendingInvitesResponse)
async def list_pending(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return pending invitations for the current owner."""
    _owner_only(user)

    result = await db.execute(
        select(Invitation).where(
            and_(
                Invitation.owner_id == user.id,
                Invitation.status == "pending",
                Invitation.expires_at > datetime.utcnow(),
            )
        )
    )
    invitations = result.scalars().all()

    pending_list = [
        PendingInvitation(
            id=inv.id,
            email=inv.email,
            created_at=inv.created_at,
            expires_at=inv.expires_at,
        )
        for inv in invitations
    ]

    return PendingInvitesResponse(invitations=pending_list)


# ═══════════════════════════════════════════════════════════════
# DELETE /team/invite/{invitation_id} — Cancel invitation
# ═══════════════════════════════════════════════════════════════


@team_router.delete("/invite/{invitation_id}", response_model=DeleteInviteResponse)
async def cancel_invite(
    invitation_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel a pending invitation (owner only)."""
    _owner_only(user)

    # Fetch the invitation
    result = await db.execute(
        select(Invitation).where(Invitation.id == invitation_id)
    )
    invitation = result.scalar_one_or_none()

    if invitation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found.",
        )

    # Validate invitation belongs to this owner
    if invitation.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only cancel your own invitations.",
        )

    # Mark as canceled or delete
    invitation.status = "canceled"

    # Decrement owner's seats_used
    user.seats_used -= 1
    if user.seats_used < 1:
        user.seats_used = 1

    await db.commit()

    return DeleteInviteResponse(ok=True)
