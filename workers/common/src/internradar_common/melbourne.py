"""The Melbourne calendar day, used by the fetch-once-per-day rule (ADR-015).

Timestamps are stored in UTC, but "one fetch per URL per day" must mean a Melbourne day,
otherwise it would roll over at 10:00 or 11:00 local time.
"""

from datetime import date, datetime
from zoneinfo import ZoneInfo

MELBOURNE = ZoneInfo("Australia/Melbourne")


def melbourne_day(instant: datetime) -> date:
    """The Melbourne calendar date of a timezone-aware instant."""
    if instant.utcoffset() is None:
        msg = "instant must carry a timezone"
        raise ValueError(msg)
    return instant.astimezone(MELBOURNE).date()
