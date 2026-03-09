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
        "display_name": "Kimi 2.5",
        "role": "Research & Legal",
    },
    "nvidia_kimi_thinking": {
        "base_url": "https://integrate.api.nvidia.com",
        "models": ["moonshotai/kimi-k2-thinking"],
        "default_model": "moonshotai/kimi-k2-thinking",
        "display_name": "Kimi K2 Thinking",
        "role": "Underwriting & Deal Analysis",
    },
    "nvidia_minimax": {
        "base_url": "https://integrate.api.nvidia.com",
        "models": ["minimaxai/minimax-m2.5"],
        "default_model": "minimaxai/minimax-m2.5",
        "display_name": "MiniMax 2.5",
        "role": "Fast Summaries",
    },
    "nvidia_deepseek": {
        "base_url": "https://integrate.api.nvidia.com",
        "models": ["deepseek-ai/deepseek-v3.2"],
        "default_model": "deepseek-ai/deepseek-v3.2",
        "display_name": "DeepSeek V3.2",
        "role": "Math Validation",
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
    "negotiation_summary": ("nvidia_minimax", None),
    # Underwriting — Kimi K2 Thinking (step-by-step reasoning for deal analysis)
    "underwriting":  ("nvidia_kimi_thinking", None),
    # Math validation — DeepSeek R1 (independent recalculation of deal numbers)
    "math_validation": ("nvidia_deepseek", None),
    # Content generation — Claude Sonnet for creative writing waterfall
    "content": ("anthropic", "claude-sonnet-4-6"),
    # Document Intelligence — Claude Sonnet with Vision for document analysis
    "document_analysis": ("anthropic", "claude-sonnet-4-6"),
    # Property Photo Analysis — Claude Sonnet with Vision
    "property_photos": ("anthropic", "claude-sonnet-4-6"),
    # Image prompt generation — Haiku (cheap + fast for writing SD prompts)
    "image_prompt": ("anthropic", "claude-haiku-4-5-20251001"),
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
    images: list[dict] | None = None,
) -> dict:
    """Call the Anthropic Messages API.

    Args:
        messages: Standard role/content message list.
        model: Anthropic model identifier.
        api_key: API key.
        max_tokens: Max output tokens.
        temperature: Sampling temperature.
        images: Optional list of vision images. Each dict:
            { "base64": str, "media_type": "image/jpeg"|"image/png"|"image/webp"|"image/gif" }
            Images are appended to the last user message as content blocks.
    """
    # Convert messages: Anthropic expects role/content, system goes separately
    system_text = ""
    api_messages = []
    for msg in messages:
        if msg.get("role") == "system":
            system_text = msg.get("content", "")
        else:
            api_messages.append({"role": msg["role"], "content": msg["content"]})

    # If images are provided, convert the last user message to multi-content format
    # (Anthropic Vision API requires content blocks: text + image_url/base64)
    if images and api_messages:
        # Find the last user message
        for i in range(len(api_messages) - 1, -1, -1):
            if api_messages[i]["role"] == "user":
                text_content = api_messages[i]["content"]
                content_blocks = []
                # Add each image as a content block
                for img in images:
                    content_blocks.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img.get("media_type", "image/jpeg"),
                            "data": img["base64"],
                        },
                    })
                # Add the text after the images
                content_blocks.append({"type": "text", "text": text_content})
                api_messages[i]["content"] = content_blocks
                break

    body: dict = {
        "model": model,
        "messages": api_messages,
        "max_tokens": max_tokens,
    }
    if system_text:
        body["system"] = system_text

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    # Vision requests can take longer — increase timeout
    timeout = 120.0 if images else 60.0

    async with httpx.AsyncClient(timeout=timeout) as client:
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

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{base_url}/v1/chat/completions",
            headers=headers,
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    content = ""
    reasoning_content = ""
    choices = data.get("choices", [])
    if choices:
        msg = choices[0].get("message", {})
        content = msg.get("content", "")
        # Kimi K2 Thinking returns step-by-step reasoning in reasoning_content
        reasoning_content = msg.get("reasoning_content", "")

    usage = data.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", 0) or (prompt_tokens + completion_tokens)

    result = {
        "content": content,
        "tokens_used": total_tokens,
        "input_tokens": prompt_tokens or total_tokens,
        "output_tokens": completion_tokens or 0,
    }
    if reasoning_content:
        result["reasoning_content"] = reasoning_content
    return result


