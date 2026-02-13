"""Agent spawner — delegates specialized tasks to sub-agents.

Supports two execution modes:
  1. Persona mode (default): The main engine adopts the agent's system prompt
     for a single request. Fast, no subprocess overhead.
  2. Headless mode: Spawns a Claude Code subprocess with the agent's prompt
     as the system context. Full isolation, parallel execution capability.

The orchestrator decides which mode based on task complexity and whether
parallel execution is needed.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field

from helm.agents.definitions import AgentDefinition, get_agent, list_agents
from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class AgentResult:
    """Result from a sub-agent execution."""
    agent_name: str
    task: str
    output: str
    status: str = "completed"  # completed, failed, timeout
    duration_ms: int = 0
    model_used: str = ""
    error: str | None = None


class AgentSpawner:
    """Manages sub-agent lifecycle and execution."""

    def __init__(self) -> None:
        self._active_agents: dict[str, asyncio.Task] = {}

    async def run_agent(
        self,
        agent_name: str,
        task: str,
        context: str = "",
        mode: str = "persona",
        tenant_id: str | None = None,
    ) -> AgentResult:
        """Execute a sub-agent on a task.

        Args:
            agent_name: Name of the agent definition to use
            task: The task/prompt to give the agent
            context: Additional context (user profile, deal data, etc.)
            mode: "persona" (same process) or "headless" (subprocess)
            tenant_id: Optional tenant scoping
        """
        agent_def = get_agent(agent_name)
        if not agent_def:
            return AgentResult(
                agent_name=agent_name,
                task=task,
                output="",
                status="failed",
                error=f"Unknown agent: {agent_name}",
            )

        start = time.time()

        # Log the agent execution start
        await self._log_execution(agent_name, task, "started", tenant_id=tenant_id)

        try:
            if mode == "headless":
                result = await self._run_headless(agent_def, task, context)
            else:
                result = await self._run_persona(agent_def, task, context)

            result.duration_ms = int((time.time() - start) * 1000)
            await self._log_execution(
                agent_name, task, result.status,
                output=result.output[:500],
                duration_ms=result.duration_ms,
                tenant_id=tenant_id,
            )
            return result

        except Exception as exc:
            duration_ms = int((time.time() - start) * 1000)
            await self._log_execution(
                agent_name, task, "failed",
                error=str(exc),
                duration_ms=duration_ms,
                tenant_id=tenant_id,
            )
            return AgentResult(
                agent_name=agent_name,
                task=task,
                output="",
                status="failed",
                duration_ms=duration_ms,
                error=str(exc),
            )

    async def run_parallel(
        self,
        tasks: list[dict],
        context: str = "",
        tenant_id: str | None = None,
    ) -> list[AgentResult]:
        """Run multiple agents in parallel.

        Args:
            tasks: List of {"agent": "name", "task": "prompt"} dicts
            context: Shared context for all agents
            tenant_id: Optional tenant scoping
        """
        coroutines = [
            self.run_agent(
                t["agent"], t["task"],
                context=context,
                mode=t.get("mode", "persona"),
                tenant_id=tenant_id,
            )
            for t in tasks
        ]
        return await asyncio.gather(*coroutines)

    async def compile_results(self, results: list[AgentResult]) -> str:
        """Compile multi-agent results into a unified response."""
        if not results:
            return "No agent results to compile."

        if len(results) == 1:
            r = results[0]
            if r.status == "completed":
                return r.output
            return f"Agent {r.agent_name} failed: {r.error}"

        # Multiple results — synthesize
        parts = []
        for r in results:
            if r.status == "completed":
                parts.append(f"**{r.agent_name}** ({r.duration_ms}ms):\n{r.output}")
            else:
                parts.append(f"**{r.agent_name}**: Failed — {r.error}")

        compiled = "\n\n---\n\n".join(parts)

        # Optionally synthesize with the engine
        from helm.assistant.engine import helm_engine
        from helm.models.schemas import ChatRequest

        synthesis_prompt = (
            "You received results from multiple specialist agents. "
            "Synthesize them into a unified, actionable response for the user.\n\n"
            f"{compiled}"
        )
        response = await helm_engine.chat(
            ChatRequest(message=synthesis_prompt, conversation_id="agent_synthesis")
        )
        return response.reply

    # ── Persona Mode ─────────────────────────────────────────────────────

    async def _run_persona(
        self,
        agent_def: AgentDefinition,
        task: str,
        context: str,
    ) -> AgentResult:
        """Run an agent by injecting its persona into the main engine."""
        from helm.assistant.engine import helm_engine
        from helm.assistant.memory import memory
        from helm.models.schemas import ChatRequest

        # Build a specialized system prompt
        agent_prompt = agent_def.system_prompt
        if context:
            agent_prompt += f"\n\n--- Context ---\n{context}"

        # Use a dedicated conversation so agent history stays separate
        conv_id = f"agent_{agent_def.name}_{int(time.time())}"
        memory.add(conv_id, "user", task)

        messages = memory.get_history(conv_id)

        reply_text, model_used = await helm_engine._chat_with_fallback(
            agent_def.model, agent_prompt, messages,
        )

        return AgentResult(
            agent_name=agent_def.name,
            task=task,
            output=reply_text,
            model_used=model_used,
        )

    # ── Headless Mode (Claude Code subprocess) ───────────────────────────

    async def _run_headless(
        self,
        agent_def: AgentDefinition,
        task: str,
        context: str,
    ) -> AgentResult:
        """Run an agent as a Claude Code headless subprocess."""
        from helm.integrations.claude_cli import claude_cli_client

        if not claude_cli_client.is_configured:
            # Fall back to persona mode
            logger.info("Claude CLI not available, falling back to persona mode for %s", agent_def.name)
            return await self._run_persona(agent_def, task, context)

        full_prompt = f"{agent_def.system_prompt}\n\n"
        if context:
            full_prompt += f"--- Context ---\n{context}\n\n"
        full_prompt += f"--- Task ---\n{task}"

        result = await claude_cli_client.chat(
            messages=[{"role": "user", "content": full_prompt}],
            system_prompt=agent_def.system_prompt,
        )

        content = result.get("content", "")
        if not content:
            return AgentResult(
                agent_name=agent_def.name,
                task=task,
                output="",
                status="failed",
                error=result.get("error", "No output from headless agent"),
            )

        return AgentResult(
            agent_name=agent_def.name,
            task=task,
            output=content,
            model_used=result.get("model", "claude-cli"),
        )

    # ── Logging ──────────────────────────────────────────────────────────

    async def _log_execution(
        self,
        agent_name: str,
        task: str,
        status: str,
        output: str = "",
        error: str = "",
        duration_ms: int = 0,
        tenant_id: str | None = None,
    ) -> None:
        """Log agent execution to the database."""
        try:
            from helm.models.database import AgentLog, async_session

            async with async_session() as session:
                log = AgentLog(
                    tenant_id=tenant_id,
                    agent_name=agent_name,
                    task=task[:500],
                    status=status,
                    input_summary=task[:200],
                    output_summary=output[:200] if output else None,
                    duration_ms=duration_ms,
                    error=error or None,
                )
                session.add(log)
                await session.commit()
        except Exception as exc:
            logger.warning("Failed to log agent execution: %s", exc)

    # ── Route Detection ──────────────────────────────────────────────────

    def detect_agent(self, message: str) -> str | None:
        """Detect if a message should be routed to a specific agent.

        Returns the agent name or None for default handling.
        """
        msg_lower = message.lower()

        # Explicit agent invocations
        if msg_lower.startswith("@"):
            agent_name = msg_lower.split()[0].lstrip("@")
            if get_agent(agent_name):
                return agent_name

        # Intent-based routing
        routing_rules = {
            "deal-analyzer": ["analyze this deal", "evaluate this property", "run the numbers", "brrrr analysis", "should i buy"],
            "market-researcher": ["market research", "pull comps", "neighborhood analysis", "what are rents"],
            "outreach-drafter": ["draft an email", "draft a text", "write a message", "draft a letter"],
            "task-manager": ["what's on my plate", "show my tasks", "what's due", "daily briefing"],
            "schedule-optimizer": ["optimize my schedule", "schedule conflict", "block time for"],
            "health-coach": ["workout", "meal plan", "sleep", "wellness check"],
            "research-assistant": ["research", "look up", "find out about"],
        }

        for agent_name, signals in routing_rules.items():
            for signal in signals:
                if signal in msg_lower:
                    return agent_name

        return None


# Singleton
agent_spawner = AgentSpawner()
