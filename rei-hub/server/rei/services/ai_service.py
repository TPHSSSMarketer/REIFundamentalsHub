"""Central AI abstraction layer — all AI calls in REI Hub go through this service."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import base64
import json
import logging
import time
from collections import deque
from datetime import datetime
from typing import Optional

import httpx
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import AI_PLAN_ALLOWANCES, AI_TOKEN_PRICING, CREDIT_MARKUP, Settings
from rei.models.user import AIProviderConfig, KnowledgeEntry, User

logger = logging.getLogger(__name__)


# ── NVIDIA Rate Limiter (40 RPM) ─────────────────────────────────────────

NVIDIA_RPM_LIMIT = 40  # Max requests per minute for NVIDIA endpoints

class _NvidiaRateLimiter:
    """Simple sliding-window rate limiter for NVIDIA API calls."""

    def __init__(self, rpm: int = NVIDIA_RPM_LIMIT):
        self._rpm = rpm
        self._timestamps: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        """Wait until a request slot is available within the RPM window."""
        async with self._lock:
            now = time.monotonic()
            window = 60.0  # 1 minute

            # Purge timestamps older than the window
            while self._timestamps and (now - self._timestamps[0]) >= window:
                self._timestamps.popleft()

            if len(self._timestamps) >= self._rpm:
                # Wait until the oldest request falls outside the window
                sleep_for = window - (now - self._timestamps[0]) + 0.1
                logger.info("NVIDIA rate limit reached (%d RPM). Waiting %.1fs", self._rpm, sleep_for)
                await asyncio.sleep(sleep_for)
                # Purge again after sleeping
                now = time.monotonic()
                while self._timestamps and (now - self._timestamps[0]) >= window:
                    self._timestamps.popleft()

            self._timestamps.append(time.monotonic())


_nvidia_limiter = _NvidiaRateLimiter()

# ── Provider configuration ────────────────────────────────────────────────

PROVIDER_CONFIGS = {
    "anthropic": {
        "base_url": "https://api.anthropic.com",
        "models": [
            "claude-opus-4-6",
            "claude-sonnet-4-6",
            "claude-haiku-4-5-20251001",
        ],
        "default_model": "claude-sonnet-4-6",
        "display_name": "Anthropic Claude",
        "role": "General AI, Voice, Chat & SMS",
    },
    "nvidia_kimi": {
        "base_url": "https://integrate.api.nvidia.com",
        "models": ["moonshotai/kimi-k2.5"],
        "default_model": "moonshotai/kimi-k2.5",
        "display_name": "NVIDIA Kimi 2.5",
        "role": "Research & Legal",
    },
    "nvidia_minimax": {
        "base_url": "https://integrate.api.nvidia.com",
        "models": ["minimaxai/minimax-m2.5"],
        "default_model": "minimaxai/minimax-m2.5",
        "display_name": "NVIDIA MiniMax 2.5",
        "role": "Fast Summaries",
    },
    "nvidia_nemotron": {
        "base_url": "https://integrate.api.nvidia.com",
        "models": ["nvidia/llama-3.3-nemotron-super-49b-v1"],
        "default_model": "nvidia/llama-3.3-nemotron-super-49b-v1",
        "display_name": "NVIDIA Nemotron (Underwriting)",
        "role": "AI Underwriting Analysis",
    },
}

# ── Task-based routing map ─────────────────────────────────────────────────
# Maps task_type → (provider, model_override)
# All providers are always active; each is used for its designated purpose.

TASK_ROUTING: dict[str, tuple[str, str | None]] = {
    # Anthropic Claude — Sonnet for voice, Haiku for chat/sms/webchat
    "voice":         ("anthropic", "claude-sonnet-4-6"),
    "sms_draft":     ("anthropic", "claude-haiku-4-5-20251001"),
    "opener":        ("anthropic", "claude-haiku-4-5-20251001"),
    "chat":          ("anthropic", "claude-haiku-4-5-20251001"),
    "webchat":       ("anthropic", "claude-haiku-4-5-20251001"),
    "general":       ("anthropic", None),  # uses default_model (Sonnet)
    # NVIDIA Kimi — research & legal
    "research":      ("nvidia_kimi", None),
    "legal":         ("nvidia_kimi", None),
    # NVIDIA MiniMax — fast summaries
    "summary":       ("nvidia_minimax", None),
    # NVIDIA Nemotron — underwriting
    "underwriting":  ("nvidia_nemotron", None),
}


# ── Key encryption helpers ────────────────────────────────────────────────


def encrypt_api_key(key: str, secret: str) -> str:
    """Encrypt an API key using HMAC-based obfuscation with the secret.

    Uses a simple XOR cipher keyed by the HMAC of the secret. Not AES
    (avoiding extra pip dependencies) but sufficient to prevent plaintext
    storage. The result is base64-encoded for safe DB storage.
    """
    if not key or not secret:
        return key
    # Derive a key stream from the secret
    key_bytes = key.encode("utf-8")
    secret_hash = hashlib.sha256(secret.encode("utf-8")).digest()
    # XOR the key bytes with repeated secret hash
    encrypted = bytes(
        b ^ secret_hash[i % len(secret_hash)] for i, b in enumerate(key_bytes)
    )
    return base64.b64encode(encrypted).decode("utf-8")


def decrypt_api_key(encrypted: str, secret: str) -> str:
    """Decrypt an API key encrypted with encrypt_api_key."""
    if not encrypted or not secret:
        return encrypted
    try:
        encrypted_bytes = base64.b64decode(encrypted.encode("utf-8"))
        secret_hash = hashlib.sha256(secret.encode("utf-8")).digest()
        decrypted = bytes(
            b ^ secret_hash[i % len(secret_hash)]
            for i, b in enumerate(encrypted_bytes)
        )
        return decrypted.decode("utf-8")
    except Exception:
        logger.warning("Failed to decrypt API key")
        return ""


def mask_api_key(key: Optional[str]) -> str:
    """Mask an API key for display: show prefix + last 4 chars."""
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:3]}...{key[-4:]}"


# ── Provider-specific call functions ──────────────────────────────────────


async def _call_anthropic(
    messages: list[dict],
    model: str,
    api_key: str,
    max_tokens: int,
    temperature: float,
) -> dict:
    """Call the Anthropic Messages API."""
    # Convert messages: Anthropic expects role/content, system goes separately
    system_text = ""
    api_messages = []
    for msg in messages:
        if msg.get("role") == "system":
            system_text = msg.get("content", "")
        else:
            api_messages.append({"role": msg["role"], "content": msg["content"]})

    body: dict = {
        "model": model,
        "messages": api_messages,
        "max_tokens": max_tokens,
    }
    if system_text:
        body["system"] = system_text

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2025-01-01",
        "content-type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    content = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            content += block.get("text", "")

    usage = data.get("usage", {})
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)

    return {
        "content": content,
        "tokens_used": input_tokens + output_tokens,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }


async def _call_nvidia(
    messages: list[dict],
    model: str,
    api_key: str,
    base_url: str,
    max_tokens: int,
    temperature: float,
) -> dict:
    """Call an NVIDIA NIM endpoint (OpenAI-compatible chat completions)."""
    # Enforce 40 RPM rate limit across all NVIDIA calls
    await _nvidia_limiter.acquire()

    body = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "content-type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{base_url}/v1/chat/completions",
            headers=headers,
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    content = ""
    choices = data.get("choices", [])
    if choices:
        content = choices[0].get("message", {}).get("content", "")

    usage = data.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", 0) or (prompt_tokens + completion_tokens)

    return {
        "content": content,
        "tokens_used": total_tokens,
        "input_tokens": prompt_tokens or total_tokens,
        "output_tokens": completion_tokens or 0,
    }


# ── Billing-cycle helpers ─────────────────────────────────────────────────

import calendar


def _current_billing_cycle_start(user_obj: User, now: datetime) -> datetime:
    """Return the start of the current billing cycle for a user.

    Uses the user's signup day-of-month as the anniversary date.
    Example: signed up Jan 15 → cycles are 15th-to-15th each month.
    If the signup day doesn't exist in a short month (e.g. day=31 in Feb),
    it falls back to the last day of that month.
    """
    signup_day = user_obj.created_at.day if user_obj.created_at else 1

    # Clamp to last day of current month if needed (e.g. signup day 31, current month has 28)
    max_day = calendar.monthrange(now.year, now.month)[1]
    cycle_day = min(signup_day, max_day)
    cycle_start_this_month = now.replace(day=cycle_day, hour=0, minute=0, second=0, microsecond=0)

    if now >= cycle_start_this_month:
        # We're past the anniversary day this month → current cycle started this month
        return cycle_start_this_month
    else:
        # We haven't reached the anniversary day yet → cycle started last month
        if now.month == 1:
            prev_year, prev_month = now.year - 1, 12
        else:
            prev_year, prev_month = now.year, now.month - 1
        max_day_prev = calendar.monthrange(prev_year, prev_month)[1]
        cycle_day_prev = min(signup_day, max_day_prev)
        return datetime(prev_year, prev_month, cycle_day_prev, 0, 0, 0)


# ── Core completion function ──────────────────────────────────────────────


async def _get_global_config(db: AsyncSession) -> Optional[AIProviderConfig]:
    """Fetch the global AI provider config (where user_id is NULL)."""
    result = await db.execute(
        select(AIProviderConfig).where(AIProviderConfig.user_id.is_(None))
    )
    return result.scalar_one_or_none()


async def _resolve_provider(
    user_id: Optional[int],
    db: AsyncSession,
    settings: Settings,
    task_type: str = "general",
    use_own_keys: bool = False,
) -> dict:
    """Resolve which provider, model, and API key to use for a request.

    All providers are always active — routing is determined by task_type.
    Admin keys live in ProviderCredentials (Admin > Credentials page).
    Per-user keys are used ONLY as a fallback when plan credits and
    universal credits are both exhausted (use_own_keys=True).
    Returns dict with: provider, model, api_key, base_url, using_own_keys
    """
    global_config = await _get_global_config(db)

    anthropic_key = ""
    nvidia_key = ""

    # ── 1. Read admin keys from ProviderCredentials (single source of truth) ──
    try:
        from rei.services.credentials_service import get_provider_credentials

        anth_creds = await get_provider_credentials(db, "anthropic")
        if anth_creds and anth_creds.get("anthropic_api_key"):
            anthropic_key = anth_creds["anthropic_api_key"]

        nv_creds = await get_provider_credentials(db, "nvidia")
        if nv_creds and nv_creds.get("nvidia_api_key"):
            nvidia_key = nv_creds["nvidia_api_key"]
    except Exception as exc:
        logger.warning("Failed to read ProviderCredentials: %s", exc)

    # ── 2. Per-user key overrides — ONLY when credits are exhausted ──
    # Subscribers use plan credits first. Their own keys are a fallback so
    # they're never blocked from AI features once credits run out.
    using_own_keys = False
    if use_own_keys and user_id and global_config and global_config.allow_user_override:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user and user.ai_override_enabled:
            if user.ai_own_anthropic_key:
                anthropic_key = decrypt_api_key(
                    user.ai_own_anthropic_key, settings.ai_encryption_key
                )
                using_own_keys = True
            if user.ai_own_nvidia_key:
                nvidia_key = decrypt_api_key(
                    user.ai_own_nvidia_key, settings.ai_encryption_key
                )
                using_own_keys = True

    # ── Task-based routing: pick provider + model by task type ──
    route = TASK_ROUTING.get(task_type, TASK_ROUTING["general"])
    provider = route[0]
    pconfig = PROVIDER_CONFIGS.get(provider, PROVIDER_CONFIGS["anthropic"])
    model = route[1] or pconfig["default_model"]
    base_url = pconfig["base_url"]

    # Determine API key for the routed provider
    if provider == "anthropic":
        api_key = anthropic_key
    else:
        api_key = nvidia_key

    # Fallback chain if the designated provider has no key configured
    if not api_key:
        fallback_chain = [
            ("anthropic", anthropic_key),
            ("nvidia_kimi", nvidia_key),
            ("nvidia_minimax", nvidia_key),
            ("nvidia_nemotron", nvidia_key),
        ]
        for fb_provider, fb_key in fallback_chain:
            if fb_key and fb_provider != provider:
                provider = fb_provider
                model = PROVIDER_CONFIGS[fb_provider]["default_model"]
                api_key = fb_key
                base_url = PROVIDER_CONFIGS[fb_provider]["base_url"]
                break

    return {
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "base_url": base_url,
        "using_own_keys": using_own_keys,
    }


def _fire_usage_reminder(user_obj: User, pct_used: int, settings: Settings) -> None:
    """Schedule a usage reminder email (fire-and-forget, non-blocking)."""
    import asyncio

    async def _send():
        try:
            from rei.services.email import send_ai_usage_reminder_email

            await send_ai_usage_reminder_email(
                to_email=user_obj.email,
                full_name=user_obj.full_name or user_obj.email,
                pct_used=pct_used,
                plan=getattr(user_obj, "plan", "starter"),
                settings=settings,
            )
        except Exception as exc:
            logger.warning("Failed to send AI usage reminder: %s", exc)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_send())
    except RuntimeError:
        pass  # No running loop — skip (shouldn't happen in FastAPI)


async def ai_complete(
    messages: list[dict],
    user_id: Optional[int],
    db: AsyncSession,
    settings: Settings,
    task_type: str = "general",
    max_tokens: int = 2000,
    temperature: float = 0.3,
    use_own_keys: bool = False,
) -> dict:
    """Main AI completion function — resolves provider and calls the API.

    Returns: { content, provider, model, tokens_used }
    """
    resolved = await _resolve_provider(user_id, db, settings, task_type, use_own_keys=use_own_keys)

    if not resolved["api_key"]:
        return {
            "content": "No AI provider is configured. Please ask your admin to set up an API key.",
            "provider": resolved["provider"],
            "model": resolved["model"],
            "tokens_used": 0,
            "input_tokens": 0,
            "output_tokens": 0,
        }

    try:
        if resolved["provider"] == "anthropic":
            result = await _call_anthropic(
                messages,
                resolved["model"],
                resolved["api_key"],
                max_tokens,
                temperature,
            )
        else:
            result = await _call_nvidia(
                messages,
                resolved["model"],
                resolved["api_key"],
                resolved["base_url"],
                max_tokens,
                temperature,
            )
    except httpx.HTTPStatusError as exc:
        err_body = exc.response.text[:500]
        logger.error(
            "AI provider %s (model=%s, url=%s) returned %s: %s",
            resolved["provider"],
            resolved["model"],
            resolved["base_url"],
            exc.response.status_code,
            err_body,
        )
        # Build user-friendly error with detail
        if exc.response.status_code == 401:
            hint = "Invalid API key. Please re-enter your key in Admin > Credentials."
        elif exc.response.status_code == 404:
            hint = f"Model '{resolved['model']}' not found on {resolved['provider']}. The model may be unavailable or renamed."
        elif exc.response.status_code == 429:
            hint = "Rate limit exceeded. Please wait a moment and try again."
        else:
            # Include the actual error body for debugging
            try:
                err_detail = exc.response.json().get("error", {}).get("message", err_body[:200])
            except Exception:
                err_detail = err_body[:200]
            hint = f"{err_detail}"
        return {
            "content": f"AI provider error ({exc.response.status_code}) from {resolved['provider']}: {hint}",
            "provider": resolved["provider"],
            "model": resolved["model"],
            "tokens_used": 0,
            "input_tokens": 0,
            "output_tokens": 0,
        }
    except Exception as exc:
        logger.exception("AI provider call failed")
        return {
            "content": f"AI provider error: {str(exc)}",
            "provider": resolved["provider"],
            "model": resolved["model"],
            "tokens_used": 0,
            "input_tokens": 0,
            "output_tokens": 0,
        }

    # Update usage tracking — global config + per-user
    tokens_used = result.get("tokens_used", 0)
    input_tokens = result.get("input_tokens", 0)
    output_tokens = result.get("output_tokens", 0)

    global_config = await _get_global_config(db)
    if global_config:
        global_config.total_requests += 1
        global_config.total_tokens += tokens_used

    # ── Calculate dollar cost from token pricing ──
    pricing = AI_TOKEN_PRICING.get(
        resolved["model"], {"input_per_1m": 0, "output_per_1m": 0}
    )
    cost_dollars = (
        (input_tokens / 1_000_000) * pricing["input_per_1m"]
        + (output_tokens / 1_000_000) * pricing["output_per_1m"]
    )
    cost_cents = round(cost_dollars * 100)  # Integer cents

    # Per-user tracking (tokens + dollar cost + threshold reminders)
    warning_pct = None  # Will be set if a threshold is crossed
    if user_id:
        user_obj = await db.get(User, user_id)
        if user_obj:
            user_obj.ai_total_requests = (user_obj.ai_total_requests or 0) + 1
            user_obj.ai_total_tokens = (user_obj.ai_total_tokens or 0) + tokens_used
            user_obj.ai_last_request_at = datetime.utcnow()

            # Monthly reset on signup anniversary (not calendar 1st).
            # E.g. if they signed up Jan 15, credits reset on the 15th each month.
            now = datetime.utcnow()
            billing_cycle_start = _current_billing_cycle_start(user_obj, now)
            if user_obj.ai_cost_reset_at is None or user_obj.ai_cost_reset_at < billing_cycle_start:
                user_obj.ai_cost_cents = 0
                user_obj.ai_cost_reset_at = billing_cycle_start
                user_obj.ai_reminder_75_sent = False
                user_obj.ai_reminder_90_sent = False
                user_obj.ai_reminder_95_sent = False

            # Determine plan allowance for credit logic + reminders
            plan_allowance = AI_PLAN_ALLOWANCES.get(
                getattr(user_obj, "plan", "starter"),
                AI_PLAN_ALLOWANCES["starter"],
            )
            allowance_cents = plan_allowance["monthly_allowance_cents"]

            # Accumulate cost — skip entirely when subscriber is using their own keys
            if resolved.get("using_own_keys"):
                # Subscriber's own API keys in use — they pay their provider directly,
                # no cost to our system. Still track requests/tokens for analytics.
                pass
            elif allowance_cents > 0 and (user_obj.ai_cost_cents or 0) >= allowance_cents:
                # Over monthly allowance → deduct from universal credits with 30% markup
                marked_up_cents = int(cost_cents * CREDIT_MARKUP)
                user_obj.phone_credits_cents = max(
                    0, (user_obj.phone_credits_cents or 0) - marked_up_cents
                )
            else:
                # Under allowance → add to ai_cost_cents as normal
                user_obj.ai_cost_cents = (user_obj.ai_cost_cents or 0) + cost_cents

            # ── Check usage thresholds and send reminders ──
            if allowance_cents > 0:
                pct_used = ((user_obj.ai_cost_cents or 0) / allowance_cents) * 100
                if pct_used >= 95 and not user_obj.ai_reminder_95_sent:
                    user_obj.ai_reminder_95_sent = True
                    warning_pct = 95
                    _fire_usage_reminder(user_obj, 95, settings)
                elif pct_used >= 90 and not user_obj.ai_reminder_90_sent:
                    user_obj.ai_reminder_90_sent = True
                    warning_pct = 90
                    _fire_usage_reminder(user_obj, 90, settings)
                elif pct_used >= 75 and not user_obj.ai_reminder_75_sent:
                    user_obj.ai_reminder_75_sent = True
                    warning_pct = 75
                    _fire_usage_reminder(user_obj, 75, settings)

    await db.commit()

    return {
        "content": result["content"],
        "provider": resolved["provider"],
        "model": resolved["model"],
        "tokens_used": tokens_used,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_cents": cost_cents,
        "warning_pct": warning_pct,
    }


# ── Knowledge Base helper ─────────────────────────────────────────────────


async def get_user_knowledge(user_id: int, db: AsyncSession) -> list[dict]:
    """Get all active knowledge entries for a user (platform + account level)."""
    result = await db.execute(
        select(KnowledgeEntry).where(
            and_(
                (KnowledgeEntry.user_id == user_id) | (KnowledgeEntry.user_id.is_(None)),
                KnowledgeEntry.is_active == True,
            )
        )
    )
    entries = result.scalars().all()
    return [{"name": e.name, "content": e.content} for e in entries]


# ── Conversation data extraction (NVIDIA — free) ─────────────────────────


async def extract_conversation_data(
    messages: list[dict],
    settings: Settings,
) -> dict:
    """Extract structured lead data from a conversation using NVIDIA (free).

    Returns a dict of extracted fields (null for anything not mentioned).
    Uses NVIDIA models so there is zero token cost.
    """
    # Build the extraction prompt
    conversation_text = ""
    for msg in messages:
        role = "Agent" if msg.get("role") == "assistant" else "Lead"
        conversation_text += f"{role}: {msg.get('content', '')}\n"

    extraction_prompt = f"""Analyze this real estate conversation and extract any mentioned information.
