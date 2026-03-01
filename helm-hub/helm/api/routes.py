"""API route definitions — the external surface of Helm.

Domain-specific routes (e.g. real estate) are provided by plugins
and mounted at /api/plugins/{plugin_name}/.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, UploadFile, WebSocket, WebSocketDisconnect

_routes_logger = logging.getLogger(__name__)

from helm.api.middleware import (
    get_current_user,
    optional_auth,
    rate_limit,
    rate_limit_strict,
    rate_limit_webhook,
    get_tenant_scope,
)

from helm.agents.definitions import list_agents
from helm.assistant.engine import helm_engine
from helm.assistant.memory import memory
from helm.checkins.scheduler import checkin_scheduler
from helm.integrations.file_manager import file_manager
from helm.integrations.google_drive import google_drive_client
from helm.integrations.registry import registry
from helm.integrations.telegram import telegram_bot
from helm.integrations.voice import voice_processor
from helm.integrations.whatsapp import whatsapp_client
from helm.integrations.workspace import default_workspace
from helm.models.schemas import (
    AssistantMode,
    ChatRequest,
    ChatResponse,
)
from helm.reliability.breakers import get_all_breaker_status
from helm.reliability.health_check import health_checker
from helm.reliability.retry_queue import retry_queue as _retry_queue

router = APIRouter()


# ── Health ───────────────────────────────────────────────────────────────────


@router.get("/health")
async def health_check():
    from helm.config import get_settings
    _settings = get_settings()
    return {"status": "ok", "environment": _settings.app_env, "version": "1.0.0"}


@router.get("/health/detailed")
async def health_detailed(user: dict = Depends(get_current_user)):
    """Detailed health check with all integration statuses. Requires authentication."""
    return await health_checker.full_check()


# ── Integrations Status ─────────────────────────────────────────────────────


@router.get("/integrations")
async def list_integrations(user: dict = Depends(get_current_user)):
    """List all registered integrations and their status."""
    return registry.get_status_report()


# ── Plugins Status ──────────────────────────────────────────────────────────


@router.get("/plugins")
async def list_plugins(user: dict = Depends(get_current_user)):
    """List all loaded plugins."""
    from helm.plugins import plugin_manager

    return {"plugins": plugin_manager.list_plugins()}


# ── Agents ───────────────────────────────────────────────────────────────────


@router.get("/agents")
async def list_available_agents(scope: str | None = None, user: dict = Depends(get_current_user)):
    """List all available sub-agents (core + plugin-provided)."""
    agents = list_agents(scope)
    return {
        "agents": [
            {
                "name": a.name,
                "description": a.description,
                "scope": a.scope,
                "requires_plugins": a.requires_plugins,
            }
            for a in agents
        ]
    }


# ── Check-ins ────────────────────────────────────────────────────────────────


@router.post("/checkin/trigger")
async def trigger_checkin(user: dict = Depends(get_current_user)):
    """Manually trigger a smart check-in cycle."""
    result = await checkin_scheduler.run_cycle()
    return result


# ── Chat ─────────────────────────────────────────────────────────────────────


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, user: dict = Depends(get_current_user)):
    """Send a message to Helm and receive a response."""
    return await helm_engine.chat(request)


@router.delete("/chat/{conversation_id}")
async def clear_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    """Clear a conversation's history."""
    memory.clear(conversation_id)
    return {"status": "cleared", "conversation_id": conversation_id}


@router.get("/chat/history")
async def list_conversations_route(user: dict = Depends(get_current_user)):
    """List all conversations with metadata for the sidebar."""
    convos = memory.list_conversations_meta()
    return {
        "conversations": [
            {
                "id": c.id,
                "title": c.title,
                "preview": c.preview,
                "message_count": c.message_count,
                "created_at": c.created_at.isoformat(),
                "updated_at": c.updated_at.isoformat(),
            }
            for c in convos
        ]
    }


