"""Document service — .docx merge field detection and document generation.

Uses zipfile + base64 to manipulate .docx files (which are ZIP archives)
without requiring python-docx or any additional packages.
"""

from __future__ import annotations

import base64
import io
import re
import zipfile
from datetime import datetime


_MERGE_FIELD_PATTERN = re.compile(r"\{\{([A-Z_][A-Z0-9_]*)\}\}")


def detect_merge_fields(docx_base64: str) -> list[str]:
    """Scan a base64-encoded .docx for ``{{FIELD_NAME}}`` placeholders.

    Returns a deduplicated list of field names found.
    """
    raw = base64.b64decode(docx_base64)
    fields: list[str] = []

    with zipfile.ZipFile(io.BytesIO(raw), "r") as zf:
        for name in zf.namelist():
            if name.endswith(".xml") or name.endswith(".xml.rels"):
                xml_content = zf.read(name).decode("utf-8", errors="ignore")
                for match in _MERGE_FIELD_PATTERN.finditer(xml_content):
                    field = match.group(1)
                    if field not in fields:
                        fields.append(field)

    return fields


def merge_document(docx_base64: str, merge_data: dict[str, str]) -> str:
    """Replace all ``{{FIELD_NAME}}`` placeholders in a .docx with values.

    Returns a base64-encoded .docx with substitutions applied.
    """
    raw = base64.b64decode(docx_base64)
    buf_in = io.BytesIO(raw)
    buf_out = io.BytesIO()

    with zipfile.ZipFile(buf_in, "r") as zf_in, zipfile.ZipFile(
        buf_out, "w", zipfile.ZIP_DEFLATED
    ) as zf_out:
        for item in zf_in.infolist():
            data = zf_in.read(item.filename)

            if item.filename.endswith(".xml") or item.filename.endswith(
                ".xml.rels"
            ):
                text = data.decode("utf-8", errors="ignore")
                for field_name, value in merge_data.items():
                    placeholder = "{{" + field_name + "}}"
                    text = text.replace(placeholder, _xml_escape(value))
                data = text.encode("utf-8")

            zf_out.writestr(item, data)

    return base64.b64encode(buf_out.getvalue()).decode("ascii")


def generate_file_name(
    template_name: str,
    homeowner_name: str,
    property_address: str = "",
    buying_entity: str = "",
    date: str | None = None,
) -> str:
    """Build a standardised contract file name.

    Format: ``"Document Name - Homeowner Name - Address.docx"``
    where address = "street, city, ST zip"

    Falls back to buying_entity + date if no address provided.
    """
    parts = [template_name]
    if homeowner_name:
        parts.append(homeowner_name)
    if property_address:
        parts.append(property_address)
    elif buying_entity:
        parts.append(buying_entity)
    name = " - ".join(parts)
    # Sanitise characters that are invalid in file names
    for ch in ('/', '\\', ':', '*', '?', '"', '<', '>', '|'):
        name = name.replace(ch, '_')
    return f"{name}.docx"


def build_merge_data(user, contract_data: dict) -> dict[str, str]:
    """Assemble merge-field values from user profile and contract input.

    Standard fields:
        COMPANY_NAME, HOMEOWNER_NAME, BUYING_ENTITY, PROPERTY_ADDRESS,
        PURCHASE_PRICE, CLOSING_DATE, EMD_AMOUNT, ADDITIONAL_CLAUSES

    Any extra ``custom_fields`` in *contract_data* are also included.
    """
    data: dict[str, str] = {
        "COMPANY_NAME": getattr(user, "company_name", None) or "",
        "HOMEOWNER_NAME": contract_data.get("homeowner_name", ""),
        "BUYING_ENTITY": contract_data.get("buying_entity", ""),
        "PROPERTY_ADDRESS": contract_data.get("property_address", ""),
        "PURCHASE_PRICE": _fmt_currency(contract_data.get("purchase_price")),
        "CLOSING_DATE": contract_data.get("closing_date", ""),
        "EMD_AMOUNT": _fmt_currency(contract_data.get("emd_amount")),
        "ADDITIONAL_CLAUSES": contract_data.get("additional_clauses", ""),
    }

    custom = contract_data.get("custom_fields")
    if isinstance(custom, dict):
        for key, value in custom.items():
            data[key.upper()] = str(value)

    return data


