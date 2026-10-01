"""At least 5 seconds between requests to the same host (docs/ethics-policy.md).

A host's Crawl-delay raises that floor but never lowers it. Different hosts do not slow
each other down. Time is injected: the fake sleeper advances a manual clock, so these
tests never really wait.
"""

from datetime import UTC, datetime, timedelta

import pytest
from internradar_common.spacing import MIN_SPACING_SECONDS, HostSpacer, SystemSleeper

START = datetime(2026, 10, 1, 1, 0, 0, tzinfo=UTC)


class ManualClock:
    def __init__(self) -> None:
        self._now = START

    def now(self) -> datetime:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += timedelta(seconds=seconds)


class FakeSleeper:
    def __init__(self, clock: ManualClock) -> None:
        self._clock = clock
        self.sleeps: list[float] = []

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self._clock.advance(seconds)


@pytest.fixture
def clock() -> ManualClock:
    return ManualClock()


@pytest.fixture
def sleeper(clock: ManualClock) -> FakeSleeper:
    return FakeSleeper(clock)


@pytest.fixture
def spacer(clock: ManualClock, sleeper: FakeSleeper) -> HostSpacer:
    return HostSpacer(clock, sleeper)


def test_the_minimum_spacing_is_five_seconds() -> None:
    assert MIN_SPACING_SECONDS == 5


def test_the_first_request_to_a_host_does_not_wait(spacer: HostSpacer, sleeper: FakeSleeper) -> None:
    spacer.wait_turn("careers.example.com")

    assert sleeper.sleeps == []


def test_a_second_immediate_request_waits_the_full_spacing(
    spacer: HostSpacer, sleeper: FakeSleeper
) -> None:
    spacer.wait_turn("careers.example.com")
    spacer.wait_turn("careers.example.com")

    assert sleeper.sleeps == [5]


def test_only_the_remaining_time_is_waited(
    spacer: HostSpacer, clock: ManualClock, sleeper: FakeSleeper
) -> None:
    spacer.wait_turn("careers.example.com")
    clock.advance(3)
    spacer.wait_turn("careers.example.com")

    assert sleeper.sleeps == [2]


def test_no_wait_when_enough_time_has_already_passed(
    spacer: HostSpacer, clock: ManualClock, sleeper: FakeSleeper
) -> None:
    spacer.wait_turn("careers.example.com")
    clock.advance(5)
    spacer.wait_turn("careers.example.com")
    clock.advance(60)
    spacer.wait_turn("careers.example.com")

    assert sleeper.sleeps == []


def test_the_spacing_runs_from_the_last_request_not_the_first(
    spacer: HostSpacer, sleeper: FakeSleeper
) -> None:
    for _ in range(4):
        spacer.wait_turn("careers.example.com")

    assert sleeper.sleeps == [5, 5, 5]


def test_different_hosts_do_not_wait_for_each_other(
    spacer: HostSpacer, sleeper: FakeSleeper
) -> None:
    spacer.wait_turn("careers.example.com")
    spacer.wait_turn("boards-api.greenhouse.io")

    assert sleeper.sleeps == []


def test_host_names_are_compared_case_insensitively(
    spacer: HostSpacer, sleeper: FakeSleeper
) -> None:
    spacer.wait_turn("Careers.Example.com")
    spacer.wait_turn("careers.example.COM")

    assert sleeper.sleeps == [5]


def test_a_longer_crawl_delay_raises_the_spacing(spacer: HostSpacer, sleeper: FakeSleeper) -> None:
    spacer.wait_turn("careers.example.com", crawl_delay=12)
    spacer.wait_turn("careers.example.com", crawl_delay=12)

    assert sleeper.sleeps == [12]


def test_a_shorter_crawl_delay_never_lowers_the_spacing(
    spacer: HostSpacer, sleeper: FakeSleeper
) -> None:
    spacer.wait_turn("careers.example.com", crawl_delay=1)
    spacer.wait_turn("careers.example.com", crawl_delay=1)
    spacer.wait_turn("careers.example.com", crawl_delay=0)

    assert sleeper.sleeps == [5, 5]


def test_the_system_sleeper_really_sleeps_for_the_given_time() -> None:
    SystemSleeper().sleep(0)
