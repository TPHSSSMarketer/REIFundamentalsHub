"""AI Admin Assistant — Tool Definitions.

Defines all tools (functions) the AI assistant can call to interact with the
REI Hub platform. Each tool has a name, description, risk_level, domain,
and JSON Schema for its parameters.

Risk levels:
- LOW: Read-only queries, summaries, reports (auto-approved by default)
- MEDIUM: Send messages, update records, create tasks (ask user by default)
- HIGH: Make calls, spend credits, delete records (always ask by default)
"""

from __future__ import annotations


# ── CRM Domain Tools ─────────────────────────────────────────────────

CRM_TOOLS = [
    {
        "name": "get_contacts",
        "description": "Get a list of contacts from CRM, optionally filtered by tag, role, or search query",
        "risk_level": "LOW",
        "domain": "crm",
        "parameters": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Search by name, phone, or email"},
                "tag": {"type": "string", "description": "Filter by contact tag"},
                "role": {"type": "string", "description": "Filter by role (seller, buyer, agent, etc.)"},
                "limit": {"type": "integer", "description": "Max results to return", "default": 25},
            },
        },
    },
    {
        "name": "get_contact_details",
        "description": "Get full details for a specific contact including interaction history",
        "risk_level": "LOW",
        "domain": "crm",
        "parameters": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string", "description": "The contact's ID"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "create_contact",
        "description": "Create a new contact in the CRM",
        "risk_level": "MEDIUM",
        "domain": "crm",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Contact's full name"},
                "phone": {"type": "string", "description": "Phone number"},
                "email": {"type": "string", "description": "Email address"},
                "role": {"type": "string", "enum": ["seller", "buyer", "agent", "broker", "lender", "partner", "other"]},
                "tags": {"type": "array", "items": {"type": "string"}, "description": "Tags to apply"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_contact",
        "description": "Update an existing contact's information or tags",
        "risk_level": "MEDIUM",
        "domain": "crm",
        "parameters": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "name": {"type": "string"},
                "phone": {"type": "string"},
                "email": {"type": "string"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "notes": {"type": "string", "description": "Add a note to the contact"},
            },
            "required": ["contact_id"],
        },
    },
    {
        "name": "get_pipeline_summary",
        "description": "Get a summary of the deals pipeline: deal counts and total value by stage",
        "risk_level": "LOW",
        "domain": "crm",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_deals",
        "description": "Get deals from the pipeline, optionally filtered by stage",
        "risk_level": "LOW",
        "domain": "crm",
        "parameters": {
            "type": "object",
            "properties": {
                "stage": {"type": "string", "description": "Filter by stage (e.g., 'lead', 'contacted', 'analysis', 'offer_made', 'under_contract')"},
                "limit": {"type": "integer", "default": 25},
            },
        },
    },
    {
        "name": "get_stalled_deals",
        "description": "Find deals that have been stuck in the same stage for more than N days",
        "risk_level": "LOW",
        "domain": "crm",
        "parameters": {
            "type": "object",
            "properties": {
                "days_threshold": {"type": "integer", "description": "Days without movement", "default": 7},
                "stage": {"type": "string", "description": "Optionally filter to a specific stage"},
            },
        },
    },
    {
        "name": "update_deal_stage",
        "description": "Move a deal to a different pipeline stage",
        "risk_level": "MEDIUM",
        "domain": "crm",
        "parameters": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string"},
                "new_stage": {"type": "string"},
                "notes": {"type": "string", "description": "Reason for stage change"},
            },
            "required": ["deal_id", "new_stage"],
        },
    },
    {
        "name": "get_portfolio_summary",
        "description": "Get summary of owned portfolio properties with values and rental income",
        "risk_level": "LOW",
        "domain": "crm",
        "parameters": {"type": "object", "properties": {}},
    },
]


# ── Phone & SMS Domain Tools ─────────────────────────────────────────

PHONE_TOOLS = [
    {
        "name": "send_sms",
        "description": "Send an SMS text message to a specific contact",
        "risk_level": "MEDIUM",
        "domain": "phone",
        "parameters": {
            "type": "object",
            "properties": {
                "contact_phone": {"type": "string", "description": "Recipient phone number"},
                "message": {"type": "string", "description": "SMS message text (max 160 chars recommended)"},
                "contact_name": {"type": "string", "description": "Recipient name (for logging)"},
            },
            "required": ["contact_phone", "message"],
        },
    },
    {
        "name": "send_bulk_sms",
        "description": "Send the same SMS to multiple contacts",
        "risk_level": "HIGH",
        "domain": "phone",
        "parameters": {
            "type": "object",
            "properties": {
                "contact_phones": {"type": "array", "items": {"type": "string"}, "description": "List of phone numbers"},
                "message": {"type": "string", "description": "SMS message template"},
            },
            "required": ["contact_phones", "message"],
        },
    },
    {
        "name": "schedule_callback",
        "description": "Schedule an AI callback to a contact at a specific time",
        "risk_level": "MEDIUM",
        "domain": "phone",
        "parameters": {
            "type": "object",
            "properties": {
                "contact_phone": {"type": "string"},
                "contact_name": {"type": "string"},
                "scheduled_at": {"type": "string", "format": "datetime", "description": "ISO datetime for callback"},
                "persona_id": {"type": "string", "description": "Which AI persona to use for the call"},
                "notes": {"type": "string", "description": "Context for the AI during the callback"},
            },
            "required": ["contact_phone", "scheduled_at"],
        },
    },
    {
        "name": "get_call_history",
        "description": "Get recent call logs with outcomes and summaries",
        "risk_level": "LOW",
        "domain": "phone",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "default": 20},
                "contact_phone": {"type": "string", "description": "Filter to a specific contact"},
            },
        },
    },
    {
        "name": "get_usage_stats",
        "description": "Get phone system usage stats: minutes used, SMS count, credits balance",
        "risk_level": "LOW",
        "domain": "phone",
        "parameters": {"type": "object", "properties": {}},
    },
]


