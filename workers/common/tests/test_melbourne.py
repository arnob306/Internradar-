"""The fetch-once-per-day rule uses the Melbourne calendar day (ADR-015).

A UTC day would roll over at 10:00 or 11:00 Melbourne time, in the middle of the working
day, so a daily job could run twice in one Melbourne day or skip one. Victoria's daylight
saving in 2026 starts on Sunday 4 October and ends on Sunday 5 April.
"""

from datetime import UTC, date, datetime, timedelta, timezone

import pytest
from internradar_common.melbourne import melbourne_day

AEST = timezone(timedelta(hours=10), "AEST")


@pytest.mark.parametrize(
    ("instant", "expected"),
    [
        # Standard time (UTC+10)
        (datetime(2026, 9, 30, 13, 59, 59, tzinfo=UTC), date(2026, 9, 30)),
        (datetime(2026, 9, 30, 14, 0, 0, tzinfo=UTC), date(2026, 10, 1)),
        # Daylight saving starts Sunday 4 October 2026 at 02:00 (UTC+10 becomes UTC+11)
        (datetime(2026, 10, 3, 13, 59, 59, tzinfo=UTC), date(2026, 10, 3)),
        (datetime(2026, 10, 3, 14, 0, 0, tzinfo=UTC), date(2026, 10, 4)),
        (datetime(2026, 10, 4, 12, 59, 59, tzinfo=UTC), date(2026, 10, 4)),
        (datetime(2026, 10, 4, 13, 0, 0, tzinfo=UTC), date(2026, 10, 5)),
        # Daylight saving ends Sunday 5 April 2026 at 03:00 (UTC+11 becomes UTC+10)
        (datetime(2026, 4, 4, 12, 59, 59, tzinfo=UTC), date(2026, 4, 4)),
        (datetime(2026, 4, 4, 13, 0, 0, tzinfo=UTC), date(2026, 4, 5)),
        (datetime(2026, 4, 5, 13, 59, 59, tzinfo=UTC), date(2026, 4, 5)),
        (datetime(2026, 4, 5, 14, 0, 0, tzinfo=UTC), date(2026, 4, 6)),
    ],
)
def test_melbourne_day_rolls_over_at_melbourne_midnight(instant: datetime, expected: date) -> None:
    assert melbourne_day(instant) == expected


def test_a_non_utc_aware_instant_gives_the_same_day() -> None:
    utc = datetime(2026, 9, 30, 14, 0, 0, tzinfo=UTC)
    in_aest = utc.astimezone(AEST)

    assert melbourne_day(in_aest) == melbourne_day(utc)


def test_the_utc_day_and_the_melbourne_day_differ_in_the_morning() -> None:
    # 09:00 Melbourne on 1 October is still 30 September in UTC.
    morning = datetime(2026, 9, 30, 23, 0, 0, tzinfo=UTC)

    assert morning.date() == date(2026, 9, 30)
    assert melbourne_day(morning) == date(2026, 10, 1)


def test_a_naive_datetime_is_rejected() -> None:
    with pytest.raises(ValueError, match="timezone"):
        melbourne_day(datetime(2026, 9, 30, 12, 0, 0))  # noqa: DTZ001 - the point of the test