@router.get("/chat/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    """Load a conversation's full message history."""
    messages = memory.get_full_history(conversation_id)
    if not messages:
        return {"conversation_id": conversation_id, "messages": []}
    return {"conversation_id": conversation_id, "messages": messages}


# ── Briefing ─────────────────────────────────────────────────────────────────


@router.get("/briefing")
async def daily_briefing(user: dict = Depends(get_current_user)):
    """Generate the daily briefing."""
    text = await helm_engine.daily_briefing()
    return {"briefing": text}


# ── WebSocket (real-time chat) ───────────────────────────────────────────────


@router.websocket("/ws/chat")
async def websocket_chat(ws: WebSocket):
    """Real-time chat over WebSocket for the frontend dashboard.

    Authentication: pass ``api_key`` as a query parameter, e.g.
    ``ws://host/api/ws/chat?api_key=YOUR_KEY``
    """
    from helm.api.middleware import _valid_api_keys

    # Verify API key from query params before accepting the connection
    api_key = ws.query_params.get("api_key", "")
    valid_keys = _valid_api_keys()
    if valid_keys and api_key not in valid_keys:
        await ws.close(code=4001, reason="Invalid or missing API key")
        return

    await ws.accept()
    conversation_id: str | None = None
    mode = AssistantMode.BUSINESS

    try:
        while True:
            data = await ws.receive_json()

            if "mode" in data:
                mode = AssistantMode(data["mode"])

            if "conversation_id" in data:
                conversation_id = data["conversation_id"]

            request = ChatRequest(
                message=data.get("message", ""),
                mode=mode,
                conversation_id=conversation_id,
            )

            response = await helm_engine.chat(request)
            conversation_id = response.conversation_id

            await ws.send_json(response.model_dump(mode="json"))

    except WebSocketDisconnect:
        pass


# ── Telegram Webhook ────────────────────────────────────────────────────────


@router.post("/telegram/webhook")
async def telegram_webhook(request: Request, _: None = Depends(rate_limit_webhook)):
    """Receive inbound updates from Telegram."""
    # SECURITY FIX #10: Verify Telegram webhook signature
    from helm.config import get_settings
    _tg_settings = get_settings()
    expected_secret = _tg_settings.telegram_webhook_secret
    if expected_secret:
        header_secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if header_secret != expected_secret:
            _routes_logger.warning("Telegram webhook rejected: invalid secret token")
            raise HTTPException(status_code=403, detail="Invalid webhook secret")

    update = await request.json()
    await telegram_bot.handle_update(update)
    return {"ok": True}


# ── WhatsApp Webhook ────────────────────────────────────────────────────────


@router.get("/whatsapp/webhook")
async def whatsapp_verify(
    hub_mode: str = Query("", alias="hub.mode"),
    hub_verify_token: str = Query("", alias="hub.verify_token"),
    hub_challenge: str = Query("", alias="hub.challenge"),
):
    """Meta webhook verification (GET request)."""
    challenge = whatsapp_client.verify_webhook(hub_mode, hub_verify_token, hub_challenge)
    if challenge is not None:
        return Response(content=challenge, media_type="text/plain")
    return Response(content="Forbidden", status_code=403)


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request, _: None = Depends(rate_limit_webhook)):
    """Receive inbound messages from WhatsApp."""
    # SECURITY FIX #10: Verify WhatsApp X-Hub-Signature-256 (HMAC-SHA256)
    from helm.config import get_settings
    _wa_settings = get_settings()
    app_secret = _wa_settings.whatsapp_app_secret
    if app_secret:
        signature_header = request.headers.get("X-Hub-Signature-256", "")
        body_bytes = await request.body()
        expected_sig = "sha256=" + hmac.new(
            app_secret.encode(), body_bytes, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature_header, expected_sig):
            _routes_logger.warning("WhatsApp webhook rejected: invalid HMAC signature")
            raise HTTPException(status_code=403, detail="Invalid webhook signature")
        # Re-parse the body since we already consumed it
        import json
        payload = json.loads(body_bytes)
    else:
        payload = await request.json()

    await whatsapp_client.handle_webhook(payload)
    return {"status": "ok"}


# ── Slack ────────────────────────────────────────────────────────────────────


@router.post("/slack/webhook")
async def slack_webhook(request: Request, _: None = Depends(rate_limit_webhook)):
    """Receive events from Slack Events API."""
    from helm.integrations.slack import slack_client

    payload = await request.json()
    result = await slack_client.handle_event(payload)
    return result


# ── Microsoft Teams ──────────────────────────────────────────────────────────


@router.post("/teams/webhook")
async def teams_webhook(request: Request, _: None = Depends(rate_limit_webhook)):
    """Receive activities from Microsoft Teams Bot Framework."""
    from helm.integrations.teams import teams_client

    activity = await request.json()
    result = await teams_client.handle_activity(activity)
    return result


# ── Google Chat ──────────────────────────────────────────────────────────────


@router.post("/google-chat/webhook")
async def google_chat_webhook(request: Request, _: None = Depends(rate_limit_webhook)):
    """Receive events from Google Chat."""
    from helm.integrations.google_chat import google_chat_client

    event = await request.json()
    result = await google_chat_client.handle_event(event)
    return result


# ── Voice ───────────────────────────────────────────────────────────────────


@router.post("/voice/transcribe")
async def voice_transcribe(file: UploadFile, user: dict = Depends(get_current_user)):
    """Upload an audio file and get a text transcription."""
    audio_bytes = await file.read()
    text = await voice_processor.transcribe(audio_bytes, filename=file.filename or "audio.ogg")
    if text is None:
        return {"error": "Transcription failed. Check voice API configuration."}
    return {"text": text}


@router.post("/voice/synthesize")
async def voice_synthesize(request: Request, user: dict = Depends(get_current_user)):
    """Convert text to speech. Returns audio bytes."""
    data = await request.json()
    text = data.get("text", "")
    voice = data.get("voice")
    if not text:
        return {"error": "No text provided."}

    audio_bytes = await voice_processor.synthesize(text, voice=voice)
    if audio_bytes is None:
        return {"error": "Speech synthesis failed. Check voice API configuration."}

    return Response(
        content=audio_bytes,
        media_type="audio/ogg",
        headers={"Content-Disposition": "attachment; filename=helm_reply.ogg"},
    )