async def _call_nvidia_with_tools(
    messages: list[dict],
    model: str,
    api_key: str,
    base_url: str,
    max_tokens: int,
    temperature: float,
    tools: list[dict],
    tool_choice: str = "auto",
) -> dict:
    """Call NVIDIA NIM endpoint with function/tool calling support.

    Uses the OpenAI-compatible chat completions API with the 'tools' parameter.
    Kimi K2.5 supports tool calling natively through the NIM API.

    Args:
        tools: List of tool definitions in OpenAI format:
            [{"type": "function", "function": {"name": ..., "description": ..., "parameters": ...}}]
        tool_choice: "auto" (model decides), "none", or {"type": "function", "function": {"name": "..."}}

    Returns dict with:
        - content: Text response (may be empty if tool calls are returned)
        - tool_calls: List of tool call dicts if the model wants to call tools
        - tokens_used, input_tokens, output_tokens: Usage stats
    """
    await _nvidia_limiter.acquire()

    body: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "tools": tools,
    }
    if tool_choice != "auto":
        body["tool_choice"] = tool_choice

    headers = {
        "Authorization": f"Bearer {api_key}",
        "content-type": "application/json",
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{base_url}/v1/chat/completions",
            headers=headers,
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    content = ""
    tool_calls_raw: list[dict] = []
    choices = data.get("choices", [])
    if choices:
        msg = choices[0].get("message", {})
        content = msg.get("content", "") or ""
        # Tool calls come back in the message.tool_calls array
        if msg.get("tool_calls"):
            tool_calls_raw = msg["tool_calls"]

    usage = data.get("usage", {})
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", 0) or (prompt_tokens + completion_tokens)

    # Normalize tool calls to a clean format
    tool_calls = []
    for tc in tool_calls_raw:
        fn = tc.get("function", {})
        tool_calls.append({
            "id": tc.get("id", ""),
            "function_name": fn.get("name", ""),
            "arguments": fn.get("arguments", "{}"),
        })

    return {
        "content": content,
        "tool_calls": tool_calls,
        "tokens_used": total_tokens,
        "input_tokens": prompt_tokens or total_tokens,
        "output_tokens": completion_tokens or 0,
    }


# ── NVIDIA Stable Diffusion Image Generation ─────────────────────────────

PLATFORM_DIMENSIONS: dict[str, tuple[int, int]] = {
    "facebook":       (1024, 576),   # Landscape
    "instagram":      (1024, 1024),  # Square
    "linkedin":       (1024, 576),   # Landscape
    "youtube_thumb":  (1024, 576),   # Landscape
    "blog":           (1024, 576),   # Landscape
    "youtube_short":  (576, 1024),   # Portrait
    "postcard":       (1024, 683),   # Postcard landscape
}


async def _call_nvidia_image(
    prompt: str,
    width: int,
    height: int,
    api_key: str,
    steps: int = 30,
    cfg_scale: float = 7.0,
) -> str:
    """Call NVIDIA NIM Stable Diffusion 3 Medium to generate an image.

    Returns base64-encoded PNG string.
    """
    await _nvidia_limiter.acquire()

    url = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    body = {
        "prompt": prompt,
        "height": height,
        "width": width,
        "steps": steps,
        "cfg_scale": cfg_scale,
    }

    async with httpx.AsyncClient(timeout=180.0) as client:
        resp = await client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()

    # NVIDIA returns { "artifacts": [{ "base64": "...", "seed": ... }] }
    # or { "image": "base64..." } depending on the model version
    if "artifacts" in data and data["artifacts"]:
        return data["artifacts"][0]["base64"]
    elif "image" in data:
        return data["image"]
    else:
        raise ValueError(f"Unexpected NVIDIA image response format: {list(data.keys())}")


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
            ("nvidia_kimi_thinking", nvidia_key),
            ("nvidia_deepseek", nvidia_key),
            ("nvidia_minimax", nvidia_key),
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


async def call_ai(
    task_type: str,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 300,
    temperature: float = 0.2,
) -> Optional[dict]:
    """Lightweight AI call for system-level tasks (not user-billed).

    Wraps ai_complete() with a simpler interface that accepts system_prompt
    + user_prompt instead of a messages list. Used by negotiation_summary.py
    and other services that need AI without a user context.

    Returns: { content, provider, model, tokens_used } or None on failure.
    """
    from rei.config import get_settings
    settings = get_settings()

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    try:
        from rei.database import async_session_factory
        async with async_session_factory() as db:
            return await ai_complete(
                messages=messages,
                user_id=None,
                db=db,
                settings=settings,
                task_type=task_type,
                max_tokens=max_tokens,
                temperature=temperature,
            )
    except Exception as e:
        logger.error("call_ai failed for task_type=%s: %s", task_type, e)
        return None


async def ai_complete(
    messages: list[dict],
    user_id: Optional[int],
    db: AsyncSession,
    settings: Settings,
    task_type: str = "general",
    max_tokens: int = 2000,
    temperature: float = 0.3,
    use_own_keys: bool = False,
    images: list[dict] | None = None,
) -> dict:
    """Main AI completion function — resolves provider and calls the API.

    Args:
        images: Optional list of vision images for Claude Vision.
            Each dict: { "base64": str, "media_type": str }
            Only supported with Anthropic provider.

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
                images=images,
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

    # ── Per-provider monthly aggregates ──
    try:
        from rei.models.user import AIUsageByProvider
        current_month = datetime.utcnow().strftime("%Y-%m")
        provider_key = resolved["provider"]
        model_key = resolved["model"]

        row = await db.execute(
            select(AIUsageByProvider).where(
                AIUsageByProvider.provider == provider_key,
                AIUsageByProvider.model == model_key,
                AIUsageByProvider.month == current_month,
            )
        )
        usage_row = row.scalar_one_or_none()
        if usage_row:
            usage_row.total_requests += 1
            usage_row.total_tokens += tokens_used
            usage_row.input_tokens += input_tokens
            usage_row.output_tokens += output_tokens
            usage_row.cost_cents += cost_cents
            usage_row.updated_at = datetime.utcnow()
        else:
            usage_row = AIUsageByProvider(
                provider=provider_key,
                model=model_key,
                month=current_month,
                total_requests=1,
                total_tokens=tokens_used,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_cents=cost_cents,
            )
            db.add(usage_row)
    except Exception:
        logger.debug("Failed to update per-provider usage tracking", exc_info=True)

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


# ═══════════════════════════════════════════════════════════════════════
# Direct Mail — AI Copy Generation for Postcards & Letters
# ═══════════════════════════════════════════════════════════════════════


async def generate_direct_mail_copy(
    lead,
    mail_type: str,
    campaign_type: str,
    user_profile,
    custom_instructions: str | None,
    db,
    settings,
) -> str:
    """Generate personalized direct mail copy for a lead using Claude.

    Returns the generated copy text (already humanized).
    """
    from rei.services.credentials_service import get_provider_credentials

    # Get Anthropic API key
    anthropic_key = ""
    try:
        creds = await get_provider_credentials(db, "anthropic")
        if creds and creds.get("anthropic_api_key"):
            anthropic_key = creds["anthropic_api_key"]
    except Exception:
        pass
    if not anthropic_key:
        anthropic_key = getattr(settings, "anthropic_api_key", "") or ""
    if not anthropic_key:
        raise ValueError("No Anthropic API key configured.")

    # Build lead context
    lead_name = lead.full_name or f"{lead.first_name or ''} {lead.last_name or ''}".strip() or "Homeowner"
    lead_address = f"{lead.address or ''}, {lead.city or ''}, {lead.state or ''} {lead.zip_code or ''}".strip(", ")

    # Build investor profile context
    company_name = user_profile.company_name if user_profile else "Our Company"
    company_phone = user_profile.company_phone if user_profile else ""
    company_website = user_profile.company_website if user_profile else ""
    mission = user_profile.mission_statement if user_profile else ""
    tone = user_profile.content_tone if user_profile else "Professional & Educational"

    length_guide = "Keep it to 3-5 sentences for a postcard back." if mail_type == "postcard" else "Write 2-3 paragraphs for a professional letter."

    campaign_descriptions = {
        "motivated_seller": "reaching out to a homeowner who may want to sell their property quickly for cash",
        "cash_offer": "making a cash offer to purchase a property",
        "we_buy_houses": "letting the homeowner know we buy houses in any condition",
        "follow_up": "following up on a previous letter or postcard",
        "probate": "reaching out sensitively about an inherited property",
        "pre_foreclosure": "reaching out to a homeowner facing potential foreclosure",
        "absentee_owner": "reaching out to an owner who does not live at the property",
        "vacant_property": "reaching out about a property that appears vacant",
    }
    campaign_desc = campaign_descriptions.get(campaign_type, f"a direct mail campaign about {campaign_type}")

    system_prompt = f"""You are a direct mail copywriter for a real estate investment company.

COMPANY: {company_name}
{f"PHONE: {company_phone}" if company_phone else ""}
{f"WEBSITE: {company_website}" if company_website else ""}
{f"MISSION: {mission}" if mission else ""}

TONE: {tone}

Write a {mail_type} for {campaign_desc}.

RECIPIENT: {lead_name}
PROPERTY: {lead_address}
{f"PROPERTY TYPE: {lead.property_type}" if lead.property_type else ""}

{length_guide}

RULES:
- Address the recipient by name where natural
- Include the company name and phone number
- Be warm, genuine, and human-sounding
- Never use em dashes
- No filler phrases like "comprehensive guide" or "let's dive in"
- Make it feel like a real person wrote it, not a marketing template
- Include a clear call to action (call us, visit our website, etc.)
{f"ADDITIONAL INSTRUCTIONS: {custom_instructions}" if custom_instructions else ""}

Write ONLY the mail copy text. No subject lines, headers, or meta-instructions."""

    import httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": anthropic_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 1024,
                "messages": [{"role": "user", "content": f"Write the {mail_type} copy now."}],
                "system": system_prompt,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    copy_text = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            copy_text += block["text"]

    # Run through humanizer
    try:
        from rei.services.admin_humanizer_service import humanize_text
        copy_text = humanize_text(copy_text)
    except Exception:
        pass

    return copy_text.strip()


async def generate_postcard_image(
    campaign_type: str,
    custom_prompt: str | None,
    db,
    user_id: int,
) -> str:
    """Generate an AI image for a postcard front using NVIDIA Stable Diffusion.

    Returns base64-encoded PNG string.
    """
    from rei.services.credentials_service import get_provider_credentials

    # Get NVIDIA API key
    nvidia_key = ""
    try:
        creds = await get_provider_credentials(db, "nvidia")
        if creds and creds.get("nvidia_api_key"):
            nvidia_key = creds["nvidia_api_key"]
    except Exception:
        pass
    if not nvidia_key:
        raise ValueError("No NVIDIA API key configured for image generation.")

    # Build prompt based on campaign type
    prompt_templates = {
        "motivated_seller": "Professional real estate photography of a beautiful suburban house with a SOLD sign in the front yard, warm golden hour lighting, lush green lawn, inviting atmosphere, high quality real estate marketing photo",
        "cash_offer": "Professional photo of a real estate investor handing over cash money with house keys on a table, modern clean office setting, business transaction, warm lighting, high quality commercial photography",
        "we_buy_houses": "Professional wide angle photo of a diverse neighborhood of houses in various conditions, suburban street view, warm sunlight, inviting real estate marketing imagery, high quality photography",
        "probate": "Peaceful serene photo of a well-maintained family home with a white picket fence, soft warm morning light, gentle and respectful atmosphere, traditional American home, high quality real estate photography",
        "pre_foreclosure": "Professional photo of a helpful real estate advisor meeting with a homeowner at their front door, warm genuine handshake, supportive atmosphere, residential neighborhood, high quality photography",
        "absentee_owner": "Professional aerial view photo of a residential property with a well-maintained yard, suburban neighborhood, clear blue sky, real estate investment property, high quality drone photography",
        "vacant_property": "Professional photo of a vacant house with potential, empty but well-structured property, blue sky background, real estate opportunity, renovation potential, high quality real estate photography",
        "follow_up": "Professional close-up photo of a handwritten letter next to house keys on a wooden desk, warm personal touch, real estate marketing, cozy office setting, high quality product photography",
    }

    if custom_prompt:
        prompt = custom_prompt
    else:
        prompt = prompt_templates.get(
            campaign_type,
            "Professional real estate photography of a beautiful suburban house, warm lighting, high quality marketing photo"
        )

    w, h = PLATFORM_DIMENSIONS.get("postcard", (1024, 683))

    image_b64 = await _call_nvidia_image(
        prompt=prompt,
        width=w,
        height=h,
        api_key=nvidia_key,
    )

    # Apply logo watermark if user has one
    from sqlalchemy import select
    from rei.models.user import User as UserModel
    user_result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    profile = user_result.scalar_one_or_none()
    if profile and profile.company_logo_url:
        try:
            image_b64 = _apply_logo_watermark(image_b64, profile.company_logo_url, w)
        except Exception as exc:
            logger.warning("Logo watermark failed for postcard: %s", exc)

    return image_b64


# ═══════════════════════════════════════════════════════════════════════
# ContentHub AI — Content Waterfall Generation & URL Scraping
# ═══════════════════════════════════════════════════════════════════════


async def generate_content_waterfall(
    source_text: str,
    topic: str,
    user_id: Optional[int],
    db: AsyncSession,
    settings: Settings,
    tone_override: Optional[str] = None,
) -> dict:
    """Generate a content waterfall — one source piece → 6 platform-specific versions.

    Uses Claude Sonnet for creative writing quality. The waterfall strategy follows
    the OpenClaw content methodology: transform a single core idea into optimized
    content for Facebook, Instagram, LinkedIn, YouTube (script + short), and blog.

    Returns: {
        content: { facebook, instagram, linkedin, youtube_script, youtube_short, blog_post },
        topic: str,
        model: str,
    }
    """
    # ── Fetch user's business profile for personalization ──
    investor_profile_block = ""
    effective_tone = tone_override or "Professional & Educational"
    try:
        if user_id:
            from rei.models.user import User as UserModel
            result = await db.execute(select(UserModel).where(UserModel.id == user_id))
            profile_user = result.scalars().first()
            if profile_user:
                parts = []
                if profile_user.company_name:
                    parts.append(f"Company Name: {profile_user.company_name}")
                if profile_user.company_phone:
                    parts.append(f"Business Phone: {profile_user.company_phone}")
                if profile_user.company_website:
                    parts.append(f"Website: {profile_user.company_website}")
                if profile_user.investing_strategy:
                    parts.append(f"Investing Strategy: {profile_user.investing_strategy}")
                if profile_user.mission_statement:
                    parts.append(f"Mission: {profile_user.mission_statement}")
                if profile_user.primary_market:
                    parts.append(f"Primary Market: {profile_user.primary_market}")
                if parts:
                    investor_profile_block = "\nINVESTOR PROFILE:\n" + "\n".join(parts) + "\n"
                # Resolve tone: override > user default > fallback
                if not tone_override and profile_user.content_tone:
                    effective_tone = profile_user.content_tone
    except Exception as exc:
        logger.warning("Failed to fetch user profile for content generation: %s", exc)

    system_prompt = f"""You are an expert real estate content strategist and copywriter.
Your job is to transform source content into platform-optimized pieces for a real estate investor's brand.
{investor_profile_block}
TONE: {effective_tone}
Write all content in this tone. If the investor provided a mission or strategy, naturally weave their voice and perspective into the content. Reference their company name and website where appropriate (e.g., in CTAs).

VOICE & STYLE GUIDELINES:
- Write as a knowledgeable, approachable real estate investor sharing valuable insights
- Use conversational yet professional language - not corporate jargon
- Include specific, actionable advice where possible
- Adapt tone to each platform's audience expectations
- Never use generic filler - every sentence should add value
- NEVER use em dashes. Use regular dashes or commas instead

PLATFORM REQUIREMENTS:
1. FACEBOOK: 150-300 words. Engaging, story-driven. Start with a hook question or bold statement.
   Include a call-to-action. Use line breaks for readability. Add 2-3 relevant hashtags at the end.

2. INSTAGRAM: 100-200 words. Visual-first thinking — describe what image to pair it with.
   Use emoji sparingly but strategically. Include 15-20 hashtags in a separate block at the end.
   Start with a strong hook line.

3. LINKEDIN: 200-400 words. Professional and insightful. Share lessons learned, market analysis,
   or investment strategies. Position the author as a thought leader. End with a discussion question.
   Use 3-5 relevant hashtags.

4. YOUTUBE_SCRIPT: 800-1200 words. Full video script with:
   - Hook (first 15 seconds — grab attention immediately)
   - Intro (who you are, what they'll learn)
   - Main content broken into 3-5 key points with transitions
   - Outro with call-to-action (subscribe, comment, check links)
   Format with [SECTION] headers and (camera direction) notes.

5. YOUTUBE_SHORT: 100-150 words. 60-second vertical video script.
   Punchy, fast-paced. One key insight or tip. Strong hook in first 3 seconds.
   End with "Follow for more" type CTA.

6. BLOG_POST: 600-1000 words. SEO-friendly with a clear H1 title, H2 subheadings,
   an introduction, 3-5 main sections, and a conclusion with CTA.
   Include natural keyword usage. Write in clean HTML (h1, h2, p, ul/li tags only).

CRITICAL: Return your response as a valid JSON object with exactly these keys:
facebook, instagram, linkedin, youtube_script, youtube_short, blog_post

Each value must be a string containing the content for that platform.
Return ONLY the JSON object — no markdown fences, no explanation."""

    user_message = f"TOPIC: {topic}\n\nSOURCE CONTENT:\n{source_text}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    result = await ai_complete(
        messages=messages,
        user_id=user_id,
        db=db,
        settings=settings,
        task_type="content",
        max_tokens=6000,
        temperature=0.7,
    )

    # Parse the JSON response from Claude
    response_text = result.get("content", "").strip()

    # Clean markdown fences if present
    if "```json" in response_text:
        response_text = response_text.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in response_text:
        response_text = response_text.split("```", 1)[1].split("```", 1)[0]

    try:
        content = json.loads(response_text.strip())
    except json.JSONDecodeError:
        logger.warning("Content waterfall JSON parse failed, attempting recovery")
        # Try to find the JSON object in the response
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                content = json.loads(response_text[start:end])
            except json.JSONDecodeError:
                content = {
                    "facebook": response_text,
                    "instagram": "",
                    "linkedin": "",
                    "youtube_script": "",
                    "youtube_short": "",
                    "blog_post": "",
                }
        else:
            content = {
                "facebook": response_text,
                "instagram": "",
                "linkedin": "",
                "youtube_script": "",
                "youtube_short": "",
                "blog_post": "",
            }

    # Ensure all expected keys exist
    for key in ("facebook", "instagram", "linkedin", "youtube_script", "youtube_short", "blog_post"):
        if key not in content:
            content[key] = ""

    # Humanize all generated content — remove AI writing patterns and em dashes
    try:
        from rei.services.admin_humanizer_service import humanize_text

        for key in content:
            if content[key]:
                content[key] = humanize_text(content[key])
    except Exception as exc:
        logger.warning("Humanizer post-processing failed (non-fatal): %s", exc)

    return {
        "content": content,
        "topic": topic,
        "model": result.get("model", ""),
        "cost_cents": result.get("cost_cents", 0),
    }


async def scrape_url_content(url: str) -> dict:
    """Scrape a URL and extract clean text content using BeautifulSoup.

    No AI is needed for this step — just fetch and parse HTML.
    Returns: { text, url, char_count }
    """
    from bs4 import BeautifulSoup

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; REIFundamentalsHub/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        resp.raise_for_status()
        html = resp.text

    soup = BeautifulSoup(html, "lxml")

    # Remove script, style, nav, footer, header elements
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
        tag.decompose()

    # Try to find the main article content first
    article = soup.find("article") or soup.find("main") or soup.find("div", class_="content")
    if article:
        text = article.get_text(separator="\n", strip=True)
    else:
        text = soup.get_text(separator="\n", strip=True)

    # Clean up excessive whitespace
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    clean_text = "\n".join(lines)

    # Truncate to ~10K chars to keep prompts reasonable
    if len(clean_text) > 10000:
        clean_text = clean_text[:10000] + "\n\n[Content truncated...]"

    return {
        "text": clean_text,
        "url": str(url),
        "char_count": len(clean_text),
    }


# ═══════════════════════════════════════════════════════════════════════
# Document Intelligence — AI-powered document analysis
# ═══════════════════════════════════════════════════════════════════════

# Category-specific prompts for document analysis
_DOC_CATEGORY_PROMPTS = {
    "title": """You are a real estate title expert analyzing a title report/commitment.
Extract and organize:
- Property legal description and address
- Current owner(s) of record
- All liens, encumbrances, and exceptions (mortgages, tax liens, judgments, easements)
- Any title defects or clouds on title
- Requirements/conditions to clear title
- Vesting information
- Tax status and amounts owed
Flag any RED FLAGS that could delay or prevent closing.""",

    "inspection": """You are a certified home inspector reviewing an inspection report.
Extract and organize:
- Overall property condition assessment (grade A-F)
- Major structural issues (foundation, roof, framing)
- Mechanical systems status (HVAC, plumbing, electrical)
- Safety hazards (mold, asbestos, lead paint, radon)
- Estimated repair costs for each issue (provide ranges)
- Items needing immediate attention vs. future maintenance
- Code violations if any
Prioritize issues by severity and cost impact.""",

    "appraisal": """You are a real estate appraiser reviewing an appraisal report.
Extract and organize:
- Appraised value and effective date
- Property details (sq ft, beds, baths, lot size, year built)
- Comparable sales used (address, sale price, adjustments)
- Market conditions assessment
- Any special conditions or assumptions
- Value reconciliation approach
Flag any concerns about the valuation methodology.""",

    "contract": """You are a real estate attorney reviewing a purchase/sale contract.
Extract and organize:
- Buyer and seller names/entities
- Property address and legal description
- Purchase price and earnest money amount
- Contingencies (inspection, financing, appraisal) and their deadlines
- Closing date and possession terms
- Special conditions or addenda
- Who pays what closing costs
- Default and remedy provisions
Flag any unusual terms, missing protections, or potential risks.""",

    "insurance": """You are an insurance specialist reviewing a property insurance document.
Extract and organize:
- Policy type and coverage amounts
- Premium amounts (annual/monthly)
- Deductibles
- What is covered and excluded
- Named insured and loss payee
- Policy term dates
- Any special endorsements or riders
Flag any gaps in coverage for an investment property.""",

    "general": """You are a real estate document analyst.
Analyze this document and extract all relevant information for a real estate investor.
Organize your findings into clear sections with:
- Document type and purpose
- Key parties involved
- Important dates and deadlines
- Financial figures
- Terms and conditions
- Action items or requirements
- Any red flags or concerns""",
}


async def analyze_document(
    file_content_b64: str,
    file_type: str,
    document_category: str,
    user_id: Optional[int],
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """Analyze a document using Claude Vision (images) or text extraction (PDFs).

    Args:
        file_content_b64: Base64-encoded file content
        file_type: MIME type (image/jpeg, application/pdf, etc.)
        document_category: Category for prompt selection (title, inspection, etc.)
        user_id: User making the request
        db: Database session
        settings: App settings

    Returns: {
        summary: str,
        key_issues: [{ issue, severity, detail }],
        extracted_data: { ... },
        risk_flags: [str],
        recommendation: str,
    }
    """
    category_prompt = _DOC_CATEGORY_PROMPTS.get(
        document_category, _DOC_CATEGORY_PROMPTS["general"]
    )

    system_prompt = f"""{category_prompt}

RESPONSE FORMAT — Return a valid JSON object with exactly these fields:
{{
    "summary": "<2-3 paragraph summary of the document>",
    "key_issues": [
        {{ "issue": "<issue title>", "severity": "<high|medium|low>", "detail": "<explanation>" }}
    ],
    "extracted_data": {{
        "<relevant field>": "<value>",
        ...
    }},
    "risk_flags": ["<risk 1>", "<risk 2>"],
    "recommendation": "<overall recommendation for the investor>"
}}

Return ONLY the JSON object — no markdown fences, no explanation."""

    images = None
    user_message = "Analyze this document thoroughly."

    # For PDFs: try text extraction first, fall back to image if too short
    if "pdf" in file_type.lower():
        try:
            import io
            from pypdf import PdfReader

            pdf_bytes = base64.b64decode(file_content_b64)
            reader = PdfReader(io.BytesIO(pdf_bytes))
            text_pages = []
            for page in reader.pages:
                text_pages.append(page.extract_text() or "")
            full_text = "\n\n".join(text_pages)

            if len(full_text.strip()) > 100:
                # Good text extraction — use text mode
                user_message = f"Analyze this document:\n\n{full_text[:15000]}"
            else:
                # Poor extraction (scanned PDF) — would need OCR, skip vision for now
                user_message = (
                    "This appears to be a scanned PDF with no extractable text. "
                    "Please note that image-based analysis of PDFs is not yet supported. "
                    "Try uploading individual page images instead."
                )
        except ImportError:
            logger.warning("pypdf not installed — cannot extract PDF text")
            user_message = "PDF text extraction is not available. Please upload as images."
        except Exception as exc:
            logger.warning("PDF text extraction failed: %s", exc)
            user_message = f"Failed to read PDF: {str(exc)[:200]}"
    elif file_type.startswith("image/"):
        # Image documents (photos of contracts, scanned pages, etc.)
        images = [{"base64": file_content_b64, "media_type": file_type}]
        user_message = "Analyze this document image thoroughly."

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    result = await ai_complete(
        messages=messages,
        user_id=user_id,
        db=db,
        settings=settings,
        task_type="document_analysis",
        max_tokens=4000,
        temperature=0.2,
        images=images,
    )

    # Parse the response
    response_text = result.get("content", "").strip()
    if "```json" in response_text:
        response_text = response_text.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in response_text:
        response_text = response_text.split("```", 1)[1].split("```", 1)[0]

    try:
        analysis = json.loads(response_text.strip())
    except json.JSONDecodeError:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                analysis = json.loads(response_text[start:end])
            except json.JSONDecodeError:
                analysis = {
                    "summary": response_text,
                    "key_issues": [],
                    "extracted_data": {},
                    "risk_flags": [],
                    "recommendation": "Unable to parse structured analysis.",
                }
        else:
            analysis = {
                "summary": response_text,
                "key_issues": [],
                "extracted_data": {},
                "risk_flags": [],
                "recommendation": "Unable to parse structured analysis.",
            }

    # Ensure all expected keys
    for key in ("summary", "key_issues", "extracted_data", "risk_flags", "recommendation"):
        if key not in analysis:
            analysis[key] = [] if key in ("key_issues", "risk_flags") else ("" if key != "extracted_data" else {})

    analysis["model"] = result.get("model", "")
    analysis["cost_cents"] = result.get("cost_cents", 0)
    return analysis


# ═══════════════════════════════════════════════════════════════════════
# Property Photo AI Analysis — Claude Vision
# ═══════════════════════════════════════════════════════════════════════


async def analyze_property_photos(
    photos: list[dict],
    property_address: str,
    user_id: Optional[int],
    db: AsyncSession,
    settings: Settings,
) -> dict:
    """Analyze property photos using Claude Vision for condition assessment.

    Args:
        photos: List of { "base64": str, "media_type": str, "category": str }
            Up to 12 photos per call.
        property_address: Address for context.
        user_id: User making the request.
        db: Database session.
        settings: App settings.

    Returns: {
        per_photo: [{ category, condition_grade, issues[], repair_cost_range }],
        summary: { overall_grade, total_estimated_repairs, condition_description, key_concerns[] },
    }
    """
    system_prompt = """You are an experienced real estate property inspector and contractor.
Analyze the provided property photos and assess the condition of each area shown.

For EACH photo, provide:
- category: What area of the property this shows (e.g., "front exterior", "kitchen", "bathroom")
- condition_grade: Letter grade A through F (A=excellent, B=good, C=fair, D=poor, F=severe issues)
- issues: List of specific issues you can see (empty list if none)
- repair_cost_range: Estimated repair cost as "$X - $Y" or "$0" if no repairs needed

Then provide an OVERALL SUMMARY of the entire property.

RESPONSE FORMAT — Return a valid JSON object:
{
    "per_photo": [
        {
            "photo_index": 0,
            "category": "<area of property>",
            "condition_grade": "<A|B|C|D|F>",
            "issues": ["<issue 1>", "<issue 2>"],
            "repair_cost_range": "<$X - $Y>"
        }
    ],
    "summary": {
        "overall_grade": "<A|B|C|D|F>",
        "total_estimated_repairs": <number in dollars>,
        "condition_description": "<2-3 sentence overall description>",
        "key_concerns": ["<concern 1>", "<concern 2>"]
    }
}

Return ONLY the JSON object — no markdown fences, no explanation."""

    # Build the image list (max 12)
    images = []
    photo_labels = []
    for i, photo in enumerate(photos[:12]):
        images.append({
            "base64": photo["base64"],
            "media_type": photo.get("media_type", "image/jpeg"),
        })
        photo_labels.append(f"Photo {i + 1}: {photo.get('category', 'unknown')}")

    labels_text = "\n".join(photo_labels)
    user_message = (
        f"Property: {property_address}\n\n"
        f"I'm sending {len(images)} property photos. Here are their categories:\n{labels_text}\n\n"
        f"Please analyze each photo and provide an overall property condition assessment."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    result = await ai_complete(
        messages=messages,
        user_id=user_id,
        db=db,
        settings=settings,
        task_type="property_photos",
        max_tokens=4000,
        temperature=0.2,
        images=images,
    )

    # Parse the response
    response_text = result.get("content", "").strip()
    if "```json" in response_text:
        response_text = response_text.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in response_text:
        response_text = response_text.split("```", 1)[1].split("```", 1)[0]

    try:
        analysis = json.loads(response_text.strip())
    except json.JSONDecodeError:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                analysis = json.loads(response_text[start:end])
            except json.JSONDecodeError:
                analysis = {"per_photo": [], "summary": {
                    "overall_grade": "?",
                    "total_estimated_repairs": 0,
                    "condition_description": "Unable to parse photo analysis.",
                    "key_concerns": [],
                }}
        else:
            analysis = {"per_photo": [], "summary": {
                "overall_grade": "?",
                "total_estimated_repairs": 0,
                "condition_description": response_text[:500],
                "key_concerns": [],
            }}

    if "per_photo" not in analysis:
        analysis["per_photo"] = []
    if "summary" not in analysis:
        analysis["summary"] = {
            "overall_grade": "?",
            "total_estimated_repairs": 0,
            "condition_description": "Analysis incomplete.",
            "key_concerns": [],
        }

    analysis["model"] = result.get("model", "")
    analysis["cost_cents"] = result.get("cost_cents", 0)
    return analysis


# ── ContentHub Image Generation ───────────────────────────────────────────


async def generate_platform_image_prompts(
    topic: str,
    platforms: list[str],
    user_id: int | None,
    db: AsyncSession,
    settings: Settings,
) -> dict[str, str]:
    """Use Claude Haiku to generate optimized Stable Diffusion prompts for each platform.

    Returns a dict of platform → prompt string.
    """
    platform_specs = []
    for plat in platforms:
        w, h = PLATFORM_DIMENSIONS.get(plat, (1024, 576))
        orientation = "square" if w == h else ("landscape" if w > h else "portrait")
        platform_specs.append(f"- {plat}: {w}x{h} ({orientation})")

    specs_text = "\n".join(platform_specs)

    system_prompt = (
        "You are an expert at writing image generation prompts for Stable Diffusion. "
        "Your prompts produce professional, photorealistic real estate marketing images. "
        "Write prompts that are vivid, detailed, and visually compelling — suitable for "
        "social media marketing by a real estate investor.\n\n"
        "Rules:\n"
        "- Each prompt must be 1-2 sentences, under 200 characters\n"
        "- Focus on professional real estate imagery: modern homes, neighborhoods, keys, "
        "contracts, happy homeowners, investment growth visuals\n"
        "- Avoid text/words in images (Stable Diffusion renders text poorly)\n"
        "- Tailor each prompt to its platform's aspect ratio and audience\n"
        "- Instagram: eye-catching, vibrant, square composition\n"
        "- Facebook/LinkedIn: professional, trustworthy, landscape composition\n"
        "- YouTube: dynamic thumbnails with strong focal points\n"
        "- Blog: editorial photography style\n"
        "- YouTube Short: vertical composition, bold visual\n\n"
        "Respond with valid JSON only — a dict mapping platform name to prompt string."
    )

    user_message = (
        f"Topic: {topic}\n\n"
        f"Generate one Stable Diffusion image prompt for each platform:\n{specs_text}\n\n"
        f"Return JSON: {{\"facebook\": \"prompt...\", \"instagram\": \"prompt...\", ...}}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]

    result = await ai_complete(
        messages=messages,
        user_id=user_id,
        db=db,
        settings=settings,
        task_type="image_prompt",
        max_tokens=1000,
        temperature=0.7,
    )

    response_text = result.get("content", "").strip()
    # Parse JSON from response
    if "```json" in response_text:
        response_text = response_text.split("```json", 1)[1].split("```", 1)[0]
    elif "```" in response_text:
        response_text = response_text.split("```", 1)[1].split("```", 1)[0]

    try:
        prompts = json.loads(response_text.strip())
    except json.JSONDecodeError:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                prompts = json.loads(response_text[start:end])
            except json.JSONDecodeError:
                prompts = {plat: f"Professional real estate investment photo about {topic}, high quality, photorealistic" for plat in platforms}
        else:
            prompts = {plat: f"Professional real estate investment photo about {topic}, high quality, photorealistic" for plat in platforms}

    return prompts


def _apply_logo_watermark(image_b64: str, logo_b64: str, image_width: int) -> str:
    """Overlay a logo watermark onto a generated image (bottom-right corner).

    Both inputs and output are base64-encoded PNG strings.
    Uses Pillow (already in requirements.txt).
    """
    import io
    from PIL import Image

    # Decode the generated image
    img_bytes = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(img_bytes)).convert("RGBA")

    # Decode the logo — strip data-URI prefix if present
    logo_data = logo_b64
    if "," in logo_data:
        logo_data = logo_data.split(",", 1)[1]
    logo_bytes = base64.b64decode(logo_data)
    logo = Image.open(io.BytesIO(logo_bytes)).convert("RGBA")

    # Resize logo to ~10% of image width, preserving aspect ratio
    target_w = max(int(image_width * 0.10), 40)
    aspect = logo.height / logo.width
    target_h = int(target_w * aspect)
    logo = logo.resize((target_w, target_h), Image.LANCZOS)

    # Apply semi-transparency to the logo (70% opacity)
    alpha = logo.split()[3]
    alpha = alpha.point(lambda p: int(p * 0.7))
    logo.putalpha(alpha)

    # Paste in bottom-right corner with padding
    padding = 15
    x = img.width - target_w - padding
    y = img.height - target_h - padding
    img.paste(logo, (x, y), logo)

    # Re-encode to base64 PNG
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


async def generate_platform_images(
    topic: str,
    platforms: list[str],
    user_id: int,
    db: AsyncSession,
    settings: Settings,
) -> dict[str, dict]:
    """Generate images for each platform using Claude Haiku (prompts) + NVIDIA Stable Diffusion.

    Returns dict: { platform: { id, url, prompt, width, height } }
    """
    from datetime import timedelta
    from rei.models.crm import ContentImage
    from rei.services.credentials_service import get_provider_credentials

    # 1. Get NVIDIA API key
    nvidia_key = ""
    try:
        nv_creds = await get_provider_credentials(db, "nvidia")
        if nv_creds and nv_creds.get("nvidia_api_key"):
            nvidia_key = nv_creds["nvidia_api_key"]
    except Exception:
        pass

    if not nvidia_key:
        nvidia_key = getattr(settings, "nvidia_api_key", "") or ""

    if not nvidia_key:
        raise ValueError("No NVIDIA API key configured. Add it in Admin > Credentials.")

    # 2. Generate optimized prompts via Claude Haiku
    prompts = await generate_platform_image_prompts(topic, platforms, user_id, db, settings)

    # 3. Pre-fetch user's logo for watermarking (once, outside loop)
    user_logo_b64 = None
    try:
        from rei.models.user import User as UserModel
        user_result = await db.execute(
            select(UserModel).where(UserModel.id == user_id)
        )
        wm_user = user_result.scalars().first()
        if wm_user and wm_user.company_logo_b64:
            user_logo_b64 = wm_user.company_logo_b64
    except Exception as wm_exc:
        logger.warning("Failed to fetch user logo for watermarking: %s", wm_exc)

    # 4. Generate images for each platform
    results: dict[str, dict] = {}
    now = datetime.utcnow()
    expires = now + timedelta(days=7)

    for plat in platforms:
        prompt = prompts.get(plat, f"Professional real estate photo about {topic}")
        w, h = PLATFORM_DIMENSIONS.get(plat, (1024, 576))

        try:
            image_b64 = await _call_nvidia_image(
                prompt=prompt,
                width=w,
                height=h,
                api_key=nvidia_key,
            )

            # Watermark with user's logo if available
            if user_logo_b64:
                try:
                    image_b64 = _apply_logo_watermark(image_b64, user_logo_b64, w)
                except Exception as wm_exc:
                    logger.warning("Logo watermark failed for %s (non-fatal): %s", plat, wm_exc)

            # Store in DB
            img = ContentImage(
                user_id=user_id,
                platform=plat,
                topic=topic,
                prompt=prompt,
                image_b64=image_b64,
                mime_type="image/png",
                width=w,
                height=h,
                expires_at=expires,
            )
            db.add(img)
            await db.flush()  # Get the ID

            results[plat] = {
                "id": img.id,
                "prompt": prompt,
                "width": w,
                "height": h,
            }
            logger.info("Generated %s image for topic '%s' (id=%s)", plat, topic, img.id)

        except Exception as exc:
            logger.error("Failed to generate image for %s: %s", plat, exc)
            results[plat] = {
                "id": None,
                "prompt": prompt,
                "width": w,
                "height": h,
                "error": str(exc),
            }

    await db.commit()
    return results
