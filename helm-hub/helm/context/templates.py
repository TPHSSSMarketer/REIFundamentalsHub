"""Context file templates and tenant provisioning.

When a new tenant is provisioned (SaaS signup or personal setup), the system
creates a set of living context files in their workspace.  These files are
the "brain" of the AI assistant — the user profile, rules, goals, contacts,
and memory log.

Domain-specific templates (e.g. real estate) are registered by plugins.
The general-purpose templates below work for any user.

For SaaS: each tenant gets their own set, pre-filled from onboarding answers.
For personal use: you fill these out once, and the AI maintains them.
"""

from __future__ import annotations

import logging
from pathlib import Path

from helm.integrations.workspace import VirtualWorkspace

logger = logging.getLogger(__name__)


# ── Template Definitions ─────────────────────────────────────────────────────

TEMPLATES: dict[str, str] = {}

TEMPLATES["USER.md"] = """\
# Investor Profile

## About Me
- Name: [Your Name]
- Role: Real estate investor
- Experience Level: [Beginner / Intermediate / Advanced]
- Entity: [LLC name if applicable]
- Location: [Your city/state]
- Time Zone: [e.g., America/New_York]

## Investment Goals
- 12-Month Goal: [e.g., Acquire 4 rental properties generating $X/mo cash flow]
- 36-Month Goal: [e.g., Portfolio of 12 doors, $X/mo passive income]
- Exit Strategy Preference: [Long-term hold / BRRRR / Flip / Wholesale]
- Annual Acquisition Budget: $[amount]
- Risk Tolerance: [Conservative / Moderate / Aggressive]

## Financial Snapshot
- Available Cash for Deals: $[amount]
- Pre-Approved Financing: [Conventional up to $X / Hard money / DSCR loan]
- Current Monthly Cash Flow from RE: $[amount]
- Credit Score Range: [if relevant]

## Schedule & Preferences
- Work Hours: [e.g., 8am-6pm]
- Sacred Time (do not disturb): [e.g., 7-9am deep work, after 10pm]
- Preferred Check-in Times: [e.g., 7am briefing, 6pm pipeline digest]
- Communication Preference: [Telegram / WhatsApp / Both]
- Decision Speed: [Fast — send deals immediately / Sleep on it — batch daily]

## Team
- [Name] — [Role] — [Contact info] — [Notes]

## Personal Notes
- [Anything else the AI should know]
"""

TEMPLATES["RULES.md"] = """\
# Investment Rules & Guardrails

> These rules are NON-NEGOTIABLE. The AI must flag any deal that violates
> a HARD rule. SOFT rules are preferences that can flex with justification.

## Hard Rules (Never Break)

### Acquisition Criteria
- Maximum Purchase Price: $[amount] per door
- Minimum Cash-on-Cash Return: [X]%
- Maximum Offer: Never exceed [X]% of ARV minus estimated repairs
- Repair Budget Ceiling: Walk away if rehab exceeds $[amount]
- Location: Only pursue deals in approved target markets (see MARKET_CONTEXT.md)
- Foundation Issues: Walk if estimated above $[amount]

### Financial Guardrails
- Never commit if cash reserves would drop below $[amount]
- Maximum debt-to-income exposure: [X]%
- Always hold back [X]% of purchase price for unexpected repairs

### Due Diligence Non-Negotiables
- Always get independent inspection (never waive)
- Always verify rent comps with 3+ comparable properties
- Always confirm clear title before closing
- Always verify insurance costs before making an offer

## Soft Rules (Preferences — Can Flex)

### Property Preferences
- Preferred Types: [SFR / Small Multi 2-4 / Multi 5+]
- Preferred Condition: [Turnkey / Light Rehab / Heavy Rehab]
- Preferred Bed/Bath: [X+ bed / X+ bath]
- Avoid: [e.g., HOAs over $X/mo, septic, flat roofs]

### Deal Structure
- Preferred Financing: [Conventional first, DSCR backup, hard money for flips]
- Target Cap Rate: [X]% minimum
- Target Monthly Cash Flow Per Door: $[amount]

## Evaluation Formula
Always calculate:
1. All-In Cost: Purchase + Rehab + Closing + Holding
2. ARV: 3+ verified comps within 0.5 miles, sold within 6 months
3. Cash-on-Cash Return: Annual Cash Flow / Total Cash Invested
4. Cap Rate: NOI / Purchase Price
5. 1% Rule: Monthly Rent / Purchase Price
6. DSCR: NOI / Annual Debt Service
7. Equity Position: ARV - All-In Cost

## Red Flags (Auto-Reject)
- Seller won't allow inspection
- Unresolved title issues
- Environmental concerns (UST, asbestos, lead without remediation)
- Property taxes increasing 15%+ YoY
- Neighborhood vacancy above [X]%
"""

