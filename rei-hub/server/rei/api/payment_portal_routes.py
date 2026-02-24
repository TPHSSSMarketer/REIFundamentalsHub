"""TPHS Payment Portal — public endpoints for buyer loan payments.

Prefix: /api/portal
No authentication required — these are public-facing endpoints.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.sql import func

from rei.config import get_settings
from rei.database import async_session_factory
from rei.models.loan import LoanAccount, LoanPayment
from rei.services.security import (
    sanitize_text,
    sanitize_email,
    sanitize_phone,
    sanitize_currency,
    sanitize_state_code,
    sanitize_account_number,
    check_rate_limit,
    rl_key,
    rl_ip_key,
    audit_log,
)

logger = logging.getLogger(__name__)
settings = get_settings()

payment_portal_router = APIRouter(prefix="/portal", tags=["payment-portal"])

# ── In-memory rate limiter ──────────────────────────────────────────────
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT_MAX = 10
_RATE_LIMIT_WINDOW = 60  # seconds

# Failed lookup tracking — block IP after 3 failures in 5 minutes
_failed_lookup_store: dict[str, list[float]] = defaultdict(list)
_FAILED_LOOKUP_MAX = 3
_FAILED_LOOKUP_WINDOW = 300  # 5 minutes
_FAILED_LOOKUP_BLOCK = 900  # 15 minutes
_blocked_ips: dict[str, float] = {}  # ip -> blocked_until timestamp


def _check_rate_limit(ip: str) -> bool:
    """Return True if the request is allowed, False if rate-limited."""
    now = time.time()
    timestamps = _rate_limit_store[ip]
    # Purge old entries outside the window
    _rate_limit_store[ip] = [t for t in timestamps if now - t < _RATE_LIMIT_WINDOW]
    if len(_rate_limit_store[ip]) >= _RATE_LIMIT_MAX:
        return False
    _rate_limit_store[ip].append(now)
    return True


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request, respecting X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Request / Response schemas ──────────────────────────────────────────


class StripPaymentRequest(BaseModel):
    account_number: str
    amount_cents: int
    payment_method_id: str


class ManualPaymentRequest(BaseModel):
    account_number: str
    amount: float
    payment_method: str  # "check" or "wire"
    reference_number: str = ""
    notes: str = ""


# ── Helpers ─────────────────────────────────────────────────────────────


def _gen_confirmation() -> str:
    """Generate a short human-readable confirmation number."""
    return f"TPHS-{uuid.uuid4().hex[:8].upper()}"


def _compute_late_info(
    account: LoanAccount,
) -> tuple[bool, int, float]:
    """Return (is_late, days_late, late_fee_due) for a loan account."""
    if not account.next_due_date:
        return False, 0, 0.0

    now = datetime.now(timezone.utc)
    due = account.next_due_date
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)

    if now <= due:
        return False, 0, 0.0

    days_late = (now - due).days
    if days_late <= account.grace_period_days:
        return False, 0, 0.0

    return True, days_late, account.late_fee_amount


# ── Endpoints ───────────────────────────────────────────────────────────


@payment_portal_router.get("/health")
async def portal_health():
    """Verify the portal is running."""
    return {"status": "ok"}


@payment_portal_router.get("/lookup")
async def portal_lookup(
    account_number: str,
    property_address: str,
    request: Request,
):
    """Look up a loan account by account number + property address."""
    ip = _get_client_ip(request)

    # IP-based rate limit: 10 per minute
    if not check_rate_limit(rl_ip_key(ip, "portal_lookup"), max_requests=10, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests. Try again in a minute.")

    # Check if IP is blocked from too many failed lookups
    now_ts = time.time()
    if ip in _blocked_ips:
        if now_ts < _blocked_ips[ip]:
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")
        else:
            del _blocked_ips[ip]

    # Sanitize inputs
    try:
        account_number = sanitize_account_number(account_number)
        property_address = sanitize_text(property_address, 300)
    except ValueError:
        # Don't reveal validation details on public endpoint
        return {"valid": False}

    if not account_number.strip() or not property_address.strip():
        return {"valid": False}

    async with async_session_factory() as db:
        result = await db.execute(
            select(LoanAccount).where(
                func.lower(LoanAccount.account_number) == account_number.strip().lower(),
                LoanAccount.status == "active",
            )
        )
        account = result.scalar_one_or_none()

    valid = False

    if not account:
        valid = False
    else:
        # Verify property address matches (case-insensitive, loose match)
        stored_addr = account.property_address.lower().strip()
        input_addr = property_address.lower().strip()
        if input_addr not in stored_addr and stored_addr not in input_addr:
            valid = False
        else:
            valid = True

    if not valid:
        # Track failed lookups per IP
        _failed_lookup_store[ip] = [
            t for t in _failed_lookup_store[ip] if now_ts - t < _FAILED_LOOKUP_WINDOW
        ]
        _failed_lookup_store[ip].append(now_ts)
        if len(_failed_lookup_store[ip]) >= _FAILED_LOOKUP_MAX:
            _blocked_ips[ip] = now_ts + _FAILED_LOOKUP_BLOCK

        # Audit log
        try:
            async with async_session_factory() as audit_db:
                await audit_db.run_sync(lambda s: audit_log(
                    s, action="portal_lookup", user_id=None,
                    ip_address=ip,
                    details={"account_number": account_number, "found": False},
                    success=False,
                ))
        except Exception:
            pass

        return {"valid": False}

    is_late, days_late, late_fee_due = _compute_late_info(account)

    now = datetime.now(timezone.utc)
    due = account.next_due_date
    if due and due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    days_until_due = (due - now).days if due and due > now else 0

    total_due_now = account.monthly_payment + (late_fee_due if is_late else 0.0)

    # Return first name only for security
    first_name = account.buyer_name.split()[0] if account.buyer_name else ""

    # Audit log
    try:
        async with async_session_factory() as audit_db:
            await audit_db.run_sync(lambda s: audit_log(
                s, action="portal_lookup", user_id=None,
                ip_address=ip,
                details={"account_number": account_number, "found": True},
                success=True,
            ))
    except Exception:
        pass

    return {
        "valid": True,
        "buyer_name": first_name,
        "property_address": account.property_address,
        "current_balance": round(account.current_balance, 2),
        "monthly_payment": round(account.monthly_payment, 2),
        "next_due_date": due.strftime("%Y-%m-%d") if due else None,
        "days_until_due": days_until_due,
        "is_late": is_late,
        "days_late": days_late,
        "late_fee_due": round(late_fee_due, 2),
        "total_due_now": round(total_due_now, 2),
        "account_number": account.account_number,
        "payment_methods_accepted": ["stripe", "check", "wire"],
    }


@payment_portal_router.post("/pay/stripe")
async def portal_pay_stripe(body: StripPaymentRequest, request: Request):
    """Charge buyer's card via Stripe and record the payment."""
    ip = _get_client_ip(request)

    # Rate limit: 5 per hour per IP
    if not check_rate_limit(rl_ip_key(ip, "portal_pay_stripe"), max_requests=5, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many payment attempts. Try again later.")

    # Validate amount_cents
    if not isinstance(body.amount_cents, int) or body.amount_cents < 100:
        raise HTTPException(status_code=422, detail="Minimum payment is $1.00.")
    if body.amount_cents > 1_000_000:
        raise HTTPException(status_code=422, detail="Maximum payment is $10,000.")

    # Sanitize account number
    try:
        account_number = sanitize_account_number(body.account_number)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not settings.stripe_connect_secret_key:
        raise HTTPException(status_code=503, detail="Payment processing not configured.")

    async with async_session_factory() as db:
        result = await db.execute(
            select(LoanAccount).where(
                func.lower(LoanAccount.account_number) == account_number.strip().lower(),
                LoanAccount.status == "active",
            )
        )
        account = result.scalar_one_or_none()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found.")

        if body.amount_cents < int(account.monthly_payment * 100):
            raise HTTPException(
                status_code=400,
                detail=f"Minimum payment is ${account.monthly_payment:.2f}.",
            )

        # Create Stripe PaymentIntent using TPHS Connect credentials
        stripe.api_key = settings.stripe_connect_secret_key
        try:
            intent = stripe.PaymentIntent.create(
                amount=body.amount_cents,
                currency="usd",
                payment_method=body.payment_method_id,
                confirm=True,
                automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
                description=f"Loan payment — {account.account_number}",
                metadata={
                    "account_number": account.account_number,
                    "property_address": account.property_address,
                },
            )
        except stripe.error.CardError as e:
            raise HTTPException(status_code=400, detail=str(e.user_message or e))
        except stripe.error.StripeError as e:
            logger.exception("Stripe error processing portal payment")
            raise HTTPException(status_code=502, detail="Payment processing failed. Please try again.")

        if intent.status != "succeeded":
            raise HTTPException(status_code=400, detail="Payment was not completed. Please try again.")

        amount_dollars = body.amount_cents / 100.0
        balance_after = max(0.0, account.current_balance - amount_dollars)
        confirmation = _gen_confirmation()

        # Determine card last four from the payment method
        card_last_four = ""
        try:
            pm = stripe.PaymentMethod.retrieve(body.payment_method_id)
            if pm.card:
                card_last_four = pm.card.last4 or ""
        except Exception:
            pass

        receipt_url = ""
        if intent.latest_charge:
            try:
                charge = stripe.Charge.retrieve(intent.latest_charge)
                receipt_url = charge.receipt_url or ""
            except Exception:
                pass

        payment = LoanPayment(
            confirmation_number=confirmation,
            account_number=account.account_number,
            amount=amount_dollars,
            payment_method="stripe",
            status="completed",
            stripe_payment_intent_id=intent.id,
            stripe_receipt_url=receipt_url,
            card_last_four=card_last_four,
            balance_after=round(balance_after, 2),
        )
        db.add(payment)

        account.current_balance = round(balance_after, 2)
        await db.commit()

    # Audit log
    try:
        async with async_session_factory() as audit_db:
            await audit_db.run_sync(lambda s: audit_log(
                s, action="portal_payment_stripe", user_id=None,
                ip_address=ip,
                details={"account_number": account_number, "amount_cents": body.amount_cents},
            ))
    except Exception:
        pass

    return {
        "success": True,
        "payment_id": intent.id,
        "amount": amount_dollars,
        "confirmation_number": confirmation,
        "receipt_url": receipt_url,
        "balance_after": round(balance_after, 2),
        "card_last_four": card_last_four,
    }


@payment_portal_router.post("/pay/manual")
async def portal_pay_manual(body: ManualPaymentRequest, request: Request):
    """Record a pending check/wire payment notification."""
    ip = _get_client_ip(request)

    # Rate limit: 5 per hour per IP
    if not check_rate_limit(rl_ip_key(ip, "portal_pay_manual"), max_requests=5, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many payment attempts. Try again later.")

    if body.payment_method not in ("check", "wire"):
        raise HTTPException(status_code=400, detail="Payment method must be 'check' or 'wire'.")

    # Sanitize inputs
    try:
        account_number = sanitize_account_number(body.account_number)
        amount = sanitize_currency(body.amount)
        reference_number = sanitize_text(body.reference_number, 100) if body.reference_number else body.reference_number
        notes = sanitize_text(body.notes, 500) if body.notes else body.notes
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    async with async_session_factory() as db:
        result = await db.execute(
            select(LoanAccount).where(
                func.lower(LoanAccount.account_number) == account_number.strip().lower(),
                LoanAccount.status == "active",
            )
        )
        account = result.scalar_one_or_none()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found.")

        confirmation = _gen_confirmation()
        payment = LoanPayment(
            confirmation_number=confirmation,
            account_number=account.account_number,
            amount=amount,
            payment_method=body.payment_method,
            status="pending",
            reference_number=reference_number,
            notes=notes,
            balance_after=round(account.current_balance, 2),  # Unchanged until admin confirms
        )
        db.add(payment)
        await db.commit()

    # Send admin notification email (best-effort)
    if settings.tphs_admin_email:
        try:
            from rei.services.email import send_email

            await send_email(
                to_email=settings.tphs_admin_email,
                to_name="TPHS Admin",
                subject=f"Payment Notification — {account.account_number}",
                html_content=(
                    f"<p>A buyer has submitted a <strong>{body.payment_method}</strong> "
                    f"payment notification.</p>"
                    f"<p><strong>Account:</strong> {account.account_number}<br>"
                    f"<strong>Amount:</strong> ${amount:,.2f}<br>"
                    f"<strong>Reference:</strong> {reference_number or 'N/A'}<br>"
                    f"<strong>Notes:</strong> {notes or 'N/A'}</p>"
                    f"<p>Please verify receipt and confirm in the admin panel.</p>"
                ),
                settings=settings,
            )
        except Exception:
            logger.warning("Failed to send admin notification for manual payment %s", confirmation)

    # Audit log
    try:
        async with async_session_factory() as audit_db:
            await audit_db.run_sync(lambda s: audit_log(
                s, action="portal_payment_manual", user_id=None,
                ip_address=ip,
                details={"account_number": account_number, "amount": amount, "method": body.payment_method},
            ))
    except Exception:
        pass

    return {
        "success": True,
        "confirmation_number": confirmation,
        "message": (
            "Payment notification received. "
            "Your payment will be processed within 2 business days."
        ),
    }


@payment_portal_router.get("/receipt/{confirmation_number}")
async def portal_receipt(confirmation_number: str):
    """Return receipt data for a given confirmation number."""
    async with async_session_factory() as db:
        result = await db.execute(
            select(LoanPayment).where(
                LoanPayment.confirmation_number == confirmation_number.strip()
            )
        )
        payment = result.scalar_one_or_none()

    if not payment:
        raise HTTPException(status_code=404, detail="Receipt not found.")

    return {
        "confirmation_number": payment.confirmation_number,
        "date": payment.created_at.strftime("%Y-%m-%d %H:%M UTC") if payment.created_at else "",
        "amount": round(payment.amount, 2),
        "account_number": payment.account_number,
        "payment_method": payment.payment_method,
        "status": payment.status,
        "card_last_four": payment.card_last_four,
        "balance_after": round(payment.balance_after, 2),
        "reference_number": payment.reference_number,
        "receipt_url": payment.stripe_receipt_url,
    }
