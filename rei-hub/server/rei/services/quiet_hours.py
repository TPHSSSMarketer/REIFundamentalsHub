"""Quiet Hours — Prevent outbound calls, SMS, and fax outside allowed hours.

Contacts should NOT be reached between 8:30 PM and 9:15 AM in their local
timezone. This module provides a single check used across all outbound
communication paths (SMS, campaigns, callbacks, fax).

Exceptions:
- Direct dial is excluded (client may have requested a callback).
- If the contact initiated the conversation first (inbound SMS/call within
  the last 4 hours), the quiet-hours block is bypassed.

Timezone resolution order:
1. Explicit tz_name parameter (from campaign/callback settings)
2. Property address state → timezone (from CRM deal)
3. Phone area code → timezone
4. Falls back to America/New_York

TCPA and state-level regulations generally restrict calls/texts to 8 AM–9 PM,
so this window (9:15 AM – 8:30 PM) is slightly more conservative.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, time as dt_time, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

# ── Allowed contact window ────────────────────────────────────────────
CONTACT_WINDOW_START = dt_time(9, 15)   # 9:15 AM local
CONTACT_WINDOW_END = dt_time(20, 30)    # 8:30 PM local
DEFAULT_TIMEZONE = "America/New_York"

# How far back to look for inbound messages that bypass quiet hours
INBOUND_BYPASS_WINDOW_HOURS = 4


# ── US State → IANA timezone ──────────────────────────────────────────
_STATE_TO_TZ: dict[str, str] = {
    # Eastern
    "CT": "America/New_York", "DE": "America/New_York", "FL": "America/New_York",
    "GA": "America/New_York", "IN": "America/Indiana/Indianapolis",
    "KY": "America/New_York", "ME": "America/New_York", "MD": "America/New_York",
    "MA": "America/New_York", "MI": "America/Detroit", "NH": "America/New_York",
    "NJ": "America/New_York", "NY": "America/New_York", "NC": "America/New_York",
    "OH": "America/New_York", "PA": "America/New_York", "RI": "America/New_York",
    "SC": "America/New_York", "TN": "America/New_York", "VT": "America/New_York",
    "VA": "America/New_York", "WV": "America/New_York", "DC": "America/New_York",
    # Central
    "AL": "America/Chicago", "AR": "America/Chicago", "IL": "America/Chicago",
    "IA": "America/Chicago", "KS": "America/Chicago", "LA": "America/Chicago",
    "MN": "America/Chicago", "MS": "America/Chicago", "MO": "America/Chicago",
    "NE": "America/Chicago", "ND": "America/Chicago", "OK": "America/Chicago",
    "SD": "America/Chicago", "TX": "America/Chicago", "WI": "America/Chicago",
    # Mountain
    "AZ": "America/Phoenix", "CO": "America/Denver", "ID": "America/Boise",
    "MT": "America/Denver", "NM": "America/Denver", "UT": "America/Denver",
    "WY": "America/Denver",
    # Pacific
    "CA": "America/Los_Angeles", "NV": "America/Los_Angeles",
    "OR": "America/Los_Angeles", "WA": "America/Los_Angeles",
    # Alaska / Hawaii
    "AK": "America/Anchorage", "HI": "Pacific/Honolulu",
}

# ── US Area Code → IANA timezone (grouped by timezone) ────────────────
# Covers the most common ~250 US area codes. Missing codes fall back to
# state lookup or default.
_AREA_CODE_TO_TZ: dict[str, str] = {}

_EASTERN_CODES = [
    201, 202, 203, 207, 212, 215, 216, 219, 224, 225, 227, 228, 229, 231,
    234, 239, 240, 248, 251, 252, 253, 260, 267, 269, 272, 276, 278, 281,
    301, 302, 303, 304, 305, 312, 313, 314, 315, 317, 319, 321, 330, 331,
    334, 336, 339, 340, 347, 351, 352, 360, 361, 386, 401, 404, 407, 410,
    412, 413, 414, 419, 423, 434, 440, 443, 470, 475, 478, 484, 501, 502,
    503, 504, 508, 510, 513, 515, 516, 517, 518, 540, 551, 561, 567, 570,
    571, 574, 580, 585, 586, 601, 603, 607, 609, 610, 614, 616, 617, 631,
    636, 646, 667, 678, 681, 689, 704, 706, 712, 713, 714, 716, 717, 718,
    724, 727, 732, 734, 740, 754, 757, 760, 762, 763, 765, 769, 770, 772,
    774, 781, 786, 802, 803, 804, 810, 813, 814, 828, 830, 831, 832, 843,
    845, 848, 850, 856, 857, 858, 859, 860, 862, 863, 864, 865, 872, 878,
    901, 904, 908, 910, 912, 914, 917, 919, 920, 929, 931, 937, 940, 941,
    947, 951, 954, 959, 970, 971, 972, 973, 978, 979, 980, 984, 985,
]
_CENTRAL_CODES = [
    205, 210, 214, 217, 218, 254, 256, 262, 264, 270, 274, 279, 281,
    309, 312, 314, 316, 318, 319, 320, 325, 327, 331, 334, 337, 346,
    361, 380, 402, 405, 409, 414, 417, 430, 432, 469, 479, 501, 507,
    512, 515, 520, 531, 534, 539, 563, 573, 575, 580, 601, 605, 612,
    615, 618, 620, 630, 636, 641, 651, 660, 662, 682, 701, 708, 712,
    713, 715, 731, 737, 743, 763, 769, 779, 785, 806, 815, 816, 830,
    832, 850, 870, 901, 903, 913, 918, 920, 936, 940, 952, 956, 972,
    979, 985,
]
_MOUNTAIN_CODES = [
    303, 307, 385, 406, 435, 480, 505, 520, 602, 623, 719, 720, 775,
    801, 928, 970,
]
_PACIFIC_CODES = [
    206, 209, 213, 253, 310, 323, 341, 360, 408, 415, 424, 425, 442,
    458, 503, 509, 510, 530, 541, 559, 562, 564, 619, 626, 628, 650,
    657, 661, 669, 707, 714, 747, 760, 805, 818, 831, 858, 909, 916,
    925, 949, 951, 971,
]

for _code in _EASTERN_CODES:
    _AREA_CODE_TO_TZ[str(_code)] = "America/New_York"
for _code in _CENTRAL_CODES:
    _AREA_CODE_TO_TZ[str(_code)] = "America/Chicago"
for _code in _MOUNTAIN_CODES:
    _AREA_CODE_TO_TZ[str(_code)] = "America/Denver"
for _code in _PACIFIC_CODES:
    _AREA_CODE_TO_TZ[str(_code)] = "America/Los_Angeles"


# ── Timezone resolution ───────────────────────────────────────────────

def tz_from_state(state: str | None) -> str | None:
    """Look up timezone from a US state abbreviation (e.g. 'TX' → America/Chicago)."""
    if not state:
        return None
    return _STATE_TO_TZ.get(state.strip().upper())


def tz_from_phone(phone_number: str | None) -> str | None:
    """Look up timezone from a US phone number's area code."""
    if not phone_number:
        return None
    # Strip to digits only
    digits = re.sub(r"\D", "", phone_number)
    # Handle +1 prefix
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) < 10:
        return None
    area_code = digits[:3]
    return _AREA_CODE_TO_TZ.get(area_code)


