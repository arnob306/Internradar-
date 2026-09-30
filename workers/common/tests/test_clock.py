from datetime import UTC, datetime, timedelta, timezone

import pytest
from internradar_common.clock import FixedClock, SystemClock

MELBOURNE = timezone(timedelta(hours=10))


def test_fixed_clock_returns_the_injected_instant() -> None:
    instant = datetime(2026, 9, 30, tzinfo=MELBOURNE)

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


def test_system_clock_returns_a_utc_aware_datetime() -> None:
    now = SystemClock().now()

    assert now.tzinfo is UTC