@router.post("/voice/chat")
async def voice_chat(file: UploadFile, user: dict = Depends(get_current_user)):
    """Full voice round-trip: upload audio → transcribe → AI reply → synthesize."""
    audio_bytes = await file.read()
    reply_text, reply_audio = await voice_processor.voice_chat(
        audio_bytes, filename=file.filename or "audio.ogg"
    )

    if reply_text is None:
        return {"error": "Could not process voice message."}

    if reply_audio:
        import base64

        return {
            "text": reply_text,
            "audio_base64": base64.b64encode(reply_audio).decode(),
        }

    return {"text": reply_text, "audio_base64": None}


# ── File Management ────────────────────────────────────────────────────────


@router.get("/files")
async def list_files(path: str = "/", user: dict = Depends(get_current_user)):
    """List files at a path. Supports prefixes: drive://, ws://, or default."""
    if not file_manager.active_backends:
        return {"path": path, "files": [], "note": "No file backends configured"}
    files = await file_manager.list_files(path)
    return {
        "path": path,
        "files": [
            {
                "name": f.name,
                "path": f.path,
                "mime_type": f.mime_type,
                "size_bytes": f.size_bytes,
                "is_folder": f.is_folder,
                "backend": f.backend,
                "modified_at": f.modified_at.isoformat() if f.modified_at else None,
            }
            for f in files
        ],
    }


@router.get("/files/read")
async def read_file(path: str, user: dict = Depends(get_current_user)):
    """Read a file's contents. Returns base64-encoded data."""
    import base64

    if not file_manager.active_backends:
        return {"error": "No file backends configured", "path": path}
    content = await file_manager.read_file(path)
    if content is None:
        return {"error": "File not found or not readable", "path": path}
    return {
        "path": path,
        "size_bytes": len(content),
        "content_base64": base64.b64encode(content).decode(),
    }


@router.post("/files/write")
async def write_file(request: Request, user: dict = Depends(get_current_user)):
    """Write content to a file."""
    import base64

    data = await request.json()
    path = data.get("path", "")
    if not path:
        return {"error": "No path provided"}
    if not file_manager.active_backends:
        return {"error": "No file backends configured"}

    content_b64 = data.get("content_base64", "")
    content_text = data.get("content_text", "")
    mime_type = data.get("mime_type", "")

    if content_b64:
        content = base64.b64decode(content_b64)
    elif content_text:
        content = content_text.encode("utf-8")
    else:
        return {"error": "No content provided (use content_base64 or content_text)"}

    result = await file_manager.write_file(path, content, mime_type)
    if result is None:
        return {"error": "Failed to write file", "path": path}
    return {"status": "ok", "file": {"name": result.name, "path": result.path, "backend": result.backend}}


@router.post("/files/folder")
async def create_folder(request: Request, user: dict = Depends(get_current_user)):
    """Create a folder at the given path."""
    data = await request.json()
    path = data.get("path", "")
    if not path:
        return {"error": "No path provided"}
    result = await file_manager.create_folder(path)
    if result is None:
        return {"error": "Failed to create folder", "path": path}
    return {"status": "ok", "folder": {"name": result.name, "path": result.path, "backend": result.backend}}


@router.delete("/files")
async def delete_file(path: str, user: dict = Depends(get_current_user)):
    """Delete a file or folder."""
    success = await file_manager.delete_file(path)
    return {"status": "deleted" if success else "not_found", "path": path}


@router.post("/files/move")
async def move_file(request: Request, user: dict = Depends(get_current_user)):
    """Move or rename a file."""
    data = await request.json()
    src = data.get("src", "")
    dst = data.get("dst", "")
    if not src or not dst:
        return {"error": "Both src and dst are required"}
    result = await file_manager.move_file(src, dst)
    if result is None:
        return {"error": "Move failed", "src": src, "dst": dst}
    return {"status": "ok", "file": {"name": result.name, "path": result.path, "backend": result.backend}}


@router.get("/files/search")
async def search_files(q: str, backend: str | None = None, user: dict = Depends(get_current_user)):
    """Search for files by name across backends."""
    results = await file_manager.search_files(q, backend=backend)
    return {
        "query": q,
        "results": [
            {"name": f.name, "path": f.path, "backend": f.backend, "is_folder": f.is_folder}
            for f in results
        ],
    }


@router.get("/files/backends")
async def list_file_backends(user: dict = Depends(get_current_user)):
    """List active file storage backends."""
    return {"backends": file_manager.active_backends}


# ── Virtual Workspace (Tier 2) ────────────────────────────────────────────


@router.post("/workspace/execute")
async def workspace_execute(request: Request, user: dict = Depends(get_current_user)):
    """Execute code in the virtual workspace sandbox. Admin only."""
    # SECURITY FIX #8: Restrict code execution to admin users only
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")

    data = await request.json()
    language = data.get("language", "python")
    code = data.get("code", "")
    timeout = min(data.get("timeout", 30), 30)

    if not code:
        return {"error": "No code provided"}

    if language == "python":
        result = await default_workspace.execute_python(code, timeout=timeout)
    elif language in ("bash", "shell", "sh"):
        result = await default_workspace.execute_shell(code, timeout=timeout)
    else:
        return {"error": f"Unsupported language: {language}. Use 'python' or 'bash'."}

    return result


