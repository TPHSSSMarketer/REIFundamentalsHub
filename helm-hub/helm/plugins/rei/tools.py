"""RE-specific tool definitions for function-calling models."""

from __future__ import annotations

REI_TOOL_DEFINITIONS = [
    {
        "name": "get_portfolio_overview",
        "description": (
            "Retrieve a summary of the user's real estate portfolio from "
            "REIFundamentals Hub, including total properties, value, income, "
            "and average cap rate."
        ),
    },
    {
        "name": "get_property_details",
        "description": (
            "Fetch detailed information about a specific property by address "
            "or property ID from REIFundamentals Hub."
        ),
        "parameters": {
            "query": "Address or property ID to look up.",
        },
    },
    {
        "name": "analyze_deal",
        "description": (
            "Run a full investment analysis on a potential deal, including "
            "cap rate, cash-on-cash return, ROI projection, and risk assessment."
        ),
        "parameters": {
            "address": "Property address.",
            "purchase_price": "Proposed purchase price.",
            "rehab_cost": "Estimated rehabilitation cost (default 0).",
            "after_repair_value": "Estimated ARV (optional).",
            "monthly_rent": "Expected monthly rent (optional).",
            "strategy": "Investment strategy: buy_and_hold, flip, brrrr, wholesale.",
        },
    },
]
