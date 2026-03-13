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


# ── Property Research Tools ──────────────────────────────────────────

PROPERTY_TOOLS = [
    {
        "name": "lookup_property",
        "description": (
            "Look up detailed property data by address. Returns tax assessment, sale history, "
            "liens, property details, and comps from the ATTOM database. You can provide a full "
            "address or just a street + zip code. If city/state are missing, the system will "
            "resolve them from the zip code automatically."
        ),
        "risk_level": "LOW",
        "domain": "property",
        "parameters": {
            "type": "object",
            "properties": {
                "address": {"type": "string", "description": "Street address (e.g., '214 Little Plains Road')"},
                "city": {"type": "string", "description": "City name (optional if zip_code provided)"},
                "state": {"type": "string", "description": "2-letter state code (optional if zip_code provided)"},
                "zip_code": {"type": "string", "description": "ZIP code — helps resolve city/state automatically"},
            },
            "required": ["address"],
        },
    },
    {
        "name": "get_market_data",
        "description": "Get real estate market data for a city/area: median home prices, rents, days on market, inventory levels, and price trends.",
        "risk_level": "LOW",
        "domain": "property",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "City name"},
                "state": {"type": "string", "description": "2-letter state code"},
            },
            "required": ["city", "state"],
        },
    },
    {
        "name": "search_properties",
        "description": (
            "Search for properties matching criteria in a given area. Uses Playwright "
            "browser scraping to find active listings from Zillow, Realtor.com, Redfin, "
            "ForSaleByOwner.com (FSBO), or Craigslist. Returns addresses, prices, beds, "
            "baths, sqft, listing URLs, and contact info (owner/agent name, phone, email) "
            "when available. FSBO and Craigslist sources are best for finding owner contact "
            "details. Default source is Zillow."
        ),
        "risk_level": "LOW",
        "domain": "property",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City and state (e.g. 'Huntington, NY'), county, or ZIP code to search in"},
                "source": {"type": "string", "description": "Listing source: zillow, realtor, redfin, fsbo, or craigslist", "default": "zillow"},
                "max_price": {"type": "integer", "description": "Maximum price filter"},
                "min_beds": {"type": "integer", "description": "Minimum bedrooms"},
                "min_baths": {"type": "integer", "description": "Minimum bathrooms"},
                "property_type": {"type": "string", "description": "Property type: single_family, multi_family, condo, townhouse, land"},
                "limit": {"type": "integer", "description": "Max results to return", "default": 20},
            },
            "required": ["location"],
        },
    },
    {
        "name": "market_scan",
        "description": (
            "Scan a market for new listings and import them into a Lead List in Lead Center. "
            "Scrapes Zillow, Realtor.com, Redfin, ForSaleByOwner.com (FSBO), or Craigslist, "
            "creates or updates a named Lead List, and adds each listing as a new lead. "
            "FSBO and Craigslist sources also capture owner/agent name, phone, and email. "
            "Perfect for daily market scanning automations. "
            "Returns the number of new leads imported and the list name. "
            "Use this when the user wants to 'scan a market', 'import listings into leads', "
            "'find new deals and add to lead center', or 'run a daily market scan'."
        ),
        "risk_level": "MEDIUM",
        "domain": "property",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City and state (e.g. 'Huntington, NY'), county, or ZIP code"},
                "source": {"type": "string", "description": "Listing source: zillow, realtor, redfin, fsbo, or craigslist", "default": "zillow"},
                "list_name": {"type": "string", "description": "Name for the Lead List (e.g. 'Huntington NY - March 2026'). Auto-generated if not provided."},
                "max_price": {"type": "integer", "description": "Maximum price filter"},
                "min_beds": {"type": "integer", "description": "Minimum bedrooms"},
                "min_baths": {"type": "integer", "description": "Minimum bathrooms"},
                "property_type": {"type": "string", "description": "Property type: single_family, multi_family, condo, townhouse, land"},
                "limit": {"type": "integer", "description": "Max listings to import", "default": 50},
                "skip_duplicates": {"type": "boolean", "description": "Skip listings already in the list (by address match)", "default": True},
            },
            "required": ["location"],
        },
    },
]

# ── Deal Management Tools ───────────────────────────────────────────

