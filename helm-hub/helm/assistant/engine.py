"""Core AI engine — the brain behind Helm.

Orchestration flow for every message:
  1. Check for sub-agent routing (@mention or intent detection)
  2. Check permission tier (auto-approved / confirmation-required / admin-only)
  3. Smart-route to the right model tier (Opus/Sonnet/Perplexity)
  4. Apply output style based on mode
  5. Persist to database

Supports four AI backends (configured via AI_BACKEND env var):
  - "anthropic" — direct Anthropic API (requires API credits)
  - "openrouter" — OpenRouter gateway (supports Claude + many other models)
  - "claude_cli" — Claude Code CLI headless mode (uses Max subscription)
  - "nvidia" — NVIDIA NIM (OpenAI-compatible API, e.g. Nemotron)
"""

from __future__ import annotations

import logging
import uuid

import anthropic

from helm.assistant.memory import memory
from helm.assistant.prompts import build_system_prompt
from helm.config import get_settings
from helm.models.schemas import AssistantMode, ChatRequest, ChatResponse
from helm.orchestrator.multi_ai_router import (
    ModelTier,
    classify_task_smart,
    get_model_info,
    strip_command,
)
from helm.orchestrator.agent_spawner import agent_spawner

logger = logging.getLogger(__name__)
settings = get_settings()


# ── Permission Tiers ────────────────────────────────────────────────────────

class PermissionTier:
    AUTO = "auto"           # No confirmation needed
    CONFIRM = "confirm"     # Needs user button-press before executing
    ADMIN = "admin"         # Never automated

# Actions and their required permission tier
PERMISSION_MAP = {
    # Auto-approved (read-only)
    "read_contacts": PermissionTier.AUTO,
    "read_deals": PermissionTier.AUTO,
    "read_calendar": PermissionTier.AUTO,
    "read_tasks": PermissionTier.AUTO,
    "search_memory": PermissionTier.AUTO,
    "generate_summary": PermissionTier.AUTO,
    "transcribe_voice": PermissionTier.AUTO,
    "run_research": PermissionTier.AUTO,
    "spawn_readonly_agent": PermissionTier.AUTO,
    # Confirmation required (write operations)
    "send_message": PermissionTier.CONFIRM,
    "create_contact": PermissionTier.CONFIRM,
    "update_contact": PermissionTier.CONFIRM,
    "create_deal": PermissionTier.CONFIRM,
    "update_deal": PermissionTier.CONFIRM,
    "create_task": PermissionTier.CONFIRM,
    "complete_task": PermissionTier.CONFIRM,
    "schedule_event": PermissionTier.CONFIRM,
    "move_pipeline_stage": PermissionTier.CONFIRM,
    "make_voice_call": PermissionTier.CONFIRM,
    # Admin only
    "delete_data": PermissionTier.ADMIN,
    "modify_pipeline": PermissionTier.ADMIN,
    "change_tenant_config": PermissionTier.ADMIN,
    "access_other_tenant": PermissionTier.ADMIN,
}


def check_permission(action: str) -> str:
    """Return the permission tier for an action."""
    return PERMISSION_MAP.get(action, PermissionTier.AUTO)


