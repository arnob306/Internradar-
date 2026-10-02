"""PoliteFetcher, cycle E: retries only when there was no response at all.

A timeout or connection failure may be retried, at most 3 attempts in total, and every
attempt waits its turn. Any HTTP response, even an error, is an answer from the host and
is never retried. The day's claim is used up either way (ADR-015).
"""

import httpx
import pytest
from internradar_common.fetcher import (
    AlreadyFetchedToday,
    Fetched,
    HttpError,
    NoResponse,
    PoliteFetcher,
    Validators,
)
from internradar_common.testing import FakeSleeper
from pytest_httpx import HTTPXMock

HOST = "https://careers.example.com"
ROBOTS = f"{HOST}/robots.txt"
PAGE = f"{HOST}/graduates"


@pytest.fixture(autouse=True)
def _robots(robots_missing: None) -> None:
    """Every test here fetches a page, so careers.example.com needs a robots answer."""


def page_requests(httpx_mock: HTTPXMock) -> list[httpx.Request]:
    return [r for r in httpx_mock.get_requests() if r.url.path == "/graduates"]


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectError("refused"),
        httpx.ReadTimeout("slow"),
        httpx.ConnectTimeout("slow"),
        httpx.RemoteProtocolError("dropped"),
    ],
)
def test_a_no_response_failure_is_retried_and_can_succeed(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock, failure: httpx.TransportError
) -> None:
    httpx_mock.add_exception(failure, url=PAGE)
    httpx_mock.add_response(url=PAGE, text="ok")

    result = fetcher.fetch(PAGE)

    assert result == Fetched(status=200, body="ok")
    assert len(page_requests(httpx_mock)) == 2


def test_it_gives_up_after_three_attempts_and_says_how_many(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    for _ in range(3):
        httpx_mock.add_exception(httpx.ReadTimeout("slow"), url=PAGE)

    result = fetcher.fetch(PAGE)

    assert result == NoResponse(attempts=3)
    assert len(page_requests(httpx_mock)) == 3


def test_every_attempt_waits_its_turn(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    for _ in range(3):
        httpx_mock.add_exception(httpx.ConnectError("refused"), url=PAGE)

    fetcher.fetch(PAGE)

    # robots to attempt 1, attempt 1 to 2, attempt 2 to 3
    assert sleeper.sleeps == [5, 5, 5]


def test_retries_respect_a_longer_crawl_delay(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.reset()
    httpx_mock.add_response(url=ROBOTS, text="User-agent: *\nCrawl-delay: 12\n")
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=PAGE)
    httpx_mock.add_response(url=PAGE, text="ok")

    fetcher.fetch(PAGE)

    assert sleeper.sleeps == [12, 12]


def test_a_retry_does_not_refetch_robots_or_claim_again(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=PAGE)
    httpx_mock.add_response(url=PAGE, text="ok")

    fetcher.fetch(PAGE)

    robots = [r for r in httpx_mock.get_requests() if r.url.path == "/robots.txt"]
    assert len(robots) == 1


def test_retries_send_the_same_conditional_headers(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_exception(httpx.ConnectError("refused"), url=PAGE)
    httpx_mock.add_response(url=PAGE, status_code=304)

    fetcher.fetch(PAGE, Validators(etag='"v1"'))

    assert [r.headers.get("if-none-match") for r in page_requests(httpx_mock)] == ['"v1"', '"v1"']


def test_a_failed_fetch_still_uses_up_the_days_claim(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    for _ in range(3):
        httpx_mock.add_exception(httpx.ReadTimeout("slow"), url=PAGE)

    fetcher.fetch(PAGE)

    assert fetcher.fetch(PAGE) == AlreadyFetchedToday()
    assert len(page_requests(httpx_mock)) == 3


@pytest.mark.parametrize("status", [500, 502, 503, 429, 404, 403, 301, 302])
def test_any_http_response_other_than_success_is_returned_and_never_retried(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock, status: int
) -> None:
    httpx_mock.add_response(url=PAGE, status_code=status)

    result = fetcher.fetch(PAGE)

    assert result == HttpError(status=status)
    assert len(page_requests(httpx_mock)) == 1


def test_a_204_is_still_a_success(fetcher: PoliteFetcher, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=PAGE, status_code=204)

    assert fetcher.fetch(PAGE) == Fetched(status=204, body="")
