# Helm

**Your AI-powered command center for business and life.**

Helm is an intelligent assistant that brings together your real estate investments, business operations, and personal productivity into one unified interface. Powered by Claude, it understands context, runs the numbers, and helps you make decisions faster.

Talk to Helm from anywhere: the **web dashboard**, **Telegram**, **WhatsApp**, or by **voice**.

---

## What Helm Does

### Business Mode
- Strategic planning and decision analysis
- Financial modeling and KPI tracking
- Communication drafting (emails, proposals, pitch decks)
- Operations management and process optimization

### Real Estate Mode (REIFundamentals Hub Integration)
- Portfolio overview — total value, income, cap rates at a glance
- Deal analysis — cap rate, cash-on-cash, ROI projections, risk scoring
- Market comps and trend data by zip code
- Strategy evaluation: Buy & Hold, Fix & Flip, BRRRR, Wholesale
- Deal pipeline management

### Personal Mode
- Daily briefings with priorities and insights
- Task management and goal tracking
- Research and summarization
- Brainstorming and creative work

---

## Channels

Helm meets you where you are. Every channel routes through the same AI engine, so your context and conversation history stay consistent.

| Channel | Status | Description |
|---------|--------|-------------|
| **Web Dashboard** | Ready | Full-featured browser UI with chat, portfolio, and deal analyzer |
| **Telegram** | Ready | Bot integration — text and voice messages |
| **WhatsApp** | Ready | Business Cloud API — text and voice messages |
| **Voice** | Ready | Speech-to-text + text-to-speech (Whisper + OpenAI TTS) |
| **REST API** | Ready | Direct HTTP integration for custom apps |
| **WebSocket** | Ready | Real-time streaming chat |

---

## Architecture

```
Helm/
├── helm/                       # Python backend (FastAPI)
│   ├── main.py                 # Application entry point
│   ├── config.py               # Environment-based configuration
│   ├── assistant/
│   │   ├── engine.py           # Core AI engine (Anthropic Claude)
│   │   ├── prompts.py          # System prompts per mode
│   │   └── memory.py           # Conversation history management
│   ├── api/
│   │   ├── routes.py           # REST, WebSocket, and webhook endpoints
│   │   └── auth.py             # JWT authentication utilities
│   ├── integrations/
│   │   ├── reifundamentals.py  # REIFundamentals Hub connector
│   │   ├── telegram.py         # Telegram Bot API integration
│   │   ├── whatsapp.py         # WhatsApp Business Cloud API
│   │   └── voice.py            # Speech-to-text & text-to-speech
│   └── models/
│       ├── schemas.py          # Pydantic request/response models
│       └── database.py         # SQLAlchemy async database setup
├── frontend/                   # Browser-based dashboard
│   ├── index.html              # Single-page application
│   ├── css/styles.css          # Design system (dark/light themes)
│   └── js/app.js               # Client-side logic
├── tests/                      # Test suite
├── docker/                     # Container configuration
└── pyproject.toml              # Python project metadata
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Clone & install

```bash
git clone <your-repo-url> Helm
cd Helm
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -e ".[dev]"
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 3. Run

```bash
uvicorn helm.main:app --reload
```

Open **http://localhost:8000** in your browser.

### 4. Run with Docker

```bash
cd docker
docker compose up --build
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/chat` | Send a message to Helm |
| `DELETE` | `/api/chat/{id}` | Clear conversation history |
| `GET` | `/api/portfolio` | Fetch portfolio from REIFundamentals Hub |
| `POST` | `/api/deal/analyze` | AI-powered deal analysis |
| `GET` | `/api/briefing` | Generate daily briefing |
| `WS` | `/api/ws/chat` | Real-time chat via WebSocket |
| `POST` | `/api/telegram/webhook` | Telegram bot webhook |
| `GET` | `/api/whatsapp/webhook` | WhatsApp webhook verification |
| `POST` | `/api/whatsapp/webhook` | WhatsApp inbound messages |
| `POST` | `/api/voice/transcribe` | Upload audio → get text |
| `POST` | `/api/voice/synthesize` | Send text → get audio |
| `POST` | `/api/voice/chat` | Full voice round-trip (audio in → audio out) |

