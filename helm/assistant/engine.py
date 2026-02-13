"""Core AI engine — the brain behind Helm.

Uses the multi-model router to send each message to the right AI model:
  - Opus for complex analysis (deal evaluation, strategy, portfolio review)
  - Sonnet for routine tasks (summaries, reminders, simple Q&A)
  - Perplexity Sonar Pro for web research (comps, market data, news)
  - Perplexity Deep Research for comprehensive reports

Supports three AI backends (configured via AI_BACKEND env var):
  - "anthropic" — direct Anthropic API (requires API credits)
  - "openrouter" — OpenRouter gateway (supports Claude + many other models)
  - "claude_cli" — Claude Code CLI headless mode (uses Max subscription)
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

logger = logging.getLogger(__name__)
settings = get_settings()


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

    async def chat(self, request: ChatRequest) -> ChatResponse:
        """Process a user message and return Helm's response.

        Uses the smart router to classify intent and pick the right model:
          - Opus / Sonnet → Anthropic API, OpenRouter, or Claude CLI
          - Perplexity tiers → OpenRouter, then synthesised by the active backend
        """
        conversation_id = request.conversation_id or uuid.uuid4().hex

        # Store the user message
        memory.add(conversation_id, "user", request.message)

        # ── Smart routing ────────────────────────────────────────────────
        tier = await classify_task_smart(request.message, mode=request.mode.value)
        clean_message = strip_command(request.message)
        model_used = ""

        logger.info(
            "Router: '%s' → tier=%s  backend=%s",
            request.message[:80],
            tier,
            settings.ai_backend,
        )

        # Build context — inject user profile, rules, and memory
        user_context = await self._load_user_context()
        system_prompt = build_system_prompt(
            request.mode.value, user_context=user_context,
        )
        messages = memory.get_history(conversation_id)

        try:
            # ── Perplexity tiers: research first, then synthesise ────────
            if tier in (ModelTier.PERPLEXITY_SEARCH, ModelTier.PERPLEXITY_DEEP):
                reply_text, model_used = await self._research_and_synthesise(
                    clean_message, tier, system_prompt, messages,
                )

            else:
                # Use the configured backend with automatic fallback
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

        # Store assistant reply
        memory.add(conversation_id, "assistant", reply_text)

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
        else:
            configured = "anthropic"

        # Build an ordered list of backends to try
        backends: list[str] = [configured]
        for alt in ["claude_cli", "openrouter", "anthropic"]:
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