class HelmEngine:
    """Orchestrates conversations with the AI provider and connected tools."""

    def __init__(self) -> None:
        self._client: anthropic.AsyncAnthropic | None = None

    @property
    def client(self) -> anthropic.AsyncAnthropic:
        if self._client is None:
            self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        return self._client

    def _model_for_tier(self, tier: str) -> str:
        """Map a model tier to an actual Anthropic model ID."""
        if tier == ModelTier.OPUS:
            return settings.anthropic_model_opus
        return settings.anthropic_model  # Sonnet default

    def _openrouter_model_for_tier(self, tier: str) -> str:
        """Map a model tier to an OpenRouter model ID."""
        if tier == ModelTier.OPUS:
            return settings.openrouter_model_opus
        return settings.openrouter_model  # Sonnet default

    @property
    def _backend(self) -> str:
        return settings.ai_backend.lower()

    @property
    def _use_openrouter(self) -> bool:
        return self._backend == "openrouter"

    @property
    def _use_claude_cli(self) -> bool:
        return self._backend == "claude_cli"

    @property
    def _use_nvidia(self) -> bool:
        return self._backend == "nvidia"

    async def chat(self, request: ChatRequest) -> ChatResponse:
        """Process a user message through the full orchestration pipeline.

        Pipeline:
          1. Agent detection — route to sub-agent if message matches
          2. Smart routing — classify intent → pick model tier
          3. Output styling — apply mode-appropriate style
          4. Backend fallback — try all backends until one works
          5. Persist — save to in-memory cache + database
        """
        conversation_id = request.conversation_id or uuid.uuid4().hex

        # Store the user message (in-memory + persist to DB)
        await memory.add_and_persist(conversation_id, "user", request.message)

        # ── Step 1: Agent routing ─────────────────────────────────────────
        agent_name = agent_spawner.detect_agent(request.message)
        if agent_name:
            logger.info("Agent route: '%s' → @%s", request.message[:60], agent_name)
            try:
                # Strip the @agent-name prefix if present
                task = request.message
                if task.lower().startswith(f"@{agent_name}"):
                    task = task[len(agent_name) + 1:].strip()

                user_context = await self._load_user_context()
                result = await agent_spawner.run_agent(
                    agent_name, task, context=user_context,
                )

                if result.status == "completed" and result.output:
                    reply_text = result.output
                    model_used = f"agent:{agent_name}({result.model_used})"
                    tier = result.model_used or "sonnet"

                    await memory.add_and_persist(conversation_id, "assistant", reply_text)
                    return ChatResponse(
                        conversation_id=conversation_id,
                        reply=reply_text,
                        mode=request.mode,
                        model_tier=tier,
                        model_used=model_used,
                    )
                else:
                    logger.warning("Agent %s failed: %s — falling through to default", agent_name, result.error)
            except Exception as exc:
                logger.warning("Agent routing failed for %s: %s — falling through", agent_name, exc)

        # ── Step 2: Smart routing ─────────────────────────────────────────
        tier = await classify_task_smart(request.message, mode=request.mode.value)
        clean_message = strip_command(request.message)
        model_used = ""

        logger.info(
            "Router: '%s' → tier=%s  backend=%s",
            request.message[:80],
            tier,
            settings.ai_backend,
        )

        # ── Step 3: Build context + output style ─────────────────────────
        user_context = await self._load_user_context()
        system_prompt = build_system_prompt(
            request.mode.value, user_context=user_context,
        )
        messages = memory.get_history(conversation_id)

        try:
            # ── Step 4: Execute ──────────────────────────────────────────
            if tier in (ModelTier.PERPLEXITY_SEARCH, ModelTier.PERPLEXITY_DEEP):
                reply_text, model_used = await self._research_and_synthesise(
                    clean_message, tier, system_prompt, messages,
                )

            else:
                reply_text, model_used = await self._chat_with_fallback(
                    tier, system_prompt, messages,
                )

        except anthropic.APIError as exc:
            logger.error("Anthropic API error: %s", exc)
            reply_text = (
                "I'm having trouble reaching my AI backend right now. "
                "Please check the API key configuration and try again."
            )
        except Exception as exc:
            logger.error("Chat error: %s", exc)
            reply_text = (
                "Something went wrong processing your message. "
                "Please try again."
            )

        # ── Step 5: Persist ──────────────────────────────────────────────
        await memory.add_and_persist(conversation_id, "assistant", reply_text)

        return ChatResponse(
            conversation_id=conversation_id,
            reply=reply_text,
            mode=request.mode,
            model_tier=tier,
            model_used=model_used,
        )

    async def _chat_with_fallback(
        self,
        tier: str,
        system_prompt: str,
        messages: list[dict],
    ) -> tuple[str, str]:
        """Try the configured backend, then fall back to alternatives.

        Order: configured backend → claude_cli → openrouter → anthropic.
        Stops at the first backend that returns a non-empty response.
        """
        from helm.integrations.claude_cli import claude_cli_client
        from helm.integrations.openrouter import openrouter_client

        # Determine the configured primary backend from properties
        # (uses _use_* properties so test mocks work correctly)
        if self._use_claude_cli:
            configured = "claude_cli"
        elif self._use_openrouter:
            configured = "openrouter"
        elif self._use_nvidia:
            configured = "nvidia"
        else:
            configured = "anthropic"

        # Build an ordered list of backends to try
        backends: list[str] = [configured]
        for alt in ["claude_cli", "openrouter", "nvidia", "anthropic"]:
            if alt not in backends:
                backends.append(alt)

        errors: list[str] = []

        for backend in backends:
            try:
                if backend == "claude_cli":
                    if not claude_cli_client.is_configured:
                        errors.append("claude_cli: binary not found")
                        continue
                    text, model = await self._chat_via_claude_cli(system_prompt, messages)
                    if text and not text.startswith("I'm having trouble"):
                        return text, model
                    errors.append(f"claude_cli: {text[:100]}")

                elif backend == "openrouter":
                    if not openrouter_client.is_configured:
                        errors.append("openrouter: no API key")
                        continue
                    text, model = await self._chat_via_openrouter(tier, system_prompt, messages)
                    if text and not text.startswith("I'm having trouble"):
                        return text, model
                    errors.append(f"openrouter: {text[:100]}")

                elif backend == "nvidia":
                    if not settings.nvidia_api_key:
                        errors.append("nvidia: no API key set")
                        continue
                    text, model = await self._chat_via_nvidia(system_prompt, messages)
                    if text and not text.startswith("I'm having trouble"):
                        return text, model
                    errors.append(f"nvidia: {text[:100]}")

                elif backend == "anthropic":
                    if not settings.anthropic_api_key:
                        errors.append("anthropic: no API key set")
                        continue
                    model_id = self._model_for_tier(tier)
                    response = await self.client.messages.create(
                        model=model_id,
                        max_tokens=4096,
                        system=system_prompt,
                        messages=messages,
                    )
                    return response.content[0].text, model_id

            except Exception as exc:
                errors.append(f"{backend}: {exc}")
                logger.warning("Backend %s failed: %s", backend, exc)
                continue

        # All backends failed — give a clear, actionable error
        logger.error("All AI backends failed: %s", errors)
        return (
            "I couldn't reach any AI backend. Here's what I tried:\n\n"
            + "\n".join(f"- {e}" for e in errors)
            + "\n\nTo fix this, set up at least one backend in your .env file:\n"
            "- **Claude CLI**: Run `claude` once to log in (uses Max subscription)\n"
            "- **OpenRouter**: Set OPENROUTER_API_KEY in .env\n"
            "- **NVIDIA NIM**: Set NVIDIA_API_KEY in .env\n"
            "- **Anthropic**: Set ANTHROPIC_API_KEY in .env"
        ), "none"

    async def _chat_via_openrouter(
        self,
        tier: str,
        system_prompt: str,
        messages: list[dict],
    ) -> tuple[str, str]:
        """Route a chat request through OpenRouter."""
        from helm.integrations.openrouter import openrouter_client

        model_id = self._openrouter_model_for_tier(tier)

        # Build messages list with system prompt
        or_messages: list[dict] = [{"role": "system", "content": system_prompt}]
        or_messages.extend(messages)

        result = await openrouter_client._call(
            messages=or_messages,
            model=model_id,
            max_tokens=4096,
        )

        content = result.get("content", "")
        if not content:
            error = result.get("error", "unknown error")
            logger.error("OpenRouter chat failed: %s", error)
            return (
                "I'm having trouble reaching my AI backend right now. "
                f"OpenRouter error: {error}"
            ), model_id

        actual_model = result.get("model", model_id)
        logger.info("OpenRouter response via %s (%d chars)", actual_model, len(content))
        return content, actual_model

    async def _chat_via_claude_cli(
        self,
        system_prompt: str,
        messages: list[dict],
    ) -> tuple[str, str]:
        """Route a chat request through Claude CLI (Max subscription)."""
        from helm.integrations.claude_cli import claude_cli_client

        result = await claude_cli_client.chat(
            messages=messages,
            system_prompt=system_prompt,
        )

        content = result.get("content", "")
        if not content:
            error = result.get("error", "unknown error")
            logger.error("Claude CLI chat failed: %s", error)
            return (
                "I'm having trouble reaching the Claude CLI backend. "
                f"Error: {error}"
            ), "claude-cli"

        model_label = result.get("model", "claude-cli (Max)")
        logger.info("Claude CLI response (%d chars)", len(content))
        return content, model_label

    async def _chat_via_nvidia(
        self,
        system_prompt: str,
        messages: list[dict],
    ) -> tuple[str, str]:
        """Route a chat request through NVIDIA NIM (OpenAI-compatible API)."""
        import httpx

        model_id = settings.nvidia_model
        nim_messages: list[dict] = [{"role": "system", "content": system_prompt}]
        nim_messages.extend(messages)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"{settings.nvidia_base_url.rstrip('/')}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {settings.nvidia_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model_id,
                        "messages": nim_messages,
                        "max_tokens": 4096,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as exc:
            logger.error("NVIDIA NIM HTTP error: %s", exc)
            return (
                f"I'm having trouble reaching the NVIDIA NIM backend. "
                f"HTTP {exc.response.status_code}"
            ), model_id
        except Exception as exc:
            logger.error("NVIDIA NIM request failed: %s", exc)
            return (
                f"I'm having trouble reaching the NVIDIA NIM backend. "
                f"Error: {exc}"
            ), model_id

        content = data["choices"][0]["message"]["content"]
        actual_model = data.get("model", model_id)
        logger.info("NVIDIA NIM response via %s (%d chars)", actual_model, len(content))
        return content, actual_model

    async def _research_and_synthesise(
        self,
        query: str,
        tier: str,
        system_prompt: str,
        messages: list[dict],
    ) -> tuple[str, str]:
        """Run a Perplexity research call, then synthesise the results.

        Uses whichever backend is active (Anthropic, OpenRouter, or CLI)
        for synthesis.  Returns (reply_text, model_used_label).
        """
        from helm.integrations.openrouter import openrouter_client

        # 1. Research via OpenRouter / Perplexity
        if tier == ModelTier.PERPLEXITY_DEEP:
            research = await openrouter_client.deep_research(query)
        else:
            research = await openrouter_client.search(query)

        research_content = research.get("content", "")

        # If OpenRouter isn't configured or returned nothing, fall back
        if not research_content:
            error = research.get("error", "no content returned")
            logger.warning("Research unavailable (%s), falling back to chat", error)
            return await self._synthesise_chat(system_prompt, messages)

        # 2. Synthesise using the active backend
        synthesis_prompt = (
            f"{system_prompt}\n\n"
            f"--- Web Research Results ---\n{research_content}\n"
            f"--- End Research ---\n\n"
            f"Use the research above to give the user a clear, actionable answer. "
            f"Cite specific data points. If research is insufficient, say so."
        )

        reply_text, model_id = await self._synthesise_chat(synthesis_prompt, messages)
        return reply_text, f"perplexity+{model_id}"

    async def _synthesise_chat(
        self,
        system_prompt: str,
        messages: list[dict],
    ) -> tuple[str, str]:
        """Run a chat completion using the backend fallback chain."""
        return await self._chat_with_fallback(
            ModelTier.SONNET, system_prompt, messages,
        )

    async def _check_and_enforce_permission(
        self,
        action: str,
        details: str = "",
    ) -> tuple[bool, str | None]:
        """Check if an action is allowed. Returns (allowed, message_if_blocked).

        AUTO actions proceed immediately.
        CONFIRM actions return a confirmation prompt.
        ADMIN actions are always blocked.
        """
        tier = check_permission(action)

        if tier == PermissionTier.AUTO:
            return True, None

        if tier == PermissionTier.ADMIN:
            return False, (
                f"This action ({action}) requires admin access and cannot be "
                "executed through the chat interface."
            )

        # CONFIRM tier — return a message that includes confirmation buttons
        return False, (
            f"This action requires your confirmation before I proceed:\n\n"
            f"**Action:** {action}\n"
            f"**Details:** {details}\n\n"
            f"Please confirm using the button below or reply 'yes' to proceed."
        )

    @staticmethod
    def _detect_write_action(tool_name: str) -> str | None:
        """Map a GHL tool name to a permission action. Returns None for read-only tools."""
        write_tools = {
            "ghl_create_contact": "create_contact",
            "ghl_update_contact": "update_contact",
            "ghl_create_opportunity": "create_deal",
            "ghl_update_opportunity": "update_deal",
            "ghl_create_task": "create_task",
            "ghl_complete_task": "complete_task",
            "ghl_create_calendar_event": "schedule_event",
            "ghl_send_message": "send_message",
            "ghl_add_note": "create_contact",  # grouped with contact writes
        }
        return write_tools.get(tool_name)

    async def _load_user_context(self) -> str:
        """Load user context files (profile, rules, memory) for the system prompt."""
        from helm.context.templates import read_context_for_prompt
        from helm.integrations.workspace import default_workspace

        try:
            return await read_context_for_prompt(default_workspace)
        except Exception as exc:
            logger.warning("Could not load user context: %s", exc)
            return ""

    async def daily_briefing(self) -> str:
        """Generate a morning briefing."""
        request = ChatRequest(
            message=(
                "Generate my daily briefing for today. Include:\n"
                "1. A motivational but grounded greeting.\n"
                "2. Key priorities and focus areas.\n"
                "3. Any portfolio metrics you have access to.\n"
                "4. Actionable recommendations for the day."
            ),
            mode=AssistantMode.BUSINESS,
        )
        response = await self.chat(request)
        return response.reply


# Singleton
helm_engine = HelmEngine()