# ── LOI generation ──────────────────────────────────────────────────


def generate_loi_docx(loi_data: dict, user) -> str:
    """Generate a Letter of Intent .docx programmatically.

    Returns a base64-encoded .docx file.
    """
    company_name = getattr(user, "company_name", None) or "Our Company"
    date_str = datetime.utcnow().strftime("%B %d, %Y")
    homeowner = loi_data.get("homeowner_name", "")
    address = loi_data.get("property_address", "")
    options = loi_data.get("included_options", [])

    lines: list[str] = []
    lines.append(company_name)
    lines.append(date_str)
    lines.append("")
    lines.append("LETTER OF INTENT")
    lines.append("")
    lines.append(
        f"{company_name} expresses interest in purchasing the property "
        f"located at {address}, currently owned by {homeowner}. "
        f"We are pleased to present the following purchase option(s) "
        f"for your consideration:"
    )
    lines.append("")

    option_num = 1

    if "subject_to" in options:
        lines.append(f"Option {option_num}: Subject To Existing Financing")
        lines.append("")
        pp = _fmt_currency(loi_data.get("purchase_price"))
        emb = _fmt_currency(loi_data.get("existing_mortgage_balance"))
        mp = _fmt_currency(loi_data.get("monthly_payment"))
        rate = loi_data.get("interest_rate")
        if pp:
            lines.append(f"Purchase Price: {pp}")
        if emb:
            lines.append(f"Existing Mortgage Balance: {emb}")
        if mp:
            lines.append(f"Monthly Payment: {mp}")
        if rate is not None and rate != "":
            lines.append(f"Interest Rate: {rate}%")
        lines.append("")
        lines.append(
            "Buyer will take title to the property subject to the existing "
            "financing remaining in place. Seller remains on the loan while "
            "buyer assumes responsibility for all payments. The existing "
            "mortgage will continue to be paid on time, protecting the "
            "seller's credit. Buyer will maintain adequate insurance on the "
            "property at all times."
        )
        lines.append("")
        option_num += 1

    if "cash_purchase" in options:
        lines.append(f"Option {option_num}: Cash Purchase")
        lines.append("")
        pp = _fmt_currency(loi_data.get("purchase_price"))
        aiv = _fmt_currency(loi_data.get("as_is_value"))
        if pp:
            lines.append(f"Purchase Price: {pp}")
        if aiv:
            lines.append(f"As-Is Value: {aiv}")
        lines.append("Close in as little as 7-14 days")
        lines.append("No repairs, no commissions, no fees")
        lines.append("")
        lines.append(
            "This is a straightforward cash purchase with no financing "
            "contingencies. Buyer will cover all closing costs. Seller "
            "receives a clean, fast closing with no risk of buyer financing "
            "falling through."
        )
        lines.append("")
        option_num += 1

    if "owner_financing" in options:
        lines.append(f"Option {option_num}: Owner Financing")
        lines.append("")
        pp = _fmt_currency(loi_data.get("purchase_price"))
        dp = _fmt_currency(loi_data.get("owner_finance_down"))
        mp = _fmt_currency(loi_data.get("monthly_payment"))
        if pp:
            lines.append(f"Purchase Price: {pp}")
        if dp:
            lines.append(f"Down Payment: {dp}")
        if mp:
            lines.append(f"Monthly Payment: {mp}")
        lines.append("")
        lines.append(
            "Seller acts as the bank by carrying a note on the property. "
            "Buyer makes a down payment and regular monthly payments "
            "directly to the seller. This provides the seller with a steady "
            "income stream and potentially favorable tax treatment through "
            "an installment sale."
        )
        lines.append("")
        option_num += 1

    if "lease_option" in options:
        lines.append(f"Option {option_num}: Lease Option")
        lines.append("")
        lmp = _fmt_currency(loi_data.get("lease_monthly_payment"))
        term = loi_data.get("lease_option_term", "")
        opp = _fmt_currency(loi_data.get("option_purchase_price"))
        if lmp:
            lines.append(f"Monthly Payment: {lmp}")
        if term:
            lines.append(f"Option Term: {term}")
        if opp:
            lines.append(f"Option Purchase Price: {opp}")
        lines.append("")
        lines.append(
            "Buyer leases the property with the option to purchase at a "
            "predetermined price within the option period. Monthly payments "
            "are made to the seller during the lease term. This allows "
            "the buyer time to arrange financing while the seller receives "
            "monthly income."
        )
        lines.append("")
        option_num += 1

    notes = loi_data.get("additional_notes", "")
    if notes:
        lines.append("ADDITIONAL NOTES")
        lines.append("")
        lines.append(notes)
        lines.append("")

    lines.append("")
    lines.append("Sincerely,")
    lines.append("")
    lines.append("_________________________________")
    lines.append(company_name)
    lines.append("")
    lines.append("")
    lines.append("_________________________________")
    lines.append(f"{homeowner} (Seller)")
    lines.append("")
    lines.append(
        "This letter is not a binding contract but rather an expression of "
        "interest and intent. A formal purchase agreement will be drafted "
        "upon mutual acceptance of the terms outlined above."
    )
    lines.append("")
    lines.append(f"This offer expires 5 business days from {date_str}.")

    return _build_docx_from_lines(lines)