@router.get("/workspace/usage")
async def workspace_usage(user: dict = Depends(get_current_user)):
    """Get workspace disk usage stats."""
    return default_workspace.get_usage()


# ── Google Drive OAuth ─────────────────────────────────────────────────────


@router.get("/drive/auth/url")
async def drive_auth_url(user: dict = Depends(get_current_user)):
    """Get the Google Drive OAuth consent URL."""
    if not google_drive_client.is_configured:
        return {"error": "Google Drive not configured (missing client_id/secret)"}
    return {"url": google_drive_client.get_auth_url()}


@router.get("/drive/auth/callback")
async def drive_auth_callback(code: str = ""):
    """Handle Google Drive OAuth callback — exchange code for tokens."""
    if not code:
        return {"error": "No authorization code provided"}
    tokens = await google_drive_client.exchange_code(code)
    return {"status": "connected", "has_refresh_token": bool(tokens.get("refresh_token"))}


# ── Context Files ──────────────────────────────────────────────────────────


@router.get("/context/templates")
async def list_context_templates(user: dict = Depends(get_current_user)):
    """List all available context file templates (core + plugins)."""
    from helm.context.templates import list_context_templates as _list

    return {"templates": _list()}


@router.post("/context/provision")
async def provision_context(user: dict = Depends(get_current_user)):
    """Create context files for the default tenant workspace."""
    from helm.context.templates import provision_tenant_context

    result = await provision_tenant_context(default_workspace)
    return result


# ── Onboarding ─────────────────────────────────────────────────────────────


@router.get("/onboarding/questions")
async def onboarding_questions(user: dict = Depends(get_current_user)):
    """Return the onboarding questionnaire for new users."""
    from helm.context.templates import get_onboarding_questions

    return {"questions": get_onboarding_questions()}


@router.post("/onboarding/complete")
async def onboarding_complete(request: Request, user: dict = Depends(get_current_user), _: None = Depends(rate_limit_strict)):
    """Submit onboarding answers and provision personalised context files.

    Body: ``{"answers": {"name": "Alex", "role": "Entrepreneur", ...}}``
    """
    from helm.context.templates import provision_from_onboarding

    data = await request.json()
    answers = data.get("answers", {})
    if not answers:
        return {"error": "No answers provided. Send {\"answers\": {\"name\": \"...\", ...}}"}
    if not answers.get("name"):
        return {"error": "At minimum, a name is required."}

    result = await provision_from_onboarding(default_workspace, answers)
    return result


@router.get("/onboarding/status")
async def onboarding_status(user: dict = Depends(get_current_user)):
    """Check whether the user has completed onboarding."""
    content = await default_workspace.read_file("USER.md")
    if content is None:
        return {"onboarded": False, "reason": "No USER.md found"}

    text = content.decode("utf-8", errors="replace")
    # If the file still has unfilled template placeholders, not onboarded
    if "{name}" in text or ("[Your Name]" in text and "[amount]" in text):
        return {"onboarded": False, "reason": "USER.md contains unfilled placeholders"}

    return {"onboarded": True}


@router.get("/context/{filename:path}")
async def read_context_file(filename: str, user: dict = Depends(get_current_user)):
    """Read a specific context file from the workspace."""
    content = await default_workspace.read_file(filename)
    if content is None:
        return {"error": f"Context file not found: {filename}"}
    return {"filename": filename, "content": content.decode("utf-8", errors="replace")}


@router.put("/context/{filename:path}")
async def update_context_file(filename: str, request: Request, user: dict = Depends(get_current_user)):
    """Update a context file in the workspace."""
    data = await request.json()
    content = data.get("content", "")
    if not content:
        return {"error": "No content provided"}
    result = await default_workspace.write_file(filename, content.encode("utf-8"))
    if result is None:
        return {"error": f"Failed to write: {filename}"}
    return {"status": "ok", "filename": filename, "size_bytes": result.size_bytes}


# ── Web Research (Perplexity via OpenRouter) ──────────────────────────────


@router.post("/research/search")
async def web_research(request: Request, user: dict = Depends(get_current_user)):
    """Quick web research via Perplexity Sonar Pro Search."""
    from helm.integrations.openrouter import openrouter_client

    data = await request.json()
    query = data.get("query", "")
    context = data.get("context", "")
    if not query:
        return {"error": "No query provided"}
    if not openrouter_client.is_configured:
        return {"error": "OpenRouter not configured (set OPENROUTER_API_KEY)"}
    return await openrouter_client.search(query, context=context)


@router.post("/research/deep")
async def deep_research(request: Request, user: dict = Depends(get_current_user)):
    """Deep research via Perplexity Deep Research."""
    from helm.integrations.openrouter import openrouter_client

    data = await request.json()
    query = data.get("query", "")
    context = data.get("context", "")
    if not query:
        return {"error": "No query provided"}
    if not openrouter_client.is_configured:
        return {"error": "OpenRouter not configured (set OPENROUTER_API_KEY)"}
    return await openrouter_client.deep_research(query, context=context)


# ── Model Router Info ─────────────────────────────────────────────────────


