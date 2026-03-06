"""AI Underwriting Routes — deep deal analysis powered by Kimi K2 Thinking + DeepSeek R1 math validation."""

from __future__ import annotations

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import base64
import uuid

from rei.api.deps import get_current_user, get_db, workspace_user_id
from rei.config import get_settings, Settings
from rei.models.crm import CrmDeal, DealFile
from rei.models.user import User
from rei.services.ai_service import ai_complete
from rei.services.attom_property_service import lookup_property_data
from rei.services.underwriting_pdf import generate_underwriting_pdf, underwriting_pdf_filename

logger = logging.getLogger(__name__)

underwriting_router = APIRouter(
    prefix="/underwriting",
    tags=["underwriting"],
)


def _build_deal_schema(deal: CrmDeal) -> dict:
    """Extract all relevant financial fields from a CRM deal into a flat dict."""
    return {
        "title": deal.title or "",
        "address": deal.address or "",
        "city": deal.city or "",
        "state": deal.state or "",
        "zip": deal.zip or "",
        "property_type": deal.property_type or "",
        "bedrooms": deal.bedrooms,
        "bathrooms": deal.bathrooms,
        "square_footage": deal.square_footage,
        "year_built": deal.year_built,
        "property_condition": deal.property_condition or "",
        # Pricing
        "list_price": deal.list_price,
        "offer_price": deal.offer_price,
        "purchase_price": deal.purchase_price,
        "arv": deal.arv,
        "as_is_value": deal.as_is_value,
        # Rehab
        "rehab_estimate": deal.rehab_estimate,
        "rehab_actual": deal.rehab_actual,
        # Financing
        "loan_amount": deal.loan_amount,
        "interest_rate": deal.interest_rate,
        "loan_term_months": deal.loan_term_months,
        "monthly_mortgage_pi": deal.monthly_mortgage_pi,
        "down_payment": deal.down_payment,
        # Income
        "monthly_rent": deal.monthly_rent,
        "other_monthly_income": deal.other_monthly_income,
        # Expenses
        "property_tax_annual": deal.property_tax_annual,
        "insurance_annual": deal.insurance_annual,
        "property_mgmt_percent": deal.property_mgmt_percent,
        "vacancy_percent": deal.vacancy_percent,
        "maintenance_percent": deal.maintenance_percent,
        "hoa_monthly": deal.hoa_monthly,
        "utilities_monthly": deal.utilities_monthly,
        # Computed
        "all_in_cost": deal.all_in_cost,
        "monthly_cash_flow": deal.monthly_cash_flow,
        "cap_rate": deal.cap_rate,
        "cash_on_cash": deal.cash_on_cash,
        "roi_percent": deal.roi_percent,
        # Seller info
        "motivation_level": deal.motivation_level or "",
        "reason_for_selling": deal.reason_for_selling or "",
        "mortgage_balance": deal.mortgage_balance,
        "exit_strategy": deal.exit_strategy or "",
        # Foreclosure
        "foreclosure_status": deal.foreclosure_status or "",
        "auction_date": str(deal.auction_date) if deal.auction_date else None,
    }


