# Helm

**Your AI-powered command center for business and life.**

Helm is an intelligent assistant that brings together your real estate investments, business operations, and personal productivity into one unified interface. Powered by Claude, it understands context, runs the numbers, and helps you make decisions faster.

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

## Architecture

```
Helm/
├── helm/                     # Python backend (FastAPI)
│   ├── main.py               # Application entry point
│   ├── config.py             # Environment-based configuration
│   ├── assistant/
│   │   ├── engine.py         # Core AI engine (Anthropic Claude)
│   │   ├── prompts.py        # System prompts per mode
│   │   └── memory.py         # Conversation history management
│   ├── api/
│   │   ├── routes.py         # REST + WebSocket endpoints
│   │   └── auth.py           # JWT authentication utilities
│   ├── integrations/
│   │   └── reifundamentals.py  # REIFundamentals Hub connector
│   └── models/
│       ├── schemas.py        # Pydantic request/response models
│       └── database.py       # SQLAlchemy async database setup
├── frontend/                 # Browser-based dashboard
│   ├── index.html            # Single-page application
│   ├── css/styles.css        # Design system (dark/light themes)
│   └── js/app.js             # Client-side logic
├── tests/                    # Test suite
├── docker/                   # Container configuration
└── pyproject.toml            # Python project metadata
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
- [ ] Voice interface (speech-to-text → Helm → text-to-speech)
- [ ] Calendar and email integrations
- [ ] Mobile-responsive PWA
- [ ] Multi-user support with role-based access
- [ ] Automated deal alerts from REIFundamentals Hub webhooks
- [ ] Custom report generation (PDF export)

---

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async)
- **AI Engine:** Anthropic Claude (via official SDK)
- **Frontend:** Vanilla HTML/CSS/JS — fast, no build step
- **Database:** SQLite (dev), PostgreSQL-ready (prod)
- **Deployment:** Docker / Docker Compose

---

Built to put you at the helm.
