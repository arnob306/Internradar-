"""PoliteFetcher, cycle B: robots.txt is checked before any page is claimed or fetched.

Fail closed: if we cannot learn what the owner wants, we do not fetch (ethics policy).
A path that robots.txt forbids does not use up the page's claim for the day.
"""

from datetime import date

import httpx
import pytest
from internradar_common.claims import InMemoryClaimStore
from internradar_common.fetcher import DisallowedByRobots, Fetched, PoliteFetcher
from internradar_common.testing import FakeSleeper, ManualClock
from pytest_httpx import HTTPXMock

HOST = "https://careers.example.com"
ROBOTS = f"{HOST}/robots.txt"
PAGE = f"{HOST}/graduates"
OTHER_PAGE = f"{HOST}/internships"
DAY = date(2026, 10, 1)


def paths(httpx_mock: HTTPXMock) -> list[str]:
    return [r.url.path for r in httpx_mock.get_requests()]


def test_robots_is_fetched_before_the_page(fetcher: PoliteFetcher, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, text="<html>ok</html>")

    result = fetcher.fetch(PAGE)

    assert result == Fetched(status=200, body="<html>ok</html>")
    assert paths(httpx_mock) == ["/robots.txt", "/graduates"]


def test_a_path_forbidden_by_robots_is_not_fetched_and_keeps_its_claim(
    fetcher: PoliteFetcher, claims: InMemoryClaimStore, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, text="User-agent: *\nDisallow: /graduates\n")

    result = fetcher.fetch(PAGE)

    assert result == DisallowedByRobots()
    assert paths(httpx_mock) == ["/robots.txt"]
    assert claims.claim(PAGE, DAY) is True


def test_a_group_that_names_our_agent_is_used_instead_of_the_wildcard_group(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(
        url=ROBOTS,
        text="User-agent: *\nDisallow: /\n\nUser-agent: InternRadar\nAllow: /graduates\n",
    )
    httpx_mock.add_response(url=PAGE, text="<html>ok</html>")

    assert isinstance(fetcher.fetch(PAGE), Fetched)


@pytest.mark.parametrize("status", [500, 503, 429, 301])
def test_a_failing_or_redirecting_robots_file_forbids_the_whole_host(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock, status: int
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=status)

    result = fetcher.fetch(PAGE)

    assert result == DisallowedByRobots()
    assert paths(httpx_mock) == ["/robots.txt"]


def test_no_response_for_robots_forbids_the_whole_host(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_exception(httpx.ConnectError("unreachable"), url=ROBOTS)

    assert fetcher.fetch(PAGE) == DisallowedByRobots()
    assert paths(httpx_mock) == ["/robots.txt"]


def test_robots_is_fetched_once_per_host_per_run(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, text="<html>one</html>")
    httpx_mock.add_response(url=OTHER_PAGE, text="<html>two</html>")

    fetcher.fetch(PAGE)
    fetcher.fetch(OTHER_PAGE)

    assert paths(httpx_mock) == ["/robots.txt", "/graduates", "/internships"]


def test_each_host_gets_its_own_robots_check(fetcher: PoliteFetcher, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=ROBOTS, text="User-agent: *\nDisallow: /\n")
    httpx_mock.add_response(url="https://boards.example.org/robots.txt", status_code=404)
    httpx_mock.add_response(url="https://boards.example.org/jobs", text="<html>jobs</html>")

    assert fetcher.fetch(PAGE) == DisallowedByRobots()
    assert isinstance(fetcher.fetch("https://boards.example.org/jobs"), Fetched)


def test_a_robots_file_already_claimed_today_but_unknown_forbids_the_host(
    claims: InMemoryClaimStore, clock: ManualClock, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    # An earlier run took today's robots claim but this run never saw its answer, and we
    # may not fetch it twice in a day, so we fail closed.
    claims.claim(ROBOTS, DAY)
    fetcher = PoliteFetcher(client=httpx.Client(), clock=clock, sleeper=sleeper, claims=claims)

    assert fetcher.fetch(PAGE) == DisallowedByRobots()
    assert httpx_mock.get_requests() == []
