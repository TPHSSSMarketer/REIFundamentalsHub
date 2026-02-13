"""Claude CLI integration — use your Claude Max subscription as an AI backend.

Runs ``claude -p "prompt"`` in headless mode, routing chat through your
Max subscription instead of burning API credits.

IMPORTANT: The subprocess runs from a temp directory to prevent Claude CLI
from reading CLAUDE.md (project context) and overriding Helm's personality.

Requirements:
  - Claude Code CLI installed: ``npm install -g @anthropic-ai/claude-code``
  - Authenticated: run ``claude`` once interactively to log in

Usage:
    from helm.integrations.claude_cli import claude_cli_client

    result = await claude_cli_client.chat(
        messages=[{"role": "user", "content": "Hello"}],
        system_prompt="You are Helm.",
    )
    print(result["content"])
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import tempfile
from datetime import datetime, timezone

from helm.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Timeout for Claude CLI subprocess (seconds)
DEFAULT_TIMEOUT = 120


class ClaudeCLIClient:
    """Async wrapper around ``claude -p`` headless mode."""

    def __init__(self) -> None:
        self._claude_path: str | None = None

    @property
    def is_configured(self) -> bool:
        """Check if the Claude CLI binary is available on PATH."""
        if self._claude_path is None:
            self._claude_path = shutil.which("claude") or ""
        return bool(self._claude_path)

    @property
    def claude_binary(self) -> str:
        if self._claude_path is None:
            self._claude_path = shutil.which("claude") or "claude"
        return self._claude_path

    async def chat(
        self,
        messages: list[dict],
        system_prompt: str = "",
        max_tokens: int = 4096,
        model: str = "",
    ) -> dict:
        """Send a conversation to Claude CLI and return the response.

        Formats the conversation history into a single prompt for
        ``claude -p``, since headless mode takes one prompt string.
        """
        if not self.is_configured:
            return {
                "error": "Claude CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code",
                "content": "",
            }

        # Build the user prompt from conversation history (no system prompt here)
        prompt = self._build_prompt(messages)

        # Build command
        cmd = [
            self.claude_binary,
            "-p", prompt,
            "--output-format", "text",
        ]

        # Pass system prompt via CLI flag so it's treated as instructions
        if system_prompt:
            cmd.extend(["--system-prompt", system_prompt])

        # Add model override if specified
        if model:
            cmd.extend(["--model", model])

        # Add max tokens
        cmd.extend(["--max-tokens", str(max_tokens)])

        # Disable tools — we want pure chat, not code execution
        cmd.extend(["--allowedTools", ""])

        try:
            result = await self._run_subprocess(cmd)
            return result
        except Exception as exc:
            logger.error("Claude CLI error: %s", exc)
            return {"error": str(exc), "content": ""}

    async def _run_subprocess(self, cmd: list[str]) -> dict:
        """Execute the Claude CLI command and capture output.

        Runs from a temp directory to prevent Claude CLI from reading
        CLAUDE.md or any project context files from the working directory.
        """
        timeout = getattr(settings, "claude_cli_timeout", DEFAULT_TIMEOUT)

        logger.info("Claude CLI: running subprocess (%d char prompt)", len(cmd[2]) if len(cmd) > 2 else 0)

        # Use temp dir as cwd so Claude CLI won't read CLAUDE.md
        # from the Helm project root and override our system prompt
        cwd = tempfile.gettempdir()

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return {
                "error": f"Claude CLI timed out after {timeout}s",
                "content": "",
            }

        stdout_text = stdout.decode("utf-8", errors="replace").strip()
        stderr_text = stderr.decode("utf-8", errors="replace").strip()

        if proc.returncode != 0:
            error_msg = stderr_text or stdout_text or f"exit code {proc.returncode}"
            logger.error("Claude CLI failed (rc=%d): %s", proc.returncode, error_msg[:500])
            return {"error": f"Claude CLI error: {error_msg[:500]}", "content": ""}

        if not stdout_text:
            return {"error": "Claude CLI returned empty response", "content": ""}

        logger.info("Claude CLI response: %d chars", len(stdout_text))

        return {
            "content": stdout_text,
            "model": "claude-cli (Max subscription)",
            "tokens_used": 0,  # CLI doesn't report token usage
            "cost_usd": 0.0,   # Included in Max subscription
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _build_prompt(messages: list[dict], system_prompt: str = "") -> str:
        """Convert a conversation history into a single prompt string.

        Claude CLI headless mode takes a single prompt. We format the
        conversation as a structured block so Claude understands the context.
        System prompt is passed via --system-prompt flag, not embedded here.
        """
        parts: list[str] = []

        if system_prompt:
            parts.append(f"<system>\n{system_prompt}\n</system>\n")

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "system":
                if not system_prompt:
                    parts.insert(0, f"<system>\n{content}\n</system>\n")
            elif role == "assistant":
                parts.append(f"<assistant>\n{content}\n</assistant>\n")
            else:
                parts.append(f"<user>\n{content}\n</user>")

        return "\n".join(parts)


# Singleton
claude_cli_client = ClaudeCLIClient()
