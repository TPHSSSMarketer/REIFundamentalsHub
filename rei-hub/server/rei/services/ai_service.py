"""Central AI abstraction layer — all AI calls in REI Hub go through this service."""

from __future__ import annotations

import hashlib
import hmac
import base64
import json
import logging
import time
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings
from rei.models.user import AIProviderConfig, User

logger = logging.getLogger(__name__)

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
    },
    "nvidia_kimi": {
        "base_url": "https://integrate.api.nvidia.com",
        "models": ["moonshotai/kimi-k2-instruct"],
        "default_model": "moonshotai/kimi-k2-instruct",
        "display_name": "NVIDIA Kimi 2.5",
    },
    "nvidia_minimax": {
        "base_url": "https://integrate.api.nvidia.com",
        "models": ["minimax/minimax-text-01"],
        "default_model": "minimax/minimax-text-01",
        "display_name": "NVIDIA MiniMax 2.1",
    },
    "nvidia_aiq": {
        "base_url": "https://integrate.api.nvidia.com",
        "models": ["nvidia/llama-3.3-nemotron-super-49b-v1"],
        "default_model": "nvidia/llama-3.3-nemotron-super-49b-v1",
        "display_name": "NVIDIA AI-Q",
    },
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
        "anthropic-version": "2023-06-01",
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
    tokens_used = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

    return {"content": content, "tokens_used": tokens_used}


async def _call_nvidia(
    messages: list[dict],
    model: str,
    api_key: str,
    base_url: str,
    max_tokens: int,
    temperature: float,
) -> dict:
    """Call an NVIDIA NIM endpoint (OpenAI-compatible chat completions)."""
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
    tokens_used = usage.get("total_tokens", 0)

    return {"content": content, "tokens_used": tokens_used}


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
) -> dict:
    """Resolve which provider, model, and API key to use for a request.

    Returns dict with: provider, model, api_key, base_url
    """
    global_config = await _get_global_config(db)

    provider = settings.default_ai_provider
    model = settings.default_ai_model
    anthropic_key = ""
    nvidia_key = ""

    if global_config:
        provider = global_config.active_provider
        model = global_config.active_model
        if global_config.anthropic_api_key:
            anthropic_key = decrypt_api_key(
                global_config.anthropic_api_key, settings.ai_encryption_key
            )
        if global_config.nvidia_api_key:
            nvidia_key = decrypt_api_key(
                global_config.nvidia_api_key, settings.ai_encryption_key
            )

    # Check per-user override
    if user_id and global_config and global_config.allow_user_override:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user and user.ai_override_enabled:
            if user.ai_provider_override:
                provider = user.ai_provider_override
            if user.ai_model_override:
                model = user.ai_model_override
            # User's own keys take priority if set
            if user.ai_own_anthropic_key:
                anthropic_key = decrypt_api_key(
                    user.ai_own_anthropic_key, settings.ai_encryption_key
                )
            if user.ai_own_nvidia_key:
                nvidia_key = decrypt_api_key(
                    user.ai_own_nvidia_key, settings.ai_encryption_key
                )

    # For legal/research tasks, prefer nvidia_aiq if configured
    if task_type in ("legal", "research") and nvidia_key:
        provider = "nvidia_aiq"
        model = PROVIDER_CONFIGS["nvidia_aiq"]["default_model"]

    # Determine the API key and base_url for the resolved provider
    pconfig = PROVIDER_CONFIGS.get(provider, PROVIDER_CONFIGS["nvidia_kimi"])
    base_url = pconfig["base_url"]

    if provider == "anthropic":
        api_key = anthropic_key
    else:
        api_key = nvidia_key

    # Fallback chain: nvidia_kimi → nvidia_minimax → anthropic (last resort)
    if not api_key:
        fallback_chain = [
            ("nvidia_kimi", nvidia_key),
            ("nvidia_minimax", nvidia_key),
            ("anthropic", anthropic_key),
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
    }


async def ai_complete(
    messages: list[dict],
    user_id: Optional[int],
    db: AsyncSession,
    settings: Settings,
    task_type: str = "general",
    max_tokens: int = 2000,
    temperature: float = 0.3,
) -> dict:
    """Main AI completion function — resolves provider and calls the API.

    Returns: { content, provider, model, tokens_used }
    """
    resolved = await _resolve_provider(user_id, db, settings, task_type)

    if not resolved["api_key"]:
        return {
            "content": "No AI provider is configured. Please ask your admin to set up an API key.",
            "provider": resolved["provider"],
            "model": resolved["model"],
            "tokens_used": 0,
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
        logger.error(
            "AI provider %s returned %s: %s",
            resolved["provider"],
            exc.response.status_code,
            exc.response.text[:500],
        )
        return {
            "content": f"AI provider error ({exc.response.status_code}). Please check your API key configuration.",
            "provider": resolved["provider"],
            "model": resolved["model"],
            "tokens_used": 0,
        }
    except Exception as exc:
        logger.exception("AI provider call failed")
        return {
            "content": f"AI provider error: {str(exc)}",
            "provider": resolved["provider"],
            "model": resolved["model"],
            "tokens_used": 0,
        }

    # Update usage tracking on global config
    global_config = await _get_global_config(db)
    if global_config:
        global_config.total_requests += 1
        global_config.total_tokens += result.get("tokens_used", 0)
        await db.commit()

    return {
        "content": result["content"],
        "provider": resolved["provider"],
        "model": resolved["model"],
        "tokens_used": result.get("tokens_used", 0),
    }


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
