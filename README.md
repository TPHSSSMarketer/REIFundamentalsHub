# Helm

**Your AI-powered command center for business and life.**

Helm is an intelligent assistant that works for anyone — real estate investors, entrepreneurs, freelancers, or anyone who wants an AI chief of staff. It combines Claude's intelligence with a modular plugin system so you can connect the tools you actually use. Or run it standalone. It works either way.

Talk to Helm from the **web dashboard**, **Telegram**, **WhatsApp**, or by **voice**.

---

## Core Philosophy

**Everything is optional except the AI.** Helm works out of the box with just an Anthropic API key. Every integration — GoHighLevel, REIFundamentals Hub, Supabase, Telegram, WhatsApp, voice — is a plugin that activates when configured and gracefully stays out of the way when it's not.

---

## What Helm Does

### Business Mode
- Strategic planning and decision analysis
- Financial modeling and KPI tracking
- Communication drafting (emails, proposals, pitch decks)
- Operations management and process optimization

### Real Estate Mode
- Deal analysis — cap rate, cash-on-cash, ROI, 70% rule, BRRRR
- Portfolio tracking (via REIFundamentals Hub or GoHighLevel)
- Market research and comp analysis
- Contract review and LOI drafting

### Personal Mode
- Daily briefings with priorities and insights
- Task management and goal tracking
- Health and wellness coaching
- Research and brainstorming

---

## Channels

| Channel | Description |
|---------|-------------|
| **Web Dashboard** | Full-featured browser UI with chat, portfolio, and deal analyzer |
| **Telegram** | Bot integration — text and voice messages |
| **WhatsApp** | Business Cloud API — text and voice messages |
| **Voice** | Speech-to-text + text-to-speech (Whisper + OpenAI TTS) |
| **REST API** | Direct HTTP integration for custom apps |
| **WebSocket** | Real-time streaming chat |

---

## Plugin System

Helm discovers and registers integrations at startup. Each checks its own config — if API keys are present, it activates. If not, Helm runs without it.

```
GET /api/integrations

{
  "total_registered": 6,
  "total_active": 2,
  "plugins": {
    "telegram": {"active": true, "category": "messaging"},
    "whatsapp": {"active": false, "category": "messaging"},
    "ghl": {"active": true, "category": "crm"},
    "reifundamentals": {"active": false, "category": "crm"},
    "supabase": {"active": false, "category": "memory"},
    "voice": {"active": false, "category": "voice"}
  }
}
```

### Available Plugins

| Plugin | Category | Purpose |
|--------|----------|---------|
| **GoHighLevel** | CRM | Contacts, pipelines, deals, tasks, calendar, conversations |
| **REIFundamentals Hub** | CRM | Real estate portfolio, properties, deal pipeline, market data |
| **Supabase** | Memory | Persistent semantic memory with pgvector embeddings |
| **Telegram** | Messaging | Personal messaging channel via Bot API |
| **WhatsApp** | Messaging | Business messaging via Cloud API |
| **Voice** | Voice | Whisper STT + OpenAI TTS |

---

## Sub-Agents

Helm can delegate specialized tasks to focused AI agents, each with domain expertise:

| Agent | Scope | Description |
|-------|-------|-------------|
| `deal-analyzer` | Project | Real estate deal analysis (cap rate, cash-on-cash, BRRRR, 70% rule) |
| `market-researcher` | Project | Market data, comps, neighborhood analysis |
| `contract-reviewer` | Project | Document review for red flags and missing clauses |
| `outreach-drafter` | Project | Draft emails, texts, and messages in your voice |
| `task-manager` | Project | Pipeline and task prioritization |
| `schedule-optimizer` | Personal | Calendar optimization and conflict detection |
| `health-coach` | Personal | Wellness tracking and accountability |
| `research-assistant` | Personal | General research on any topic |

```
GET /api/agents
```

---

## Smart Check-ins

Helm can proactively reach out when something needs your attention — but only when it's actually useful. The system collects data from all active integrations, analyzes what's actionable, and decides:

- **NONE** — Nothing to report. Stay quiet.
- **TEXT** — Send a message via Telegram/WhatsApp.
- **URGENT** — Time-sensitive. Escalate.

Smart gating prevents spam: quiet hours, cooldowns, topic deduplication.

---

## Reliability

Production-grade patterns built in from day one:

- **Circuit breakers** — external APIs that fail don't cascade
- **Retry queue** — failed actions persist and retry with exponential backoff
- **Health checks** — monitor all components via `/api/health/detailed`
- **Graceful degradation** — if any integration goes down, everything else keeps working

---

## Architecture

