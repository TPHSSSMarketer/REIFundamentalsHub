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
    buying_entity: str,
    date: str | None = None,
) -> str:
    """Build a standardised contract file name.

    Returns ``"{template_name} - {homeowner_name} - {buying_entity} - {date}.docx"``
    """
    if date is None:
        date = datetime.utcnow().strftime("%Y-%m-%d")
    return f"{template_name} - {homeowner_name} - {buying_entity} - {date}.docx"


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
