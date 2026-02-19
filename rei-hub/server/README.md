# REI Hub Server

Standalone FastAPI backend for REI Fundamentals Hub. Independent of Helm Hub — has its own database, users table, and JWT auth.

## Setup

```bash
cd rei-hub/server
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env        # then edit .env with your secrets
python -m uvicorn main:app --reload --port 8001
```

The server runs on **port 8001** (Helm Hub uses 8000).

## Endpoints

| Method | Path               | Description                        | Auth     |
|--------|--------------------|------------------------------------|----------|
| POST   | /api/auth/register | Register a new user                | Public   |
| POST   | /api/auth/login    | Log in and receive JWT             | Public   |
| GET    | /api/auth/me       | Get current user profile           | Bearer   |
| POST   | /api/auth/refresh  | Refresh an existing JWT            | Bearer   |
| GET    | /health            | Health check                       | Public   |

## Database

Uses SQLite via aiosqlite for local development. The database file `rei_hub.db` is gitignored. Tables are created automatically on startup.

## Environment Variables

See `.env.example` for all configuration options.