Return ONLY a valid JSON object with these fields (use null for anything not mentioned):

{{
    "name": "<full name or null>",
    "first_name": "<first name or null>",
    "last_name": "<last name or null>",
    "email": "<email address or null>",
    "phone": "<phone number or null>",
    "property_address": "<property address or null>",
    "motivation": "<why they want to sell or null>",
    "timeline": "<when they want to sell or null>",
    "asking_price": "<their price expectation as a number or null>",
    "notes": "<any other relevant details or null>"
}}

CONVERSATION:
{conversation_text}

Return ONLY the JSON object, nothing else."""

    # Resolve NVIDIA API key from global config
    global_config = None
    nvidia_key = ""
    # We need a DB session but this is called from the endpoint which has one
    # The caller passes settings which has the encryption key
    # We'll use the key from settings or global config
    # For simplicity, try to get the key from env/settings first
    nvidia_key = getattr(settings, "nvidia_api_key", "") or ""

    if not nvidia_key:
        # Try decrypting from global config — but we don't have db here.
        # The endpoint will pass the key or we fall back gracefully.
        logger.warning("No NVIDIA key available for extraction — skipping")
        return {}

    try:
        result = await _call_nvidia(
            messages=[{"role": "user", "content": extraction_prompt}],
            model="moonshotai/kimi-k2.5",
            api_key=nvidia_key,
            base_url="https://integrate.api.nvidia.com",
            max_tokens=500,
            temperature=0.1,
        )

        response_text = result.get("content", "").strip()

        # Clean up potential markdown formatting
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())

    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse extraction JSON: %s", exc)
        return {}
    except Exception as exc:
        logger.warning("Conversation data extraction failed: %s", exc)
        return {}


async def extract_conversation_data_with_db(
    messages: list[dict],
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """Wrapper that resolves the NVIDIA key from ProviderCredentials."""
    nvidia_key = ""

    # Read from ProviderCredentials (single source of truth)
    try:
        from rei.services.credentials_service import get_provider_credentials

        nv_creds = await get_provider_credentials(db, "nvidia")
        if nv_creds and nv_creds.get("nvidia_api_key"):
            nvidia_key = nv_creds["nvidia_api_key"]
    except Exception:
        pass

    if not nvidia_key:
        nvidia_key = getattr(settings, "nvidia_api_key", "") or ""

    if not nvidia_key:
        logger.warning("No NVIDIA key for extraction")
        return {}

    # Build extraction prompt inline to avoid passing settings for key
    conversation_text = ""
    for msg in messages:
        role = "Agent" if msg.get("role") == "assistant" else "Lead"
        conversation_text += f"{role}: {msg.get('content', '')}\n"

    extraction_prompt = f"""Analyze this real estate conversation and extract any mentioned information.