DEAL_TOOLS = [
    {
        "name": "create_deal",
        "description": (
            "Create a new deal in the pipeline. Use this when the user wants to add a new "
            "property/deal. Requires a street address PLUS at least a zip code OR both city "
            "and state. The system will auto-resolve city/state from zip using the zip code "
            "database. Set stage to 'lead' by default. "
            "The user may give short descriptions like '214 Little Plains Road, 11743' — "
            "parse the address and zip from that."
        ),
        "risk_level": "LOW",
        "domain": "deals",
        "parameters": {
            "type": "object",
            "properties": {
                "address": {"type": "string", "description": "Street address (required)"},
                "city": {"type": "string", "description": "City (required if no zip provided)"},
                "state": {"type": "string", "description": "2-letter state code (required if no zip provided)"},
                "zip": {"type": "string", "description": "ZIP code (required if no city+state provided)"},
                "stage": {"type": "string", "description": "Pipeline stage: lead, contacted, analysis, offer_made, under_contract, closed, passed", "default": "lead"},
                "deal_type": {"type": "string", "description": "Deal type: wholesale, flip, rental, subject_to, owner_finance, other"},
                "contact_name": {"type": "string", "description": "Seller/contact name"},
                "asking_price": {"type": "number", "description": "Asking/list price"},
                "arv": {"type": "number", "description": "After Repair Value"},
                "notes": {"type": "string", "description": "Any additional notes"},
            },
            "required": ["address"],
        },
    },
    {
        "name": "add_deal_note",
        "description": "Add a text note to a specific deal in the pipeline. Use this when the user wants to record information about a property or deal.",
        "risk_level": "LOW",
        "domain": "deals",
        "parameters": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "The deal ID to add the note to"},
                "note": {"type": "string", "description": "The note text to add"},
                "category": {"type": "string", "description": "Note category: general, inspection, repair, financial, legal, other", "default": "general"},
            },
            "required": ["deal_id", "note"],
        },
    },
    {
        "name": "upload_deal_photo",
        "description": "Upload a photo to a deal. Use when the user sends a photo via Telegram or chat and wants it attached to a deal.",
        "risk_level": "MEDIUM",
        "domain": "deals",
        "parameters": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "The deal ID to attach the photo to"},
                "photo_category": {"type": "string", "description": "Photo category: front, back, kitchen, living_room, bedroom_1, bathroom_1, garage, yard, miscellaneous", "default": "miscellaneous"},
                "notes": {"type": "string", "description": "Description or notes about the photo"},
                "photo_data": {"type": "string", "description": "Base64-encoded image data"},
            },
            "required": ["deal_id", "photo_data"],
        },
    },
    {
        "name": "get_deal_details",
        "description": "Get full details for a specific deal including property info, financials, photos, and notes.",
        "risk_level": "LOW",
        "domain": "deals",
        "parameters": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "The deal ID"},
            },
            "required": ["deal_id"],
        },
    },
    {
        "name": "search_deals",
        "description": "Search deals by property address, contact name, or any text. More flexible than get_deals which only filters by stage.",
        "risk_level": "LOW",
        "domain": "deals",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search text (address, contact name, notes)"},
                "limit": {"type": "integer", "default": 10},
            },
            "required": ["query"],
        },
    },
    {
        "name": "delete_deal",
        "description": "Delete a deal from the pipeline. Use when the user wants to remove a duplicate or unwanted deal.",
        "risk_level": "MEDIUM",
        "domain": "deals",
        "parameters": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "The deal ID to delete"},
            },
            "required": ["deal_id"],
        },
    },
    {
        "name": "populate_deal_attom",
        "description": "Pull ATTOM property data and populate all fields on an existing deal. Use when a deal exists but doesn't have ATTOM data filled in yet, or when the user wants to refresh/update property data on a deal.",
        "risk_level": "LOW",
        "domain": "deals",
        "parameters": {
            "type": "object",
            "properties": {
                "deal_id": {"type": "string", "description": "The deal ID to populate with ATTOM data"},
            },
            "required": ["deal_id"],
        },
    },
]

# ── ContentHub Tools (Social Media) ─────────────────────────────────