TEMPLATES["DEALS_PIPELINE.md"] = """\
# Deals Pipeline
> Last updated: [auto-timestamp]
> Active deals: 0
> Total pipeline value: $0

---

## URGENT — Action Required Within 48 Hours

(No urgent items)

---

## IN PROGRESS — Active Deals

(No active deals)

---

## NEW LEADS — Need Initial Evaluation

(No new leads)

---

## CLOSED / ARCHIVED

(No closed deals yet)

---

## Pipeline Summary

| Metric                | Count | Value   |
|-----------------------|-------|---------|
| Active Leads          | 0     | —       |
| In Analysis           | 0     | —       |
| Offers Pending        | 0     | $0      |
| Under Contract        | 0     | $0      |
| Closing This Month    | 0     | $0      |
| Passed (Last 30 Days) | 0     | —       |
| Closed (YTD)          | 0     | $0      |
"""

TEMPLATES["CONTACTS.md"] = """\
# Contacts & Relationships
> Last updated: [auto-timestamp]

---

## Agents & Brokers

(Add your agents here)

---

## Lenders

(Add your lenders here)

---

## Contractors & Vendors

(Add contractors here)

---

## Wholesalers & Deal Sources

(Add wholesalers here)

---

## Property Managers

(Add PMs here)

---

## Legal & Professional

(Add attorneys, CPAs, title companies here)

---

## Sellers (Active Leads)

(Active seller contacts appear here)

---

## Contact Activity Log (Last 7 Days)

| Date | Contact | Channel | Summary |
|------|---------|---------|---------|
"""

TEMPLATES["MARKET_CONTEXT.md"] = """\
# Market Research & Intelligence
> Last updated: [auto-timestamp]
> Next scheduled deep research: [not yet configured]

---

## Target Markets

### Market 1: [City/Metro, State]

#### Target Zip Codes
- [Zip] — [Neighborhood]: [Notes]

#### Key Metrics
- Median Home Price: $[amount]
- Median Rent (SFR 3/2): $[amount]/mo
- Rent-to-Price Ratio: [X]%
- Average Days on Market: [X]
- Vacancy Rate: [X]%
- Population Growth (1yr): [X]%

#### Recent Market Intelligence
(Research findings will be added here automatically)

#### Comparable Sales (Last 90 Days)

| Address | Sale Price | $/SqFt | Bed/Bath | Condition | Date |
|---------|-----------|--------|----------|-----------|------|

#### Rental Comps

| Address | Rent/Mo | Bed/Bath | Condition | Source |
|---------|---------|----------|-----------|--------|

---

## Macro Trends
- Interest Rates: [Current avg]
- Insurance Climate: [Notes]
- Legislative Watch: [Notes]
- Supply Pipeline: [Notes]

## Research Queue
- [ ] Initial market scan for target zip codes
"""