Return ONLY a valid JSON object with these fields (use null for anything not mentioned):

{{
    "name": "<full name or null>",
    "first_name": "<first name or null>",
    "last_name": "<last name or null>",
    "email": "<email address or null>",
    "phone": "<phone number or null>",
    "property_address": "<property address or null>",
    "motivation": "<why they want to sell or null>",
    "timeline": "<when they want to sell or null>",
    "asking_price": "<their price expectation as a number or null>",
    "notes": "<any other relevant details or null>"
}}

CONVERSATION:
{conversation_text}

Return ONLY the JSON object, nothing else."""

    try:
        result = await _call_nvidia(
            messages=[{"role": "user", "content": extraction_prompt}],
            model="moonshotai/kimi-k2.5",
            api_key=nvidia_key,
            base_url="https://integrate.api.nvidia.com",
            max_tokens=500,
            temperature=0.1,
        )

        response_text = result.get("content", "").strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())

    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse extraction JSON: %s", exc)
        return {}
    except Exception as exc:
        logger.warning("Conversation data extraction failed: %s", exc)
        return {}


# ── Research helper ───────────────────────────────────────────────────────


async def ai_research(
    query: str,
    user_id: Optional[int],
    db: AsyncSession,
    settings: Settings,
    context: str = "",
) -> dict:
    """Wrapper for research queries — always uses task_type='research'."""
    messages = []
    if context:
        messages.append(
            {"role": "system", "content": f"Context:\n{context}"}
        )
    messages.append({"role": "user", "content": query})

    return await ai_complete(
        messages=messages,
        user_id=user_id,
        db=db,
        settings=settings,
        task_type="research",
        max_tokens=4000,
        temperature=0.2,
    )


# ── Legal research helper ────────────────────────────────────────────────


async def ai_legal_research(
    state: str,
    topics: list[str],
    user_id: Optional[int],
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """Wrapper for state law research — always uses task_type='legal'."""
    topics_str = ", ".join(topics)
    prompt = (
        f"Research the laws in {state} governing the following real estate topics: "
        f"{topics_str}. For each topic provide:\n"
        "1. The governing statute with citation\n"
        "2. Plain English summary\n"
        "3. Key dates and timelines\n"
        "4. Specific requirements for investors\n"
        "5. Any recent changes (last 3 years)\n"
        "Format as structured sections per topic."
    )

    messages = [{"role": "user", "content": prompt}]

    result = await ai_complete(
        messages=messages,
        user_id=user_id,
        db=db,
        settings=settings,
        task_type="legal",
        max_tokens=6000,
        temperature=0.1,
    )

    return {
        "content": result["content"],
        "citations": [],  # Could be parsed from response in future
        "provider": result["provider"],
    }


# ═══════════════════════════════════════════════════════════════════════
# Voice AI Additions — AI Service for Voice Agents
# ═══════════════════════════════════════════════════════════════════════

# ── System Prompt Builder ───────────────────────────────────────────────

def build_voice_agent_prompt(
    agent_name: str,
    agent_role: str,
    agent_personality: str,
    custom_system_prompt: str,
    knowledge_entries: list[dict[str, str]],
    company_data: dict[str, str] | None = None,
    contact_data: dict[str, str] | None = None,
) -> str:
    """
    Build the full system prompt for a voice AI agent.

    This combines everything the AI needs to know into one prompt:
    - Who it is (personality + role)
    - What company it represents
    - What scripts/knowledge to follow
    - What data to collect
    - How to assess the caller

    This prompt gets sent to Claude via ElevenLabs' Conversational AI.
    """

    # Start with agent identity
    prompt = f"""You are {agent_name}, a {agent_role.replace('_', ' ')} for a real estate investment company.