# ── Analytics Domain Tools ────────────────────────────────────────────

ANALYTICS_TOOLS = [
    {
        "name": "get_dashboard_stats",
        "description": "Get key business metrics: total leads, active deals, portfolio value, call volume",
        "risk_level": "LOW",
        "domain": "analytics",
        "parameters": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "enum": ["7d", "30d", "90d", "ytd"], "default": "30d"},
            },
        },
    },
    {
        "name": "get_pipeline_report",
        "description": "Generate a detailed pipeline analysis report with conversion rates between stages",
        "risk_level": "LOW",
        "domain": "analytics",
        "parameters": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "enum": ["7d", "30d", "90d", "ytd"], "default": "30d"},
            },
        },
    },
    {
        "name": "get_campaign_performance",
        "description": "Get performance metrics for call and SMS campaigns",
        "risk_level": "LOW",
        "domain": "analytics",
        "parameters": {
            "type": "object",
            "properties": {
                "campaign_type": {"type": "string", "enum": ["call", "sms", "all"], "default": "all"},
            },
        },
    },
    {
        "name": "get_lead_conversion_rates",
        "description": "Analyze lead-to-deal conversion rates and identify bottlenecks",
        "risk_level": "LOW",
        "domain": "analytics",
        "parameters": {
            "type": "object",
            "properties": {
                "period": {"type": "string", "enum": ["7d", "30d", "90d", "ytd"], "default": "30d"},
            },
        },
    },
]


# ── Calendar & Task Domain Tools ─────────────────────────────────────

CALENDAR_TOOLS = [
    {
        "name": "create_follow_up_task",
        "description": "Create a follow-up task/reminder for a contact",
        "risk_level": "LOW",
        "domain": "calendar",
        "parameters": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "contact_name": {"type": "string"},
                "due_date": {"type": "string", "format": "date", "description": "Due date (YYYY-MM-DD)"},
                "description": {"type": "string", "description": "What to follow up about"},
                "priority": {"type": "string", "enum": ["low", "medium", "high"], "default": "medium"},
            },
            "required": ["description", "due_date"],
        },
    },
    {
        "name": "get_upcoming_events",
        "description": "Get upcoming calendar events and tasks due soon",
        "risk_level": "LOW",
        "domain": "calendar",
        "parameters": {
            "type": "object",
            "properties": {
                "days_ahead": {"type": "integer", "description": "How many days to look ahead", "default": 7},
            },
        },
    },
    {
        "name": "create_reminder",
        "description": "Create a general reminder (not tied to a contact)",
        "risk_level": "LOW",
        "domain": "calendar",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "due_date": {"type": "string", "format": "date"},
                "notes": {"type": "string"},
            },
            "required": ["title", "due_date"],
        },
    },
]


# ── Email Marketing Domain Tools ─────────────────────────────────────

EMAIL_TOOLS = [
    {
        "name": "send_email_campaign",
        "description": "Send an email campaign to a subscriber list",
        "risk_level": "HIGH",
        "domain": "email",
        "parameters": {
            "type": "object",
            "properties": {
                "list_id": {"type": "string", "description": "Subscriber list ID"},
                "subject": {"type": "string"},
                "body_html": {"type": "string", "description": "Email body (HTML)"},
            },
            "required": ["list_id", "subject", "body_html"],
        },
    },
    {
        "name": "get_email_stats",
        "description": "Get email campaign performance: open rates, click rates, unsubscribes",
        "risk_level": "LOW",
        "domain": "email",
        "parameters": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string", "description": "Specific campaign ID, or omit for all"},
            },
        },
    },
    {
        "name": "get_subscriber_lists",
        "description": "Get all email subscriber lists with subscriber counts",
        "risk_level": "LOW",
        "domain": "email",
        "parameters": {"type": "object", "properties": {}},
    },
]


# ── Aggregate: All tools in one list ──────────────────────────────────

ALL_TOOLS = CRM_TOOLS + PHONE_TOOLS + ANALYTICS_TOOLS + CALENDAR_TOOLS + EMAIL_TOOLS

# Quick lookup by name
TOOLS_BY_NAME: dict[str, dict] = {tool["name"]: tool for tool in ALL_TOOLS}

# Group by domain
TOOLS_BY_DOMAIN: dict[str, list[dict]] = {}
for _tool in ALL_TOOLS:
    domain = _tool["domain"]
    if domain not in TOOLS_BY_DOMAIN:
        TOOLS_BY_DOMAIN[domain] = []
    TOOLS_BY_DOMAIN[domain].append(_tool)


def get_tools_for_ai() -> list[dict]:
    """Return tool definitions formatted for AI function calling.

    Returns a list of tool specs compatible with both Anthropic and
    OpenAI-compatible APIs (NVIDIA NIM / MiniMax).
    """
    return [
        {
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["parameters"],
            },
        }
        for tool in ALL_TOOLS
    ]


def get_risk_level(tool_name: str) -> str:
    """Get the risk level for a tool by name."""
    tool = TOOLS_BY_NAME.get(tool_name)
    return tool["risk_level"] if tool else "HIGH"  # Default to HIGH if unknown
