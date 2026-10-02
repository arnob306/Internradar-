"""One page and one host have one identity, however the URL is spelled.

The fetch-once claim and the 5-second spacing both key on these, so a spelling difference
must never let a page be fetched twice a day or a host be hit without waiting. Found in
code review: "https://h.com" vs "https://h.com/", and ":443" vs no port, were different keys.
"""

from datetime import date

import pytest
from internradar_common.claims import InMemoryClaimStore, claim_key
from internradar_common.fetch_url import host_key
from internradar_common.fetcher import Fetched, PoliteFetcher
from internradar_common.testing import FakeSleeper
from pytest_httpx import HTTPXMock

DAY = date(2026, 10, 2)


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://careers.example.com/x", "careers.example.com"),
        ("https://Careers.Example.COM/x", "careers.example.com"),
        ("https://careers.example.com./x", "careers.example.com"),
        ("https://careers.example.com:443/x", "careers.example.com"),
        ("https://careers.example.com:8443/x", "careers.example.com:8443"),
        ("https://careers.example.com", "careers.example.com"),
    ],
)
def test_host_key_ignores_case_trailing_dot_and_the_default_port(url: str, expected: str) -> None:
    assert host_key(url) == expected


@pytest.mark.parametrize(
    "same",
    [
        "https://careers.example.com",
        "https://careers.example.com/",
        "https://CAREERS.example.com/",
        "https://careers.example.com:443/",
        "https://careers.example.com/#apply",
    ],
)
def test_spellings_of_the_site_root_share_one_claim(same: str) -> None:
    store = InMemoryClaimStore()
    store.claim("https://careers.example.com/", DAY)

    assert store.claim(same, DAY) is False


def test_the_default_port_is_the_same_page_but_another_port_is_not() -> None:
    store = InMemoryClaimStore()
    store.claim("https://careers.example.com/graduates", DAY)

    assert store.claim("https://careers.example.com:443/graduates", DAY) is False
    assert store.claim("https://careers.example.com:8443/graduates", DAY) is True


def test_claim_key_is_the_normalised_form() -> None:
    assert claim_key("https://CAREERS.example.com:443") == "https://careers.example.com/"
    assert claim_key("https://careers.example.com/a?b=1#c") == "https://careers.example.com/a?b=1"


def test_a_default_port_spelling_waits_like_the_bare_host_and_reuses_robots(
    fetcher: PoliteFetcher, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url="https://careers.example.com/robots.txt", status_code=404)
    httpx_mock.add_response(url="https://careers.example.com/graduates", text="one")
    httpx_mock.add_response(url="https://careers.example.com/internships", text="two")

    first = fetcher.fetch("https://careers.example.com/graduates")
    second = fetcher.fetch("https://careers.example.com:443/internships")

    assert isinstance(first, Fetched)
    assert isinstance(second, Fetched)
    # robots to page one, then page one to page two: it is one host, so it waits both times.
    assert sleeper.sleeps == [5, 5]
    robots = [r for r in httpx_mock.get_requests() if r.url.path == "/robots.txt"]
    assert len(robots) == 1