CONTENT_TOOLS = [
    {
        "name": "create_social_post",
        "description": "Generate a social media post about a property, deal, market insight, or topic. Creates platform-specific content for Facebook, Instagram, LinkedIn, Twitter, and TikTok.",
        "risk_level": "MEDIUM",
        "domain": "content",
        "parameters": {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "What the post should be about (e.g., 'new flip at 123 Main St', 'market update for Suffolk County')"},
                "deal_id": {"type": "string", "description": "Optional deal ID to pull property details from"},
                "tone": {"type": "string", "description": "Post tone: professional, casual, exciting, educational", "default": "professional"},
                "platforms": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Target platforms: facebook, instagram, linkedin, twitter, tiktok",
                    "default": ["facebook", "instagram", "linkedin"],
                },
            },
            "required": ["topic"],
        },
    },
    {
        "name": "list_content",
        "description": "List existing ContentHub entries. Use to see what social media content has been created.",
        "risk_level": "LOW",
        "domain": "content",
        "parameters": {
            "type": "object",
            "properties": {
                "platform": {"type": "string", "description": "Filter by platform (facebook, instagram, etc.)"},
                "limit": {"type": "integer", "default": 10},
            },
        },
    },
]

# ── Email Tools (expanded) ──────────────────────────────────────────

EMAIL_COMPOSE_TOOLS = [
    {
        "name": "draft_email",
        "description": "Draft and send a personalized email to a contact. The email is humanized to avoid sounding like AI. Use for follow-ups, offers, updates, etc.",
        "risk_level": "MEDIUM",
        "domain": "email_compose",
        "parameters": {
            "type": "object",
            "properties": {
                "to_email": {"type": "string", "description": "Recipient email address"},
                "to_name": {"type": "string", "description": "Recipient name"},
                "subject": {"type": "string", "description": "Email subject line"},
                "body": {"type": "string", "description": "Email body content (will be humanized before sending)"},
                "contact_id": {"type": "string", "description": "Optional CRM contact ID to link the email to"},
            },
            "required": ["to_email", "to_name", "subject", "body"],
        },
    },
    {
        "name": "draft_offer_email",
        "description": "Draft an offer email for a property. Generates a professional offer letter with price, terms, and closing timeline.",
        "risk_level": "MEDIUM",
        "domain": "email_compose",
        "parameters": {
            "type": "object",
            "properties": {
                "to_email": {"type": "string", "description": "Seller or agent email"},
                "to_name": {"type": "string", "description": "Seller or agent name"},
                "property_address": {"type": "string", "description": "Property address"},
                "offer_price": {"type": "number", "description": "Offer amount in dollars"},
                "closing_days": {"type": "integer", "description": "Days to close", "default": 30},
                "contingencies": {"type": "string", "description": "Any contingencies or special terms"},
            },
            "required": ["to_email", "to_name", "property_address", "offer_price"],
        },
    },
]

# ── Calendar & Showing Tools (expanded) ─────────────────────────────

SHOWING_TOOLS = [
    {
        "name": "schedule_showing",
        "description": "Schedule a property showing appointment. Creates a calendar event and optionally texts the seller/agent to confirm.",
        "risk_level": "MEDIUM",
        "domain": "showing",
        "parameters": {
            "type": "object",
            "properties": {
                "property_address": {"type": "string", "description": "Property address for the showing"},
                "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
                "time": {"type": "string", "description": "Time in HH:MM format (24hr)"},
                "duration_minutes": {"type": "integer", "description": "Showing duration", "default": 30},
                "contact_id": {"type": "string", "description": "Contact ID of the seller/agent"},
                "deal_id": {"type": "string", "description": "Optional deal ID to link to"},
                "notify_contact": {"type": "boolean", "description": "Send SMS to the contact to confirm", "default": False},
                "notes": {"type": "string", "description": "Notes about the showing"},
            },
            "required": ["property_address", "date", "time"],
        },
    },
    {
        "name": "get_schedule",
        "description": "Get upcoming calendar events and tasks for a date range. Shows showings, closings, follow-ups, and reminders.",
        "risk_level": "LOW",
        "domain": "showing",
        "parameters": {
            "type": "object",
            "properties": {
                "days_ahead": {"type": "integer", "description": "Number of days to look ahead", "default": 7},
                "event_type": {"type": "string", "description": "Filter by type: appointment, closing, follow_up, callback, reminder, task"},
            },
        },
    },
]