def _build_docx_from_lines(lines: list[str]) -> str:
    """Build a minimal .docx from a list of text lines.

    Returns base64-encoded content.
    """
    paragraphs = []
    for i, line in enumerate(lines):
        props = ""
        run_props = '<w:rPr><w:sz w:val="22"/></w:rPr>'

        if i == 0:
            props = '<w:pPr><w:jc w:val="center"/></w:pPr>'
            run_props = '<w:rPr><w:b/><w:sz w:val="28"/></w:rPr>'
        elif i == 3 and line == "LETTER OF INTENT":
            props = '<w:pPr><w:jc w:val="center"/></w:pPr>'
            run_props = '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>'
        elif line.startswith("Option ") and ": " in line:
            run_props = '<w:rPr><w:b/><w:sz w:val="24"/></w:rPr>'
        elif line in ("ADDITIONAL NOTES",):
            run_props = '<w:rPr><w:b/><w:sz w:val="24"/></w:rPr>'

        escaped = _xml_escape(line)
        paragraphs.append(
            f"<w:p>{props}<w:r>{run_props}"
            f'<w:t xml:space="preserve">{escaped}</w:t></w:r></w:p>'
        )

    body_xml = "".join(paragraphs)

    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
        'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
        'xmlns:o="urn:schemas-microsoft-com:office:office" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
        'xmlns:v="urn:schemas-microsoft-com:vml" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:w10="urn:schemas-microsoft-com:office:word" '
        'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
        'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" '
        'xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" '
        'xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" '
        'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" '
        'mc:Ignorable="w14 wp14">'
        f"<w:body>{body_xml}</w:body>"
        "</w:document>"
    )

    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType='
        '"application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType='
        '"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )

    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type='
        '"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )

    word_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        "</Relationships>"
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("word/_rels/document.xml.rels", word_rels)
        zf.writestr("word/document.xml", document_xml)

    return base64.b64encode(buf.getvalue()).decode("ascii")


# ── helpers ─────────────────────────────────────────────────────────

def _fmt_currency(value) -> str:
    """Format a numeric value as ``$X,XXX``."""
    if value is None:
        return ""
    try:
        return f"${float(value):,.0f}"
    except (TypeError, ValueError):
        return str(value)


def _xml_escape(text: str) -> str:
    """Escape characters that are special in XML."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