@router.post("/router/classify")
async def classify_message(request: Request, user: dict = Depends(get_current_user)):
    """Classify which model tier should handle a message."""
    from helm.orchestrator.multi_ai_router import classify_task, get_model_info

    data = await request.json()
    message = data.get("message", "")
    mode = data.get("mode", "business")
    if not message:
        return {"error": "No message provided"}
    tier = classify_task(message, mode=mode)
    return {"tier": tier, "model": get_model_info(tier)}


# ── Modes & Styles ───────────────────────────────────────────────────────


@router.get("/modes")
async def list_modes(source: str | None = None, user: dict = Depends(get_current_user)):
    """List available assistant modes. Use ?source=core to exclude plugin modes."""
    from helm.assistant.prompts import MODE_PROMPTS, _plugin_mode_prompts

    modes = []
    descriptions = {
        "business": "Strategic planning, financial modeling, operations, communication",
        "personal": "Daily planning, goal tracking, brainstorming, wellness",
        "real_estate": "Deal analysis, comps, market research, portfolio management",
    }

    all_modes = {**MODE_PROMPTS, **_plugin_mode_prompts}
    for mode_key in all_modes:
        mode_source = "plugin" if mode_key in _plugin_mode_prompts else "core"
        if source and mode_source != source:
            continue
        modes.append({
            "id": mode_key,
            "label": mode_key.replace("_", " ").title(),
            "description": descriptions.get(mode_key, ""),
            "source": mode_source,
        })

    return {"modes": modes}


@router.get("/output-styles")
async def list_output_styles(source: str | None = None, user: dict = Depends(get_current_user)):
    """List available output styles. Use ?source=core to exclude plugin styles."""
    from helm.assistant.output_styles import STYLES, _plugin_styles

    styles = []
    descriptions = {
        "default": "Clear, structured, professional",
        "briefing": "Executive summary format, priority-ordered",
        "personal": "Casual, brief, friendly",
        "client-facing": "Professional, warm, action-oriented",
        "re-investor": "Numbers-focused, RE terminology, metrics-first",
    }

    for name in {**STYLES, **_plugin_styles}:
        style_source = "plugin" if name in _plugin_styles else "core"
        if source and style_source != source:
            continue
        styles.append({
            "id": name,
            "label": name.replace("-", " ").replace("_", " ").title(),
            "description": descriptions.get(name, ""),
            "source": style_source,
        })

    return {"styles": styles}


# ── Account ──────────────────────────────────────────────────────────────


@router.get("/account")
async def account_info(user: dict = Depends(get_current_user)):
    """Account profile and plan information."""
    content = await default_workspace.read_file("USER.md")
    user_name = ""
    if content:
        text = content.decode("utf-8", errors="replace")
        # Try to extract name from the USER.md file
        for line in text.splitlines():
            if line.startswith("# ") and "name" not in line.lower():
                user_name = line.lstrip("# ").strip()
                break

    return {
        "name": user_name or "User",
        "plan": "base",  # base | pro | enterprise
        "features": {
            "chat": True,
            "agents": True,
            "voice": True,
            "integrations": True,
            "plugins": False,   # Upsell — requires Pro plan
            "multi_tenant": False,
        },
    }


@router.get("/account/plugins/available")
async def available_plugins(user: dict = Depends(get_current_user)):
    """List plugins available for purchase / activation."""
    from helm.plugins import plugin_manager

    installed = {p["name"] for p in plugin_manager.list_plugins()}

    # Plugin catalog — add new plugins here as they're built
    catalog = [
        {
            "id": "rei",
            "name": "Real Estate Investor",
            "description": "Deal analysis, comps, portfolio tracking, BRRRR calculator. Adds Real Estate mode and RE Investor output style.",
            "price": "Included with Pro",
            "category": "industry",
            "installed": "rei" in installed,
        },
        {
            "id": "ecommerce",
            "name": "E-Commerce",
            "description": "Inventory tracking, order management, supplier comms, pricing optimization.",
            "price": "Included with Pro",
            "category": "industry",
            "installed": False,
            "coming_soon": True,
        },
        {
            "id": "agency",
            "name": "Marketing Agency",
            "description": "Client reporting, campaign management, content calendar, social media scheduling.",
            "price": "Included with Pro",
            "category": "industry",
            "installed": False,
            "coming_soon": True,
        },
        {
            "id": "quickbooks",
            "name": "QuickBooks",
            "description": "Sync invoices, expenses, and financial reports with QuickBooks Online.",
            "price": "$29/mo add-on",
            "category": "software",
            "installed": False,
            "coming_soon": True,
        },
        {
            "id": "google_workspace",
            "name": "Google Workspace",
            "description": "Gmail, Calendar, Drive, and Docs integration for full productivity sync.",
            "price": "Included with Pro",
            "category": "software",
            "installed": False,
            "coming_soon": True,
        },
        {
            "id": "slack",
            "name": "Slack",
            "description": "Receive briefings and manage tasks directly from Slack channels.",
            "price": "Included with Pro",
            "category": "software",
            "installed": False,
            "coming_soon": True,
        },
    ]

    return {"plugins": catalog}


# ── System Info ──────────────────────────────────────────────────────────