# ── Aggregate: All tools in one list ──────────────────────────────────

ALL_TOOLS = (
    CRM_TOOLS + PHONE_TOOLS + ANALYTICS_TOOLS + CALENDAR_TOOLS + EMAIL_TOOLS
    + PROPERTY_TOOLS + DEAL_TOOLS + CONTENT_TOOLS + EMAIL_COMPOSE_TOOLS + SHOWING_TOOLS
)

# Quick lookup by name
TOOLS_BY_NAME: dict[str, dict] = {tool["name"]: tool for tool in ALL_TOOLS}

# Aliases for common AI name variations.
# The AI inverts names, adds prefixes, or uses synonyms.
_TOOL_ALIASES: dict[str, str] = {
    # ── lookup_property aliases ──
    "property_lookup": "lookup_property",
    "attom_data_lookup": "lookup_property",
    "attom_lookup": "lookup_property",
    "attom_property_lookup": "lookup_property",
    "property_data_lookup": "lookup_property",
    "property_data": "lookup_property",
    "get_property_data": "lookup_property",
    "get_property": "lookup_property",
    "property_search": "lookup_property",
    "search_property": "lookup_property",
    "fetch_property": "lookup_property",
    "pull_property_data": "lookup_property",
    "pull_property": "lookup_property",
    "run_property_lookup": "lookup_property",
    # ── create_deal aliases ──
    "deal_create": "create_deal",
    "add_deal": "create_deal",
    "new_deal": "create_deal",
    # ── Other common inversions ──
    "contact_create": "create_contact",
    "add_contact": "create_contact",
    "contact_get": "get_contacts",
    "deal_search": "search_deals",
    "deal_update": "update_deal",
    "sms_send": "send_sms",
    "market_data": "get_market_data",
    "market_lookup": "get_market_data",
    "pipeline_summary": "get_pipeline_summary",
    "get_pipeline": "get_pipeline_summary",
    "content_generate": "generate_content",
    "content_list": "list_content",
    "remove_deal": "delete_deal",
    "refresh_deal_attom": "populate_deal_attom",
    "update_deal_attom": "populate_deal_attom",
    "fill_deal_attom": "populate_deal_attom",
    # ── market_scan aliases ──
    "scan_market": "market_scan",
    "scan_listings": "market_scan",
    "import_listings": "market_scan",
    "scrape_market": "market_scan",
    "daily_scan": "market_scan",
    "find_listings": "market_scan",
    # ── search_properties aliases ──
    "search_listings": "search_properties",
    "find_properties": "search_properties",
    "scrape_zillow": "search_properties",
    "zillow_search": "search_properties",
}


def resolve_tool_name(name: str) -> str:
    """Resolve a tool name, checking aliases and fuzzy matching.

    Strategy:
    1. Exact match in TOOLS_BY_NAME
    2. Static alias lookup
    3. Fuzzy: find tool whose name words overlap the most with the given name
    """
    if name in TOOLS_BY_NAME:
        return name

    # Static alias
    canonical = _TOOL_ALIASES.get(name)
    if canonical and canonical in TOOLS_BY_NAME:
        import logging
        logging.getLogger(__name__).info("Tool alias resolved: %s → %s", name, canonical)
        return canonical

    # Fuzzy word-overlap: split both names into word sets and find best match.
    # Requires at least 1 overlap AND excludes generic verbs (get/set/run/do)
    # to avoid false matches like "get_status" → "get_contacts".
    import logging
    _log = logging.getLogger(__name__)
    _GENERIC_VERBS = {"get", "set", "run", "do", "make", "list", "check", "the", "a"}
    input_words = set(name.lower().split("_")) - _GENERIC_VERBS
    if not input_words:
        return name

    best_match = None
    best_score = 0
    for tool_name in TOOLS_BY_NAME:
        tool_words = set(tool_name.lower().split("_")) - _GENERIC_VERBS
        overlap = len(input_words & tool_words)
        if overlap > best_score:
            best_score = overlap
            best_match = tool_name

    if best_match and best_score >= 1:
        _log.info("Fuzzy tool name resolved: %s → %s (overlap=%d)", name, best_match, best_score)
        return best_match

    return name  # Return original (will fail lookup later with a warning)