PERSONALITY: You are {agent_personality}. Speak naturally like a real person — use conversational language,
brief acknowledgments ("mm-hmm", "gotcha", "I see"), and natural transitions. Never sound robotic or scripted.
Keep your responses concise — this is a phone call, not an essay. Aim for 1-3 sentences per response.

"""

    # Add company info if available
    if company_data:
        prompt += "COMPANY INFORMATION:\n"
        for key, value in company_data.items():
            if value:
                prompt += f"- {key}: {value}\n"
        prompt += "\n"

    # Add contact context if we know who's calling
    if contact_data:
        prompt += "CALLER CONTEXT (what we already know about this person):\n"
        for key, value in contact_data.items():
            if value and not key.startswith("_"):
                prompt += f"- {key}: {value}\n"
        prompt += "\n"

    # Add knowledge base entries (scripts, objection handlers, etc.)
    if knowledge_entries:
        prompt += "KNOWLEDGE BASE & SCRIPTS:\n"
        prompt += "Use the following information to guide the conversation. "
        prompt += "Follow the scripts naturally — don't read them word for word.\n\n"
        for entry in knowledge_entries:
            prompt += f"--- {entry.get('name', 'Script')} ---\n"
            prompt += f"{entry.get('content', '')}\n\n"

    # Add custom system prompt if the user has one
    if custom_system_prompt:
        prompt += f"ADDITIONAL INSTRUCTIONS:\n{custom_system_prompt}\n\n"

    # Add data extraction instructions
    prompt += """CRITICAL INSTRUCTIONS FOR EVERY CALL:
