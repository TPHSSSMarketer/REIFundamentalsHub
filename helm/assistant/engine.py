"""Core AI engine — the brain behind Helm.

Uses the multi-model router to send each message to the right AI model:
  - Opus for complex analysis (deal evaluation, strategy, portfolio review)
  - Sonnet for routine tasks (summaries, reminders, simple Q&A)
  - Perplexity Sonar Pro for web research (comps, market data, news)
  - Perplexity Deep Research for comprehensive reports
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

    async def chat(self, request: ChatRequest) -> ChatResponse:
        """Process a user message and return Helm's response.

        Uses the smart router to classify intent and pick the right model:
          - Opus / Sonnet → Anthropic API directly
          - Perplexity tiers → OpenRouter, then Opus synthesises the result
        """
        conversation_id = request.conversation_id or uuid.uuid4().hex

        # Store the user message
        memory.add(conversation_id, "user", request.message)

        # ── Smart routing ────────────────────────────────────────────────
        tier = await classify_task_smart(request.message, mode=request.mode.value)
        clean_message = strip_command(request.message)
        model_used = ""

        logger.info(
            "Router: '%s' → tier=%s",
            request.message[:80],
            tier,
        )

        # Build context
        system_prompt = build_system_prompt(request.mode.value)
        messages = memory.get_history(conversation_id)

        try:
            # ── Perplexity tiers: research first, then synthesise ────────
            if tier in (ModelTier.PERPLEXITY_SEARCH, ModelTier.PERPLEXITY_DEEP):
                reply_text, model_used = await self._research_and_synthesise(
                    clean_message, tier, system_prompt, messages,
                )

            # ── Anthropic tiers (Opus / Sonnet) ─────────────────────────
            else:
                model_id = self._model_for_tier(tier)
                model_used = model_id

                response = await self.client.messages.create(
                    model=model_id,
                    max_tokens=4096,
                    system=system_prompt,
                    messages=messages,
                )
                reply_text = response.content[0].text

        except anthropic.APIError as exc:
            logger.error("Anthropic API error: %s", exc)
            reply_text = (
                "I'm having trouble reaching my AI backend right now. "
                "Please check the API key configuration and try again."
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

    async def _research_and_synthesise(
        self,
        query: str,
        tier: str,
        system_prompt: str,
        messages: list[dict],
    ) -> tuple[str, str]:
        """Run a Perplexity research call, then have Claude synthesise the results.

        Returns (reply_text, model_used_label).
        """
        from helm.integrations.openrouter import openrouter_client

        # 1. Research via OpenRouter / Perplexity
        if tier == ModelTier.PERPLEXITY_DEEP:
            research = await openrouter_client.deep_research(query)
        else:
            research = await openrouter_client.search(query)

        research_content = research.get("content", "")

        # If OpenRouter isn't configured or returned nothing, fall back to Sonnet
        if not research_content:
            error = research.get("error", "no content returned")
            logger.warning("Research unavailable (%s), falling back to Sonnet", error)
            model_id = settings.anthropic_model
            response = await self.client.messages.create(
                model=model_id,
                max_tokens=4096,
                system=system_prompt,
                messages=messages,
            )
            return response.content[0].text, model_id

        # 2. Synthesise with Sonnet (fast + cheap) using the research as context
        synthesis_prompt = (
            f"{system_prompt}\n\n"
            f"--- Web Research Results ---\n{research_content}\n"
            f"--- End Research ---\n\n"
            f"Use the research above to give the user a clear, actionable answer. "
            f"Cite specific data points. If research is insufficient, say so."
        )

        model_id = settings.anthropic_model
        response = await self.client.messages.create(
            model=model_id,
            max_tokens=4096,
            system=synthesis_prompt,
            messages=messages,
        )

        model_label = f"perplexity+{model_id}"
        return response.content[0].text, model_label

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