def _build_underwriting_prompt(deal_data: dict, attom_data: dict) -> str:
    """Build the system prompt for the underwriting analysis."""
    prompt = """You are an expert real estate underwriting analyst. Analyze the following deal data and provide a comprehensive underwriting assessment.

DEAL FINANCIAL DATA:
"""
    for key, value in deal_data.items():
        if value is not None and value != "":
            label = key.replace("_", " ").title()
            prompt += f"  {label}: {value}\n"

    if attom_data and any(attom_data.values()):
        prompt += "\nATTOM PROPERTY DATA:\n"

        if attom_data.get("property_detail"):
            prompt += "  Property Detail:\n"
            for k, v in attom_data["property_detail"].items():
                if v:
                    prompt += f"    {k.replace('_', ' ').title()}: {v}\n"

        if attom_data.get("tax_assessment"):
            prompt += "  Tax Assessment:\n"
            for k, v in attom_data["tax_assessment"].items():
                if v:
                    prompt += f"    {k.replace('_', ' ').title()}: {v}\n"

        if attom_data.get("sale_history"):
            prompt += "  Sale History:\n"
            for sale in attom_data["sale_history"][:5]:
                prompt += f"    - {sale.get('sale_date', '?')}: ${sale.get('sale_price', '?')} ({sale.get('sale_type', '')})\n"

        if attom_data.get("lien_records"):
            prompt += "  Liens/Mortgages:\n"
            for lien in attom_data["lien_records"]:
                prompt += f"    - {lien.get('type', '?')}: ${lien.get('amount', '?')} by {lien.get('lender', '?')}\n"
    else:
        prompt += "\nNote: ATTOM property data was not available for this analysis. Assessment is based on CRM data only.\n"

    prompt += """
INSTRUCTIONS:
Provide your analysis as a JSON object with EXACTLY this structure:
{
    "score": <integer 1-100, where 100 is the best possible deal>,
    "rating": "<one of: STRONG_BUY, BUY, HOLD, NEGOTIATE, PASS>",
    "risk_flags": [
        {"flag": "<short risk description>", "severity": "<high|medium|low>", "detail": "<explanation>"}
    ],
    "strengths": [
        "<strength 1>",
        "<strength 2>"
    ],
    "comp_analysis": [
        {"description": "<comp description>", "sale_price": "<price>", "sale_date": "<date>", "relevance": "<why this comp matters>"}
    ],
    "memo": "<A 3-5 paragraph narrative underwriting memo covering: deal overview, financial analysis, risk assessment, market context, and final recommendation. Write in professional but accessible language.>",
    "recommendation": "<BUY|PASS|NEGOTIATE>",
    "recommended_offer": <suggested offer price as number or null if insufficient data>,
    "max_allowable_offer": <maximum price that still makes sense as number or null>
}

SCORING GUIDE:
- 80-100: Strong deal, minimal risk, solid returns
- 60-79: Good deal with manageable risks
- 40-59: Marginal deal, significant concerns
- 20-39: Poor deal, major red flags
- 1-19: Walk away

Return ONLY the JSON object, no markdown formatting or extra text."""

    return prompt


def _build_validation_prompt(deal_data: dict, analysis: dict) -> str:
    """Build the prompt for DeepSeek R1 to validate the underwriting math."""
    # Extract the key financial numbers from the deal
    numbers = {}
    financial_fields = [
        "list_price", "offer_price", "purchase_price", "arv", "as_is_value",
        "rehab_estimate", "rehab_actual", "loan_amount", "interest_rate",
        "loan_term_months", "monthly_mortgage_pi", "down_payment",
        "monthly_rent", "other_monthly_income", "property_tax_annual",
        "insurance_annual", "property_mgmt_percent", "vacancy_percent",
        "maintenance_percent", "hoa_monthly", "utilities_monthly",
        "all_in_cost", "monthly_cash_flow", "cap_rate", "cash_on_cash",
        "roi_percent", "mortgage_balance",
    ]
    for field in financial_fields:
        val = deal_data.get(field)
        if val is not None and val != "":
            numbers[field] = val

    prompt = f"""You are a real estate math validation engine. Your ONLY job is to independently verify the financial calculations in an underwriting report.

DEAL FINANCIAL DATA (raw numbers from the CRM):
{json.dumps(numbers, indent=2)}

UNDERWRITING REPORT TO VALIDATE (produced by another AI model):
- Score: {analysis.get('score', 'N/A')}
- Rating: {analysis.get('rating', 'N/A')}
- Recommended Offer: {analysis.get('recommended_offer', 'N/A')}
- Max Allowable Offer: {analysis.get('max_allowable_offer', 'N/A')}

INSTRUCTIONS:
Using the raw deal numbers above, independently recalculate the following metrics. Then compare your calculations to the underwriting report's conclusions.

Calculations to verify:
1. Monthly Cash Flow = Monthly Rent + Other Income - Mortgage PI - (Property Tax / 12) - (Insurance / 12) - HOA - Utilities - (Rent × Management%) - (Rent × Vacancy%) - (Rent × Maintenance%)
2. Cap Rate = (Annual Net Operating Income / Purchase Price) × 100
3. Cash-on-Cash Return = (Annual Cash Flow / Total Cash Invested) × 100
4. ROI = ((Total Annual Return) / Total Investment) × 100
5. 70% Rule Max Offer = (ARV × 0.70) - Rehab Estimate
6. All-In Cost = Purchase Price + Rehab Estimate + Closing Costs (estimate 3%)

For each calculation:
- Show your work step by step
- State your calculated result
- Compare to the CRM value or underwriting report value
- Flag any discrepancy greater than 5%

Return your response as a JSON object with EXACTLY this structure:
{{
    "validated": <true if all major calculations check out, false if significant errors found>,
    "confidence": "<high|medium|low>",
    "checks": [
        {{
            "metric": "<name of metric>",
            "calculated_value": <your independently calculated number or null if insufficient data>,
            "reported_value": <the value from CRM or underwriting report>,
            "status": "<pass|fail|warning|skipped>",
            "note": "<brief explanation, show your math>"
        }}
    ],
    "discrepancies": [
        "<plain English description of any significant math errors found>"
    ],
    "summary": "<1-2 sentence overall assessment of the math accuracy>"
}}

If data is missing for a calculation, mark it as "skipped" with a note explaining what's missing.
Return ONLY the JSON object, no markdown formatting or extra text."""

    return prompt