TEMPLATES["PORTFOLIO.md"] = """\
# Current Portfolio
> Last updated: [auto-timestamp]
> Total Doors: 0
> Monthly Gross Rent: $0
> Monthly Net Cash Flow: $0
> Portfolio Equity (est.): $0

---

## Active Properties

(Add properties as you acquire them)

---

## Portfolio Health Dashboard

| Metric                     | Target | Actual | Status |
|---------------------------|--------|--------|--------|
| Average Cash-on-Cash       | [X]%+  | —      | —      |
| Average Vacancy Rate       | <[X]%  | —      | —      |
| Total Monthly Cash Flow    | $[X]+  | $0     | —      |
| Cash Reserves              | $[X]+  | —      | —      |
"""

TEMPLATES["MEMORY.md"] = """\
# Agent Memory & Learning Log
> Updated automatically after meaningful interactions.

---

## Decision Patterns Observed

(The AI will record patterns from your decisions here)

---

## Communication Preferences Learned

(Your preferred times, formats, and styles will be logged here)

---

## Market Insights Accumulated

(Research findings and corrections will be tracked here)

---

## Mistakes to Avoid

(Self-correction notes from the AI will be logged here)

---

## What's Working Well

(Effective patterns the AI identifies will be noted here)
"""

TEMPLATES["docs/ESCALATION.md"] = """\
# Smart Check-in Escalation Rules (REI-Specific)

## Escalation Levels

### NONE — Silent Update
- Market data refreshed, no notable changes
- Pipeline file updated with routine status change

### TEXT — Standard Message
- New lead matching criteria in RULES.md
- Deal status change
- Non-urgent email from agent/lender/wholesaler
- Deadline in 3-7 days (first reminder)
- Tenant maintenance request (non-emergency)

### URGENT TEXT — Priority Message
- Deadline within 48 hours
- Counter-offer expiring within 24 hours
- Lender requesting documents for active deal
- Tenant emergency
- Title issue on deal under contract
- Appraisal results

### CALL — Voice Call
- Closing day issues
- Option/contingency expiring TODAY
- Deal-breaking inspection finding
- Property emergency (fire, flood, structural)

## REI Overrides (Break Through Quiet Hours)
- Closing within 24 hours + issue found → CALL
- Option period expires within 12 hours → URGENT TEXT
- Counter-offer with same-day expiration → URGENT TEXT
- Tenant emergency (water/fire/safety) → URGENT TEXT

## Anti-Spam Rules
- Maximum 3 TEXT check-ins per day (unless deal-critical)
- Never send same deal alert twice
- If snoozed, don't resurface unless deadline forces it
- Batch low-priority items into evening digest
"""

TEMPLATES["docs/CRON_JOBS.md"] = """\
# Scheduled Automations

## Daily

### Morning Briefing — 7:00am
- Model: Sonnet
- Actions: Pipeline deadlines, unread emails, today's calendar, lease expirations
- Format: Max 5 bullet points, most urgent first

### Evening Pipeline Digest — 6:00pm
- Model: Sonnet
- Actions: All pipeline changes today, new leads, offers, upcoming deadlines
- Format: Pipeline status table + tomorrow's action items

### Market Scan — 6:30am
- Model: Perplexity Pro Search
- Actions: New listings in target zips, recent sales, local RE news
- Updates: MARKET_CONTEXT.md (silent unless significant)

## Weekly

### Market Intelligence Report — Sundays 9:00am
- Model: Perplexity Deep Research + Opus
- Actions: Price/rent trends, interest rates, supply pipeline, legislative changes
- Updates: MARKET_CONTEXT.md + Telegram summary

### Contact Follow-Up Review — Fridays 4:00pm
- Model: Sonnet
- Actions: Stale contacts with active deals, suggested follow-ups

## Monthly

### Portfolio Health Check — 1st of month 8:00am
- Model: Opus
- Actions: Actual vs. target performance, refi opportunities, lease calendar, maintenance

### Self-Improvement Review — 1st of month 9:00am
- Model: Opus
- Actions: Review MEMORY.md, analyze alert effectiveness, propose improvements
"""

