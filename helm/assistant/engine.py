"""Core AI engine — the brain behind Helm."""

from __future__ import annotations

import logging
import uuid

import anthropic

from helm.assistant.memory import memory
from helm.assistant.prompts import build_system_prompt
from helm.config import get_settings
from helm.models.schemas import AssistantMode, ChatRequest, ChatResponse

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

    async def chat(self, request: ChatRequest) -> ChatResponse:
        """Process a user message and return Helm's response."""
        conversation_id = request.conversation_id or uuid.uuid4().hex

        # Store the user message
        memory.add(conversation_id, "user", request.message)

        # Build context
        system_prompt = build_system_prompt(request.mode.value)
        messages = memory.get_history(conversation_id)

        try:
            response = await self.client.messages.create(
                model=settings.anthropic_model,
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
        )

    async def analyze_deal(
        self,
        address: str,
        purchase_price: float,
        rehab_cost: float = 0.0,
        after_repair_value: float | None = None,
        monthly_rent: float | None = None,
        strategy: str = "buy_and_hold",
    ) -> ChatResponse:
        """Run an AI-powered deal analysis using real estate expertise."""
        prompt = (
            f"Analyze this potential real estate deal:\n"
            f"- Address: {address}\n"
            f"- Purchase Price: ${purchase_price:,.2f}\n"
            f"- Rehab Cost: ${rehab_cost:,.2f}\n"
        )
        if after_repair_value:
            prompt += f"- After Repair Value (ARV): ${after_repair_value:,.2f}\n"
        if monthly_rent:
            prompt += f"- Expected Monthly Rent: ${monthly_rent:,.2f}\n"
        prompt += (
            f"- Strategy: {strategy}\n\n"
            "Provide a thorough analysis including cap rate, cash-on-cash return, "
            "ROI projection, risk factors, and your verdict. Show all math."
        )

        request = ChatRequest(
            message=prompt,
            mode=AssistantMode.REAL_ESTATE,
        )
        return await self.chat(request)

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
