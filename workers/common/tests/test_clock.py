from datetime import UTC, datetime, timedelta, timezone, tzinfo

import pytest
from internradar_common.clock import FixedClock, SystemClock

# A fixed offset, named for what it is. Melbourne itself moves to UTC+11 from
# October to April, so a fixed offset must not be called "Melbourne".
AEST = timezone(timedelta(hours=10), "AEST")


class _UnknownOffset(tzinfo):
    """A timezone object that cannot say what its UTC offset is."""

    def utcoffset(self, dt: datetime | None) -> timedelta | None:
        return None

    def dst(self, dt: datetime | None) -> timedelta | None:
        return None

    def tzname(self, dt: datetime | None) -> str | None:
        return None


def test_fixed_clock_returns_the_injected_instant() -> None:
    instant = datetime(2026, 9, 30, tzinfo=AEST)

    clock = FixedClock(instant)

    assert clock.now() == datetime(2026, 9, 29, 14, 0, tzinfo=UTC)


def test_fixed_clock_returns_utc_aware_datetimes() -> None:
    clock = FixedClock(datetime(2027, 2, 1, tzinfo=UTC))

    assert clock.now().tzinfo is UTC


def test_fixed_clock_returns_the_same_instant_every_time() -> None:
    clock = FixedClock(datetime(2027, 2, 1, tzinfo=UTC))

    assert clock.now() == clock.now()


def test_fixed_clock_rejects_a_naive_datetime() -> None:
    with pytest.raises(ValueError, match="timezone"):
        FixedClock(datetime(2027, 2, 1))  # noqa: DTZ001 - the point of the test


def test_fixed_clock_rejects_a_timezone_with_an_unknown_offset() -> None:
    # Python treats this as naive too, so astimezone() would silently guess local time.
    with pytest.raises(ValueError, match="timezone"):
        FixedClock(datetime(2027, 2, 1, tzinfo=_UnknownOffset()))


def test_system_clock_returns_a_utc_aware_datetime() -> None:
    now = SystemClock().now()

    assert now.tzinfo is UTC
