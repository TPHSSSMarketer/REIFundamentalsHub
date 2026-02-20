"""Living file sync — receives structured data from REI Hub webhook events
and writes/updates the corresponding living context files.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from helm.context.living_files import write_living_file

logger = logging.getLogger(__name__)

# Maps hub_data keys to their target living file names.
_HUB_KEY_TO_FILE: dict[str, str] = {
    "deals": "DEALS_PIPELINE.md",
    "contacts": "CONTACTS.md",
    "portfolio": "PORTFOLIO.md",
    "market": "MARKET_CONTEXT.md",
}


class LivingFileSync:
    """Syncs structured data from REI Hub into living context files."""

    def __init__(self) -> None:
        pass

    async def sync_from_hub(self, tenant_id: str, hub_data: dict) -> dict[str, int]:
        """Write/update living files from REI Hub webhook data.

        Parameters
        ----------
        tenant_id:
            The tenant whose workspace to update.
        hub_data:
            Dict with optional keys ``deals``, ``contacts``, ``portfolio``,
            ``market``.  Each value is a list of dicts.

        Returns
        -------
        dict[str, int]
            Mapping of ``{filename: bytes_written}`` for files that were updated.
        """
        updated: dict[str, int] = {}

        formatters = {
            "deals": self._format_deals,
            "contacts": self._format_contacts,
            "portfolio": self._format_portfolio,
            "market": self._format_market,
        }

        for key, target_file in _HUB_KEY_TO_FILE.items():
            if key not in hub_data:
                continue

            formatter = formatters[key]
            content = formatter(hub_data[key])
            write_living_file(tenant_id, target_file, content)
            updated[target_file] = len(content.encode("utf-8"))
            logger.info(
                "Synced %s → %s for tenant %s (%d bytes)",
                key, target_file, tenant_id, updated[target_file],
            )

        return updated

    def _format_deals(self, deals: list[dict]) -> str:
        """Format deals data into DEALS_PIPELINE.md markdown."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines: list[str] = [
            f"# Active Deals Pipeline\n",
            f"_Last synced: {now}_\n",
        ]

        for deal in deals[:50]:
            title = deal.get("title", "Untitled Deal")
            stage = deal.get("stage", "Unknown")
            value = deal.get("value", 0)
            address = deal.get("address", "No address")
            lines.append(f"## {title}")
            lines.append(f"- Stage: {stage}")
            lines.append(f"- Value: ${value:,.0f}")
            lines.append(f"- Address: {address}")
            lines.append("")

        return "\n".join(lines)

    def _format_contacts(self, contacts: list[dict]) -> str:
        """Format contacts data into CONTACTS.md markdown."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines: list[str] = [
            f"# Key Contacts\n",
            f"_Last synced: {now}_\n",
        ]

        for contact in contacts[:100]:
            name = contact.get("name", "Unknown")
            phone = contact.get("phone", "N/A")
            email = contact.get("email", "N/A")
            tags = contact.get("tags", "")
            if isinstance(tags, list):
                tags = ", ".join(tags)
            lines.append(f"## {name}")
            lines.append(f"- Phone: {phone}")
            lines.append(f"- Email: {email}")
            lines.append(f"- Tags: {tags}")
            lines.append("")

        return "\n".join(lines)

    def _format_portfolio(self, properties: list[dict]) -> str:
        """Format portfolio data into PORTFOLIO.md markdown."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines: list[str] = [
            f"# Current Portfolio\n",
            f"_Last synced: {now}_\n",
        ]

        for prop in properties[:50]:
            address = prop.get("address", "Unknown")
            status = prop.get("status", "Active")
            rent = prop.get("rent", 0)
            equity = prop.get("equity", 0)
            lines.append(f"## {address}")
            lines.append(f"- Status: {status}")
            lines.append(f"- Monthly Rent: ${rent:,.0f}")
            lines.append(f"- Estimated Equity: ${equity:,.0f}")
            lines.append("")

        return "\n".join(lines)

    def _format_market(self, data: list[dict]) -> str:
        """Format market data into MARKET_CONTEXT.md markdown."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        lines: list[str] = [
            f"# Market Research & Intelligence\n",
            f"_Last synced: {now}_\n",
        ]

        for market in data[:20]:
            name = market.get("name", "Unknown Market")
            median_price = market.get("median_price", 0)
            median_rent = market.get("median_rent", 0)
            vacancy = market.get("vacancy_rate", "N/A")
            lines.append(f"## {name}")
            lines.append(f"- Median Home Price: ${median_price:,.0f}")
            lines.append(f"- Median Rent: ${median_rent:,.0f}/mo")
            lines.append(f"- Vacancy Rate: {vacancy}")
            lines.append("")

        return "\n".join(lines)


# Module-level singleton used by hub_routes.py
living_file_sync = LivingFileSync()