TEMPLATES["templates/deal-brief.md"] = """\
# Deal Brief: [Property Address]
> Generated: [timestamp]
> Confidence: [High / Medium / Low]

## Why This Deal
[One sentence summary]

## The Numbers

| Metric             | Value  | Target (RULES.md) | Pass? |
|--------------------|--------|--------------------|-------|
| Purchase Price     | $      | < $                |       |
| ARV                | $      | —                  |       |
| Rehab Estimate     | $      | < $                |       |
| All-In Cost        | $      | —                  |       |
| Monthly Rent       | $      | —                  |       |
| Cash-on-Cash       |   %    | > [X]%             |       |
| Cap Rate           |   %    | > [X]%             |       |
| 1% Rule            |   %    | > 1%               |       |
| DSCR               |        | > 1.25             |       |
| Equity at Close    | $      | > $[X]             |       |

## Property Details
- Type: [SFR / Duplex / etc.]
- Bed/Bath: / | SqFt: | Year Built:
- Condition: [Turnkey / Light Rehab / Heavy Rehab]
- Lot Size: | Garage: | HOA:

## Comparable Sales (3+)

| Address | Sale Price | $/SqFt | Date | Similarity |
|---------|-----------|--------|------|------------|

## Risk Factors
1. [Risk]
2. [Risk]

## Verdict: [BUY / PASS / NEEDS MORE INFO]
[Reasoning]

## Next Steps
- [ ] [Action item]
"""


# ── Provisioning ─────────────────────────────────────────────────────────────


CONTEXT_FILES = [
    "USER.md",
    "RULES.md",
    "DEALS_PIPELINE.md",
    "CONTACTS.md",
    "MARKET_CONTEXT.md",
    "PORTFOLIO.md",
    "MEMORY.md",
    "docs/ESCALATION.md",
    "docs/CRON_JOBS.md",
    "templates/deal-brief.md",
]


async def provision_tenant_context(workspace: VirtualWorkspace) -> dict:
    """Create all context files for a new tenant.

    Only creates files that don't already exist (safe to call repeatedly).
    Returns a summary of what was created.
    """
    created = []
    skipped = []

    for filename in CONTEXT_FILES:
        template = TEMPLATES.get(filename, "")
        if not template:
            continue

        # Check if file already exists
        existing = await workspace.read_file(filename)
        if existing is not None:
            skipped.append(filename)
            continue

        result = await workspace.write_file(filename, template.encode("utf-8"))
        if result:
            created.append(filename)
            logger.info("Created context file: %s", filename)
        else:
            logger.warning("Failed to create context file: %s", filename)

    logger.info(
        "Tenant context provisioned: %d created, %d skipped (already exist)",
        len(created),
        len(skipped),
    )
    return {"created": created, "skipped": skipped}


async def read_context_for_prompt(workspace: VirtualWorkspace, files: list[str] | None = None) -> str:
    """Read context files and compile them into a prompt section.

    Used by the AI engine to inject tenant context into system prompts.
    Only includes files that exist and have content.
    """
    target_files = files or ["USER.md", "RULES.md", "MEMORY.md"]
    sections = []

    for filename in target_files:
        content = await workspace.read_file(filename)
        if content:
            text = content.decode("utf-8", errors="replace").strip()
            # Skip unfilled templates (RE-style or general-purpose)
            if "[Your Name]" in text and "[amount]" in text:
                continue
            if "{name}" in text and "{role}" in text:
                continue
            sections.append(f"--- {filename} ---\n{text}")

    return "\n\n".join(sections) if sections else ""


def list_context_templates() -> list[dict]:
    """Return metadata about all available context templates."""
    return [
        {
            "filename": f,
            "category": "docs" if f.startswith("docs/") else
                        "templates" if f.startswith("templates/") else "core",
            "description": _DESCRIPTIONS.get(f, ""),
        }
        for f in CONTEXT_FILES
    ]


