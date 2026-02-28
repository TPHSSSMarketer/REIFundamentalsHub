-- ============================================================
-- Voice AI Migration — CallCommander AI
-- ============================================================
-- Run this against your Supabase/PostgreSQL database.
-- This creates the new tables and adds columns to phone_numbers.
-- ============================================================

-- 1. Create AI Agents table
CREATE TABLE IF NOT EXISTS ai_agents (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    role TEXT NOT NULL,  -- 'lead_qualifier', 'appointment_setter', 'follow_up'
    personality TEXT NOT NULL,
    elevenlabs_voice_id TEXT,
    elevenlabs_agent_id TEXT,
    system_prompt TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create Knowledge Entries table
CREATE TABLE IF NOT EXISTS knowledge_entries (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER REFERENCES users(id),  -- NULL = platform-level
    name TEXT NOT NULL,
    entry_type TEXT NOT NULL,  -- 'platform_script', 'account_data', 'custom_script', 'objection_handler'
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Create Conversation Logs table
CREATE TABLE IF NOT EXISTS conversation_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER NOT NULL REFERENCES users(id),
    call_log_id TEXT REFERENCES call_logs(id),
    agent_id TEXT REFERENCES ai_agents(id),
    elevenlabs_conversation_id TEXT,
    transcript TEXT,  -- JSON array of messages
    extracted_data TEXT,  -- JSON object of parsed caller info
    caller_mood TEXT,
    deal_eagerness INTEGER,  -- 1-10 scale
    outcome TEXT,
    summary TEXT,
    status TEXT DEFAULT 'in_progress',
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP
);

-- 4. Add AI routing columns to existing phone_numbers table
ALTER TABLE phone_numbers
    ADD COLUMN IF NOT EXISTS ai_mode TEXT DEFAULT 'off',
    ADD COLUMN IF NOT EXISTS ai_agent_id TEXT REFERENCES ai_agents(id),
    ADD COLUMN IF NOT EXISTS ring_targets TEXT DEFAULT '["softphone"]',
    ADD COLUMN IF NOT EXISTS cell_forward_number TEXT,
    ADD COLUMN IF NOT EXISTS ai_schedule TEXT,
    ADD COLUMN IF NOT EXISTS user_available BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS ring_schedule TEXT;  -- JSON: controls when each device rings
    -- Example ring_schedule:
    -- {
    --   "softphone": {"days": [1,2,3,4,5], "start": "08:00", "end": "20:00"},
    --   "cell":      {"days": [1,2,3,4,5], "start": "09:00", "end": "18:00"},
    --   "timezone":  "America/New_York"
    -- }

-- 5. Create Scheduled Callbacks table (AI-booked appointments)
CREATE TABLE IF NOT EXISTS scheduled_callbacks (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER NOT NULL REFERENCES users(id),
    contact_name TEXT,
    contact_phone TEXT NOT NULL,
    contact_email TEXT,
    property_address TEXT,
    scheduled_at TIMESTAMP NOT NULL,
    timezone TEXT DEFAULT 'America/New_York',
    callback_type TEXT DEFAULT 'ai',  -- 'ai' or 'human'
    agent_id TEXT REFERENCES ai_agents(id),
    phone_number_id INTEGER REFERENCES phone_numbers(id),
    notes TEXT,
    original_conversation_id TEXT REFERENCES conversation_logs(id),
    status TEXT DEFAULT 'scheduled',  -- 'scheduled', 'in_progress', 'completed', 'failed', 'cancelled', 'no_answer'
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMP,
    completed_at TIMESTAMP,
    result_conversation_id TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 6. Create Call Campaigns table (bulk AI outbound)
CREATE TABLE IF NOT EXISTS call_campaigns (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    agent_id TEXT NOT NULL REFERENCES ai_agents(id),
    phone_number_id INTEGER NOT NULL REFERENCES phone_numbers(id),
    start_at TIMESTAMP,
    calling_window_start TEXT DEFAULT '09:00',
    calling_window_end TEXT DEFAULT '17:00',
    calling_days TEXT DEFAULT '[1,2,3,4,5]',
    timezone TEXT DEFAULT 'America/New_York',
    seconds_between_calls INTEGER DEFAULT 30,
    total_contacts INTEGER DEFAULT 0,
    calls_made INTEGER DEFAULT 0,
    calls_answered INTEGER DEFAULT 0,
    calls_no_answer INTEGER DEFAULT 0,
    calls_failed INTEGER DEFAULT 0,
    leads_qualified INTEGER DEFAULT 0,
    appointments_set INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',  -- 'draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- 7. Create Campaign Contacts table
CREATE TABLE IF NOT EXISTS campaign_contacts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    campaign_id TEXT NOT NULL REFERENCES call_campaigns(id),
    contact_name TEXT,
    contact_phone TEXT NOT NULL,
    contact_email TEXT,
    property_address TEXT,
    context_notes TEXT,
    status TEXT DEFAULT 'pending',  -- 'pending', 'calling', 'completed', 'no_answer', 'failed', 'skipped'
    attempt_count INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 2,
    conversation_id TEXT REFERENCES conversation_logs(id),
    outcome TEXT,
    deal_eagerness INTEGER,
    called_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_agents_user_id ON ai_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_user_id ON knowledge_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_type ON knowledge_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_user_id ON conversation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_call_log_id ON conversation_logs(call_log_id);
CREATE INDEX IF NOT EXISTS idx_conversation_logs_agent_id ON conversation_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_callbacks_user_id ON scheduled_callbacks(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_callbacks_status ON scheduled_callbacks(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_callbacks_scheduled_at ON scheduled_callbacks(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_call_campaigns_user_id ON call_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_call_campaigns_status ON call_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_status ON campaign_contacts(status);

-- Help Tickets table
CREATE TABLE IF NOT EXISTS help_tickets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER NOT NULL REFERENCES users(id),
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    priority TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'open',
    related_resource_type TEXT,
    related_resource_id TEXT,
    admin_notes TEXT,
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_help_tickets_user_id ON help_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_help_tickets_status ON help_tickets(status);
CREATE INDEX IF NOT EXISTS idx_help_tickets_priority ON help_tickets(priority);

-- 9. Seed platform-level knowledge entries (your pre-built scripts)
INSERT INTO knowledge_entries (id, user_id, name, entry_type, content, is_active) VALUES

-- Lead Qualification Script (used by Grace)
(gen_random_uuid()::text, NULL, 'Lead Qualification Script', 'platform_script',
'LEAD QUALIFICATION FRAMEWORK FOR REAL ESTATE INVESTORS

GOAL: Determine if the caller is a motivated seller with a property that fits the investor''s buying criteria.

OPENING:
- Greet warmly and introduce yourself by name and company
- Ask: "I understand you might be interested in selling your property. Is that right?"
- If they called us: "Thanks for reaching out! I''d love to learn more about your situation."

QUALIFYING QUESTIONS (ask naturally, not like a checklist):
1. Property Address: "Can you tell me a bit about the property? Where is it located?"
2. Ownership: "And you''re the owner of the property?"
3. Condition: "How would you describe the current condition of the property?"
4. Timeline: "What kind of timeline are you looking at for selling?"
5. Motivation: "What''s your main reason for wanting to sell?"
6. Price Expectations: "Do you have a price in mind that you''d be happy with?"
7. Mortgage: "Is there currently a mortgage on the property? Roughly how much is owed?"
8. Other Offers: "Have you spoken with any other buyers or investors?"

MOTIVATION INDICATORS (listen for these — they signal a hot lead):
- Behind on payments or facing foreclosure
- Inherited property they don''t want
- Divorce or separation
- Job relocation with tight timeline
- Property needs major repairs they can''t afford
- Tired landlord dealing with problem tenants
- Tax liens or code violations

OBJECTION HANDLING:
- "I need to think about it" → "Absolutely, take your time. Can I follow up with you in a day or two?"
- "Your offer is too low" → "I understand. What number would work for you?"
- "I want to list with a Realtor" → "That''s a great option. Just so you know, we can close much faster with no commissions or fees."

CLOSING:
- If qualified: "This sounds like it could be a great fit. Let me set up a time for [investor name] to give you a call and discuss the details."
- If not qualified: "I appreciate you taking the time to talk with me. If your situation changes, please don''t hesitate to reach out."

ALWAYS EXTRACT: caller name, email, phone number, property address, asking price, motivation level, timeline.', TRUE),

-- Appointment Setting Script (used by Marcus)
(gen_random_uuid()::text, NULL, 'Appointment Setting Script', 'platform_script',
'APPOINTMENT SETTING FRAMEWORK FOR REAL ESTATE INVESTORS

GOAL: Schedule a call or meeting between the motivated seller and the investor.

CONTEXT: This script is used AFTER a lead has been qualified. The caller has already expressed interest.

OPENING:
- "Hi [name], this is [agent name] with [company]. I''m following up on our earlier conversation about your property at [address]."
- "I have some good news — our team has reviewed your situation and we''d love to discuss a potential offer with you."

SCHEDULING:
1. Offer specific times: "Would tomorrow at 2 PM or Thursday at 10 AM work better for you?"
2. Confirm method: "Would you prefer a phone call or would you like to meet in person at the property?"
3. Get contact preference: "What''s the best number to reach you at?"
4. Confirm details: "Great, so that''s [day] at [time]. We''ll call you at [number]."

OBJECTIONS:
- "I''m not sure I''m ready" → "No pressure at all. This is just a conversation to see if we can help. No obligation."
- "Can you just make an offer now?" → "I want to make sure we give you the best possible offer, and that requires a quick conversation with our acquisitions team."
- "I''m busy" → "I totally understand. What day next week works best? We''re flexible."

CONFIRMATION:
- Repeat the appointment details
- "You''ll get a confirmation text/email shortly"
- "If anything comes up, just call this number back"

ALWAYS EXTRACT: preferred contact method, best time to call, any new concerns or questions.', TRUE),

-- Follow-Up Script (used by Sofia)
(gen_random_uuid()::text, NULL, 'Follow-Up Script', 'platform_script',
'FOLLOW-UP FRAMEWORK FOR REAL ESTATE INVESTORS

GOAL: Re-engage leads who haven''t responded, missed appointments, or need nurturing.

CONTEXT: These are leads who previously showed interest but went cold. Be friendly and persistent without being pushy.

OPENING (varies by situation):
- Missed appointment: "Hi [name], this is [agent name] with [company]. I noticed we missed connecting yesterday. I hope everything is okay!"
- No response to offer: "Hi [name], just checking in about the property at [address]. I wanted to make sure you received our offer."
- Nurture/long-term: "Hi [name], this is [agent name] with [company]. We chatted a few weeks ago about your property. Just wanted to see if anything has changed with your situation."

KEY APPROACH:
- Be warm and understanding — life happens
- Don''t make them feel guilty for not responding
- Offer value: updated market info, new options, flexible terms
- Ask if their situation has changed

RE-ENGAGEMENT QUESTIONS:
1. "Has anything changed with your property situation since we last spoke?"
2. "Is selling still something you''re considering?"
3. "Is there anything specific that''s holding you back that I might be able to help with?"
4. "Would it help if we could offer more flexible terms?"

IF THEY''RE STILL INTERESTED:
- Re-qualify quickly (has anything changed?)
- Reschedule the appointment
- Offer to send updated information

IF THEY''RE NO LONGER INTERESTED:
- "I completely understand. Would it be okay if I checked back in a few months?"
- "If your situation ever changes, you have our number."

ALWAYS EXTRACT: current status, updated motivation level, new timeline, any changed circumstances.', TRUE),

-- Objection Handlers (used by all agents)
(gen_random_uuid()::text, NULL, 'Common Objection Handlers', 'objection_handler',
'COMMON OBJECTIONS AND HOW TO HANDLE THEM

"I need to talk to my spouse/partner"
→ "Absolutely, that''s a big decision. Would it be helpful if I scheduled a call when you''re both available?"

"I''m not in a rush to sell"
→ "No rush at all. It''s actually smart to know your options early. Want me to send you some information to review at your own pace?"

"How do I know this is legitimate?"
→ "Great question. [Company name] is a local real estate investment company. You can look us up at [website]. We''ve helped many homeowners in [area]."

"I already have a Realtor"
→ "That''s great — Realtors do good work. Just know that we can often close faster with no commissions, and you can always compare options."

"Your offer is way too low"
→ "I hear you. Can you tell me what number would make this work for you? We want to find something that works for both sides."

"I don''t want anyone coming to my house"
→ "Completely understandable. We can handle most of the process over the phone and through photos if you prefer."

"How did you get my number?"
→ "We reach out to homeowners in the area who might benefit from knowing their options. If this isn''t a good time, I apologize for the interruption."

"Is this a scam?"
→ "I understand the concern — there are unfortunately bad actors out there. We''re a real company at [address/website]. I''m happy to provide references from other sellers we''ve worked with."', TRUE);