# Group by domain
TOOLS_BY_DOMAIN: dict[str, list[dict]] = {}
for _tool in ALL_TOOLS:
    domain = _tool["domain"]
    if domain not in TOOLS_BY_DOMAIN:
        TOOLS_BY_DOMAIN[domain] = []
    TOOLS_BY_DOMAIN[domain].append(_tool)


def get_tools_for_native_calling(domains: list[str] | None = None) -> list[dict]:
    """Return tool definitions in Anthropic's native tool use format.

    This is the preferred way to provide tools — the model receives real
    tool definitions and generates structured tool_use blocks instead of
    text markers.

    Args:
        domains: If provided, only include tools from these domains.

    Returns: List of dicts in Anthropic's tools format:
        [{"name": "...", "description": "...", "input_schema": {...}}]
    """
    source = ALL_TOOLS if not domains else get_tools_for_domains(domains)
    return [
        {
            "name": tool["name"],
            "description": tool["description"],
            "input_schema": tool["parameters"],
        }
        for tool in source
    ]


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


# ══════════════════════════════════════════════════════════════════════════
# INTENT CLASSIFICATION & DOMAIN ROUTING
# ══════════════════════════════════════════════════════════════════════════

DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "crm": [
        "contact", "contacts", "lead", "leads", "pipeline",
        "portfolio", "stage", "stalled", "buyer",
        "seller", "investor", "agent", "broker", "crm", "relationship",
    ],
    "phone": [
        "sms", "text", "message", "call", "callback", "phone", "voicemail",
        "bulk", "twilio", "number", "dial",
    ],
    "analytics": [
        "stats", "statistics", "dashboard", "report", "conversion", "campaign",
        "performance", "metric", "metrics", "growth", "revenue", "summary",
        "overview", "how many", "how much", "total", "count",
    ],
    "calendar": [
        "task", "tasks", "follow-up", "follow up", "reminder", "due", "upcoming",
        "calendar", "event",
    ],
    "email": [
        "campaign", "subscriber", "newsletter", "open rate",
        "click rate", "unsubscribe", "drip",
    ],
    "property": [
        "property", "properties", "lookup", "look up", "address", "house",
        "home", "attom", "assessment", "tax", "comps", "comparable",
        "market data", "median", "zillow", "listing", "listings", "mls",
        "search properties", "find properties", "pull list", "pull me",
    ],
    "deals": [
        "deal", "deals", "note", "notes", "photo", "photos", "picture",
        "file", "files", "upload", "attach", "document",
        "create deal", "new deal", "add deal", "wholesale", "flip", "rental",
        "arv", "asking price", "under contract", "offer",
    ],
    "content": [
        "social media", "social", "post", "facebook", "instagram", "linkedin",
        "twitter", "tiktok", "content", "content hub", "blog",
    ],
    "email_compose": [
        "email", "emails", "draft", "send email", "write email", "offer email",
        "offer letter", "follow up email",
    ],
    "showing": [
        "showing", "showings", "appointment", "meeting", "schedule",
        "walk through", "walkthrough", "tour", "visit", "open house",
        "closing", "my schedule", "what's on my calendar",
    ],
}


def classify_user_intent(message: str) -> list[str]:
    """Classify which tool domains are relevant to the user's message.

    Returns a list of domain names (e.g., ["crm", "phone"]).
    Always returns at least one domain.
    """
    message_lower = message.lower()
    matched = []

    for domain, keywords in DOMAIN_KEYWORDS.items():
        if any(kw in message_lower for kw in keywords):
            matched.append(domain)

    # Property and deals are closely related — load both if either matches
    if "deals" in matched and "property" not in matched:
        matched.append("property")
    if "property" in matched and "deals" not in matched:
        matched.append("deals")

    # CRM is often needed alongside deals (contact lookup, pipeline)
    if "deals" in matched and "crm" not in matched:
        matched.append("crm")

    # Fallback: general queries get analytics + crm
    if not matched:
        matched = ["crm", "analytics"]

    return matched


def get_tools_for_domains(domains: list[str]) -> list[dict]:
    """Return only tools whose domain is in the given list."""
    return [tool for tool in ALL_TOOLS if tool["domain"] in domains]