1. ALWAYS try to naturally gather these details during conversation:
   - Caller's full name
   - Email address
   - Phone number (if different from calling number)
   - Property address they're calling about
   - Their asking price or price expectations
   - Their motivation for selling
   - Their timeline for selling
   - Current mortgage balance (if applicable)

2. ASSESS the caller's mood and deal eagerness throughout the call:
   - Mood: Are they frustrated, interested, eager, skeptical, or neutral?
   - Eagerness: On a scale of 1-10, how eager are they to close a deal?

3. TRANSFER TO HUMAN: If the caller is a hot lead (eagerness 7+), say:
   "This sounds like a great opportunity. Let me connect you with [investor name]
   right now to discuss the details." Then indicate you want to transfer.

4. NEVER make up information. If you don't know something, say so honestly.
5. NEVER pretend to be a human. If directly asked, say you're an AI assistant
   working with the investment company.
6. Keep responses SHORT — this is a phone call. 1-3 sentences max per turn.
"""

    return prompt


# ── Post-Call Data Extraction ───────────────────────────────────────────

async def extract_call_data(
    transcript: list[dict[str, str]],
    settings: Settings,
) -> dict[str, Any]:
    """
    Analyze a completed call transcript and extract structured data.

    This runs AFTER the call ends and uses Claude to parse out:
    - Caller info (name, email, phone, property address)
    - Mood assessment
    - Deal eagerness (1-10)
    - Call outcome
    - Summary

    Args:
        transcript: List of message dicts [{"role": "agent", "text": "..."}, ...]
        settings: App settings with API keys

    Returns:
        {
            "extracted_data": {"name": "...", "email": "...", ...},
            "caller_mood": "interested",
            "deal_eagerness": 7,
            "outcome": "qualified",
            "summary": "..."
        }
    """
    # Format transcript for analysis
    transcript_text = ""
    for msg in transcript:
        role = "Agent" if msg.get("role") == "agent" else "Caller"
        transcript_text += f"{role}: {msg.get('text', '')}\n"

    analysis_prompt = f"""Analyze this real estate investment phone call transcript and extract the following information.
