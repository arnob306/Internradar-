"""PoliteFetcher, cycle F: identify ourselves, bound the wait, bound the download.

Every request, robots.txt included, names us and links to the project so a site owner can
find out who is fetching and why. A request never waits forever and a response is never
read past a size cap (docs/ethics-policy.md).
"""

import httpx
import pytest
from internradar_common.claims import InMemoryClaimStore
from internradar_common.fetcher import (
    MAX_BODY_BYTES,
    REQUEST_TIMEOUT_SECONDS,
    USER_AGENT,
    AlreadyFetchedToday,
    DisallowedByRobots,
    Fetched,
    PoliteFetcher,
    TooLarge,
)
from internradar_common.testing import FakeSleeper, ManualClock
from pytest_httpx import HTTPXMock

HOST = "https://careers.example.com"
ROBOTS = f"{HOST}/robots.txt"
PAGE = f"{HOST}/graduates"
SMALL_CAP = 100


@pytest.fixture
def small_fetcher(
    claims: InMemoryClaimStore, clock: ManualClock, sleeper: FakeSleeper
) -> PoliteFetcher:
    return PoliteFetcher(
        client=httpx.Client(),
        clock=clock,
        sleeper=sleeper,
        claims=claims,
        max_body_bytes=SMALL_CAP,
    )


def test_the_user_agent_names_the_project_and_links_to_it() -> None:
    assert USER_AGENT == "InternRadar/0.1 (+https://github.com/arnob306/Internradar-)"


def test_every_request_sends_our_user_agent_whatever_the_client_default_is(
    claims: InMemoryClaimStore, clock: ManualClock, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, text="ok")
    client = httpx.Client(headers={"User-Agent": "someone-else/9.9"})
    fetcher = PoliteFetcher(client=client, clock=clock, sleeper=sleeper, claims=claims)

    fetcher.fetch(PAGE)

    agents = [r.headers["user-agent"] for r in httpx_mock.get_requests()]
    assert agents == [USER_AGENT, USER_AGENT]


def test_every_request_has_a_timeout(fetcher: PoliteFetcher, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, text="ok")

    fetcher.fetch(PAGE)

    expected = {
        "connect": REQUEST_TIMEOUT_SECONDS,
        "read": REQUEST_TIMEOUT_SECONDS,
        "write": REQUEST_TIMEOUT_SECONDS,
        "pool": REQUEST_TIMEOUT_SECONDS,
    }
    assert [r.extensions["timeout"] for r in httpx_mock.get_requests()] == [expected, expected]


def test_the_default_limits_are_ten_seconds_and_five_mebibytes() -> None:
    assert REQUEST_TIMEOUT_SECONDS == 10
    assert MAX_BODY_BYTES == 5 * 1024 * 1024


def test_a_body_exactly_at_the_cap_is_accepted(
    small_fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, content=b"x" * SMALL_CAP)

    result = small_fetcher.fetch(PAGE)

    assert result == Fetched(status=200, body="x" * SMALL_CAP)


def test_a_body_one_byte_over_the_cap_is_refused(
    small_fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, content=b"x" * (SMALL_CAP + 1))

    result = small_fetcher.fetch(PAGE)

    assert result == TooLarge(limit=SMALL_CAP)


def test_a_body_that_is_too_large_still_uses_up_the_days_claim(
    small_fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, content=b"x" * (SMALL_CAP + 1))

    small_fetcher.fetch(PAGE)

    assert small_fetcher.fetch(PAGE) == AlreadyFetchedToday()


def test_a_robots_file_over_the_cap_forbids_the_host(
    small_fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, content=b"#" * (SMALL_CAP + 1))

    assert small_fetcher.fetch(PAGE) == DisallowedByRobots()


def test_the_body_is_decoded_with_the_charset_the_server_declared(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(
        url=PAGE,
        content="café".encode("iso-8859-1"),
        headers={"Content-Type": "text/html; charset=iso-8859-1"},
    )

    assert fetcher.fetch(PAGE) == Fetched(status=200, body="café")
