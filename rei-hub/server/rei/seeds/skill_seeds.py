"""System skill seeds for the AI Admin Assistant.

Pre-built automation templates available to all users. System skills
are read-only; users can clone them to create custom variants.

The 7 core skills:
1. Follow-Up Scanner — Find contacts needing follow-up
2. Pipeline Health Check — Analyze deal pipeline health
3. Lead Scorer — Score and prioritize leads
4. Daily Summary — Generate daily business summary
5. Campaign Launcher — Launch SMS campaign to tagged contacts
6. Buyer Match — Match buyers to available deals
7. Market Scanner — Scrape listings from Zillow/Realtor/Redfin into Lead Center
"""

from __future__ import annotations

import json
import logging

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.admin_assistant import AdminSkill

logger = logging.getLogger(__name__)

# ── System skill definitions ──────────────────────────────────────────────

SYSTEM_SKILLS = [
    {
        "name": "Follow-Up Scanner",
        "description": "Scan contacts that haven't been contacted in 7+ days and create follow-up tasks",
        "category": "crm",
        "icon": "UserCheck",
        "action_steps": [
            {"tool": "get_contacts", "params": {"limit": 50}},
            {"tool": "get_stalled_deals", "params": {"days_threshold": 7}},
        ],
    },
    {
        "name": "Pipeline Health Check",
        "description": "Analyze your deal pipeline health — deal counts by stage, stalled deals, and conversion rates",
        "category": "pipeline",
        "icon": "Activity",
        "action_steps": [
            {"tool": "get_pipeline_summary", "params": {}},
            {"tool": "get_stalled_deals", "params": {"days_threshold": 14}},
            {"tool": "get_lead_conversion_rates", "params": {"period": "30d"}},
        ],
    },
    {
        "name": "Lead Scorer",
        "description": "Score and prioritize your leads based on engagement, deal value, and recency",
        "category": "crm",
        "icon": "Target",
        "action_steps": [
            {"tool": "get_contacts", "params": {"role": "seller", "limit": 50}},
            {"tool": "get_dashboard_stats", "params": {"period": "30d"}},
        ],
    },
    {
        "name": "Daily Summary",
        "description": "Generate a daily business summary — calls, texts, new leads, deals, and follow-ups due",
        "category": "analytics",
        "icon": "BarChart3",
        "action_steps": [
            {"tool": "get_dashboard_stats", "params": {"period": "7d"}},
            {"tool": "get_pipeline_summary", "params": {}},
            {"tool": "get_usage_stats", "params": {}},
        ],
    },
    {
        "name": "Campaign Launcher",
        "description": "Launch an SMS campaign to a tagged group of contacts",
        "category": "phone",
        "icon": "Megaphone",
        "action_steps": [
            {"tool": "get_contacts", "params": {"tag": "hot_leads", "limit": 50}},
            {"tool": "send_bulk_sms", "params": {"message": "Your message here", "contact_list": "{{prev_result}}"}},
        ],
    },
    {
        "name": "Buyer Match",
        "description": "Match buyers in your contact list to available deals based on preferences",
        "category": "crm",
        "icon": "Handshake",
        "action_steps": [
            {"tool": "get_contacts", "params": {"role": "buyer", "limit": 50}},
            {"tool": "get_deals", "params": {"stage": "analysis"}},
        ],
    },
    {
        "name": "Market Scanner",
        "description": (
            "Scrape new property listings from Zillow, Realtor.com, or Redfin "
            "and import them into a Lead List in Lead Center. Great for daily "
            "market scanning — schedule this to run every morning to catch new "
            "listings in your target markets."
        ),
        "category": "property",
        "icon": "Radar",
        "action_steps": [
            {
                "tool": "market_scan",
                "params": {
                    "location": "Huntington, NY",
                    "source": "zillow",
                    "max_price": 500000,
                    "min_beds": 3,
                    "limit": 50,
                    "skip_duplicates": True,
                },
            },
        ],
    },
]


async def seed_system_skills(db: AsyncSession) -> int:
    """Create system skills if they don't already exist.

    Checks by name + is_system=True to avoid duplicates.

    Args:
        db: AsyncSession for database access

    Returns:
        Number of skills created
    """
    created = 0

    for skill_data in SYSTEM_SKILLS:
        # Check if this skill already exists (by name, system-level)
        result = await db.execute(
            select(AdminSkill).where(
                and_(
                    AdminSkill.name == skill_data["name"],
                    AdminSkill.user_id.is_(None),
                    AdminSkill.is_system.is_(True),
                )
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            logger.debug(f"System skill '{skill_data['name']}' already exists")
            continue

        # Serialize action_steps as JSON
        action_steps_json = json.dumps(skill_data["action_steps"])

        skill = AdminSkill(
            user_id=None,  # System-level — available to ALL users
            is_system=True,  # Read-only, cannot be edited or deleted
            name=skill_data["name"],
            description=skill_data["description"],
            category=skill_data["category"],
            icon=skill_data["icon"],
            action_steps=action_steps_json,
            enabled=True,
        )

        db.add(skill)
        created += 1

    if created:
        await db.commit()
        logger.info(f"Seeded {created} system skills.")
    else:
        logger.info("System skills already exist — skipping seed.")

    return created
