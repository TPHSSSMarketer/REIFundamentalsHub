-- ============================================================
-- Conversation Flow Engine Migration
-- ============================================================
-- Run this against your Supabase/PostgreSQL database.
-- This creates the new tables for the CloseBot-style conversation
-- flow system: personas, flows, nodes, edges, executions, and chat sessions.
-- ============================================================

-- 1. Create Personas table (AI personality profiles)
CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    personality_prompt TEXT DEFAULT '',
    tone TEXT DEFAULT 'professional',
    response_length TEXT DEFAULT 'medium',
    ai_provider TEXT,
    ai_model TEXT,
    min_response_delay_seconds INTEGER DEFAULT 0,
    max_response_delay_seconds INTEGER DEFAULT 0,
    quirks TEXT,  -- JSON: {"uses_emojis": true, "occasional_typos": false}
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Create Conversation Flows table (master workflow container)
CREATE TABLE IF NOT EXISTS conversation_flows (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    channel TEXT DEFAULT 'all',  -- 'sms', 'webchat', 'voice', 'all'
    persona_id TEXT REFERENCES personas(id),
    start_node_id TEXT,  -- Set after nodes are created
    is_active BOOLEAN DEFAULT FALSE,
    is_template BOOLEAN DEFAULT FALSE,
    tag_filters TEXT,  -- JSON list: ["new_lead", "seller"]
    canvas_data TEXT,  -- JSON: visual builder node positions
    total_executions INTEGER DEFAULT 0,
    total_completions INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Create Flow Nodes table (individual steps in a flow)
CREATE TABLE IF NOT EXISTS flow_nodes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    flow_id TEXT NOT NULL REFERENCES conversation_flows(id) ON DELETE CASCADE,
    node_type TEXT NOT NULL,  -- 'objective', 'statement', 'conversation', 'switch', 'true_false', 'webhook', 'delay', 'stop', 'transfer'
    label TEXT DEFAULT '',

    -- Objective fields
    short_description TEXT,
    output_variable TEXT,
    extra_prompt TEXT,
    sensitivity INTEGER DEFAULT 50,  -- 0-100 strictness scale
    max_attempts INTEGER DEFAULT 3,
    skip_if_known BOOLEAN DEFAULT TRUE,

    -- Statement fields
    message_text TEXT,
    ai_generate BOOLEAN DEFAULT FALSE,

    -- Switch fields
    switch_variable TEXT,
    switch_mode TEXT DEFAULT 'variable',  -- 'variable' or 'ai'
    switch_options TEXT,  -- JSON list of options

    -- True/False fields
    condition_expression TEXT,

    -- Webhook fields
    webhook_url TEXT,
    webhook_method TEXT DEFAULT 'POST',
    webhook_headers TEXT,  -- JSON object
    webhook_body_template TEXT,  -- JSON template
    webhook_response_variable TEXT,
    webhook_wait_for_response BOOLEAN DEFAULT TRUE,

    -- Delay fields
    delay_seconds INTEGER DEFAULT 0,

    -- Transfer fields
    transfer_to TEXT,  -- 'human' or agent_id

    -- Visual builder
    position_x FLOAT DEFAULT 0.0,
    position_y FLOAT DEFAULT 0.0,
    sort_order INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 4. Create Flow Edges table (connections between nodes)
CREATE TABLE IF NOT EXISTS flow_edges (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    flow_id TEXT NOT NULL REFERENCES conversation_flows(id) ON DELETE CASCADE,
    from_node_id TEXT NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
    to_node_id TEXT NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
    label TEXT DEFAULT 'default',  -- 'default', 'true', 'false', 'buy', 'sell', etc.
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Create Chat Sessions table (web chat & SMS conversations)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id INTEGER NOT NULL REFERENCES users(id),
    channel TEXT DEFAULT 'webchat',  -- 'webchat', 'sms'
    contact_phone TEXT,
    contact_email TEXT,
    contact_name TEXT,
    visitor_id TEXT,  -- Browser cookie/localStorage ID
    referrer_url TEXT,
    page_url TEXT,
    active_execution_id TEXT,  -- Links to flow_executions
    status TEXT DEFAULT 'active',  -- 'active', 'idle', 'closed', 'transferred_to_human'
    ip_address TEXT,
    user_agent TEXT,
    is_human_takeover BOOLEAN DEFAULT FALSE,
    last_message_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

-- 6. Create Flow Executions table (live conversations running through flows)
CREATE TABLE IF NOT EXISTS flow_executions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    flow_id TEXT NOT NULL REFERENCES conversation_flows(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    chat_session_id TEXT REFERENCES chat_sessions(id),
    current_node_id TEXT,
    current_node_attempts INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',  -- 'active', 'paused', 'completed', 'abandoned', 'transferred'
    variables TEXT DEFAULT '{}',  -- JSON: collected data
    messages TEXT DEFAULT '[]',  -- JSON: full message history
    contact_phone TEXT,
    contact_name TEXT,
    contact_email TEXT,
    channel TEXT DEFAULT 'webchat',
    persona_id TEXT REFERENCES personas(id),
    outcome TEXT,  -- 'qualified', 'not_qualified', 'appointment_set', 'transferred', 'abandoned'
    started_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_flows_user_id ON conversation_flows(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_flows_active ON conversation_flows(is_active);
CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow_id ON flow_nodes(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_nodes_type ON flow_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_flow_edges_flow_id ON flow_edges(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_edges_from ON flow_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_flow_edges_to ON flow_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_visitor ON chat_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_flow_id ON flow_executions(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_user_id ON flow_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_flow_executions_status ON flow_executions(status);
CREATE INDEX IF NOT EXISTS idx_flow_executions_session ON flow_executions(chat_session_id);

-- 8. Seed a template flow: "Lead Qualification" (users can clone this)
-- This creates a ready-to-use flow that replicates CloseBot's lead qualification workflow

DO $$
DECLARE
    template_flow_id TEXT;
    greeting_node_id TEXT;
    buy_sell_node_id TEXT;
    switch_node_id TEXT;
    seller_address_node_id TEXT;
    seller_timeline_node_id TEXT;
    seller_price_node_id TEXT;
    buyer_budget_node_id TEXT;
    buyer_area_node_id TEXT;
    closing_node_id TEXT;
BEGIN
    -- Only create if no templates exist yet
    IF NOT EXISTS (SELECT 1 FROM conversation_flows WHERE is_template = TRUE LIMIT 1) THEN

        template_flow_id := gen_random_uuid()::text;
        greeting_node_id := gen_random_uuid()::text;
        buy_sell_node_id := gen_random_uuid()::text;
        switch_node_id := gen_random_uuid()::text;
        seller_address_node_id := gen_random_uuid()::text;
        seller_timeline_node_id := gen_random_uuid()::text;
        seller_price_node_id := gen_random_uuid()::text;
        buyer_budget_node_id := gen_random_uuid()::text;
        buyer_area_node_id := gen_random_uuid()::text;
        closing_node_id := gen_random_uuid()::text;

        -- Create the template flow (user_id = 1 for system templates)
        INSERT INTO conversation_flows (id, user_id, name, description, channel, start_node_id, is_active, is_template)
        VALUES (
            template_flow_id, 1,
            'Lead Qualification (Template)',
            'Pre-built lead qualification flow. Greets the contact, determines if they want to buy or sell, then qualifies them accordingly. Clone this to customize it.',
            'all',
            greeting_node_id,
            FALSE, TRUE
        );

        -- Node 1: Greeting (Statement)
        INSERT INTO flow_nodes (id, flow_id, node_type, label, message_text, position_x, position_y, sort_order)
        VALUES (greeting_node_id, template_flow_id, 'statement', 'Greeting',
                'Hi there! Thanks for reaching out. I''d love to help you with your real estate needs. Are you looking to buy or sell a property?',
                250, 50, 1);

        -- Node 2: Buy or Sell? (Objective)
        INSERT INTO flow_nodes (id, flow_id, node_type, label, short_description, output_variable, extra_prompt, sensitivity, max_attempts, position_x, position_y, sort_order)
        VALUES (buy_sell_node_id, template_flow_id, 'objective', 'Buy or Sell?',
                'Determine whether the contact wants to buy or sell a property',
                'buy_or_sell',
                'If they mention both buying and selling, focus on which one is their primary need right now.',
                40, 3,
                250, 200, 2);

        -- Node 3: Switch on buy_or_sell
        INSERT INTO flow_nodes (id, flow_id, node_type, label, switch_variable, switch_mode, switch_options, position_x, position_y, sort_order)
        VALUES (switch_node_id, template_flow_id, 'switch', 'Route: Buy or Sell',
                'buy_or_sell', 'ai',
                '[{"label": "sell", "value": "sell", "description": "Contact wants to sell a property"}, {"label": "buy", "value": "buy", "description": "Contact wants to buy a property"}]',
                250, 400, 3);

        -- Seller path nodes
        INSERT INTO flow_nodes (id, flow_id, node_type, label, short_description, output_variable, sensitivity, position_x, position_y, sort_order)
        VALUES (seller_address_node_id, template_flow_id, 'objective', 'Property Address',
                'Find out the address of the property they want to sell',
                'property_address', 60,
                100, 600, 4);

        INSERT INTO flow_nodes (id, flow_id, node_type, label, short_description, output_variable, extra_prompt, sensitivity, position_x, position_y, sort_order)
        VALUES (seller_timeline_node_id, template_flow_id, 'objective', 'Timeline',
                'Determine their timeline for selling',
                'selling_timeline',
                'Common answers: ASAP, within 30 days, within 90 days, not sure, just exploring',
                30, 100, 750, 5);

        INSERT INTO flow_nodes (id, flow_id, node_type, label, short_description, output_variable, sensitivity, position_x, position_y, sort_order)
        VALUES (seller_price_node_id, template_flow_id, 'objective', 'Asking Price',
                'Find out their price expectations or asking price',
                'asking_price', 40,
                100, 900, 6);

        -- Buyer path nodes
        INSERT INTO flow_nodes (id, flow_id, node_type, label, short_description, output_variable, sensitivity, position_x, position_y, sort_order)
        VALUES (buyer_budget_node_id, template_flow_id, 'objective', 'Budget',
                'Determine the buyer''s budget or price range',
                'buyer_budget', 40,
                400, 600, 7);

        INSERT INTO flow_nodes (id, flow_id, node_type, label, short_description, output_variable, sensitivity, position_x, position_y, sort_order)
        VALUES (buyer_area_node_id, template_flow_id, 'objective', 'Target Area',
                'Find out what area or neighborhoods they''re interested in',
                'target_area', 30,
                400, 750, 8);

        -- Closing node (shared)
        INSERT INTO flow_nodes (id, flow_id, node_type, label, message_text, ai_generate, extra_prompt, position_x, position_y, sort_order)
        VALUES (closing_node_id, template_flow_id, 'statement', 'Closing',
                NULL, TRUE,
                'Thank them for their time. Summarize what you learned. Let them know someone from the team will reach out soon with more details. Ask if they have any other questions.',
                250, 1050, 9);

        -- Create edges (connections)
        INSERT INTO flow_edges (id, flow_id, from_node_id, to_node_id, label) VALUES
            (gen_random_uuid()::text, template_flow_id, greeting_node_id, buy_sell_node_id, 'default'),
            (gen_random_uuid()::text, template_flow_id, buy_sell_node_id, switch_node_id, 'default'),
            (gen_random_uuid()::text, template_flow_id, switch_node_id, seller_address_node_id, 'sell'),
            (gen_random_uuid()::text, template_flow_id, switch_node_id, buyer_budget_node_id, 'buy'),
            (gen_random_uuid()::text, template_flow_id, seller_address_node_id, seller_timeline_node_id, 'default'),
            (gen_random_uuid()::text, template_flow_id, seller_timeline_node_id, seller_price_node_id, 'default'),
            (gen_random_uuid()::text, template_flow_id, seller_price_node_id, closing_node_id, 'default'),
            (gen_random_uuid()::text, template_flow_id, buyer_budget_node_id, buyer_area_node_id, 'default'),
            (gen_random_uuid()::text, template_flow_id, buyer_area_node_id, closing_node_id, 'default');

    END IF;
END $$;
