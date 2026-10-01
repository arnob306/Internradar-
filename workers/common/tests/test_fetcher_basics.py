"""PoliteFetcher, cycle A: validation, the day claim, and a plain GET (ADR-015).

An invalid URL is refused before any claim or request. A page is fetched once per
Melbourne day. These tests use pytest-httpx, so no real request is ever made.
"""

from datetime import date

import httpx
import pytest
from internradar_common.claims import InMemoryClaimStore
from internradar_common.fetcher import AlreadyFetchedToday, Fetched, PoliteFetcher, Rejected
from internradar_common.testing import FakeSleeper, ManualClock
from pytest_httpx import HTTPXMock

PAGE = "https://careers.example.com/graduates"
DAY = date(2026, 10, 1)
SECONDS_PER_DAY = 24 * 60 * 60


@pytest.fixture
def claims() -> InMemoryClaimStore:
    return InMemoryClaimStore()


@pytest.fixture
def fetcher(claims: InMemoryClaimStore, clock: ManualClock, sleeper: FakeSleeper) -> PoliteFetcher:
    return PoliteFetcher(client=httpx.Client(), clock=clock, sleeper=sleeper, claims=claims)


@pytest.mark.parametrize(
    ("url", "reason"),
    [
        ("https://www.seek.com.au/graduate-jobs", "aggregator"),
        ("http://careers.example.com/graduates", "https"),
    ],
)
def test_a_rejected_url_makes_no_request_and_takes_no_claim(
    fetcher: PoliteFetcher,
    claims: InMemoryClaimStore,
    httpx_mock: HTTPXMock,
    url: str,
    reason: str,
) -> None:
    result = fetcher.fetch(url)

    assert isinstance(result, Rejected)
    assert reason in result.reason
    assert httpx_mock.get_requests() == []
    assert claims.claim(url, DAY) is True


def test_a_plain_fetch_returns_the_status_and_body(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")

    result = fetcher.fetch(PAGE)

    assert result == Fetched(status=200, body="<html>graduates</html>")


def test_a_page_already_fetched_today_is_not_fetched_again(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")

    first = fetcher.fetch(PAGE)
    second = fetcher.fetch(PAGE)

    assert isinstance(first, Fetched)
    assert second == AlreadyFetchedToday()
    assert len(httpx_mock.get_requests()) == 1


def test_the_page_can_be_fetched_again_on_the_next_melbourne_day(
    fetcher: PoliteFetcher, clock: ManualClock, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")

    fetcher.fetch(PAGE)
    clock.advance(SECONDS_PER_DAY)
    second = fetcher.fetch(PAGE)

    assert isinstance(second, Fetched)
    assert len(httpx_mock.get_requests()) == 2


def test_the_day_rolls_over_at_melbourne_midnight_not_utc_midnight(
    fetcher: PoliteFetcher, clock: ManualClock, httpx_mock: HTTPXMock
) -> None:
    # The manual clock starts at 01:00 UTC, which is 11:00 on 1 October in Melbourne
    # (UTC+10 until daylight saving starts on the 4th). Advancing 13 hours reaches
    # 14:00 UTC, which is midnight on 2 October in Melbourne, although the UTC date is
    # still 1 October.
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")

    fetcher.fetch(PAGE)
    clock.advance(13 * 60 * 60)
    second = fetcher.fetch(PAGE)

    assert isinstance(second, Fetched)
    assert len(httpx_mock.get_requests()) == 2