def resolve_contact_timezone(
    *,
    tz_name: str | None = None,
    property_state: str | None = None,
    phone_number: str | None = None,
) -> str:
    """Resolve the best timezone for a contact.

    Resolution order:
    1. Explicit tz_name (from campaign or callback settings)
    2. Property address state
    3. Phone number area code
    4. Default (America/New_York)
    """
    if tz_name:
        return tz_name
    from_state = tz_from_state(property_state)
    if from_state:
        return from_state
    from_phone = tz_from_phone(phone_number)
    if from_phone:
        return from_phone
    return DEFAULT_TIMEZONE


# ── Core quiet hours check ────────────────────────────────────────────

def is_within_contact_hours(tz_name: str | None = None) -> bool:
    """Return True if the current local time is within the allowed contact window.

    Parameters
    ----------
    tz_name : str | None
        IANA timezone name (e.g. "America/Chicago"). Falls back to
        America/New_York if None or invalid.

    Returns
    -------
    bool
        True if contacts may be reached right now, False if it's quiet hours.
    """
    tz_name = tz_name or DEFAULT_TIMEZONE
    try:
        local_tz = ZoneInfo(tz_name)
    except (KeyError, Exception):
        local_tz = ZoneInfo(DEFAULT_TIMEZONE)

    now_local = datetime.now(timezone.utc).astimezone(local_tz)
    current_time = dt_time(now_local.hour, now_local.minute)

    return CONTACT_WINDOW_START <= current_time <= CONTACT_WINDOW_END


def quiet_hours_message(tz_name: str | None = None) -> str:
    """Human-readable message explaining why the action was blocked."""
    tz_label = tz_name or DEFAULT_TIMEZONE
    return (
        f"Outbound contact is not allowed between 8:30 PM and 9:15 AM "
        f"({tz_label}). Please try again during allowed hours."
    )


# ── Inbound-first bypass check ────────────────────────────────────────

async def has_recent_inbound(
    db,
    user_id: int,
    contact_phone: str | None = None,
    contact_id: str | None = None,
) -> bool:
    """Check if the contact initiated communication recently (last 4 hours).

    If the contact sent an inbound SMS or made an inbound call within the
    bypass window, quiet hours are waived — the user is just responding.
    """
    from sqlalchemy import select, or_
    from rei.models.user import SmsMessage, CallLog

    cutoff = datetime.utcnow() - timedelta(hours=INBOUND_BYPASS_WINDOW_HOURS)

    # Check inbound SMS
    try:
        sms_q = select(SmsMessage.id).where(
            SmsMessage.user_id == user_id,
            SmsMessage.direction == "inbound",
            SmsMessage.sent_at >= cutoff,
        )
        if contact_id:
            sms_q = sms_q.where(SmsMessage.contact_id == contact_id)
        elif contact_phone:
            sms_q = sms_q.where(SmsMessage.from_number == contact_phone)
        sms_q = sms_q.limit(1)
        result = await db.execute(sms_q)
        if result.scalar_one_or_none():
            return True
    except Exception:
        pass

    # Check inbound calls
    try:
        call_q = select(CallLog.id).where(
            CallLog.user_id == user_id,
            CallLog.direction == "inbound",
            CallLog.started_at >= cutoff,
        )
        if contact_id:
            call_q = call_q.where(CallLog.contact_id == contact_id)
        elif contact_phone:
            call_q = call_q.where(CallLog.from_number == contact_phone)
        call_q = call_q.limit(1)
        result = await db.execute(call_q)
        if result.scalar_one_or_none():
            return True
    except Exception:
        pass

    return False
