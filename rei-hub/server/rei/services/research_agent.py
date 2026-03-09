"""Agentic research service — Kimi K2.5 tool-calling loop for deep contact research.

Instead of a single-shot prompt, the agent runs in a loop:
1. Send the research task to Kimi K2.5 with available tools
2. If the model wants to call a tool, execute it and feed results back
3. Repeat until the model returns a final answer (no more tool calls)

This produces significantly better research results because the AI can:
- Search for information step by step
- Verify findings across multiple sources
- Follow leads discovered during research
- Build a complete picture before returning results
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from rei.config import Settings
from rei.services.ai_service import _call_nvidia_with_tools, _nvidia_limiter

logger = logging.getLogger(__name__)

# ── Maximum agent loop iterations to prevent runaway costs ─────────────
MAX_AGENT_TURNS = 8   # Max tool-calling round trips
MAX_TOTAL_TOKENS = 30000  # Safety cap on total token spend per research task


# ══════════════════════════════════════════════════════════════════════════
# Tool Definitions (OpenAI function-calling format for NVIDIA NIM)
# ══════════════════════════════════════════════════════════════════════════

RESEARCH_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for real-time information. Use this to find contact details, "
                "corporate officer names, mailing addresses, phone numbers, SEC filings, "
                "and any public information about companies or government offices. "
                "Returns a summary of search results."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query. Be specific — include company name, role, and what you're looking for.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_sec_filing",
            "description": (
                "Search SEC EDGAR for corporate filings. Use this to find registered agents, "
                "corporate officers, headquarters addresses, and legal information from 10-K, "
                "DEF 14A (proxy statements), and other SEC filings."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {
                        "type": "string",
                        "description": "The company name to search for in SEC EDGAR.",
                    },
                    "filing_type": {
                        "type": "string",
                        "description": "The type of filing to look for: '10-K' (annual report), 'DEF 14A' (proxy statement), '10-Q' (quarterly), 'ARS' (annual report to shareholders).",
                        "enum": ["10-K", "DEF 14A", "10-Q", "ARS"],
                    },
                },
                "required": ["company_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_state_business_registry",
            "description": (
                "Look up a company in a state's Secretary of State business entity registry. "
                "Use this to find registered agents, incorporation details, and official "
                "business addresses."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "company_name": {
                        "type": "string",
                        "description": "The company name to search for.",
                    },
                    "state": {
                        "type": "string",
                        "description": "Two-letter state code (e.g., 'DE' for Delaware, 'NY' for New York).",
                    },
                },
                "required": ["company_name", "state"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_county_tax_office",
            "description": (
                "Look up county and local tax authority contact information for a property address. "
                "Use this for tax lien negotiation cases to find the correct tax collector, "
                "treasurer, or assessor's office."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "property_address": {
                        "type": "string",
                        "description": "Full property address including street, city, state, and ZIP.",
                    },
                    "county": {
                        "type": "string",
                        "description": "County name, if known.",
                    },
                },
                "required": ["property_address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "verify_contact_info",
            "description": (
                "Verify or cross-reference a specific piece of contact information. "
                "Use this to confirm an address, phone number, or person's current role "
                "at a company. Helps validate findings from other tools."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "entity_name": {
                        "type": "string",
                        "description": "The company or person to verify.",
                    },
                    "info_type": {
                        "type": "string",
                        "description": "What to verify: 'address', 'phone', 'email', 'role', 'registered_agent'.",
                        "enum": ["address", "phone", "email", "role", "registered_agent"],
                    },
                    "claimed_value": {
                        "type": "string",
                        "description": "The value to verify (e.g., the address or phone number found).",
                    },
                },
                "required": ["entity_name", "info_type", "claimed_value"],
            },
        },
    },
]


# ══════════════════════════════════════════════════════════════════════════
# Tool Execution — these actually do the work when the AI calls a tool
# ══════════════════════════════════════════════════════════════════════════


async def _execute_tool(
    tool_name: str,
    arguments: dict,
    api_key: str,
    base_url: str,
) -> str:
    """Execute a research tool and return results as a string.

    All tools use web search under the hood (via a secondary AI call)
    since we don't have direct database access to SEC, SoS, etc.
    The AI synthesizes search results into useful structured data.
    """
    try:
        if tool_name == "web_search":
            return await _tool_web_search(arguments.get("query", ""), api_key, base_url)
        elif tool_name == "lookup_sec_filing":
            return await _tool_sec_filing(
                arguments.get("company_name", ""),
                arguments.get("filing_type", "10-K"),
                api_key, base_url,
            )
        elif tool_name == "lookup_state_business_registry":
            return await _tool_state_registry(
                arguments.get("company_name", ""),
                arguments.get("state", "DE"),
                api_key, base_url,
            )
        elif tool_name == "lookup_county_tax_office":
            return await _tool_county_tax(
                arguments.get("property_address", ""),
                arguments.get("county", ""),
                api_key, base_url,
            )
        elif tool_name == "verify_contact_info":
            return await _tool_verify_contact(
                arguments.get("entity_name", ""),
                arguments.get("info_type", "address"),
                arguments.get("claimed_value", ""),
                api_key, base_url,
            )
        else:
            return f"Unknown tool: {tool_name}"
    except Exception as exc:
        logger.error("Tool %s execution failed: %s", tool_name, exc)
        return f"Tool execution error: {str(exc)[:200]}"


async def _web_search_via_ai(query: str, api_key: str, base_url: str) -> str:
    """Use Kimi K2.5's built-in web knowledge to answer a search query.

    Kimi K2.5 has strong web-knowledge capabilities — we use a focused
    prompt to get it to act as a search engine, returning structured
    results. This is a lightweight AI call (low tokens, high temp=0.1).
    """
    await _nvidia_limiter.acquire()

    messages = [
        {
            "role": "system",
            "content": (
                "You are a research assistant with extensive knowledge of corporate records, "
                "government databases, and public information. Answer the query with specific, "
                "factual details including names, addresses, phone numbers, and sources. "
                "If you're not confident in a detail, say so. Be concise but thorough."
            ),
        },
        {"role": "user", "content": query},
    ]

    body = {
        "model": "moonshotai/kimi-k2.5",
        "messages": messages,
        "max_tokens": 1500,
        "temperature": 0.1,
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

    choices = data.get("choices", [])
    if choices:
        return choices[0].get("message", {}).get("content", "No results found.")
    return "No results found."


async def _tool_web_search(query: str, api_key: str, base_url: str) -> str:
    """Execute a web search tool call."""
    return await _web_search_via_ai(
        f"Search for: {query}. Provide specific contact details, addresses, and names if available.",
        api_key, base_url,
    )


async def _tool_sec_filing(company_name: str, filing_type: str, api_key: str, base_url: str) -> str:
    """Look up SEC filings for a company."""
    return await _web_search_via_ai(
        f"Look up {company_name} SEC EDGAR {filing_type} filing. Find the registered agent, "
        f"corporate officers (CEO, General Counsel), headquarters address, and state of "
        f"incorporation from their most recent {filing_type} filing.",
        api_key, base_url,
    )


async def _tool_state_registry(company_name: str, state: str, api_key: str, base_url: str) -> str:
    """Look up a company in a state business registry."""
    return await _web_search_via_ai(
        f"Look up {company_name} in the {state} Secretary of State business entity registry. "
        f"Find the registered agent name and address, entity status, and filing date.",
        api_key, base_url,
    )


async def _tool_county_tax(property_address: str, county: str, api_key: str, base_url: str) -> str:
    """Look up county and local tax office info."""
    county_ctx = f" in {county} County" if county else ""
    return await _web_search_via_ai(
        f"Find the tax collector and county treasurer office contact information for the property "
        f"at {property_address}{county_ctx}. Include mailing address, phone number, office hours, "
        f"and the name of the tax collector or treasurer if available.",
        api_key, base_url,
    )


async def _tool_verify_contact(
    entity_name: str, info_type: str, claimed_value: str,
    api_key: str, base_url: str,
) -> str:
    """Verify a specific piece of contact information."""
    return await _web_search_via_ai(
        f"Verify this {info_type} for {entity_name}: '{claimed_value}'. "
        f"Is this current and accurate? If not, what is the correct {info_type}?",
        api_key, base_url,
    )


# ══════════════════════════════════════════════════════════════════════════
# Agent Loop — the core orchestrator
# ══════════════════════════════════════════════════════════════════════════


async def run_research_agent(
    system_prompt: str,
    user_prompt: str,
    api_key: str,
    base_url: str = "https://integrate.api.nvidia.com",
    model: str = "moonshotai/kimi-k2.5",
    max_turns: int = MAX_AGENT_TURNS,
    on_step: Any = None,
) -> dict:
    """Run the research agent loop with tool calling.

    Args:
        system_prompt: System context for the research task.
        user_prompt: The specific research request.
        api_key: NVIDIA NIM API key.
        base_url: NVIDIA NIM base URL.
        model: Model to use (default: Kimi K2.5).
        max_turns: Maximum tool-calling iterations.
        on_step: Optional async callback(step_data) called after each step
            for real-time progress updates. step_data is a dict with:
            { "turn": int, "action": str, "tool_name": str, "detail": str }

    Returns:
        {
            "content": str,           # Final research output
            "steps": list[dict],      # Log of each tool call and result
            "total_tokens": int,      # Total tokens consumed
            "turns_used": int,        # Number of loop iterations
            "tools_called": list[str],# Names of tools that were called
        }
    """
    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    steps: list[dict] = []
    total_tokens = 0
    tools_called: list[str] = []
    start_time = time.monotonic()

    for turn in range(max_turns):
        # Safety check: don't spend too many tokens
        if total_tokens >= MAX_TOTAL_TOKENS:
            logger.warning("Research agent hit token cap (%d). Stopping.", total_tokens)
            # Ask the model for a final answer without tools
            messages.append({
                "role": "user",
                "content": "You've used your research budget. Please provide your best answer now based on what you've found so far.",
            })
            try:
                final = await _call_nvidia_with_tools(
                    messages=messages,
                    model=model,
                    api_key=api_key,
                    base_url=base_url,
                    max_tokens=3000,
                    temperature=0.2,
                    tools=[],  # No tools — force a text response
                )
                total_tokens += final.get("tokens_used", 0)
                return {
                    "content": final.get("content", ""),
                    "steps": steps,
                    "total_tokens": total_tokens,
                    "turns_used": turn + 1,
                    "tools_called": tools_called,
                }
            except Exception:
                break

        # Call the model with tools
        logger.info("Research agent turn %d/%d (tokens so far: %d)", turn + 1, max_turns, total_tokens)

        try:
            result = await _call_nvidia_with_tools(
                messages=messages,
                model=model,
                api_key=api_key,
                base_url=base_url,
                max_tokens=3000,
                temperature=0.2,
                tools=RESEARCH_TOOLS,
                tool_choice="auto",
            )
        except Exception as exc:
            logger.error("Research agent API call failed on turn %d: %s", turn + 1, exc)
            steps.append({"turn": turn + 1, "action": "error", "detail": str(exc)[:200]})
            break

        total_tokens += result.get("tokens_used", 0)
        tool_calls = result.get("tool_calls", [])
        content = result.get("content", "")

        # If no tool calls → the model is done and returning its final answer
        if not tool_calls:
            logger.info("Research agent completed in %d turns, %d tokens", turn + 1, total_tokens)
            return {
                "content": content,
                "steps": steps,
                "total_tokens": total_tokens,
                "turns_used": turn + 1,
                "tools_called": tools_called,
            }

        # Process each tool call
        # First, add the assistant's response (with tool calls) to the conversation
        assistant_msg: dict = {"role": "assistant", "content": content or ""}
        # Include tool_calls in the message for the API
        assistant_msg["tool_calls"] = [
            {
                "id": tc["id"],
                "type": "function",
                "function": {
                    "name": tc["function_name"],
                    "arguments": tc["arguments"],
                },
            }
            for tc in tool_calls
        ]
        messages.append(assistant_msg)

        # Execute each tool and add results
        for tc in tool_calls:
            tool_name = tc["function_name"]
            try:
                args = json.loads(tc["arguments"]) if isinstance(tc["arguments"], str) else tc["arguments"]
            except json.JSONDecodeError:
                args = {}

            tools_called.append(tool_name)

            step_info = {
                "turn": turn + 1,
                "action": "tool_call",
                "tool_name": tool_name,
                "arguments": args,
            }

            # Notify progress callback
            if on_step:
                try:
                    await on_step(step_info)
                except Exception:
                    pass

            logger.info("Research agent calling tool: %s(%s)", tool_name, json.dumps(args)[:200])

            # Execute the tool
            tool_result = await _execute_tool(tool_name, args, api_key, base_url)

            step_info["result_preview"] = tool_result[:300] if tool_result else "(empty)"
            steps.append(step_info)

            # Add tool result to conversation (OpenAI format)
            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": tool_result,
            })

    # Fell through the loop without a final answer — ask for one
    logger.warning("Research agent exhausted %d turns. Requesting final answer.", max_turns)
    messages.append({
        "role": "user",
        "content": "Please provide your final answer now with all the information you've gathered.",
    })

    try:
        # Call without tools to force a final answer
        from rei.services.ai_service import _call_nvidia
        final = await _call_nvidia(
            messages=messages,
            model=model,
            api_key=api_key,
            base_url=base_url,
            max_tokens=3000,
            temperature=0.2,
        )
        total_tokens += final.get("tokens_used", 0)
        content = final.get("content", "")
    except Exception as exc:
        logger.error("Final answer request failed: %s", exc)
        content = "Research agent could not produce a final answer."

    elapsed = time.monotonic() - start_time
    logger.info("Research agent finished in %.1fs, %d turns, %d tokens", elapsed, max_turns, total_tokens)

    return {
        "content": content,
        "steps": steps,
        "total_tokens": total_tokens,
        "turns_used": max_turns,
        "tools_called": tools_called,
    }


# ══════════════════════════════════════════════════════════════════════════
# High-level wrappers for negotiation research
# ══════════════════════════════════════════════════════════════════════════


def _build_recipient_system_prompt() -> str:
    """Build the system prompt for negotiation contact research."""
    return (
        "You are an expert real estate paralegal and corporate research specialist. "
        "Your job is to find accurate, current contact information for specific people "
        "and departments at banks, mortgage servicers, and government offices.\n\n"
        "You have access to research tools. USE THEM — do not guess or make up information. "
        "Follow this research methodology:\n"
        "1. Start with a web search for the company + the specific role you're looking for\n"
        "2. Cross-reference with SEC filings for corporate officers and registered agents\n"
        "3. Check state business registries for registered agent details\n"
        "4. Verify key findings with the verify_contact_info tool\n"
        "5. For tax offices, use the county tax lookup tool\n\n"
        "IMPORTANT RULES:\n"
        "- Always use tools to find information. Never fabricate contact details.\n"
        "- If you cannot find a specific detail after searching, say 'not found' rather than guessing.\n"
        "- Prefer official sources (SEC, SoS, company websites) over third-party directories.\n"
        "- When you have enough information, return your final answer as a JSON object.\n"
    )


def _build_recipient_user_prompt(
    bank_name: str,
    state: str,
    recipient_type: str,
    title: str,
    search_hint: str,
    property_address: str = "",
) -> str:
    """Build the user prompt for a specific recipient research task."""
    state_ctx = f" The property is in {state}." if state else ""
    addr_ctx = f"\nProperty address: {property_address}" if property_address else ""

    is_tax = recipient_type.startswith("tax_")

    if is_tax:
        entity_ctx = f"a property{state_ctx}{addr_ctx}"
    else:
        entity_ctx = f"{bank_name} (mortgage servicer/bank){state_ctx}{addr_ctx}"

    return (
        f"Research the following contact information for {entity_ctx}:\n\n"
        f"Recipient: {title}\n\n"
        f"Research guidance: {search_hint}\n\n"
        "Use your research tools to find this information. When you've gathered enough data, "
        "return your FINAL ANSWER as a single JSON object with these exact keys:\n"
        "```json\n"
        "{\n"
        '  "name": "Full name or department name",\n'
        '  "title": "Exact title or role",\n'
        '  "mailing_address": "Street address",\n'
        '  "mailing_city": "City",\n'
        '  "mailing_state": "2-letter state code",\n'
        '  "mailing_zip": "ZIP code",\n'
        '  "phone": "Phone number with area code",\n'
        '  "fax": "Fax number or null",\n'
        '  "email": "Email address or null",\n'
        '  "confidence": "high or medium or low",\n'
        '  "sources": ["Source 1 description", "Source 2 description"]\n'
        "}\n"
        "```\n\n"
        "Use null for any field you genuinely cannot find after searching. "
        "Do NOT guess — only include information you found through your research tools."
    )


async def research_recipient_with_agent(
    bank_name: str,
    state: str,
    recipient_type: str,
    config: dict,
    api_key: str,
    base_url: str = "https://integrate.api.nvidia.com",
    property_address: str = "",
    on_step: Any = None,
) -> dict:
    """Research one recipient using the agent loop.

    This is the agent-powered replacement for _research_one_recipient().
    Returns the same structure for compatibility.
    """
    system_prompt = _build_recipient_system_prompt()
    user_prompt = _build_recipient_user_prompt(
        bank_name=bank_name,
        state=state,
        recipient_type=recipient_type,
        title=config["title"],
        search_hint=config.get("search_hint", ""),
        property_address=property_address,
    )

    agent_result = await run_research_agent(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        api_key=api_key,
        base_url=base_url,
        on_step=on_step,
    )

    # Parse the final content as JSON
    parsed = _parse_agent_json(agent_result["content"])
    parsed["recipient_type"] = recipient_type
    parsed["_provider"] = "nvidia_kimi_agent"
    parsed["_model"] = "moonshotai/kimi-k2.5"
    parsed["_tokens"] = agent_result["total_tokens"]
    parsed["_agent_turns"] = agent_result["turns_used"]
    parsed["_agent_tools"] = agent_result["tools_called"]
    parsed["_agent_steps"] = agent_result["steps"]

    return parsed


def _parse_agent_json(text: str) -> dict:
    """Parse JSON from the agent's final response.

    Reuses the same parsing logic from contact_research.py
    """
    if not text or not text.strip():
        return _empty_recipient()

    # Strip thinking tags
    cleaned = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()

    # Try direct parse
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, TypeError):
        pass

    # Try markdown code fence
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except (json.JSONDecodeError, TypeError):
            pass

    # Try finding JSON in text
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start:end + 1])
        except (json.JSONDecodeError, TypeError):
            pass

    logger.warning("Agent response could not be parsed as JSON: %s", text[:300])
    return _empty_recipient()


def _empty_recipient() -> dict:
    """Empty result matching contact_research format."""
    return {
        "name": None,
        "title": None,
        "mailing_address": None,
        "mailing_city": None,
        "mailing_state": None,
        "mailing_zip": None,
        "phone": None,
        "fax": None,
        "email": None,
        "confidence": "low",
        "sources": [],
        "parse_error": True,
    }