_DESCRIPTIONS = {
    "USER.md": "Your investor profile, goals, team, and preferences",
    "RULES.md": "Investment decision rules and guardrails the AI enforces",
    "DEALS_PIPELINE.md": "Active deals tracker — the AI updates this as deals progress",
    "CONTACTS.md": "People and relationships with communication history",
    "MARKET_CONTEXT.md": "Target markets, research data, comps, and trends",
    "PORTFOLIO.md": "Current holdings, performance tracking, and health dashboard",
    "MEMORY.md": "What the AI has learned from working with you",
    "docs/ESCALATION.md": "Smart check-in escalation rules for real estate",
    "docs/CRON_JOBS.md": "Scheduled automation definitions",
    "templates/deal-brief.md": "Auto-generated deal analysis format",
}


# ── General-Purpose Templates (non-domain-specific) ─────────────────────────

GENERAL_TEMPLATES: dict[str, str] = {}

GENERAL_TEMPLATES["USER.md"] = """\
# My Profile

## About Me
- Name: {name}
- Role / Title: {role}
- Industry: {industry}
- Location: {location}
- Time Zone: {timezone}

## What I Do
{about}

## Goals
- Primary Goal: {primary_goal}
- Secondary Goals: {secondary_goals}

## Schedule & Preferences
- Work Hours: {work_hours}
- Sacred Time (do not disturb): {sacred_time}
- Preferred Check-in Times: {checkin_times}
- Communication Channel: {comm_channel}
- Response Style Preference: {response_style}

## Team & Key People
{team}

## Personal Notes
{personal_notes}
"""

GENERAL_TEMPLATES["RULES.md"] = """\
# Rules & Guardrails

> These rules shape how Helm operates for you.
> HARD rules are always enforced.  SOFT rules are preferences.

## Hard Rules
- Always respect my sacred time / quiet hours.
- Never fabricate data or statistics.
- Never take irreversible actions without my explicit confirmation.
- Keep my information private — never share across tenants.
{custom_hard_rules}

## Soft Rules (Preferences)
- Communication tone: {tone}
- Detail level: {detail_level}
- When unsure, {uncertainty_action}
{custom_soft_rules}

## Decision Framework
When I ask you to help me decide:
1. Present the options clearly with pros/cons.
2. Highlight risks I might overlook.
3. Give your recommendation with reasoning.
4. Respect my final call.
"""

GENERAL_TEMPLATES["MEMORY.md"] = """\
# Agent Memory & Learning Log
> Updated automatically after meaningful interactions.

---

## Decision Patterns Observed

(Helm will record patterns from your decisions here)

---

## Communication Preferences Learned

(Your preferred times, formats, and styles will be logged here)

---

## Key Facts & Context

(Important information Helm learns over time)

---

## What's Working Well

(Effective patterns Helm identifies will be noted here)

---

## Corrections & Adjustments

(When you correct Helm, the lesson is logged here)
"""

# Core files for general (non-domain) tenants
GENERAL_CONTEXT_FILES = ["USER.md", "RULES.md", "MEMORY.md"]


# ── Onboarding ──────────────────────────────────────────────────────────────

