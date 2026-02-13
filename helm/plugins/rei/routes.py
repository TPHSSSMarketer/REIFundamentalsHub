"""RE-specific API routes — mounted at /api/plugins/rei/."""

from __future__ import annotations

from fastapi import APIRouter, Request

from helm.plugins.rei.schemas import DealAnalysisRequest, PortfolioOverview

router = APIRouter()


# ── Portfolio ───────────────────────────────────────────────────────────────


@router.get("/portfolio", response_model=PortfolioOverview)
async def get_portfolio():
    """Fetch the user's portfolio overview from REIFundamentals Hub."""
    from helm.integrations.registry import registry

    rei = registry.get("reifundamentals")
    if rei is None:
        return PortfolioOverview()
    return await rei.get_portfolio()


# ── Deal Analysis ──────────────────────────────────────────────────────────


@router.post("/deal/analyze")
async def analyze_deal(request: DealAnalysisRequest):
    """Run an AI-powered analysis on a potential deal."""
    from helm.assistant.engine import helm_engine
    from helm.models.schemas import AssistantMode, ChatRequest

    prompt = (
        f"/opus Analyze this potential real estate deal:\n"
        f"- Address: {request.address}\n"
        f"- Purchase Price: ${request.purchase_price:,.2f}\n"
        f"- Rehab Cost: ${request.rehab_cost:,.2f}\n"
    )
    if request.after_repair_value:
        prompt += f"- After Repair Value (ARV): ${request.after_repair_value:,.2f}\n"
    if request.monthly_rent:
        prompt += f"- Expected Monthly Rent: ${request.monthly_rent:,.2f}\n"
    prompt += (
        f"- Strategy: {request.strategy}\n\n"
        "Provide a thorough analysis including cap rate, cash-on-cash return, "
        "ROI projection, risk factors, and your verdict. Show all math."
    )

    chat_request = ChatRequest(
        message=prompt,
        mode=AssistantMode.REAL_ESTATE,
    )
    return await helm_engine.chat(chat_request)


# ── RE Research (Perplexity via OpenRouter) ────────────────────────────────


@router.post("/research/comps")
async def research_comps(request: Request):
    """Research comparable sales for a property address."""
    from helm.integrations.openrouter import openrouter_client

    data = await request.json()
    address = data.get("address", "")
    if not address:
        return {"error": "No address provided"}
    if not openrouter_client.is_configured:
        return {"error": "OpenRouter not configured (set OPENROUTER_API_KEY)"}
    return await openrouter_client.research_comps(address)


@router.post("/research/neighborhood")
async def research_neighborhood(request: Request):
    """Research neighborhood data for a property address."""
    from helm.integrations.openrouter import openrouter_client

    data = await request.json()
    address = data.get("address", "")
    if not address:
        return {"error": "No address provided"}
    if not openrouter_client.is_configured:
        return {"error": "OpenRouter not configured (set OPENROUTER_API_KEY)"}
    return await openrouter_client.research_neighborhood(address)


@router.post("/research/market")
async def research_market(request: Request):
    """Research market conditions for a city/metro area."""
    from helm.integrations.openrouter import openrouter_client

    data = await request.json()
    market = data.get("market", "")
    if not market:
        return {"error": "No market provided"}
    if not openrouter_client.is_configured:
        return {"error": "OpenRouter not configured (set OPENROUTER_API_KEY)"}
    return await openrouter_client.research_market(market)