```
Helm/
├── helm/
│   ├── main.py                         # FastAPI app entry point
│   ├── config.py                       # Environment-based configuration
│   ├── assistant/
│   │   ├── engine.py                   # Core AI engine (Claude)
│   │   ├── prompts.py                  # System prompts per mode
│   │   ├── memory.py                   # In-memory conversation store
│   │   └── output_styles.py            # re-investor, client-facing, personal, briefing
│   ├── agents/
│   │   └── definitions.py             # Sub-agent definitions and registry
│   ├── api/
│   │   ├── routes.py                   # REST, WebSocket, and webhook endpoints
│   │   └── auth.py                     # JWT authentication
│   ├── integrations/
│   │   ├── registry.py                 # Plugin discovery and registration
│   │   ├── ghl.py                      # GoHighLevel API v2 (optional)
│   │   ├── reifundamentals.py          # REIFundamentals Hub (optional)
│   │   ├── supabase_memory.py          # Supabase semantic memory (optional)
│   │   ├── telegram.py                 # Telegram Bot API (optional)
│   │   ├── whatsapp.py                 # WhatsApp Business API (optional)
│   │   └── voice.py                    # Whisper STT + TTS (optional)
│   ├── checkins/
│   │   └── scheduler.py               # Proactive smart check-in system
│   ├── reliability/
│   │   ├── circuit_breaker.py          # Circuit breaker pattern
│   │   ├── retry_queue.py             # Persistent retry with backoff
│   │   └── health_check.py            # System health monitoring
│   └── models/
│       ├── schemas.py                  # Pydantic models
│       └── database.py                 # SQLAlchemy async setup
├── frontend/                           # Browser dashboard
├── tests/                              # Full test suite
├── docker/                             # Container config
├── CLAUDE.md                           # Full 10-phase project blueprint
└── pyproject.toml
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Install

```bash
git clone <your-repo-url> Helm
cd Helm
python -m venv venv
source venv/bin/activate
pip install -e ".[dev]"
```

### 2. Configure

```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY — that's all you need to start
# Add other API keys to enable integrations (all optional)
```

### 3. Run

```bash
uvicorn helm.main:app --reload
```

Open **http://localhost:8000**.

### 4. Docker

```bash
cd docker && docker compose up --build
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Quick health check |
| `GET` | `/api/health/detailed` | Full system health with all integrations |
| `GET` | `/api/integrations` | List all plugins and their status |
| `GET` | `/api/agents` | List available sub-agents |
| `POST` | `/api/chat` | Send a message to Helm |
| `DELETE` | `/api/chat/{id}` | Clear conversation history |
| `GET` | `/api/portfolio` | Portfolio from REIFundamentals Hub |
| `POST` | `/api/deal/analyze` | AI-powered deal analysis |
| `GET` | `/api/briefing` | Daily briefing |
| `POST` | `/api/checkin/trigger` | Manually trigger a smart check-in |
| `POST` | `/api/telegram/webhook` | Telegram bot webhook |
| `GET/POST` | `/api/whatsapp/webhook` | WhatsApp webhook |
| `POST` | `/api/voice/transcribe` | Audio to text |
| `POST` | `/api/voice/synthesize` | Text to audio |
| `POST` | `/api/voice/chat` | Full voice round-trip |
| `WS` | `/api/ws/chat` | Real-time chat |

---

## Telegram Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot.
2. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_URL` to `.env`.
3. Register the webhook with Telegram.

### Commands
| Command | Description |
|---------|-------------|
| `/start` or `/help` | Welcome and command list |
| `/business <msg>` | Business mode |
| `/re <msg>` | Real Estate mode |
| `/personal <msg>` | Personal mode |
| `/briefing` | Daily briefing |
| *(voice note)* | Auto-transcribed and answered |

---

## WhatsApp Setup

1. Create a [Meta Developer](https://developers.facebook.com/) account.
2. Set up a WhatsApp Business app.
3. Add `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN` to `.env`.
4. Configure webhook URL in Meta Developer Portal.

Mode prefixes: `re:`, `personal:`, `biz:` (default: business).

---

## GoHighLevel Setup (Optional)

1. Register a Custom App in the GHL Developer Marketplace.
2. Complete OAuth flow to get access/refresh tokens.
3. Add `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_ACCESS_TOKEN`, `GHL_LOCATION_ID` to `.env`.

Provides: contacts, pipelines, deals, tasks, calendar, conversations, notes, custom fields.

---

## Supabase Memory Setup (Optional)

1. Create a project at [supabase.com](https://supabase.com).
2. Run the schema SQL from `CLAUDE.md` (Phase 3, Step 7).
3. Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `.env`.

Enables: semantic memory with vector search, persistent conversation logs, goal tracking.

---

## Testing

```bash
pytest
```

---

## Roadmap

- [ ] Persistent conversation storage (PostgreSQL / Redis)
- [ ] Calendar and email integrations
- [ ] ElevenLabs conversational voice agent
- [ ] Mobile-responsive PWA
- [ ] Multi-user support with role-based access
- [ ] WhatsApp voice calls (WebRTC/VoIP)
- [ ] GHL SaaS mode (multi-tenant white-label)
- [ ] Automated deal alerts via webhooks
- [ ] Observability dashboard
- [ ] PDF report generation

---

## Tech Stack

- **AI:** Anthropic Claude (primary), OpenAI Whisper/TTS (voice)
- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async)
- **Frontend:** Vanilla HTML/CSS/JS
- **CRM:** GoHighLevel API v2, REIFundamentals Hub (both optional)
- **Memory:** Supabase + pgvector (optional), SQLite (default)
- **Messaging:** Telegram Bot API, WhatsApp Business Cloud API
- **Reliability:** Circuit breakers, retry queues, health monitoring
- **Deployment:** Docker / Docker Compose

---

Built to put you at the helm.