# Questions asked during the onboarding flow.  Each maps to a field
# in the general templates above.
ONBOARDING_QUESTIONS = [
    {
        "id": "name",
        "question": "What's your name?",
        "placeholder": "e.g., Alex Rivera",
        "required": True,
    },
    {
        "id": "role",
        "question": "What's your role or title?",
        "placeholder": "e.g., Entrepreneur, Marketing Director, Freelance Designer",
        "required": True,
    },
    {
        "id": "industry",
        "question": "What industry are you in?",
        "placeholder": "e.g., Real Estate, Tech, Finance, Healthcare, Creative",
        "required": False,
    },
    {
        "id": "location",
        "question": "Where are you located?",
        "placeholder": "e.g., Atlanta, GA",
        "required": False,
    },
    {
        "id": "timezone",
        "question": "What's your time zone?",
        "placeholder": "e.g., America/New_York, America/Los_Angeles",
        "required": False,
    },
    {
        "id": "about",
        "question": "Tell Helm about yourself in a few sentences. What do you do? What matters to you?",
        "placeholder": "e.g., I run a small real estate investing company. I'm also building a SaaS product on the side. Family-first mindset — I want to be efficient so I can be present at home.",
        "required": True,
    },
    {
        "id": "primary_goal",
        "question": "What's your #1 goal right now that Helm should help you with?",
        "placeholder": "e.g., Close my first 4 rental property deals this year",
        "required": True,
    },
    {
        "id": "secondary_goals",
        "question": "Any other goals? (comma-separated)",
        "placeholder": "e.g., Launch SaaS MVP, improve daily routine, stay on top of finances",
        "required": False,
    },
    {
        "id": "work_hours",
        "question": "What are your typical work hours?",
        "placeholder": "e.g., 8am-6pm weekdays",
        "required": False,
    },
    {
        "id": "sacred_time",
        "question": "Any times Helm should NEVER disturb you?",
        "placeholder": "e.g., Before 7am, after 10pm, Sunday mornings",
        "required": False,
    },
    {
        "id": "comm_channel",
        "question": "How do you prefer Helm to reach you?",
        "placeholder": "e.g., Telegram, WhatsApp, Both",
        "required": False,
    },
    {
        "id": "response_style",
        "question": "How should Helm talk to you?",
        "placeholder": "e.g., Direct and concise, Detailed and thorough, Casual and friendly",
        "required": False,
    },
    {
        "id": "tone",
        "question": "Preferred tone for communications?",
        "placeholder": "e.g., Professional but warm, Casual, Strictly business",
        "required": False,
    },
    {
        "id": "team",
        "question": "Key people Helm should know about? (name - role - notes)",
        "placeholder": "e.g., Sarah - Business Partner - handles marketing\nMike - CPA - tax questions go to him",
        "required": False,
    },
    {
        "id": "personal_notes",
        "question": "Anything else Helm should know about you?",
        "placeholder": "e.g., I'm a morning person. I hate unnecessary meetings. I learn best from examples.",
        "required": False,
    },
]


def get_onboarding_questions() -> list[dict]:
    """Return the onboarding questionnaire."""
    return ONBOARDING_QUESTIONS


async def provision_from_onboarding(
    workspace: VirtualWorkspace,
    answers: dict[str, str],
) -> dict:
    """Create context files populated from onboarding questionnaire answers.

    ``answers`` is a dict mapping question ``id`` → user's answer.
    Unanswered optional fields get sensible defaults.
    """
    defaults = {
        "name": "User",
        "role": "Professional",
        "industry": "Not specified",
        "location": "Not specified",
        "timezone": "UTC",
        "about": "No description provided yet.",
        "primary_goal": "Not specified yet.",
        "secondary_goals": "None specified yet.",
        "work_hours": "9am-5pm",
        "sacred_time": "After 10pm",
        "checkin_times": "Morning and evening",
        "comm_channel": "Telegram",
        "response_style": "Direct and concise",
        "tone": "Professional but warm",
        "detail_level": "Concise with option to drill deeper",
        "uncertainty_action": "ask me rather than guess",
        "team": "(No team members added yet)",
        "personal_notes": "(Nothing added yet)",
        "custom_hard_rules": "",
        "custom_soft_rules": "",
    }

    # Merge user answers over defaults
    fields = {**defaults, **{k: v for k, v in answers.items() if v}}

    created = []
    for filename in GENERAL_CONTEXT_FILES:
        template = GENERAL_TEMPLATES.get(filename, "")
        if not template:
            continue

        # Fill in template placeholders
        try:
            content = template.format(**fields)
        except KeyError:
            # Template uses a key not in fields — fall back to raw template
            content = template

        result = await workspace.write_file(filename, content.encode("utf-8"))
        if result:
            created.append(filename)
            logger.info("Onboarding: created %s", filename)

    logger.info("Onboarding complete: %d files created", len(created))
    return {"created": created, "answers_received": list(answers.keys())}
