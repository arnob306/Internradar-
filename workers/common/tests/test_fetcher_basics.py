"""PoliteFetcher, cycle A: validation, the day claim, and a plain GET (ADR-015).

An invalid URL is refused before any claim or request. A page is fetched once per
Melbourne day. These tests use pytest-httpx, so no real request is ever made.
"""

from datetime import date

import httpx
import pytest
from internradar_common.claims import InMemoryClaimStore
from internradar_common.fetcher import (
    MAX_ATTEMPTS,
    AlreadyFetchedToday,
    Fetched,
    PoliteFetcher,
    Rejected,
)
from internradar_common.testing import ManualClock
from pytest_httpx import HTTPXMock

PAGE = "https://careers.example.com/graduates"
DAY = date(2026, 10, 1)
SECONDS_PER_DAY = 24 * 60 * 60


def page_requests(httpx_mock: HTTPXMock) -> list[httpx.Request]:
    return [r for r in httpx_mock.get_requests() if r.url.path != "/robots.txt"]


def test_at_most_three_attempts_are_made_in_total() -> None:
    assert MAX_ATTEMPTS == 3


@pytest.mark.parametrize(
    ("url", "reason"),
    [
        ("https://www.seek.com.au/graduate-jobs", "aggregator"),
        ("http://careers.example.com/graduates", "https"),
        ("https://careers.example.com/" + "x" * 2100, "too long"),
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


def test_a_url_with_an_invalid_port_is_rejected_not_raised(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    result = fetcher.fetch("https://careers.example.com:99999/graduates")

    assert isinstance(result, Rejected)
    assert "malformed" in result.reason
    assert httpx_mock.get_requests() == []


@pytest.mark.usefixtures("robots_missing")
def test_a_plain_fetch_returns_the_status_and_body(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")

    result = fetcher.fetch(PAGE)

    assert result == Fetched(status=200, body="<html>graduates</html>")


@pytest.mark.usefixtures("robots_missing")
def test_a_page_already_fetched_today_is_not_fetched_again(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")

    first = fetcher.fetch(PAGE)
    second = fetcher.fetch(PAGE)

    assert isinstance(first, Fetched)
    assert second == AlreadyFetchedToday()
    assert len(page_requests(httpx_mock)) == 1


@pytest.mark.usefixtures("robots_missing")
def test_the_page_can_be_fetched_again_on_the_next_melbourne_day(
    fetcher: PoliteFetcher, clock: ManualClock, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")
    httpx_mock.add_response(url=PAGE, text="<html>graduates</html>")

    fetcher.fetch(PAGE)
    clock.advance(SECONDS_PER_DAY)
    second = fetcher.fetch(PAGE)

    assert isinstance(second, Fetched)
    assert len(page_requests(httpx_mock)) == 2


@pytest.mark.usefixtures("robots_missing")
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
    assert len(page_requests(httpx_mock)) == 2
