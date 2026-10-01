"""The polite fetcher: the one place the ethics policy is enforced (ADR-015).

Expected outcomes are returned as typed results, never raised.
"""

from dataclasses import dataclass
from datetime import date
from urllib.parse import urlsplit

import httpx

from internradar_common.claims import ClaimStore
from internradar_common.clock import Clock
from internradar_common.fetch_url import RejectedUrlError, validate_fetch_url
from internradar_common.melbourne import melbourne_day
from internradar_common.robots import RobotsPolicy, policy_from_response
from internradar_common.spacing import HostSpacer, Sleeper

# The product token robots.txt groups are matched against.
ROBOTS_AGENT = "InternRadar"


@dataclass(frozen=True)
class Validators:
    """What the server told us about a page last time, so we can ask "has it changed?"."""

    etag: str | None = None
    last_modified: str | None = None


@dataclass(frozen=True)
class Fetched:
    status: int
    body: str
    etag: str | None = None
    last_modified: str | None = None


@dataclass(frozen=True)
class NotModified:
    """The server answered 304: the page is unchanged since the validators were stored."""


@dataclass(frozen=True)
class AlreadyFetchedToday:
    """The page's claim for this Melbourne day was already taken."""


@dataclass(frozen=True)
class Rejected:
    """The URL may never be fetched; no claim was taken and no request was made."""

    reason: str


@dataclass(frozen=True)
class DisallowedByRobots:
    """robots.txt forbids the path, or we could not learn what the host's owner wants."""


@dataclass(frozen=True)
class HttpError:
    """The host answered with something other than success; never retried."""

    status: int


@dataclass(frozen=True)
class NoResponse:
    """Every attempt failed before any HTTP response (timeout, connection error)."""

    attempts: int


FetchResult = (
    Fetched
    | NotModified
    | AlreadyFetchedToday
    | Rejected
    | DisallowedByRobots
    | HttpError
    | NoResponse
)

# Total attempts per claimed page, counting the first. Only no-response failures retry.
MAX_ATTEMPTS = 3


def _conditional_headers(validators: Validators | None) -> dict[str, str]:
    if validators is None:
        return {}
    headers: dict[str, str] = {}
    if validators.etag is not None:
        headers["If-None-Match"] = validators.etag
    if validators.last_modified is not None:
        headers["If-Modified-Since"] = validators.last_modified
    return headers


def _result_from(response: httpx.Response) -> Fetched | NotModified | HttpError:
    if response.status_code == httpx.codes.NOT_MODIFIED:
        return NotModified()
    if not response.is_success:
        return HttpError(status=response.status_code)
    return Fetched(
        status=response.status_code,
        body=response.text,
        etag=response.headers.get("etag"),
        last_modified=response.headers.get("last-modified"),
    )


class PoliteFetcher:
    def __init__(
        self, *, client: httpx.Client, clock: Clock, sleeper: Sleeper, claims: ClaimStore
    ) -> None:
        self._client = client
        self._clock = clock
        self._spacer = HostSpacer(clock, sleeper)
        self._claims = claims
        self._robots: dict[str, RobotsPolicy] = {}

    def fetch(self, url: str, validators: Validators | None = None) -> FetchResult:
        try:
            validate_fetch_url(url)
        except RejectedUrlError as error:
            return Rejected(str(error))
        day = melbourne_day(self._clock.now())
        policy = self._robots_policy(url, day)
        if not policy.can_fetch(url):
            return DisallowedByRobots()
        if not self._claims.claim(url, day):
            return AlreadyFetchedToday()
        response = self._get_page(url, _conditional_headers(validators), policy.crawl_delay)
        if isinstance(response, NoResponse):
            return response
        return _result_from(response)

    def _get_page(
        self, url: str, headers: dict[str, str], crawl_delay: float | None
    ) -> httpx.Response | NoResponse:
        """GET the page, retrying only when no response came back at all."""
        host = urlsplit(url).netloc
        for _ in range(MAX_ATTEMPTS):
            self._spacer.wait_turn(host, crawl_delay)
            try:
                return self._client.get(url, headers=headers)
            except httpx.TransportError:
                continue
        return NoResponse(attempts=MAX_ATTEMPTS)

    def _robots_policy(self, url: str, day: date) -> RobotsPolicy:
        """The host's policy, fetched at most once per run."""
        origin = f"https://{urlsplit(url).netloc.lower()}"
        if origin not in self._robots:
            self._robots[origin] = self._load_robots(f"{origin}/robots.txt", day)
        return self._robots[origin]

    def _load_robots(self, robots_url: str, day: date) -> RobotsPolicy:
        # robots.txt is also fetched once per day. If an earlier run took the claim but
        # we never saw its answer, we cannot know what the owner wants, so fail closed.
        if not self._claims.claim(robots_url, day):
            return policy_from_response(None, None, ROBOTS_AGENT)
        self._spacer.wait_turn(urlsplit(robots_url).netloc)
        try:
            response = self._client.get(robots_url)
        except httpx.TransportError:
            return policy_from_response(None, None, ROBOTS_AGENT)
        return policy_from_response(response.status_code, response.text, ROBOTS_AGENT)