@router.get("/system/info")
async def system_info(user: dict = Depends(get_current_user)):
    """Return system-level info for the settings dashboard."""
    from helm.config import get_settings
    from helm.integrations.claude_cli import claude_cli_client
    from helm.integrations.openrouter import openrouter_client

    s = get_settings()
    return {
        "ai_backend": s.ai_backend,
        "backends": {
            "claude_cli": {
                "configured": claude_cli_client.is_configured,
                "label": "Claude CLI (Max subscription)",
            },
            "openrouter": {
                "configured": openrouter_client.is_configured,
                "model": s.openrouter_model,
                "label": "OpenRouter",
            },
            "anthropic": {
                "configured": bool(s.anthropic_api_key and s.anthropic_api_key != "test-key-placeholder"),
                "model": s.anthropic_model,
                "label": "Anthropic API",
            },
        },
        "app_name": s.app_name,
        "app_env": s.app_env,
        "debug": s.app_debug,
    }


# ── GoHighLevel OAuth ─────────────────────────────────────────────────────


@router.get("/ghl/auth/url")
async def ghl_auth_url(user: dict = Depends(get_current_user)):
    """Get the GHL OAuth authorization URL."""
    from helm.integrations.ghl import ghl_client

    url = ghl_client.get_auth_url()
    if not url:
        return {"error": "GHL not configured (missing client_id)"}
    return {"url": url}


@router.get("/ghl/auth/callback")
async def ghl_auth_callback(code: str = ""):
    """Handle GHL OAuth callback — exchange code for tokens."""
    if not code:
        return {"error": "No authorization code provided"}
    from helm.integrations.ghl import ghl_client

    result = await ghl_client.exchange_code(code)
    if "error" in result:
        return {"error": result["error"]}
    return {"status": "connected", "location_id": result.get("locationId")}


@router.get("/ghl/status")
async def ghl_status(user: dict = Depends(get_current_user)):
    """Check GHL connection status."""
    from helm.integrations.ghl import ghl_client

    return ghl_client.get_connection_status()


@router.get("/ghl/tools")
async def ghl_tools(user: dict = Depends(get_current_user)):
    """List available GHL MCP tools."""
    from helm.integrations.ghl import ghl_client

    return {"tools": ghl_client.get_tool_definitions()}


@router.post("/ghl/tools/execute")
async def execute_ghl_tool(request: Request, user: dict = Depends(get_current_user)):
    """Execute a GHL MCP tool call.

    Write operations require explicit confirmation. Pass ``confirmed=true``
    in the JSON body to bypass the confirmation prompt (the caller is
    responsible for having obtained the user's consent).
    """
    from helm.api.permissions import check_tool_permission
    from helm.integrations.ghl import ghl_client

    data = await request.json()
    tool_name = data.get("tool", "")
    params = data.get("params", {})
    confirmed = data.get("confirmed", False)
    if not tool_name:
        return {"error": "No tool name provided"}

    # Permission check -- read-only tools pass through; write tools need
    # either admin privileges or an explicit confirmed flag.
    allowed, reason = check_tool_permission(tool_name, user=user)

    if not allowed and not confirmed:
        return {
            "error": "permission_required",
            "message": reason,
            "tool": tool_name,
            "requires_confirmation": True,
        }

    return await ghl_client.execute_tool(tool_name, params)


@router.get("/ghl/pipelines")
async def ghl_pipelines(user: dict = Depends(get_current_user)):
    """List GHL pipelines."""
    from helm.integrations.ghl import ghl_client

    pipelines = await ghl_client.get_pipelines()
    return {"pipelines": pipelines}


@router.get("/ghl/contacts")
async def ghl_contacts(q: str = "", user: dict = Depends(get_current_user)):
    """Search GHL contacts."""
    from helm.integrations.ghl import ghl_client

    if not q:
        return {"error": "Provide a search query with ?q="}
    contacts = await ghl_client.search_contacts(q)
    return {"contacts": contacts}


# ── Agent Execution ───────────────────────────────────────────────────────


@router.post("/agents/run")
async def run_agent(request: Request, user: dict = Depends(get_current_user)):
    """Run a specific sub-agent on a task."""
    from helm.orchestrator.agent_spawner import agent_spawner

    data = await request.json()
    agent_name = data.get("agent", "")
    task = data.get("task", "")
    context = data.get("context", "")
    mode = data.get("mode", "persona")

    if not agent_name or not task:
        return {"error": "Both 'agent' and 'task' are required"}

    result = await agent_spawner.run_agent(agent_name, task, context=context, mode=mode)
    return {
        "agent": result.agent_name,
        "status": result.status,
        "output": result.output,
        "duration_ms": result.duration_ms,
        "model_used": result.model_used,
        "error": result.error,
    }


@router.post("/agents/run-parallel")
async def run_agents_parallel(request: Request, user: dict = Depends(get_current_user)):
    """Run multiple agents in parallel."""
    from helm.orchestrator.agent_spawner import agent_spawner

    data = await request.json()
    tasks = data.get("tasks", [])
    context = data.get("context", "")

    if not tasks:
        return {"error": "Provide a 'tasks' array with [{agent, task}, ...]"}

    results = await agent_spawner.run_parallel(tasks, context=context)
    return {
        "results": [
            {
                "agent": r.agent_name,
                "status": r.status,
                "output": r.output,
                "duration_ms": r.duration_ms,
                "error": r.error,
            }
            for r in results
        ]
    }


