"""Test doubles for time, shared by every worker's tests.

Like FixedClock, these live in the package so tests can import them (pytest runs in
importlib mode, which cannot import from conftest files).
"""

from datetime import UTC, datetime, timedelta

DEFAULT_START = datetime(2026, 10, 1, 1, 0, 0, tzinfo=UTC)


class ManualClock:
    """A clock that only moves when told to."""

    def __init__(self, start: datetime = DEFAULT_START) -> None:
        self._now = start

    def now(self) -> datetime:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += timedelta(seconds=seconds)


class FakeSleeper:
    """Records each sleep and advances the clock instead of blocking."""

    def __init__(self, clock: ManualClock) -> None:
        self._clock = clock
        self.sleeps: list[float] = []

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self._clock.advance(seconds)
