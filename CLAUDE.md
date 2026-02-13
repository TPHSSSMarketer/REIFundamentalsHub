# PROJECT: AI Assistant — Always-On Multi-Agent System
## Codename: CommandCenter
### Overview
Build a secure, always-on, multi-agent AI assistant that runs 24/7 on a dedicated Windows PC. It combines Claude Code as the orchestrator with Gemini CLI for web research, sub-agents for specialized tasks, and GoHighLevel as the CRM/pipeline backbone. Communication happens via Telegram (personal) and WhatsApp Business API (business/SaaS clients). The system must be SaaS-compliant from day one — multi-tenant, white-labeled through GHL SaaS Mode, with per-tenant agent configurations, isolated data, and production-grade reliability.
This is NOT a toy or experiment. This is business infrastructure for a real estate investing operation AND a personal assistant, with plans to sell as a SaaS product to other businesses.
### Inspiration & Architecture Sources
- Goda Go's "Claude Code Always-On" system (Telegram bot + Claude Code headless + Supabase memory + ElevenLabs voice + proactive check-ins)
- NetworkChuck's multi-AI terminal workflow (sub-agents, Gemini CLI headless research, shared context files, parallel agent execution)
- Built to replace OpenClaw/Clawdbot with something secure, reliable, and business-grade
---
## TECH STACK
| Component | Tool | Purpose |
|-----------|------|---------|
| Runtime | Bun (Windows native) | Fast TypeScript execution |
| Bot Framework | grammy | Telegram Bot API |
| WhatsApp | WhatsApp Business Cloud API | Client-facing messaging + voice calls |
| AI Orchestrator | Claude Code (headless mode) | Primary intelligence, decision-making, agent spawning |
| AI Research | Gemini CLI (headless via `gemini -p`) | Free web research, current data, market lookups |
| AI Backup | OpenCode (opencode.ai) | Open-source fallback, local model support, cost optimization |
| Voice Transcription | Gemini API | Multilingual audio-to-text |
| Voice Synthesis | ElevenLabs | TTS for voice replies + Conversational AI voice agent |
| Voice Calls | WhatsApp Business Calling API (WebRTC/VoIP) | Bidirectional voice calls within WhatsApp |
| CRM & Pipeline | GoHighLevel API v2 (OAuth) | Contacts, deals, tasks, calendar, conversations, workflows |
| Database | Supabase (PostgreSQL + pgvector) | Multi-tenant semantic memory, embeddings, state tracking |
| Embeddings | OpenAI text-embedding-3-large (1536 dims) | Semantic search via Supabase Edge Functions |
| Process Manager | PM2 | Windows 24/7 operation, auto-restart, monitoring |
| SaaS Multi-Tenancy | GHL SaaS Mode (Agency Pro) | White-label sub-accounts per client |
| Observability | Custom dashboard (part of GHL website wrapper) | System health, agent logs, tenant monitoring |
### Key Commands
```
claude -p "[prompt]" --output-format json --allowedTools "..."   # Headless Claude execution
gemini -p "[research query]"                                       # Headless Gemini research
pm2 start relay.ts --interpreter bun --name "ai-orchestrator"     # Always-on process
```
---
## PHASE 1: FOUNDATION & INFRASTRUCTURE (Windows)
### Step 1 — Project Initialization
```
mkdir C:\\CommandCenter
cd C:\\CommandCenter
bun init
```
Create the following directory structure:
```
C:\\CommandCenter\\
├── src/
│   ├── relay/
│   │   ├── telegram-relay.ts        # grammy Telegram bot handler
│   │   ├── whatsapp-relay.ts        # WhatsApp Cloud API webhook handler
│   │   └── tenant-router.ts         # Routes messages to correct tenant context
│   ├── orchestrator/
│   │   ├── orchestrator.ts          # Main Claude Code headless orchestration
│   │   ├── agent-spawner.ts         # Sub-agent creation and management
│   │   ├── multi-ai-router.ts       # Routes tasks to Claude/Gemini/OpenCode
│   │   └── response-compiler.ts     # Compiles multi-agent results
│   ├── checkins/
│   │   ├── scheduler.ts             # 30-minute check-in loop
│   │   ├── data-collector.ts        # Parallel data gathering from all sources
│   │   ├── decision-engine.ts       # NONE / TEXT / CALL decision logic
│   │   ├── gating-rules.ts          # Smart gating (quiet hours, cooldowns, etc.)
│   │   └── delivery.ts              # Send check-in via Telegram/WhatsApp with buttons
│   ├── integrations/
│   │   ├── ghl/
│   │   │   ├── ghl-client.ts        # GHL API v2 OAuth client
│   │   │   ├── ghl-contacts.ts      # Contact CRUD operations
│   │   │   ├── ghl-opportunities.ts # Pipeline/deal management
│   │   │   ├── ghl-tasks.ts         # Task management
│   │   │   ├── ghl-calendar.ts      # Calendar operations
│   │   │   ├── ghl-conversations.ts # Messaging through GHL
│   │   │   └── ghl-mcp-server.ts    # MCP server exposing GHL tools to Claude
│   │   ├── voice/
│   │   │   ├── elevenlabs-tts.ts    # Text-to-speech for voice replies
│   │   │   ├── elevenlabs-agent.ts  # Conversational voice agent config
│   │   │   ├── whatsapp-calling.ts  # WhatsApp VoIP call handling
│   │   │   ├── transcription.ts     # Voice-to-text via Gemini API
│   │   │   └── post-call-pipeline.ts # Transcript → tasks → memory → summary
│   │   ├── supabase/
│   │   │   ├── client.ts            # Supabase client with RLS
│   │   │   ├── memory.ts            # Semantic memory read/write
│   │   │   ├── embeddings.ts        # Edge Function calls for embeddings
│   │   │   └── tenant-manager.ts    # Tenant provisioning and isolation
│   │   └── gemini/
│   │       └── gemini-headless.ts   # Shell wrapper for `gemini -p` commands
│   ├── agents/                       # Sub-agent definitions
│   │   ├── deal-analyzer.md          # Real estate deal analysis agent
│   │   ├── contract-reviewer.md      # Document/contract review agent
│   │   ├── market-researcher.md      # Gemini-powered web research agent
│   │   ├── outreach-drafter.md       # Communication drafting agent
│   │   ├── task-manager.md           # GHL pipeline management agent
│   │   ├── schedule-optimizer.md     # Calendar optimization agent
│   │   ├── health-coach.md           # Personal wellness agent
│   │   └── research-assistant.md     # General research agent
│   ├── reliability/
│   │   ├── circuit-breaker.ts        # Circuit breaker for external APIs
│   │   ├── retry-queue.ts           # Action queue with retry logic
│   │   ├── health-check.ts          # System health monitoring
│   │   └── error-handler.ts         # Global error handling + notification
│   └── config/
│       ├── tenant-config.ts          # Per-tenant configuration schema
│       ├── gating-config.ts          # Smart gating rules
│       └── permissions.ts            # Action permission tiers
├── context/                          # Shared AI context files
│   ├── claude.md                     # Master context (synced to others)
│   ├── gemini.md                     # Synced copy for Gemini tasks
│   └── agents.md                     # Synced copy for OpenCode/Codex tasks
├── workspace/                        # Agent working directory
│   ├── active-deals/                 # Current deal files from GHL
│   ├── research/                     # Gemini research output
│   ├── drafts/                       # Communication drafts pending approval
│   ├── reviews/                      # Agent analysis output
│   └── logs/                         # Execution logs
├── .env                              # Environment variables (never commit)
├── ecosystem.config.js               # PM2 process configuration
├── CLAUDE.md                         # THIS FILE — project context
└── package.json
```
### Step 2 — Install Dependencies
```bash
bun add grammy                    # Telegram bot framework
bun add @supabase/supabase-js     # Supabase client
bun add openai                    # OpenAI embeddings (called via Supabase Edge Functions)
bun add node-fetch                # HTTP client for WhatsApp Cloud API & GHL API
bun add zod                       # Runtime type validation
bun add winston                   # Structured logging
bun add bottleneck                # Rate limiting for API calls
bun add opossum                   # Circuit breaker pattern
bun add cron                      # Cron scheduling for check-ins
npm install -g pm2                # Process manager (global)
npm install -g @anthropic-ai/claude-code   # Claude Code CLI
npm install -g @google/generative-ai-cli   # Gemini CLI
```
### Step 3 — Environment Variables (.env)
```
# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_USER_ID=           # Your personal Telegram user ID (auth)
# WhatsApp Business API
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=            # Webhook verification
WHATSAPP_WEBHOOK_URL=             # Your public webhook endpoint
# GoHighLevel
GHL_CLIENT_ID=                    # From GHL Developer Marketplace app
GHL_CLIENT_SECRET=
GHL_REDIRECT_URI=
GHL_API_BASE=https://services.leadconnectorhq.com
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Server-side only, never expose
# ElevenLabs
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=              # Your preferred voice
ELEVENLABS_AGENT_ID=              # Conversational agent ID
# Gemini
GEMINI_API_KEY=                   # For Gemini CLI auth
# System
NODE_ENV=production
LOG_LEVEL=info
ADMIN_TENANT_ID=                  # Your personal tenant ID
```
---
## PHASE 2: GOHIGHLEVEL INTEGRATION
### Step 4 — GHL API v2 OAuth Connection
Register a Custom App in the GHL Developer Marketplace. For SaaS mode, each client installs your app into their sub-account granting scoped OAuth access.
### Step 5 — GHL MCP Tool Server
Build an MCP server that exposes these GHL operations as tools for Claude Code:
```
Tools to implement:
- ghl_search_contacts(query, locationId) → Find contacts by name/tag/email/phone
- ghl_get_contact(contactId) → Full contact details with custom fields
- ghl_create_contact(data) → Add new contact
- ghl_update_contact(contactId, data) → Update contact fields/tags
- ghl_get_opportunities(pipelineId, stageId?, status?) → Pull deals from pipelines
- ghl_create_opportunity(data) → Add new deal to pipeline
- ghl_update_opportunity(opportunityId, data) → Move deal stages, update fields
- ghl_get_pipelines(locationId) → List all pipelines and stages
- ghl_get_tasks(contactId?, dueDate?) → Tasks due today/this week/overdue
- ghl_create_task(data) → Create task tied to contact/deal
- ghl_complete_task(taskId) → Mark task complete
- ghl_get_calendar_events(startDate, endDate) → Calendar events
- ghl_create_calendar_event(data) → Schedule events
- ghl_get_conversations(contactId) → Pull message history
- ghl_send_message(contactId, message, channel) → Send via SMS/email/WhatsApp through GHL
- ghl_get_notes(contactId) → Contact notes
- ghl_add_note(contactId, note) → Add note to contact
- ghl_get_custom_fields(locationId) → List custom field definitions
```
### Step 6 — GHL Pipeline Structure
**Real Estate Pipeline — "Deal Tracker":**
```
Stages: Lead → Analysis → Offer Sent → Under Contract → Due Diligence → Rehab → Rented/Listed → Sold/Held → Dead
Custom Fields: ARV, Purchase Price, Rehab Budget, Rent Estimate, Cap Rate, Cash-on-Cash, LTV, Strategy (BRRRR/Flip/Hold), Agent Name, Lender, Closing Date, Inspection Date
```
**Personal Pipeline — "Life Manager":**
```
Stages: Inbox → This Week → In Progress → Waiting On → Done
Custom Fields: Category (Health/Family/Finance/Home/Learning/Social), Priority (P1/P2/P3), Due Date, Energy Level (High/Low), Time Estimate
```
**SaaS Client Pipelines:** Configurable per tenant during onboarding.
---
## PHASE 3: DATABASE & MEMORY SYSTEM
### Step 7 — Supabase Schema
```sql
-- Tenant management
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ghl_location_id TEXT UNIQUE,
  ghl_access_token TEXT,          -- Encrypted
  ghl_refresh_token TEXT,         -- Encrypted
  telegram_chat_id TEXT,
  whatsapp_phone TEXT,
  system_prompt TEXT,             -- Per-tenant personality/context
  gating_config JSONB DEFAULT '{}',
  agent_config JSONB DEFAULT '{}', -- Which sub-agents are enabled
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Semantic memory (per tenant)
CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  content TEXT NOT NULL,
  summary TEXT,                   -- AI-generated summary
  category TEXT,                  -- deal, contact, goal, personal, etc.
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Conversation logs
CREATE TABLE conversation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  channel TEXT NOT NULL,          -- telegram, whatsapp, voice_call
  role TEXT NOT NULL,             -- user, assistant, system
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Check-in state tracking
CREATE TABLE checkin_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) UNIQUE,
  last_checkin_at TIMESTAMPTZ,
  last_checkin_type TEXT,         -- none, text, call
  last_checkin_summary TEXT,
  pending_items JSONB DEFAULT '[]',
  suppressed_items JSONB DEFAULT '[]', -- Items user snoozed
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- Agent execution logs (observability)
CREATE TABLE agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  agent_name TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT NOT NULL,           -- started, completed, failed, retried
  input_summary TEXT,
  output_summary TEXT,
  duration_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Goals tracking
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  goal TEXT NOT NULL,
  status TEXT DEFAULT 'active',   -- active, completed, paused, abandoned
  target_date DATE,
  progress_notes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Row-level security (CRITICAL for multi-tenancy)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
-- RLS policies: each tenant can only access their own rows
CREATE POLICY tenant_isolation ON memories FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_isolation ON conversation_logs FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_isolation ON checkin_state FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_isolation ON agent_logs FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);
CREATE POLICY tenant_isolation ON goals FOR ALL USING (tenant_id = current_setting('app.tenant_id')::uuid);
-- pgvector similarity search function
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding VECTOR(1536),
  match_tenant_id UUID,
  match_count INT DEFAULT 10,
  match_threshold FLOAT DEFAULT 0.7
) RETURNS TABLE (id UUID, content TEXT, summary TEXT, category TEXT, similarity FLOAT) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.content, m.summary, m.category,
         1 - (m.embedding <=> query_embedding) AS similarity
  FROM memories m
  WHERE m.tenant_id = match_tenant_id
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
```
### Step 8 — Supabase Edge Functions for Embeddings
Create Edge Functions that call OpenAI's `text-embedding-3-large` model. The OpenAI API key stays in Supabase secrets and is never exposed to the client application.
---
## PHASE 4: MESSAGING & VOICE SYSTEM
### Step 9 — Telegram Relay (Personal Channel)
Using grammy framework. Handles: text messages, voice messages (transcribed via Gemini API), images, files, inline keyboard buttons for confirmations/actions. Auth: restrict to TELEGRAM_ADMIN_USER_ID only.
### Step 10 — WhatsApp Business API Relay (Business/SaaS Channel)
Webhook-based. Receives incoming messages, routes through tenant identification (phone number → GHL sub-account → tenant config). Sends outbound messages, voice notes, interactive button messages, and media.
### Step 11 — Voice Message Flow
```
Incoming voice → Download audio → Gemini API transcription → Claude orchestrator processes →
Response generated → ElevenLabs TTS → Send as voice note back to Telegram/WhatsApp
```
### Step 12 — WhatsApp Voice Calls (Business-Initiated & User-Initiated)
Using WhatsApp Business Calling API (Cloud API Calling) with WebRTC/SIP:
- Business-initiated: AI requests permission via text button first, then initiates VoIP call
- User-initiated: User calls the WhatsApp Business number, webhook triggers, connects to ElevenLabs conversational agent with full memory context injected
- Post-call: Transcript → Claude extracts tasks → Updates GHL → Summary to messaging channel → Stored in memory
### Step 13 — ElevenLabs Voice Agent Configuration
The conversational AI agent gets injected with:
- Tenant's system prompt and personality
- Last 15 messages from conversation history
- Current goals from Supabase
- Key facts and preferences from memory
- Active deal summaries from GHL (for real estate context)
---
## PHASE 5: PROACTIVE SMART CHECK-INS
### Step 14 — Check-in Scheduler
Runs every 30 minutes via PM2 cron. For each active tenant:
**1. COLLECT (Parallel Data Gathering)**
```
Promise.all([
  ghl.getOpportunities({ status: 'open', withDeadlines: true }),
  ghl.getTasks({ dueToday: true, overdue: true }),
  ghl.getCalendarEvents({ today: true, next3Days: true }),
  ghl.getConversations({ unread: true, last7Days: true }),
  gmail.getUnread({ last7Days: true }),  // If Gmail integration enabled
  supabase.getGoals({ status: 'active' }),
  supabase.getCheckinState(tenantId),
  supabase.getRecentConversations(tenantId, 3), // Last 3 days
])
```
**2. ANALYZE**
Claude reviews all collected data holistically. Cross-references: "Is this unread email from a contact with an active deal? Has user already replied? Is there a deadline approaching?"
**3. DECIDE — Three Outputs:**
- **NONE** — Nothing actionable. Don't interrupt.
- **TEXT** — Send Telegram/WhatsApp message with context + inline action buttons
- **CALL** — Urgent (deal deadline, time-sensitive decision). Ask permission first with [Yes, call me] [Not now] buttons
**4. DELIVER**
Actionable messages with buttons:
```
Deal Update: 123 Oak St
Due Diligence expires in 48 hours. Inspection report not yet uploaded.
Lender hasn't confirmed wire details.
[Show Checklist] [Call Lender] [Snooze 4hr]
```
**5. TRACK**
Update checkin_state: last contact time, what was communicated, snoozed items.
### Step 15 — Smart Gating Rules
```typescript
const gatingRules = {
  minTimeBetweenCheckins: 2 * 60 * 60 * 1000,  // 2 hours (unless urgent)
  quietHoursStart: 22,  // 10pm
  quietHoursEnd: 7,     // 7am
  sacredBlocks: [       // No interruptions during these times
    { start: '07:00', end: '10:00', label: 'Morning Deep Work' },
  ],
  urgencyOverrides: {   // These bypass cooldown
    dealDeadlineWithin24h: true,
    missedClosingDate: true,
    clientEmergency: true,
  },
  antiSpam: {
    sameTopicCooldown: 4 * 60 * 60 * 1000,  // Don't repeat same topic within 4 hours
    checkSentFolder: true,   // Don't nag about emails already replied to
    contactFrequencyAware: true, // Track how many times same item surfaced
  }
};
```
---
## PHASE 6: MULTI-AGENT ORCHESTRATION
### Step 16 — Orchestrator Design
The main Claude Code instance is the orchestrator. It receives every message, loads tenant context, and decides how to handle it:
```
Route A: Handle directly (simple questions, conversation, planning)
Route B: Spawn sub-agent (specialized task requiring fresh context)
Route C: Run Gemini headless (web research, current data)
Route D: Parallel agents (multiple specialists simultaneously)
Route E: Confirmation required (action needs user approval before executing)
```
### Step 17 — Sub-Agent Definitions
**@deal-analyzer**
```
Scope: Project
Description: Real estate deal analysis specialist. Evaluates properties against the investor's specific criteria.
Instructions: You analyze real estate deals. When given a property, calculate: ARV, rehab cost estimate, maximum allowable offer (using 70% rule), projected cash-on-cash return, cap rate, and BRRRR feasibility. Reference the investor's criteria from the context files. Always present a clear BUY / PASS / NEEDS MORE INFO recommendation with reasoning.
Tools: Read, Write, Bash, GHL MCP tools
Model: Sonnet
```
**@market-researcher**
```
Scope: Project
Description: Web research specialist using Gemini CLI for current market data.
Instructions: You perform web research using Gemini CLI in headless mode. When given a research task: 1) Format as a clear query, 2) Run: gemini -p "[query]", 3) Compile and summarize results with sources. Specialize in real estate market data, comparable sales, neighborhood analysis, and economic indicators.
Tools: Bash (to run gemini -p), Read, Write
Model: Sonnet
```
**@contract-reviewer**
```
Scope: Project
Description: Reviews purchase agreements, leases, inspection reports, and legal documents.
Instructions: You review real estate documents for red flags, missing clauses, unfavorable terms, and items requiring attention. Flag anything unusual. Present findings in priority order: Critical → Important → Minor. Always note items that need attorney review.
Tools: Read, Write
Model: Sonnet
```
**@outreach-drafter**
```
Scope: Project
Description: Drafts professional communications in the user's voice.
Instructions: You draft emails, texts, and messages to sellers, agents, lenders, contractors, partners, and tenants. Match the user's communication style (loaded from context). Always present drafts for approval — never send directly. Include suggested subject lines for emails.
Tools: Read, Write
Model: Sonnet
```
**@task-manager**
```
Scope: Project
Description: GHL pipeline and task management specialist.
Instructions: You manage the user's GHL pipelines, tasks, and calendar. When asked "what's on my plate?" pull all relevant data and synthesize a prioritized daily briefing. You can create tasks, move opportunities through stages, and schedule events — but always confirm with the user first for any write operations.
Tools: Read, Write, GHL MCP tools
Model: Sonnet
```
**@schedule-optimizer**
```
Scope: Personal
Description: Calendar and time management specialist.
Instructions: You optimize the user's schedule across business and personal calendars. Detect conflicts, suggest optimal time blocks, protect deep work periods, and coordinate logistics (drive times between property viewings, etc.). Reference the user's energy patterns and preferences from context.
Tools: Read, Write, GHL MCP tools (calendar)
Model: Sonnet
```
**@research-assistant**
```
Scope: Personal
Description: General-purpose research using Gemini headless mode.
Instructions: You research any topic using Gemini CLI. Books, articles, investment education, personal interests, product comparisons, travel planning — anything requiring current web data. Present findings in concise, actionable format.
Tools: Bash (gemini -p), Read, Write
Model: Sonnet
```
### Step 18 — Context File Sync System
Every 15 minutes (via PM2 cron), the context-sync process:
1. Reads master `context/claude.md`
2. Syncs content to `context/gemini.md` and `context/agents.md`
3. Updates active deal summaries from GHL
4. Updates current goals from Supabase
5. Commits changes (optional git backup)
---
## PHASE 7: CUSTOM OUTPUT STYLES
### Step 19 — Output Styles for Different Modes
**re-investor** — Concise, numbers-focused. Uses RE investing terminology. Always includes key metrics. Frames everything in ROI and risk terms.
**client-facing** — Professional, warm. Uses client's brand voice. Avoids jargon. Always includes next-step action items.
**personal-assistant** — Casual, brief, friendly. Focuses on what's actionable right now.
**briefing** — Structured executive summary. Leads with most urgent item. Uses bullet format with clear priority indicators.
---
## PHASE 8: SAAS MULTI-TENANCY
### Step 20 — Tenant Provisioning
When a new client signs up through the GHL SaaS:
1. GHL creates sub-account automatically (SaaS mode)
2. OAuth flow completes — system stores tokens in encrypted tenants table
3. Supabase tenant record created with unique tenant_id
4. Client completes onboarding questionnaire (business type, goals, schedule, preferences)
5. System generates personalized system_prompt from questionnaire
6. Default pipelines and custom fields created in their GHL sub-account
7. Default sub-agents assigned based on business type
8. WhatsApp Business number connected (GHL's native WhatsApp integration)
9. AI assistant goes live
### Step 21 — Tenant Isolation
- Supabase RLS: Every query scoped to tenant_id
- GHL API: Every call uses tenant's OAuth token against their locationId
- Agent spawning: Agents load tenant-specific system prompt and context
- Memory: Embeddings and search scoped to tenant
- Logs: All agent execution logs tagged with tenant_id
- Error containment: One tenant's error never affects others
### Step 22 — Per-Tenant Agent Configuration
Stored in tenants.agent_config JSONB:
```json
{
  "enabled_agents": ["deal-analyzer", "task-manager", "outreach-drafter"],
  "custom_agents": [],
  "output_style": "re-investor",
  "voice_enabled": true,
  "proactive_checkins": true,
  "checkin_interval_minutes": 30,
  "gating_overrides": {}
}
```
---
## PHASE 9: RELIABILITY & PRODUCTION-GRADE PATTERNS
### Step 23 — Circuit Breakers
Every external API call (GHL, Supabase, ElevenLabs, Gemini, WhatsApp) wrapped with opossum circuit breaker:
```typescript
const ghlBreaker = new CircuitBreaker(ghlApiCall, {
  timeout: 10000,        // 10s timeout
  errorThresholdPercentage: 50,
  resetTimeout: 30000,   // Try again after 30s
});
ghlBreaker.fallback(() => ({ error: 'GHL temporarily unavailable', queued: true }));
```
### Step 24 — Graceful Degradation
```
If Gemini CLI down    → Orchestrator handles research directly via Claude
If ElevenLabs down    → Voice messages fall back to text responses
If GHL API down       → Actions queued in retry-queue, user notified
If Supabase down      → Local file cache used temporarily, sync when restored
If WhatsApp API down  → Notifications route to Telegram as fallback
```
### Step 25 — Retry Queue
Failed actions stored in a persistent queue:
```typescript
interface QueuedAction {
  id: string;
  tenantId: string;
  action: string;          // e.g., "ghl_create_task"
  payload: any;
  attempts: number;
  maxAttempts: number;     // Default: 3
  nextRetryAt: Date;
  backoffMs: number;       // Doubles each retry
  createdAt: Date;
}
```
PM2 runs a retry processor every 5 minutes to reprocess failed actions.
### Step 26 — Idempotency
All write operations include idempotency keys (hash of action + payload + timestamp-bucket) to prevent duplicate actions on retry.
### Step 27 — Health Checks & Alerting
Health check endpoint runs every 60 seconds:
```
Check: Telegram bot connected?
Check: WhatsApp webhook responding?
Check: Supabase reachable?
Check: GHL API responding?
Check: PM2 processes all running?
Check: Last successful check-in within expected window?
Check: Memory usage within limits?
Check: Error rate below threshold?
```
If any check fails → Alert sent to your personal Telegram.
### Step 28 — Structured Logging
Winston logger with JSON format. Every log entry includes: timestamp, level, tenantId (if applicable), agentName (if applicable), action, duration, and error details. Logs rotate daily, retained for 30 days.
---
## PHASE 10: WINDOWS DEPLOYMENT
### Step 29 — PM2 Ecosystem Configuration
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'telegram-relay',
      script: 'src/relay/telegram-relay.ts',
      interpreter: 'bun',
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
      error_file: 'logs/telegram-error.log',
      out_file: 'logs/telegram-out.log',
    },
    {
      name: 'whatsapp-relay',
      script: 'src/relay/whatsapp-relay.ts',
      interpreter: 'bun',
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
      error_file: 'logs/whatsapp-error.log',
      out_file: 'logs/whatsapp-out.log',
    },
    {
      name: 'smart-checkins',
      script: 'src/checkins/scheduler.ts',
      interpreter: 'bun',
      cron_restart: '*/30 * * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
      error_file: 'logs/checkins-error.log',
      out_file: 'logs/checkins-out.log',
    },
    {
      name: 'context-sync',
      script: 'src/orchestrator/context-sync.ts',
      interpreter: 'bun',
      cron_restart: '*/15 * * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
      error_file: 'logs/sync-error.log',
      out_file: 'logs/sync-out.log',
    },
    {
      name: 'retry-processor',
      script: 'src/reliability/retry-processor.ts',
      interpreter: 'bun',
      cron_restart: '*/5 * * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
      error_file: 'logs/retry-error.log',
      out_file: 'logs/retry-out.log',
    },
    {
      name: 'health-monitor',
      script: 'src/reliability/health-check.ts',
      interpreter: 'bun',
      cron_restart: '* * * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
      error_file: 'logs/health-error.log',
      out_file: 'logs/health-out.log',
    },
  ]
};
```
### Step 30 — Launch Commands
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup                     # Configure auto-start on Windows boot
pm2 monit                       # Real-time monitoring dashboard
```
---
## SECURITY MODEL
### Permission Tiers
```
AUTO-APPROVED (no confirmation needed):
- Read any data (contacts, deals, calendar, memory)
- Search memory
- Generate summaries and analyses
- Transcribe voice messages
- Run Gemini research queries
- Spawn read-only sub-agents
CONFIRMATION REQUIRED (Telegram/WhatsApp button prompt):
- Send messages to contacts through GHL
- Create or update deals/opportunities
- Create or complete tasks
- Schedule calendar events
- Make outbound voice calls
- Move deals between pipeline stages
ADMIN ONLY (never automated):
- Delete any data
- Modify pipeline stage definitions
- Change tenant configurations
- Access other tenants' data
- Modify billing or subscriptions
- Change security settings
```
### Authentication
- Telegram: User ID whitelist (TELEGRAM_ADMIN_USER_ID)
- WhatsApp: Phone number mapped to tenant via GHL sub-account
- GHL API: OAuth tokens per tenant, auto-refreshed
- Supabase: Row-level security with tenant_id scoping
- Voice calls: Caller ID verification
- Claude Code: Local execution, no public ports, `--allowedTools` flag scoping
---
## BUILD ORDER (Recommended)
```
Sprint 1 (Foundation):     Phase 1 Steps 1-3, Phase 2 Steps 4-5
Sprint 2 (Core Loop):      Phase 4 Steps 9-10 (Telegram + WhatsApp text), Phase 3 Steps 7-8
Sprint 3 (GHL Deep):       Phase 2 Step 6-7 (pipelines + MCP tools)
Sprint 4 (Voice):          Phase 4 Steps 11-13
Sprint 5 (Check-ins):      Phase 5 Steps 14-15
Sprint 6 (Multi-Agent):    Phase 6 Steps 16-18, Phase 7 Step 19
Sprint 7 (Reliability):    Phase 9 Steps 23-28
Sprint 8 (SaaS):           Phase 8 Steps 20-22
Sprint 9 (Deployment):     Phase 10 Steps 29-30
Sprint 10 (Polish):        Observability dashboard, onboarding flow, documentation
```
---
## ESTIMATED MONTHLY COSTS
### Personal Use
| Service | Cost |
|---------|------|
| Claude Max 20x | $200 |
| Supabase | Free tier |
| ElevenLabs | $5-22 |
| WhatsApp Business API | $0-15 (conversation pricing) |
| OpenAI Embeddings | $2-5 |
| Gemini CLI | Free |
| **Total** | **~$210-$240/month** |
### SaaS Revenue Model
Charge clients $97-$297/month per sub-account. Claude Code cost is fixed at $200/month regardless of tenant count (within plan limits). Margins improve with each client added. GHL sub-account fees bundled or passed through.
---
## NOTES FOR CLAUDE CODE
When building this project:
- Always implement error handling and circuit breakers from the start — not as an afterthought
- Every external API call must have timeout, retry, and fallback logic
- Every database write must be idempotent
- Every user-facing action must go through the permission tier check
- Use TypeScript strict mode throughout
- Use Zod for runtime validation of all external data (API responses, webhook payloads)
- Log every agent execution with structured JSON logging
- Test each phase independently before integrating
- The system must gracefully handle any single component being temporarily unavailable
- Never expose API keys, tokens, or secrets in logs, error messages, or responses
- All tenant data must be isolated — a query for tenant A must never return tenant B's data