@router.get("/agents/logs")
async def agent_logs(limit: int = 50, user: dict = Depends(get_current_user)):
    """Get recent agent execution logs."""
    try:
        from helm.models.database import AgentLog, async_session
        from sqlalchemy import select

        async with async_session() as session:
            result = await session.execute(
                select(AgentLog).order_by(AgentLog.created_at.desc()).limit(limit)
            )
            logs = result.scalars().all()
            return {
                "logs": [
                    {
                        "id": log.id,
                        "agent_name": log.agent_name,
                        "task": log.task[:200],
                        "status": log.status,
                        "duration_ms": log.duration_ms,
                        "error": log.error,
                        "created_at": log.created_at.isoformat() if log.created_at else None,
                    }
                    for log in logs
                ]
            }
    except Exception as exc:
        return {"logs": [], "error": str(exc)}


# ── Tenant Management ─────────────────────────────────────────────────────


@router.get("/tenants")
async def list_tenants(user: dict = Depends(get_current_user)):
    """List all tenants."""
    from helm.integrations.tenant_manager import tenant_manager

    tenants = await tenant_manager.list_tenants()
    return {"tenants": tenants}


@router.post("/tenants")
async def create_tenant(request: Request, user: dict = Depends(get_current_user), _: None = Depends(rate_limit_strict)):
    """Create a new tenant."""
    from helm.integrations.tenant_manager import tenant_manager

    data = await request.json()
    name = data.get("name", "")
    if not name:
        return {"error": "Tenant name is required"}
    return await tenant_manager.create_tenant(
        name=name,
        ghl_location_id=data.get("ghl_location_id"),
        telegram_chat_id=data.get("telegram_chat_id"),
        whatsapp_phone=data.get("whatsapp_phone"),
    )


@router.get("/tenants/{tenant_id}")
async def get_tenant(tenant_id: str, user: dict = Depends(get_current_user)):
    """Get tenant details."""
    from helm.integrations.tenant_manager import tenant_manager

    tenant = await tenant_manager.get_tenant(tenant_id)
    if not tenant:
        return {"error": "Tenant not found"}
    return tenant


