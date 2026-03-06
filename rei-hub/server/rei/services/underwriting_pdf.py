"""Generate a professional PDF underwriting report from AI analysis data."""

from __future__ import annotations

import base64
import io
import logging
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    PageBreak,
    Image,
)
from reportlab.graphics.shapes import Drawing, Rect, String, Circle, Wedge
from reportlab.graphics import renderPDF
from reportlab.graphics.charts.piecharts import Pie
from reportlab.pdfgen import canvas as pdf_canvas

logger = logging.getLogger(__name__)

# ── Color palette ──────────────────────────────────────────────────────

BRAND_PRIMARY = colors.HexColor("#6366F1")  # Indigo
BRAND_DARK = colors.HexColor("#1E293B")  # Slate 800
BRAND_LIGHT = colors.HexColor("#F8FAFC")  # Slate 50
GREEN = colors.HexColor("#10B981")
AMBER = colors.HexColor("#F59E0B")
RED = colors.HexColor("#EF4444")
BLUE = colors.HexColor("#3B82F6")
SLATE_300 = colors.HexColor("#CBD5E1")
SLATE_500 = colors.HexColor("#64748B")
SLATE_700 = colors.HexColor("#334155")
WHITE = colors.white


# ── Score visual ───────────────────────────────────────────────────────

def _score_color(score: int) -> colors.HexColor:
    if score >= 70:
        return GREEN
    elif score >= 40:
        return AMBER
    return RED


def _rating_label(rating: str) -> str:
    return {
        "STRONG_BUY": "STRONG BUY",
        "BUY": "BUY",
        "HOLD": "HOLD",
        "NEGOTIATE": "NEGOTIATE",
        "PASS": "PASS",
    }.get(rating, rating)


# ── Custom page numbering ─────────────────────────────────────────────

class _NumberedCanvas(pdf_canvas.Canvas):
    """Canvas subclass that adds page numbers and a footer."""

    def __init__(self, *args, **kwargs):
        self._disclaimer = kwargs.pop("disclaimer", "")
        pdf_canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            pdf_canvas.Canvas.showPage(self)
        pdf_canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.setFont("Helvetica", 8)
        self.setFillColor(SLATE_500)
        text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(letter[0] - 0.75 * inch, 0.5 * inch, text)
        self.drawString(
            0.75 * inch, 0.5 * inch,
            "REI Fundamentals Hub — Underwriting Report"
        )


# ── Main PDF generation ───────────────────────────────────────────────