@underwriting_router.post("/{deal_id}/analyze")
async def analyze_deal(
    deal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Run AI underwriting analysis on a deal."""
    # Fetch the deal
    result = await db.execute(
        select(CrmDeal).where(CrmDeal.id == deal_id, CrmDeal.user_id == user.id)
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    # Build deal data schema
    deal_data = _build_deal_schema(deal)

    # Fetch ATTOM data if available
    attom_data = {}
    if deal.address and deal.city and deal.state:
        try:
            attom_data = await lookup_property_data(
                address=deal.address,
                city=deal.city or "",
                state=deal.state or "",
                zip_code=deal.zip or "",
                db=db,
            )
        except Exception as exc:
            logger.warning("ATTOM lookup failed for deal %s: %s", deal_id, exc)

    # Build prompt and call AI
    prompt = _build_underwriting_prompt(deal_data, attom_data)
    messages = [{"role": "user", "content": prompt}]

    ai_result = await ai_complete(
        messages=messages,
        user_id=user.id,
        db=db,
        settings=settings,
        task_type="underwriting",
        max_tokens=4000,
        temperature=0.2,
    )

    # Parse the AI response
    response_text = ai_result.get("content", "")

    # Clean up markdown formatting if present
    if "```json" in response_text:
        response_text = response_text.split("```json")[1].split("```")[0]
    elif "```" in response_text:
        response_text = response_text.split("```")[1].split("```")[0]

    try:
        analysis = json.loads(response_text.strip())
    except json.JSONDecodeError:
        logger.error("Failed to parse underwriting JSON: %s", response_text[:500])
        raise HTTPException(
            status_code=500,
            detail="AI returned an invalid response. Please try again.",
        )

    # Add metadata
    analysis["analyzed_at"] = datetime.utcnow().isoformat()
    analysis["provider"] = ai_result.get("provider", "")
    analysis["model"] = ai_result.get("model", "")
    analysis["tokens_used"] = ai_result.get("tokens_used", 0)
    analysis["attom_available"] = bool(attom_data)

    # ── Phase 2: DeepSeek R1 Math Validation ──────────────────────────────
    # Run a second AI call to independently verify the financial calculations.
    # This is a safety net — if validation fails, we still return the analysis.
    try:
        validation_prompt = _build_validation_prompt(deal_data, analysis)
        validation_messages = [{"role": "user", "content": validation_prompt}]

        validation_result = await ai_complete(
            messages=validation_messages,
            user_id=user.id,
            db=db,
            settings=settings,
            task_type="math_validation",
            max_tokens=3000,
            temperature=0.1,  # Very low — we want deterministic math
        )

        validation_text = validation_result.get("content", "")
        # Thinking models (DeepSeek R1) may put JSON in reasoning_content
        if not validation_text or not validation_text.strip():
            validation_text = validation_result.get("reasoning_content", "")

        # Clean up markdown formatting if present
        if validation_text and "```json" in validation_text:
            validation_text = validation_text.split("```json")[1].split("```")[0]
        elif validation_text and "```" in validation_text:
            validation_text = validation_text.split("```")[1].split("```")[0]

        validation = json.loads(validation_text.strip())

        # Add validation metadata
        validation["validator_provider"] = validation_result.get("provider", "")
        validation["validator_model"] = validation_result.get("model", "")
        validation["validator_tokens"] = validation_result.get("tokens_used", 0)

        analysis["math_validation"] = validation
        analysis["tokens_used"] = (
            analysis.get("tokens_used", 0) + validation_result.get("tokens_used", 0)
        )

        logger.info(
            "Math validation complete for deal %s: validated=%s, checks=%d",
            deal_id,
            validation.get("validated"),
            len(validation.get("checks", [])),
        )

    except json.JSONDecodeError:
        logger.warning("Math validation returned invalid JSON for deal %s", deal_id)
        analysis["math_validation"] = {
            "validated": None,
            "summary": "Validation returned an invalid response. Underwriting analysis is still valid.",
            "checks": [],
            "discrepancies": [],
        }
    except Exception as exc:
        logger.warning("Math validation failed for deal %s: %s", deal_id, exc)
        analysis["math_validation"] = {
            "validated": None,
            "summary": f"Validation unavailable: {str(exc)[:100]}",
            "checks": [],
            "discrepancies": [],
        }

    # Save analysis to deal
    deal.underwriting_data = json.dumps(analysis)

    # ── Generate PDF report and save to deal files ────────────────────────
    try:
        # Fetch deal photos for the report (front photo first, then up to 5 more)
        photos_result = await db.execute(
            select(DealFile).where(
                DealFile.deal_id == deal_id,
                DealFile.user_id == user.id,
                DealFile.file_type == "photo",
            )
        )
        all_photos = photos_result.scalars().all()

        # Sort: "front" category first, then by creation date
        sorted_photos = sorted(
            all_photos,
            key=lambda p: (0 if p.category == "front" else 1, p.created_at or datetime.min),
        )
        photo_dicts = [
            {"file_content": p.file_content, "category": p.category}
            for p in sorted_photos[:6]
        ]

        # Generate the PDF
        pdf_bytes = generate_underwriting_pdf(
            analysis=analysis,
            deal_data=deal_data,
            deal_title=deal.title or "",
            deal_photos=photo_dicts if photo_dicts else None,
        )

        # Save PDF as a deal file
        pdf_filename = underwriting_pdf_filename(deal_data)
        pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

        # Remove any existing underwriting PDF to avoid duplicates
        existing_pdfs = await db.execute(
            select(DealFile).where(
                DealFile.deal_id == deal_id,
                DealFile.user_id == workspace_user_id(user),
                DealFile.category == "underwriting_report",
            )
        )
        for old_pdf in existing_pdfs.scalars().all():
            await db.delete(old_pdf)

        new_file = DealFile(
            id=str(uuid.uuid4()),
            user_id=workspace_user_id(user),
            deal_id=deal_id,
            file_type="document",
            category="underwriting_report",
            file_name=pdf_filename,
            mime_type="application/pdf",
            file_size=len(pdf_bytes),
            file_content=pdf_b64,
            notes="AI-generated underwriting report",
            transaction_phase="buying",
        )
        db.add(new_file)

        analysis["pdf_file_id"] = new_file.id
        analysis["pdf_file_name"] = pdf_filename
        # Update the stored JSON with PDF reference
        deal.underwriting_data = json.dumps(analysis)

        logger.info("Generated underwriting PDF for deal %s: %s (%d bytes)", deal_id, pdf_filename, len(pdf_bytes))

    except Exception as exc:
        logger.warning("Failed to generate underwriting PDF for deal %s: %s", deal_id, exc)
        # Don't fail the whole request — the analysis is still valid

    await db.commit()

    return analysis


@underwriting_router.get("/{deal_id}")
async def get_underwriting(
    deal_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the most recent saved underwriting analysis for a deal."""
    result = await db.execute(
        select(CrmDeal).where(CrmDeal.id == deal_id, CrmDeal.user_id == user.id)
    )
    deal = result.scalar_one_or_none()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    if not deal.underwriting_data:
        return {"has_analysis": False}

    try:
        analysis = json.loads(deal.underwriting_data)
        analysis["has_analysis"] = True
        return analysis
    except json.JSONDecodeError:
        return {"has_analysis": False}