@router.put("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Update tenant configuration."""
    from helm.integrations.tenant_manager import tenant_manager

    data = await request.json()
    result = await tenant_manager.update_tenant(tenant_id, data)
    if not result:
        return {"error": "Tenant not found or update failed"}
    return result


@router.post("/tenants/onboard")
async def onboard_tenant(request: Request, user: dict = Depends(get_current_user)):
    """Full tenant onboarding flow."""
    from helm.integrations.tenant_manager import tenant_manager

    data = await request.json()
    name = data.get("name", "")
    if not name:
        return {"error": "Name is required"}
    return await tenant_manager.provision_from_onboarding(
        name=name,
        business_type=data.get("business_type", ""),
        goals=data.get("goals", []),
        schedule_prefs=data.get("schedule_prefs"),
    )


# ── ElevenLabs Voice ──────────────────────────────────────────────────────


@router.get("/voice/elevenlabs/status")
async def elevenlabs_status(user: dict = Depends(get_current_user)):
    """Check ElevenLabs connection status."""
    from helm.integrations.elevenlabs import elevenlabs_client

    return elevenlabs_client.get_connection_status()


@router.get("/voice/elevenlabs/voices")
async def elevenlabs_voices(user: dict = Depends(get_current_user)):
    """List available ElevenLabs voices."""
    from helm.integrations.elevenlabs import elevenlabs_client

    voices = await elevenlabs_client.list_voices()
    return {"voices": voices}


@router.post("/voice/call/initiate")
async def voice_call_initiate(request: Request, user: dict = Depends(get_current_user), _: None = Depends(rate_limit_strict)):
    """Initiate an outbound WhatsApp VoIP call.

    Sends a permission request to the recipient first. The actual call
    begins only after the user taps [Accept Call].

    Body: ``{"to": "+1234567890", "tenant_id": "optional-tenant-id"}``
    """
    from helm.integrations.whatsapp_calling import whatsapp_calling

    data = await request.json()
    to = data.get("to", "")
    if not to:
        return {"error": "Recipient phone number ('to') is required"}
    return await whatsapp_calling.initiate_call(
        to=to,
        tenant_id=data.get("tenant_id"),
    )


@router.post("/voice/call/webhook")
async def voice_call_webhook(request: Request, _rl: None = Depends(rate_limit_webhook)):
    """Receive WhatsApp Business Calling API webhook events.

    Dispatches incoming, ended, and failed call events to the
    appropriate handlers.
    """
    from helm.integrations.whatsapp_calling import whatsapp_calling

    payload = await request.json()
    return await whatsapp_calling.handle_call_webhook(payload)


@router.get("/voice/call/status")
async def voice_call_status(user: dict = Depends(get_current_user)):
    """Check WhatsApp calling integration status and active calls."""
    from helm.integrations.whatsapp_calling import whatsapp_calling

    return whatsapp_calling.get_connection_status()


@router.post("/voice/elevenlabs/synthesize")
async def elevenlabs_synthesize(request: Request, user: dict = Depends(get_current_user)):
    """Synthesize text using ElevenLabs TTS."""
    from helm.integrations.elevenlabs import elevenlabs_client

    data = await request.json()
    text = data.get("text", "")
    if not text:
        return {"error": "No text provided"}

    audio = await elevenlabs_client.synthesize(
        text,
        voice_id=data.get("voice_id"),
        model_id=data.get("model_id", "eleven_turbo_v2_5"),
    )
    if not audio:
        return {"error": "ElevenLabs synthesis failed or not configured"}

    import base64
    return {
        "audio_base64": base64.b64encode(audio).decode(),
        "format": "mp3",
        "size_bytes": len(audio),
    }


# ── Goals ─────────────────────────────────────────────────────────────────


@router.get("/goals")
async def list_goals(status: str = "active", user: dict = Depends(get_current_user)):
    """List goals."""
    try:
        from helm.models.database import Goal, async_session
        from sqlalchemy import select

        async with async_session() as session:
            query = select(Goal).order_by(Goal.created_at.desc())
            if status:
                query = query.where(Goal.status == status)
            result = await session.execute(query.limit(50))
            goals = result.scalars().all()
            return {
                "goals": [
                    {
                        "id": g.id,
                        "goal": g.goal,
                        "status": g.status,
                        "target_date": g.target_date,
                        "progress_notes": g.progress_notes or [],
                        "created_at": g.created_at.isoformat() if g.created_at else None,
                    }
                    for g in goals
                ]
            }
    except Exception as exc:
        return {"goals": [], "error": str(exc)}


@router.post("/goals")
async def create_goal(request: Request, user: dict = Depends(get_current_user), _: None = Depends(rate_limit_strict)):
    """Create a new goal."""
    try:
        from helm.models.database import Goal, async_session

        data = await request.json()
        goal_text = data.get("goal", "")
        if not goal_text:
            return {"error": "Goal text is required"}

        async with async_session() as session:
            goal = Goal(
                goal=goal_text,
                status="active",
                target_date=data.get("target_date"),
                tenant_id=data.get("tenant_id"),
            )
            session.add(goal)
            await session.commit()
            await session.refresh(goal)
            return {"id": goal.id, "goal": goal.goal, "status": goal.status}
    except Exception as exc:
        return {"error": str(exc)}


@router.put("/goals/{goal_id}")
async def update_goal(goal_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Update a goal's status or notes."""
    try:
        from helm.models.database import Goal, async_session
        from sqlalchemy import select

        data = await request.json()
        async with async_session() as session:
            result = await session.execute(
                select(Goal).where(Goal.id == goal_id)
            )
            goal = result.scalar_one_or_none()
            if not goal:
                return {"error": "Goal not found"}

            if "status" in data:
                goal.status = data["status"]
            if "progress_note" in data:
                notes = goal.progress_notes or []
                notes.append({"note": data["progress_note"], "at": datetime.now(timezone.utc).isoformat()})
                goal.progress_notes = notes

            await session.commit()
            return {"id": goal.id, "status": goal.status}
    except Exception as exc:
        return {"error": str(exc)}


# ── Reliability ──────────────────────────────────────────────────────────────


@router.get("/reliability/breakers")
async def circuit_breaker_status(user: dict = Depends(get_current_user)):
    """Return the status of all circuit breakers."""
    return get_all_breaker_status()


@router.get("/reliability/retry-queue")
async def retry_queue_status(user: dict = Depends(get_current_user)):
    """Return the current retry queue status."""
    return _retry_queue.get_status()


@router.post("/reliability/retry-queue/process")
async def process_retry_queue(user: dict = Depends(get_current_user)):
    """Manually trigger processing of the retry queue."""
    result = await _retry_queue.process()
    return result


# ── GHL SaaS Webhooks ────────────────────────────────────────────────────────


@router.post("/ghl/saas/webhook")
async def ghl_saas_webhook(request: Request, _: None = Depends(rate_limit_webhook)):
    """Handle GHL SaaS Mode webhooks (app install / uninstall)."""
    from helm.integrations.ghl_saas import ghl_saas

    payload = await request.json()
    event_type = payload.get("event") or payload.get("type", "")
    if not event_type:
        return {"error": "Missing event type in webhook payload"}
    return await ghl_saas.handle_webhook(event_type, payload)


# ── SaaS Onboarding ─────────────────────────────────────────────────────────


@router.get("/onboarding/saas/questions")
async def saas_onboarding_questions(user: dict = Depends(get_current_user)):
    """Return the SaaS onboarding questionnaire for new tenants."""
    from helm.integrations.ghl_saas import ghl_saas

    return {"questions": ghl_saas.get_onboarding_questions()}


@router.post("/onboarding/saas/process/{tenant_id}")
async def process_saas_onboarding(tenant_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Process SaaS onboarding questionnaire answers for a tenant."""
    from helm.integrations.ghl_saas import ghl_saas

    data = await request.json()
    answers = data.get("answers", {})
    if not answers:
        return {"error": "No answers provided. Send {\"answers\": {...}}"}
    return await ghl_saas.process_onboarding_answers(tenant_id, answers)