Return your response as a valid JSON object with exactly these fields.

TRANSCRIPT:
{transcript_text}

Return this exact JSON structure (use null for any information not mentioned):
{{
    "extracted_data": {{
        "caller_name": "<full name or null>",
        "email": "<email address or null>",
        "phone": "<phone number if different from calling number, or null>",
        "property_address": "<full property address or null>",
        "asking_price": "<their price expectation or null>",
        "motivation": "<why they want to sell or null>",
        "timeline": "<when they want to sell or null>",
        "mortgage_balance": "<approximate mortgage balance or null>",
        "property_condition": "<condition description or null>",
        "other_offers": "<any mention of other buyers/realtors or null>"
    }},
    "caller_mood": "<one of: eager, interested, neutral, skeptical, frustrated, hostile>",
    "deal_eagerness": <number 1-10 where 10 is extremely eager to close>,
    "outcome": "<one of: qualified, not_qualified, appointment_set, callback_requested, transferred_to_human, hung_up, voicemail>",
    "summary": "<2-3 sentence summary of the call and key takeaways>"
}}

Return ONLY the JSON object, nothing else."""

    try:
        # Use the existing ai_complete function from this service
        result = await ai_complete(
            prompt=analysis_prompt,
            user_id=None,
            db=None,
            settings=settings,
            provider="anthropic",
            model="claude-sonnet-4-6",
        )

        # Parse the JSON response
        response_text = result.get("content", "")

        # Clean up potential markdown formatting
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        parsed = json.loads(response_text.strip())
        return parsed

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse call data extraction JSON: {e}")
        return {
            "extracted_data": {},
            "caller_mood": "unknown",
            "deal_eagerness": 0,
            "outcome": "unknown",
            "summary": "Failed to analyze call transcript.",
        }
    except Exception as e:
        logger.error(f"Call data extraction failed: {e}")
        return {
            "extracted_data": {},
            "caller_mood": "unknown",
            "deal_eagerness": 0,
            "outcome": "unknown",
            "summary": f"Analysis error: {str(e)}",
        }