---

## Telegram Setup

1. Message [@BotFather](https://t.me/BotFather) on Telegram and create a new bot.
2. Copy the bot token and add it to `.env`:
   ```
   TELEGRAM_BOT_TOKEN=your-token-here
   TELEGRAM_WEBHOOK_URL=https://yourdomain.com/api/telegram/webhook
   ```
3. Register the webhook (one-time, or Helm can do it at startup):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://yourdomain.com/api/telegram/webhook"}'
   ```

### Telegram Commands
| Command | Description |
|---------|-------------|
| `/start` or `/help` | Welcome message and command list |
| `/business <message>` | Chat in Business mode |
| `/re <message>` | Chat in Real Estate mode |
| `/personal <message>` | Chat in Personal mode |
| `/briefing` | Get your daily briefing |
| *(voice note)* | Automatically transcribed and answered |

---

## WhatsApp Setup

1. Create a [Meta Developer](https://developers.facebook.com/) account.
2. Set up a WhatsApp Business app and go to **WhatsApp → API Setup**.
3. Add credentials to `.env`:
   ```
   WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
   WHATSAPP_ACCESS_TOKEN=your-access-token
   WHATSAPP_VERIFY_TOKEN=helm-whatsapp-verify
   ```
4. Configure the webhook URL in Meta Developer Portal:
   - URL: `https://yourdomain.com/api/whatsapp/webhook`
   - Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to: **messages**

### WhatsApp Mode Prefixes
| Prefix | Mode |
|--------|------|
| `re:` or `real estate:` | Real Estate |
| `personal:` | Personal |
| `biz:` or `business:` | Business |
| *(no prefix)* | Business (default) |

Voice messages are automatically transcribed and answered.

---

## Voice Integration

Helm uses OpenAI Whisper for speech-to-text and OpenAI TTS for text-to-speech.

1. Add your OpenAI API key to `.env`:
   ```
   OPENAI_API_KEY=your-openai-key
   ```
2. Voice is automatically available across all channels:
   - **Web:** Upload audio via `/api/voice/chat`
   - **Telegram:** Send a voice note to the bot
   - **WhatsApp:** Send a voice message

### Configuration options
| Variable | Default | Description |
|----------|---------|-------------|
| `VOICE_STT_MODEL` | `whisper-1` | Whisper model for transcription |
| `VOICE_TTS_MODEL` | `tts-1` | TTS model (`tts-1` or `tts-1-hd`) |
| `VOICE_TTS_VOICE` | `onyx` | Voice: alloy, echo, fable, onyx, nova, shimmer |

---

## REIFundamentals Hub Integration

Helm connects to REIFundamentals Hub through a dedicated integration layer. To enable it:

1. Add your API credentials to `.env`:
   ```
   REIFUNDAMENTALS_API_URL=https://api.reifundamentals.com/v1
   REIFUNDAMENTALS_API_KEY=your-key-here
   ```

2. The integration gracefully degrades — if the Hub is unreachable or unconfigured, Helm continues working with all other features.

### Supported Hub Features
- Portfolio retrieval and property search
- Individual property details
- Deal pipeline management
- Market data and comps by zip code
- Inbound webhook verification

---

## Testing

```bash
pytest
```

---

## Roadmap

- [ ] Persistent conversation storage (PostgreSQL / Redis)
- [ ] Calendar and email integrations
- [ ] Mobile-responsive PWA
- [ ] Multi-user support with role-based access
- [ ] Automated deal alerts from REIFundamentals Hub webhooks
- [ ] Custom report generation (PDF export)
- [ ] Voice in the web dashboard (microphone button)
- [ ] Telegram inline mode (use Helm in any chat)

---

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async)
- **AI Engine:** Anthropic Claude (via official SDK)
- **Voice:** OpenAI Whisper (STT) + OpenAI TTS
- **Messaging:** Telegram Bot API, WhatsApp Business Cloud API
- **Frontend:** Vanilla HTML/CSS/JS — fast, no build step
- **Database:** SQLite (dev), PostgreSQL-ready (prod)
- **Deployment:** Docker / Docker Compose

---

Built to put you at the helm.
