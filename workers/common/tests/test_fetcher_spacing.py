"""PoliteFetcher, cycle C: every request waits its turn per host (ethics policy).

The robots.txt request counts as a request, so the page that follows it waits too. A
Crawl-delay in robots.txt raises the spacing for that host. Nothing waits when no
request is made, and a different host never waits for this one.
"""

import pytest
from internradar_common.fetcher import PoliteFetcher
from internradar_common.testing import FakeSleeper
from pytest_httpx import HTTPXMock

HOST = "https://careers.example.com"
ROBOTS = f"{HOST}/robots.txt"
PAGE = f"{HOST}/graduates"
OTHER_PAGE = f"{HOST}/internships"
BOARDS = "https://boards.example.org"


def test_the_page_waits_five_seconds_after_the_robots_request(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, text="ok")

    fetcher.fetch(PAGE)

    assert sleeper.sleeps == [5]


def test_each_further_page_on_the_same_host_waits_again(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, text="one")
    httpx_mock.add_response(url=OTHER_PAGE, text="two")

    fetcher.fetch(PAGE)
    fetcher.fetch(OTHER_PAGE)

    assert sleeper.sleeps == [5, 5]


def test_a_crawl_delay_in_robots_raises_the_spacing_for_pages(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, text="User-agent: *\nCrawl-delay: 12\n")
    httpx_mock.add_response(url=PAGE, text="one")
    httpx_mock.add_response(url=OTHER_PAGE, text="two")

    fetcher.fetch(PAGE)
    fetcher.fetch(OTHER_PAGE)

    assert sleeper.sleeps == [12, 12]


def test_a_crawl_delay_below_the_floor_does_not_lower_it(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, text="User-agent: *\nCrawl-delay: 1\n")
    httpx_mock.add_response(url=PAGE, text="one")

    fetcher.fetch(PAGE)

    assert sleeper.sleeps == [5]


def test_different_hosts_do_not_wait_for_each_other(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, text="one")
    httpx_mock.add_response(url=f"{BOARDS}/robots.txt", status_code=404)
    httpx_mock.add_response(url=f"{BOARDS}/jobs", text="two")

    fetcher.fetch(PAGE)
    fetcher.fetch(f"{BOARDS}/jobs")

    # One wait per host (robots to page). The second host's robots request did not wait.
    assert sleeper.sleeps == [5, 5]


@pytest.mark.parametrize(
    "robots_text", ["User-agent: *\nDisallow: /graduates\n", "User-agent: *\nDisallow: /\n"]
)
def test_a_disallowed_page_makes_no_second_request_so_nothing_waits(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock, robots_text: str
) -> None:
    httpx_mock.add_response(url=ROBOTS, text=robots_text)

    fetcher.fetch(PAGE)

    assert sleeper.sleeps == []


def test_a_page_already_fetched_today_does_not_wait_again(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)
    httpx_mock.add_response(url=PAGE, text="one")

    fetcher.fetch(PAGE)
    fetcher.fetch(PAGE)

    assert sleeper.sleeps == [5]


def test_a_rejected_url_does_not_wait(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    fetcher.fetch("https://www.seek.com.au/graduate-jobs")

    assert sleeper.sleeps == []
    assert httpx_mock.get_requests() == []
