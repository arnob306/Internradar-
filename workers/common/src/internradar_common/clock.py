"""Time source for the workers.

Worker code that needs "now" takes a Clock. SystemClock is the only place that
reads the real clock; tests use FixedClock (see test_time_discipline.py).
"""

from datetime import UTC, datetime
from typing import Protocol


class Clock(Protocol):
    def now(self) -> datetime:
        """Return the current instant as a UTC-aware datetime."""
        ...


class FixedClock:
    """A clock frozen at one instant, for tests and reproducible runs."""

    def __init__(self, instant: datetime) -> None:
        # Aware means a timezone that can report its offset. A tzinfo whose utcoffset()
        # is None is treated as naive by Python, and astimezone() would guess local time.
        if instant.utcoffset() is None:
            msg = "instant must carry a timezone"
            raise ValueError(msg)
        self._instant = instant.astimezone(UTC)

    def now(self) -> datetime:
        return self._instant


class SystemClock:
    """The real clock. Use only at process entrypoints."""

    def now(self) -> datetime:
        return datetime.now(UTC)