def generate_underwriting_pdf(
    analysis: dict,
    deal_data: dict,
    deal_title: str = "",
    deal_photos: list[dict] | None = None,
) -> bytes:
    """Generate a professionally formatted PDF underwriting report.

    Args:
        analysis: The full underwriting analysis dict (from AI)
        deal_data: The deal's financial data dict
        deal_title: Human-readable deal title
        deal_photos: Optional list of deal photos as
                     [{"file_content": base64_str, "category": "front", ...}]

    Returns:
        PDF content as bytes
    """
    buf = io.BytesIO()

    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        topMargin=0.75 * inch,
        bottomMargin=0.85 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()
    story = []

    # ── Custom styles ──
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=22,
        textColor=BRAND_DARK,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=11,
        textColor=SLATE_500,
        spaceAfter=16,
    )
    heading_style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Heading2"],
        fontSize=14,
        textColor=BRAND_PRIMARY,
        spaceBefore=16,
        spaceAfter=8,
        fontName="Helvetica-Bold",
    )
    subheading_style = ParagraphStyle(
        "SubHeading",
        parent=styles["Heading3"],
        fontSize=11,
        textColor=SLATE_700,
        spaceBefore=10,
        spaceAfter=4,
        fontName="Helvetica-Bold",
    )
    body_style = ParagraphStyle(
        "ReportBody",
        parent=styles["Normal"],
        fontSize=10,
        textColor=SLATE_700,
        leading=14,
        spaceAfter=6,
    )
    small_style = ParagraphStyle(
        "SmallText",
        parent=styles["Normal"],
        fontSize=8,
        textColor=SLATE_500,
        leading=10,
    )
    center_style = ParagraphStyle(
        "Centered",
        parent=body_style,
        alignment=TA_CENTER,
    )
    disclaimer_style = ParagraphStyle(
        "Disclaimer",
        parent=styles["Normal"],
        fontSize=7.5,
        textColor=SLATE_500,
        leading=10,
        spaceBefore=12,
        spaceAfter=4,
        alignment=TA_LEFT,
    )

    # ── Helper: section header bar ──
    def section_header(text: str):
        story.append(Spacer(1, 6))
        story.append(HRFlowable(width="100%", thickness=1, color=SLATE_300))
        story.append(Paragraph(text, heading_style))

    # ═══════════════════════════════════════════════════════════════════
    # PAGE 1: Cover / Summary
    # ═══════════════════════════════════════════════════════════════════

    # Title
    address = deal_data.get("address", "")
    city = deal_data.get("city", "")
    state = deal_data.get("state", "")
    zipcode = deal_data.get("zip", "")
    location = ", ".join(filter(None, [city, state, zipcode]))

    story.append(Paragraph("Underwriting Report", title_style))
    if address:
        story.append(Paragraph(f"{address}", subtitle_style))
    if location:
        story.append(Paragraph(location, small_style))
    story.append(Spacer(1, 4))

    # Metadata line
    analyzed_at = analysis.get("analyzed_at", "")
    if analyzed_at:
        try:
            dt = datetime.fromisoformat(analyzed_at)
            analyzed_str = dt.strftime("%B %d, %Y at %I:%M %p UTC")
        except Exception:
            analyzed_str = analyzed_at
    else:
        analyzed_str = "N/A"

    meta_parts = [f"Generated: {analyzed_str}"]
    if analysis.get("attom_available"):
        meta_parts.append("ATTOM Property Data: Included")
    else:
        meta_parts.append("ATTOM Property Data: Not Available")
    story.append(Paragraph(" · ".join(meta_parts), small_style))
    story.append(Spacer(1, 12))

    # ── Score & Rating Summary Table ──
    score = analysis.get("score", 0)
    rating = _rating_label(analysis.get("rating", "N/A"))
    sc = _score_color(score)

    recommended_offer = analysis.get("recommended_offer")
    max_offer = analysis.get("max_allowable_offer")

    summary_data = [
        [
            Paragraph("<b>Deal Score</b>", center_style),
            Paragraph("<b>Rating</b>", center_style),
            Paragraph("<b>Recommendation</b>", center_style),
        ],
        [
            Paragraph(f'<font size="24" color="{sc.hexval()}">{score}</font><font size="9" color="#64748B"> / 100</font>', center_style),
            Paragraph(f'<font size="14" color="{sc.hexval()}"><b>{rating}</b></font>', center_style),
            Paragraph(f'<font size="12"><b>{analysis.get("recommendation", "N/A")}</b></font>', center_style),
        ],
    ]

    summary_table = Table(summary_data, colWidths=[2.3 * inch, 2.3 * inch, 2.3 * inch])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
        ("TEXTCOLOR", (0, 0), (-1, 0), SLATE_700),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, SLATE_300),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 1), (-1, 1), 12),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 12),
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 8))

    # Offer prices
    if recommended_offer or max_offer:
        offer_data = [[]]
        offer_headers = [[]]
        if recommended_offer:
            offer_headers[0].append(Paragraph("<b>Recommended Offer</b>", center_style))
            offer_data[0].append(Paragraph(
                f'<font size="14" color="#1D4ED8"><b>${recommended_offer:,.0f}</b></font>',
                center_style
            ))
        if max_offer:
            offer_headers[0].append(Paragraph("<b>Max Allowable Offer</b>", center_style))
            offer_data[0].append(Paragraph(
                f'<font size="14" color="#334155"><b>${max_offer:,.0f}</b></font>',
                center_style
            ))

        cw = 3.45 * inch if len(offer_data[0]) == 2 else 6.9 * inch
        offer_table = Table(offer_headers + offer_data, colWidths=[cw] * len(offer_data[0]))
        offer_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
            ("GRID", (0, 0), (-1, -1), 0.5, SLATE_300),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(offer_table)
        story.append(Spacer(1, 6))

    # ═══════════════════════════════════════════════════════════════════
    # Property Details
    # ═══════════════════════════════════════════════════════════════════

    section_header("Property Details")

    prop_fields = [
        ("Property Type", deal_data.get("property_type")),
        ("Bedrooms", deal_data.get("bedrooms")),
        ("Bathrooms", deal_data.get("bathrooms")),
        ("Square Footage", f"{deal_data['square_footage']:,}" if deal_data.get("square_footage") else None),
        ("Year Built", deal_data.get("year_built")),
        ("Condition", deal_data.get("property_condition")),
    ]

    prop_rows = []
    row = []
    for label, val in prop_fields:
        if val is not None and val != "":
            row.append(Paragraph(f"<b>{label}:</b> {val}", body_style))
            if len(row) == 3:
                prop_rows.append(row)
                row = []
    if row:
        while len(row) < 3:
            row.append(Paragraph("", body_style))
        prop_rows.append(row)

    if prop_rows:
        prop_table = Table(prop_rows, colWidths=[2.3 * inch] * 3)
        prop_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(prop_table)

    # ═══════════════════════════════════════════════════════════════════
    # Deal Photos (if available)
    # ═══════════════════════════════════════════════════════════════════

    if deal_photos:
        section_header("Property Photos")

        photo_images = []
        for photo in deal_photos[:6]:  # Max 6 photos
            try:
                b64 = photo.get("file_content", "")
                if not b64:
                    continue
                img_bytes = base64.b64decode(b64)
                img_buf = io.BytesIO(img_bytes)
                img = Image(img_buf, width=3.2 * inch, height=2.4 * inch)
                img.hAlign = "CENTER"

                category = photo.get("category", "").replace("_", " ").title()
                photo_images.append((img, category))
            except Exception as exc:
                logger.warning("Failed to add photo to PDF: %s", exc)

        # Arrange photos in a 2-column grid
        if photo_images:
            photo_rows = []
            for i in range(0, len(photo_images), 2):
                row_data = []
                for j in range(2):
                    if i + j < len(photo_images):
                        img, cat = photo_images[i + j]
                        cell = [img, Paragraph(cat, ParagraphStyle("PhotoCaption", parent=small_style, alignment=TA_CENTER))]
                        row_data.append(cell)
                    else:
                        row_data.append([""])
                photo_rows.append(row_data)

            # Flatten for Table (each cell is a list of flowables)
            for row in photo_rows:
                row_table = Table(
                    [[row[0], row[1]]],
                    colWidths=[3.45 * inch, 3.45 * inch],
                )
                row_table.setStyle(TableStyle([
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(row_table)

    # ═══════════════════════════════════════════════════════════════════
    # Financial Summary
    # ═══════════════════════════════════════════════════════════════════

    section_header("Financial Summary")

    def _fmt_currency(val):
        if val is None:
            return "—"
        try:
            return f"${float(val):,.0f}"
        except (ValueError, TypeError):
            return str(val)

    def _fmt_pct(val):
        if val is None:
            return "—"
        try:
            return f"{float(val):.1f}%"
        except (ValueError, TypeError):
            return str(val)

    fin_sections = [
        ("Pricing", [
            ("List Price", _fmt_currency(deal_data.get("list_price"))),
            ("Purchase Price", _fmt_currency(deal_data.get("purchase_price"))),
            ("ARV (After Repair Value)", _fmt_currency(deal_data.get("arv"))),
            ("As-Is Value", _fmt_currency(deal_data.get("as_is_value"))),
        ]),
        ("Costs", [
            ("Rehab Estimate", _fmt_currency(deal_data.get("rehab_estimate"))),
            ("All-In Cost", _fmt_currency(deal_data.get("all_in_cost"))),
            ("Down Payment", _fmt_currency(deal_data.get("down_payment"))),
        ]),
        ("Financing", [
            ("Loan Amount", _fmt_currency(deal_data.get("loan_amount"))),
            ("Interest Rate", _fmt_pct(deal_data.get("interest_rate"))),
            ("Loan Term", f"{deal_data['loan_term_months']} months" if deal_data.get("loan_term_months") else "—"),
            ("Monthly P&I", _fmt_currency(deal_data.get("monthly_mortgage_pi"))),
        ]),
        ("Income & Returns", [
            ("Monthly Rent", _fmt_currency(deal_data.get("monthly_rent"))),
            ("Monthly Cash Flow", _fmt_currency(deal_data.get("monthly_cash_flow"))),
            ("Cap Rate", _fmt_pct(deal_data.get("cap_rate"))),
            ("Cash-on-Cash", _fmt_pct(deal_data.get("cash_on_cash"))),
            ("ROI", _fmt_pct(deal_data.get("roi_percent"))),
        ]),
    ]

    for section_name, fields in fin_sections:
        # Filter out "—" only rows
        valid_fields = [(l, v) for l, v in fields if v != "—"]
        if not valid_fields:
            continue

        story.append(Paragraph(f"<b>{section_name}</b>", subheading_style))
        rows = [[
            Paragraph("<b>Metric</b>", ParagraphStyle("TH", parent=body_style, textColor=SLATE_500)),
            Paragraph("<b>Value</b>", ParagraphStyle("TH", parent=body_style, textColor=SLATE_500, alignment=TA_RIGHT)),
        ]]
        for label, value in valid_fields:
            rows.append([
                Paragraph(label, body_style),
                Paragraph(f"<b>{value}</b>", ParagraphStyle("ValRight", parent=body_style, alignment=TA_RIGHT)),
            ])

        fin_table = Table(rows, colWidths=[4.5 * inch, 2.4 * inch])
        fin_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
            ("LINEBELOW", (0, 0), (-1, 0), 1, SLATE_300),
            ("LINEBELOW", (0, -1), (-1, -1), 0.5, SLATE_300),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]))
        story.append(fin_table)
        story.append(Spacer(1, 4))

    # ═══════════════════════════════════════════════════════════════════
    # Risk Flags
    # ═══════════════════════════════════════════════════════════════════

    risk_flags = analysis.get("risk_flags", [])
    if risk_flags:
        section_header("Risk Assessment")

        severity_colors = {
            "high": RED,
            "medium": AMBER,
            "low": GREEN,
        }

        risk_rows = [[
            Paragraph("<b>Severity</b>", ParagraphStyle("TH", parent=body_style, textColor=SLATE_500)),
            Paragraph("<b>Risk</b>", ParagraphStyle("TH", parent=body_style, textColor=SLATE_500)),
            Paragraph("<b>Detail</b>", ParagraphStyle("TH", parent=body_style, textColor=SLATE_500)),
        ]]
        for flag in risk_flags:
            sev = flag.get("severity", "medium").upper()
            sev_color = severity_colors.get(flag.get("severity", "medium"), AMBER)
            risk_rows.append([
                Paragraph(f'<font color="{sev_color.hexval()}"><b>{sev}</b></font>', body_style),
                Paragraph(f"<b>{flag.get('flag', '')}</b>", body_style),
                Paragraph(flag.get("detail", ""), small_style),
            ])

        risk_table = Table(risk_rows, colWidths=[1.0 * inch, 2.2 * inch, 3.7 * inch])
        risk_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
            ("LINEBELOW", (0, 0), (-1, 0), 1, SLATE_300),
            ("GRID", (0, 0), (-1, -1), 0.5, SLATE_300),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(risk_table)

    # ═══════════════════════════════════════════════════════════════════
    # Strengths
    # ═══════════════════════════════════════════════════════════════════

    strengths = analysis.get("strengths", [])
    if strengths:
        section_header("Deal Strengths")
        for s in strengths:
            story.append(Paragraph(f"• {s}", body_style))

    # ═══════════════════════════════════════════════════════════════════
    # Comparable Sales
    # ═══════════════════════════════════════════════════════════════════

    comps = analysis.get("comp_analysis", [])
    if comps:
        section_header("Comparable Sales")

        comp_rows = [[
            Paragraph("<b>Description</b>", ParagraphStyle("TH", parent=small_style, textColor=SLATE_500)),
            Paragraph("<b>Price</b>", ParagraphStyle("TH", parent=small_style, textColor=SLATE_500)),
            Paragraph("<b>Date</b>", ParagraphStyle("TH", parent=small_style, textColor=SLATE_500)),
            Paragraph("<b>Relevance</b>", ParagraphStyle("TH", parent=small_style, textColor=SLATE_500)),
        ]]
        for comp in comps:
            comp_rows.append([
                Paragraph(comp.get("description", ""), small_style),
                Paragraph(str(comp.get("sale_price", "")), small_style),
                Paragraph(str(comp.get("sale_date", "")), small_style),
                Paragraph(comp.get("relevance", ""), small_style),
            ])

        comp_table = Table(comp_rows, colWidths=[2.2 * inch, 1.3 * inch, 1.0 * inch, 2.4 * inch])
        comp_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
            ("LINEBELOW", (0, 0), (-1, 0), 1, SLATE_300),
            ("GRID", (0, 0), (-1, -1), 0.5, SLATE_300),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(comp_table)

    # ═══════════════════════════════════════════════════════════════════
    # Math Validation
    # ═══════════════════════════════════════════════════════════════════

    math_val = analysis.get("math_validation")
    if math_val and math_val.get("checks"):
        section_header("Independent Math Validation")

        validated = math_val.get("validated")
        if validated is True:
            story.append(Paragraph(
                '<font color="#10B981"><b>✓ MATH VERIFIED</b></font> — All major calculations independently confirmed.',
                body_style,
            ))
        elif validated is False:
            story.append(Paragraph(
                '<font color="#EF4444"><b>✗ DISCREPANCIES FOUND</b></font> — Review details below.',
                body_style,
            ))
        else:
            story.append(Paragraph("Validation results inconclusive.", body_style))

        if math_val.get("summary"):
            story.append(Paragraph(math_val["summary"], small_style))
        story.append(Spacer(1, 4))

        status_colors = {
            "pass": GREEN,
            "fail": RED,
            "warning": AMBER,
            "skipped": SLATE_300,
        }

        val_rows = [[
            Paragraph("<b>Metric</b>", ParagraphStyle("TH", parent=small_style, textColor=SLATE_500)),
            Paragraph("<b>Status</b>", ParagraphStyle("TH", parent=small_style, textColor=SLATE_500)),
            Paragraph("<b>Notes</b>", ParagraphStyle("TH", parent=small_style, textColor=SLATE_500)),
        ]]
        for check in math_val["checks"]:
            status = check.get("status", "skipped")
            sc_color = status_colors.get(status, SLATE_300)
            val_rows.append([
                Paragraph(check.get("metric", ""), small_style),
                Paragraph(f'<font color="{sc_color.hexval()}"><b>{status.upper()}</b></font>', small_style),
                Paragraph(check.get("note", ""), small_style),
            ])

        val_table = Table(val_rows, colWidths=[1.8 * inch, 0.8 * inch, 4.3 * inch])
        val_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_LIGHT),
            ("LINEBELOW", (0, 0), (-1, 0), 1, SLATE_300),
            ("GRID", (0, 0), (-1, -1), 0.5, SLATE_300),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(val_table)

        # Discrepancies
        discreps = math_val.get("discrepancies", [])
        if discreps:
            story.append(Spacer(1, 4))
            story.append(Paragraph("<b>Discrepancies:</b>", body_style))
            for d in discreps:
                story.append(Paragraph(f'<font color="#EF4444">• {d}</font>', small_style))

        # Validator info
        if math_val.get("validator_model"):
            story.append(Spacer(1, 4))
            story.append(Paragraph(
                f"Validated by: {math_val['validator_model']}",
                small_style,
            ))

    # ═══════════════════════════════════════════════════════════════════
    # Underwriting Memo
    # ═══════════════════════════════════════════════════════════════════

    memo = analysis.get("memo", "")
    if memo:
        section_header("Underwriting Memo")
        # Split memo into paragraphs
        for para in memo.split("\n\n"):
            para = para.strip()
            if para:
                story.append(Paragraph(para, body_style))
                story.append(Spacer(1, 4))

    # ═══════════════════════════════════════════════════════════════════
    # Seller Info (if available)
    # ═══════════════════════════════════════════════════════════════════

    seller_fields = [
        ("Motivation Level", deal_data.get("motivation_level")),
        ("Reason for Selling", deal_data.get("reason_for_selling")),
        ("Mortgage Balance", _fmt_currency(deal_data.get("mortgage_balance"))),
        ("Exit Strategy", deal_data.get("exit_strategy")),
        ("Foreclosure Status", deal_data.get("foreclosure_status")),
        ("Auction Date", deal_data.get("auction_date")),
    ]
    valid_seller = [(l, v) for l, v in seller_fields if v and v != "—" and v != ""]

    if valid_seller:
        section_header("Seller Information")
        for label, val in valid_seller:
            story.append(Paragraph(f"<b>{label}:</b> {val}", body_style))

    # ═══════════════════════════════════════════════════════════════════
    # Disclaimer
    # ═══════════════════════════════════════════════════════════════════

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=SLATE_300))
    story.append(Paragraph(
        "<b>DISCLAIMER — AI-GENERATED ANALYSIS</b>",
        ParagraphStyle("DisclaimerTitle", parent=disclaimer_style, fontName="Helvetica-Bold", fontSize=8),
    ))
    story.append(Paragraph(
        "This underwriting report has been generated by artificial intelligence and is provided "
        "for informational purposes only. It does not constitute financial, legal, or investment "
        "advice. All data, calculations, scores, and recommendations contained in this report "
        "should be independently verified by the investor or a qualified professional before making "
        "any investment decisions. Market conditions, property conditions, and financial circumstances "
        "can change rapidly and may not be reflected in this analysis. The investor assumes full "
        "responsibility for due diligence, verification of all information, and any actions taken "
        "based on this report. REI Fundamentals Hub, its affiliates, and its AI providers make no "
        "warranties or guarantees regarding the accuracy, completeness, or reliability of this report.",
        disclaimer_style,
    ))
    story.append(Paragraph(
        f"Report generated on {analyzed_str} by REI Fundamentals Hub Underwriting System.",
        disclaimer_style,
    ))

    # ── Build the PDF ──
    doc.build(story, canvasmaker=_NumberedCanvas)

    return buf.getvalue()


def underwriting_pdf_filename(deal_data: dict) -> str:
    """Generate a standardized filename for the underwriting PDF.

    Format: Underwriting Report - 123 Main St, City, ST - 03-06-2026.pdf
    """
    address = deal_data.get("address", "Unknown Property")
    city = deal_data.get("city", "")
    state = deal_data.get("state", "")

    # Clean address: keep alphanumeric, spaces, commas, hyphens
    clean_addr = "".join(c if c.isalnum() or c in " ,-" else "" for c in address).strip()
    clean_addr = clean_addr[:50]  # Limit length

    # Build location portion: "City, ST"
    location_parts = []
    if city:
        location_parts.append(city.strip())
    if state:
        location_parts.append(state.strip().upper()[:2])
    location = ", ".join(location_parts)

    # Date as MM-DD-YYYY
    date_str = datetime.utcnow().strftime("%m-%d-%Y")

    # Assemble: Underwriting Report - 123 Main St, City, ST - 03-06-2026.pdf
    if location:
        return f"Underwriting Report - {clean_addr}, {location} - {date_str}.pdf"
    else:
        return f"Underwriting Report - {clean_addr} - {date_str}.pdf"
