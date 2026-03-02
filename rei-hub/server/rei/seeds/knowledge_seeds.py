"""Starter platform-level knowledge entries for the REI Hub Knowledge Base.

These are available to ALL users and serve as a baseline of real estate
investing knowledge. Users can add their own account-level entries on top.

Platform entries have user_id=NULL so they appear for every user.
"""

from __future__ import annotations

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from rei.models.user import KnowledgeEntry

logger = logging.getLogger(__name__)

# ── Starter entries ──────────────────────────────────────────────────────

PLATFORM_ENTRIES = [
    # ── Training (ALWAYS loaded — sets AI mindset and tone) ──
    {
        "name": "Core Negotiation Mindset",
        "entry_type": "training",
        "content": (
            "You are a trained real estate investing professional. Follow these "
            "core principles in EVERY interaction — phone calls, text messages, "
            "and web chats alike.\n\n"
            "MINDSET:\n"
            "- You are a problem solver, not a salesperson. Your job is to find "
            "out if you can help the seller, not to pressure them into a deal.\n"
            "- Every seller has a unique situation. Listen more than you talk. "
            "Ask open-ended questions and let them share their story.\n"
            "- Be genuinely curious about their situation. People can tell when "
            "you actually care versus when you're just running a script.\n"
            "- Stay calm and confident. Never sound desperate, rushed, or pushy.\n"
            "- Always assume positive intent — the seller is talking to you because "
            "they have a problem they need solved.\n\n"
            "TONE:\n"
            "- Warm, professional, and conversational — like a trusted advisor, "
            "not a telemarketer.\n"
            "- Use their first name naturally throughout the conversation.\n"
            "- Mirror their energy level — if they're relaxed, be relaxed. "
            "If they're concerned, acknowledge that concern before moving forward.\n"
            "- Avoid industry jargon. Speak in plain English that anyone can understand.\n"
            "- Be honest about who you are and what you do. Transparency builds trust.\n\n"
            "APPROACH:\n"
            "- Lead with empathy. Before talking numbers, understand WHY they want to sell.\n"
            "- Build rapport before business. Spend the first few minutes connecting "
            "as a person, not jumping straight to the property.\n"
            "- Ask permission before asking personal questions: 'Do you mind if I ask...'\n"
            "- Never bad-mouth the property or make the seller feel embarrassed "
            "about its condition.\n"
            "- When presenting an offer, frame it as solving their problem: "
            "'Based on what you've shared, here's how we can help...'\n"
            "- Always leave the door open. Even if they say no today, they should "
            "feel comfortable calling you back in 3 months."
        ),
    },
    {
        "name": "Negotiation Techniques",
        "entry_type": "training",
        "content": (
            "KEY NEGOTIATION PRINCIPLES:\n\n"
            "1. ANCHORING: Let the seller state their price first whenever possible. "
            "If they ask 'What would you offer?', respond with 'I want to make sure "
            "my offer reflects the real value. What number would make this work for you?'\n\n"
            "2. SILENCE IS POWER: After stating your offer or asking an important "
            "question, stop talking. Let the silence do the work. Most people will "
            "fill the silence with valuable information.\n\n"
            "3. THE FLINCH: When a seller names a high price, pause briefly and say "
            "'Okay...' in a thoughtful tone. This signals that the number is higher "
            "than expected without being confrontational.\n\n"
            "4. FEEL-FELT-FOUND: When handling objections: 'I understand how you feel. "
            "Other sellers have felt the same way. What they found was that...'\n\n"
            "5. EITHER/OR CLOSE: Instead of 'Would you like to move forward?', "
            "ask 'Would Tuesday or Thursday work better for a walkthrough?'\n\n"
            "6. THIRD-PARTY AUTHORITY: 'My partner/team needs to approve the final "
            "number' gives you room to negotiate without being the 'bad guy'.\n\n"
            "7. WALK AWAY POWER: Be willing to walk away. Never chase a deal that "
            "doesn't make financial sense. The seller can sense desperation.\n\n"
            "8. PROBLEM STACKING: Gently help the seller see the full picture of "
            "costs they'd face with a traditional sale — agent fees, repairs, holding "
            "costs, time on market — without being pushy about it.\n\n"
            "9. FUTURE PACING: Help the seller visualize life after the sale: "
            "'Imagine not having to worry about that mortgage payment anymore...'\n\n"
            "10. RECIPROCITY: Give something to get something. Offer flexibility "
            "on closing date, moving help, or other concessions to earn goodwill "
            "before asking for a price concession."
        ),
    },
    # ── Call Scripts ──
    {
        "name": "Cold Call Script — Motivated Seller",
        "entry_type": "platform_script",
        "content": (
            "Opening: Hi, is this [Name]? My name is [Agent Name] and I'm reaching "
            "out because I noticed you might have a property at [Address]. I work with "
            "a local real estate investment company and we buy homes in your area. "
            "I was wondering if you'd ever consider an offer on your property?\n\n"
            "If YES: Great! Can I ask you a few quick questions about the property?\n"
            "- How long have you owned it?\n"
            "- Is anyone currently living there?\n"
            "- Have you done any major repairs or renovations recently?\n"
            "- What would be your ideal timeline for selling?\n"
            "- Do you have a price in mind?\n\n"
            "If NO: No problem at all. Would it be okay if I followed up in a few months "
            "in case anything changes? Sometimes situations come up where having a quick, "
            "hassle-free sale option is helpful.\n\n"
            "Closing: I appreciate your time, [Name]. I'll put together some numbers "
            "and get back to you within 24 hours. What's the best way to reach you?"
        ),
    },
    {
        "name": "Follow-Up Call Script",
        "entry_type": "platform_script",
        "content": (
            "Opening: Hi [Name], this is [Agent Name] following up from our last "
            "conversation about your property at [Address]. I wanted to check in and "
            "see if anything has changed since we last spoke?\n\n"
            "Key questions to revisit:\n"
            "- Has your timeline changed at all?\n"
            "- Have you received any other offers?\n"
            "- Is there anything specific you're looking for in a deal?\n"
            "- Would you be open to a creative financing option that might get you "
            "a higher price over time?\n\n"
            "If they're ready: Perfect. I'd love to set up a time to walk through the "
            "property and put together a formal offer. When works best for you this week?\n\n"
            "If not ready: I completely understand. I'll check back in [timeframe]. "
            "In the meantime, feel free to reach out if anything changes."
        ),
    },
    {
        "name": "Appointment Setting Script",
        "entry_type": "platform_script",
        "content": (
            "Opening: Hi [Name], thanks for taking my call. Based on what we've "
            "discussed, I think we can put together a great offer for your property "
            "at [Address]. The next step would be for me or one of our team members "
            "to take a quick look at the property — it usually takes about 15-20 minutes.\n\n"
            "Scheduling: What day this week works best for you? Morning or afternoon?\n\n"
            "Confirmation: Great, I've got you down for [Day] at [Time]. I'll send "
            "you a confirmation text with my contact info. If anything comes up, "
            "just give me a call and we can reschedule.\n\n"
            "Before we hang up, is there anything specific about the property I should "
            "know before I come out? Any repairs needed, tenants, liens, or anything "
            "like that?\n\n"
            "Closing: Perfect. I look forward to meeting you on [Day]. Have a great day!"
        ),
    },
    # ── Objection Handlers ──
    {
        "name": "Objection: Your Offer Is Too Low",
        "entry_type": "objection_handler",
        "content": (
            "Response: I understand that might not be what you were hoping to hear, "
            "and I appreciate your honesty. Let me explain how we arrive at our numbers. "
            "We factor in the current market value, any repairs the property needs, our "
            "holding costs, and the fact that we close quickly with cash — no inspections, "
            "no appraisals, no waiting for bank financing.\n\n"
            "What most sellers tell us they value is the certainty and speed. With a "
            "traditional sale, you'd pay 5-6% in agent commissions, plus closing costs, "
            "plus the time it takes to list, show, and close. Our offer eliminates all of that.\n\n"
            "That said, I want to make sure we find something that works for both of us. "
            "Is there a specific number you had in mind? Sometimes we can structure the "
            "deal differently — like seller financing — to bridge the gap."
        ),
    },
    {
        "name": "Objection: I Want to List with an Agent",
        "entry_type": "objection_handler",
        "content": (
            "Response: That's absolutely a valid option, and I'd never discourage you "
            "from exploring it. Here's what I'd suggest: go ahead and talk to a few "
            "agents and see what they think you can get. Keep our offer in your back "
            "pocket as a backup.\n\n"
            "A few things to keep in mind as you compare:\n"
            "- Agent commissions typically run 5-6% of the sale price\n"
            "- Average days on market in your area is [X] days\n"
            "- You'll likely need to make repairs and stage the home for showings\n"
            "- Buyer financing can fall through, adding weeks or months\n"
            "- Our offer is as-is, no repairs, close in 2-3 weeks, cash in hand\n\n"
            "If the agent route doesn't work out or takes too long, our offer stands. "
            "I'm happy to check back in a month if you'd like."
        ),
    },
    {
        "name": "Objection: I'm Not Ready to Sell Yet",
        "entry_type": "objection_handler",
        "content": (
            "Response: No problem at all — there's no pressure here. I just wanted "
            "to plant the seed so that when the time is right, you know you have an "
            "option.\n\n"
            "Can I ask what might change your mind down the road? Is it a timeline "
            "thing, a price thing, or something else entirely?\n\n"
            "Would it be okay if I followed up in [30/60/90] days just to check in? "
            "A lot can change in a few months, and I want to make sure you have our "
            "info when you need it.\n\n"
            "In the meantime, if anything comes up — a change in plans, an unexpected "
            "expense, a job relocation — you can always reach me directly at this number."
        ),
    },
    {
        "name": "Objection: I Need to Think About It",
        "entry_type": "objection_handler",
        "content": (
            "Response: Absolutely, take all the time you need. This is a big decision "
            "and you should feel 100% comfortable.\n\n"
            "While you're thinking it over, can I ask — what's the main thing you're "
            "weighing? Is it the price, the timing, or something else? Sometimes I can "
            "provide additional information that helps with the decision.\n\n"
            "Here's what I'll do: I'll send you a recap of our offer via text or email "
            "so you have everything in writing. When would be a good time for me to "
            "follow up? Would later this week work?\n\n"
            "And of course, if you have any questions before then, don't hesitate to "
            "call or text me back."
        ),
    },
    # ── Account Data Templates ──
    {
        "name": "Company Overview Template",
        "entry_type": "account_data",
        "content": (
            "[CUSTOMIZE THIS ENTRY WITH YOUR COMPANY INFO]\n\n"
            "Company Name: [Your Company Name]\n"
            "Location: [City, State]\n"
            "Years in Business: [X]\n"
            "Specialties: [e.g., wholesaling, fix & flip, buy & hold, creative finance]\n"
            "Markets Served: [List your target markets/zip codes]\n"
            "Typical Deal Size: [e.g., $50K - $300K]\n"
            "Closing Timeline: [e.g., 14-21 days]\n\n"
            "Unique Selling Points:\n"
            "- We close with cash, no financing contingencies\n"
            "- We buy properties as-is, no repairs needed\n"
            "- We cover all closing costs\n"
            "- We can close on your timeline\n"
            "- We are a local company, not a national call center"
        ),
    },
    {
        "name": "Buy Criteria Template",
        "entry_type": "account_data",
        "content": (
            "[CUSTOMIZE THIS ENTRY WITH YOUR BUY CRITERIA]\n\n"
            "Target Property Types: [SFR, Multi-family, Land, Commercial]\n"
            "Target Markets/Zip Codes: [List specific areas]\n"
            "Price Range: [e.g., ARV $100K - $400K]\n"
            "Maximum Offer Formula: [e.g., 70% of ARV minus repairs]\n"
            "Minimum Equity: [e.g., 30%+]\n"
            "Deal Breakers: [e.g., flood zone, foundation issues, HOA restrictions]\n\n"
            "Preferred Seller Situations:\n"
            "- Pre-foreclosure\n"
            "- Inherited/probate properties\n"
            "- Vacant/abandoned properties\n"
            "- Divorce situations\n"
            "- Tired landlords\n"
            "- Code violations\n"
            "- Tax delinquent properties"
        ),
    },
    {
        "name": "SMS Templates — Initial Outreach",
        "entry_type": "platform_script",
        "content": (
            "Template 1 (Direct):\n"
            "Hi [Name], I'm [Agent Name] with [Company]. We're buying homes in "
            "[Area] and I noticed your property at [Address]. Would you consider "
            "a cash offer? No fees, no repairs, close on your timeline. Let me know "
            "if you're interested!\n\n"
            "Template 2 (Soft):\n"
            "Hey [Name], I'm reaching out about [Address]. I work with local investors "
            "and wanted to see if you've ever thought about selling. No pressure at all — "
            "just exploring. Feel free to text back if you'd like to chat.\n\n"
            "Template 3 (Value-first):\n"
            "Hi [Name]! I recently ran some numbers on properties in [Area] and your "
            "home at [Address] caught my eye. I'd love to share what I found — would "
            "you be open to a quick conversation this week?\n\n"
            "Template 4 (Follow-up):\n"
            "Hi [Name], just following up from my earlier message about [Address]. "
            "I know things get busy — just wanted to make sure you saw my note. "
            "Our offer still stands if you're interested. Have a great day!"
        ),
    },
]


async def seed_platform_knowledge(db: AsyncSession) -> int:
    """Create platform-level knowledge entries if they don't exist.

    Returns the number of entries created (skips existing ones by name).
    """
    created = 0
    for entry_data in PLATFORM_ENTRIES:
        # Check if this entry already exists (by name, platform-level)
        result = await db.execute(
            select(KnowledgeEntry).where(
                KnowledgeEntry.name == entry_data["name"],
                KnowledgeEntry.user_id.is_(None),
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            continue

        entry = KnowledgeEntry(
            user_id=None,  # Platform-level — available to ALL users
            name=entry_data["name"],
            entry_type=entry_data["entry_type"],
            content=entry_data["content"],
            is_active=True,
        )
        db.add(entry)
        created += 1

    if created:
        await db.commit()
        logger.info("Seeded %d platform knowledge entries.", created)
    else:
        logger.info("Platform knowledge entries already exist — skipping seed.")

    return created
