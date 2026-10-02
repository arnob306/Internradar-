"""PoliteFetcher, cycle D: conditional GETs, so unchanged pages cost the host almost nothing.

The caller passes the validators stored from the last fetch. A 304 means unchanged. A 200
returns the page's new validators for the caller to store.
"""

import pytest
from internradar_common.fetcher import (
    AlreadyFetchedToday,
    Fetched,
    NotModified,
    PoliteFetcher,
    Validators,
)
from pytest_httpx import HTTPXMock

HOST = "https://careers.example.com"
PAGE = f"{HOST}/graduates"
ETAG = '"v1-abc"'
LAST_MODIFIED = "Wed, 30 Sep 2026 02:00:00 GMT"


@pytest.fixture(autouse=True)
def _robots(robots_missing: None) -> None:
    """Every test here fetches a page, so careers.example.com needs a robots answer."""


def page_request_headers(httpx_mock: HTTPXMock) -> dict[str, str]:
    (request,) = [r for r in httpx_mock.get_requests() if r.url.path == "/graduates"]
    return dict(request.headers)


def test_no_validators_means_no_conditional_headers(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, text="ok")

    fetcher.fetch(PAGE)

    headers = page_request_headers(httpx_mock)
    assert "if-none-match" not in headers
    assert "if-modified-since" not in headers


@pytest.mark.parametrize(
    ("validators", "expected"),
    [
        (Validators(etag=ETAG), {"if-none-match": ETAG}),
        (Validators(last_modified=LAST_MODIFIED), {"if-modified-since": LAST_MODIFIED}),
        (
            Validators(etag=ETAG, last_modified=LAST_MODIFIED),
            {"if-none-match": ETAG, "if-modified-since": LAST_MODIFIED},
        ),
    ],
)
def test_stored_validators_are_sent_as_conditional_headers(
    fetcher: PoliteFetcher,
    httpx_mock: HTTPXMock,
    validators: Validators,
    expected: dict[str, str],
) -> None:
    httpx_mock.add_response(url=PAGE, text="ok")

    fetcher.fetch(PAGE, validators)

    headers = page_request_headers(httpx_mock)
    assert {k: v for k, v in headers.items() if k.startswith("if-")} == expected


def test_a_304_means_not_modified(fetcher: PoliteFetcher, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=PAGE, status_code=304)

    result = fetcher.fetch(PAGE, Validators(etag=ETAG))

    assert result == NotModified()


def test_a_304_still_uses_up_the_pages_claim_for_the_day(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, status_code=304)

    fetcher.fetch(PAGE, Validators(etag=ETAG))

    assert fetcher.fetch(PAGE, Validators(etag=ETAG)) == AlreadyFetchedToday()


def test_a_200_returns_the_new_validators(fetcher: PoliteFetcher, httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(
        url=PAGE, text="new", headers={"ETag": '"v2-def"', "Last-Modified": LAST_MODIFIED}
    )

    result = fetcher.fetch(PAGE, Validators(etag=ETAG))

    assert result == Fetched(status=200, body="new", etag='"v2-def"', last_modified=LAST_MODIFIED)


def test_a_200_without_validator_headers_returns_none_for_both(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, text="plain")

    result = fetcher.fetch(PAGE)

    assert result == Fetched(status=200, body="plain", etag=None, last_modified=None)


def test_the_robots_request_is_never_conditional(
    fetcher: PoliteFetcher, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url=PAGE, text="ok")

    fetcher.fetch(PAGE, Validators(etag=ETAG, last_modified=LAST_MODIFIED))

    (robots,) = [r for r in httpx_mock.get_requests() if r.url.path == "/robots.txt"]
    assert "if-none-match" not in robots.headers
    assert "if-modified-since" not in robots.headers
