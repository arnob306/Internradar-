"""robots.txt decisions (docs/ethics-policy.md, RFC 9309).

A successful response is parsed. A missing file (404 and other 4xx) means everything is
allowed. A server error, rate limit or no response at all means nothing is fetched from
that host for the day, because we cannot tell what the owner wants.
"""

import pytest
from internradar_common.robots import RobotsPolicy, policy_from_response

AGENT = "InternRadar"
HOST = "https://careers.example.com"

WILDCARD_GROUP = """\
User-agent: *
Disallow: /private/
Disallow: /*.pdf$
Allow: /private/public-note
Crawl-delay: 12
"""

ROBOTS = WILDCARD_GROUP + """
User-agent: InternRadar
Disallow: /internal/
"""


def parse(body: str) -> RobotsPolicy:
    return policy_from_response(200, body, AGENT)


def test_a_specific_group_for_our_agent_beats_the_wildcard_group() -> None:
    policy = parse(ROBOTS)

    assert policy.can_fetch(f"{HOST}/graduates")
    assert policy.can_fetch(f"{HOST}/private/page")  # wildcard group does not apply to us
    assert not policy.can_fetch(f"{HOST}/internal/page")


def test_wildcard_and_end_anchor_patterns_are_honoured() -> None:
    policy = parse(WILDCARD_GROUP)

    assert not policy.can_fetch(f"{HOST}/files/brochure.pdf")
    assert policy.can_fetch(f"{HOST}/files/brochure.pdf.html")


def test_a_longer_allow_overrides_a_shorter_disallow() -> None:
    policy = parse(WILDCARD_GROUP)

    assert not policy.can_fetch(f"{HOST}/private/page")
    assert policy.can_fetch(f"{HOST}/private/public-note")


def test_crawl_delay_is_exposed_when_declared() -> None:
    assert parse(WILDCARD_GROUP).crawl_delay == 12
    assert parse(ROBOTS).crawl_delay is None


def test_an_empty_robots_file_allows_everything() -> None:
    policy = parse("")

    assert policy.can_fetch(f"{HOST}/anything")
    assert policy.crawl_delay is None


@pytest.mark.parametrize("status", [404, 410, 401, 403])
def test_a_missing_or_restricted_robots_file_allows_everything(status: int) -> None:
    policy = policy_from_response(status, None, AGENT)

    assert policy.can_fetch(f"{HOST}/anything")


@pytest.mark.parametrize("status", [500, 502, 503, 429, None])
def test_an_unreachable_robots_file_forbids_everything(status: int | None) -> None:
    policy = policy_from_response(status, None, AGENT)

    assert not policy.can_fetch(f"{HOST}/anything")
    assert not policy.can_fetch(f"{HOST}/")


def test_an_unresolved_redirect_forbids_everything() -> None:
    assert not policy_from_response(302, None, AGENT).can_fetch(f"{HOST}/")


def test_a_successful_response_without_a_body_forbids_everything() -> None:
    assert not policy_from_response(200, None, AGENT).can_fetch(f"{HOST}/")
