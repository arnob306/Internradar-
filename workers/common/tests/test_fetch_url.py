"""Only employer pages and public ATS feeds may be fetched (docs/ethics-policy.md).

Aggregators (SEEK, Prosple, GradConnection) are refused by host, including subdomains,
before any network activity. URLs come from our own seed data, never from users, but the
check still runs so a bad seed row cannot cause a request.
"""

import pytest
from internradar_common.fetch_url import RejectedUrlError, validate_fetch_url


@pytest.mark.parametrize(
    "url",
    [
        "https://www.optiver.com/working-at-optiver/career-opportunities/",
        "https://boards-api.greenhouse.io/v1/boards/imc/jobs",
        "https://job-boards.greenhouse.io/optiver",
        "https://careers.example.com.au/graduates?team=tech#apply",
    ],
)
def test_an_ordinary_https_employer_url_is_accepted(url: str) -> None:
    assert validate_fetch_url(url) == url


@pytest.mark.parametrize(
    "url",
    [
        "https://www.seek.com.au/graduate-jobs",
        "https://seek.com.au/job/123",
        "https://au.prosple.com/graduate-employers/optiver",
        "https://prosple.com/",
        "https://gradconnection.com/graduate-jobs/",
        "https://www.gradconnection.com/employers/imc",
        "https://www.seek.com/",
        "https://WWW.SEEK.COM.AU/jobs",
        "https://www.seek.com.au./jobs",
    ],
)
def test_aggregator_hosts_are_refused(url: str) -> None:
    with pytest.raises(RejectedUrlError, match="aggregator"):
        validate_fetch_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "https://notseek.com.au/careers",
        "https://seek.com.au.example.com/careers",
        "https://myprosple.com/",
    ],
)
def test_lookalike_hosts_are_not_mistaken_for_aggregators(url: str) -> None:
    assert validate_fetch_url(url) == url


@pytest.mark.parametrize(
    ("url", "reason"),
    [
        ("http://www.optiver.com/careers", "https"),
        ("ftp://www.optiver.com/careers", "https"),
        ("file:///etc/passwd", "https"),
        ("//www.optiver.com/careers", "https"),
        ("https:///careers", "host"),
        ("https://user:pass@www.optiver.com/careers", "credentials"),
        ("https://127.0.0.1/careers", "address"),
        ("https://[::1]/careers", "address"),
        ("https://localhost/careers", "address"),
        ("", "https"),
        ("https://[::1/careers", "malformed"),
    ],
)
def test_unsafe_or_malformed_urls_are_refused(url: str, reason: str) -> None:
    with pytest.raises(RejectedUrlError, match=reason):
        validate_fetch_url(url)


PREFIX = "https://careers.example.com/"


def test_a_url_of_exactly_2048_characters_is_accepted() -> None:
    url = PREFIX + "x" * (2048 - len(PREFIX))

    assert len(url) == 2048
    assert validate_fetch_url(url) == url


def test_a_url_over_2048_characters_is_refused_to_match_the_claims_table_limit() -> None:
    # fetch_claims.url_key is limited to 2048 characters, so a longer URL would otherwise
    # crash the run at the database instead of being rejected here.
    with pytest.raises(RejectedUrlError, match="too long"):
        validate_fetch_url(PREFIX + "x" * (2049 - len(PREFIX)))


@pytest.mark.parametrize("port", ["99999", "abc", "-1", "65536"])
def test_an_invalid_port_is_refused_rather_than_crashing_later(port: str) -> None:
    with pytest.raises(RejectedUrlError, match="malformed"):
        validate_fetch_url(f"https://careers.example.com:{port}/graduates")
