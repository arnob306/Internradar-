"""The polite fetcher: the one place the ethics policy is enforced (ADR-015).

Expected outcomes are returned as typed results, never raised.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date

import httpx

from internradar_common.claims import ClaimStore
from internradar_common.clock import Clock
from internradar_common.fetch_url import RejectedUrlError, host_key, validate_fetch_url
from internradar_common.melbourne import melbourne_day
from internradar_common.robots import RobotsPolicy, policy_from_response
from internradar_common.spacing import HostSpacer, Sleeper

# The product token robots.txt groups are matched against.
ROBOTS_AGENT = "InternRadar"

# Names the project and links to it, so a site owner can see who is fetching and why.
USER_AGENT = f"{ROBOTS_AGENT}/0.1 (+https://github.com/arnob306/Internradar-)"

# Total attempts per claimed page, counting the first. Only no-response failures retry.
MAX_ATTEMPTS = 3

REQUEST_TIMEOUT_SECONDS = 10
# httpx's timeout is per read, so a server dripping bytes would never trip it. This is the
# budget for the whole response; reading stops once it is spent.
MAX_TOTAL_SECONDS = 30
MAX_BODY_BYTES = 5 * 1024 * 1024


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


@dataclass(frozen=True)
class TooLarge:
    """The response body passed the size cap, so reading stopped."""

    limit: int


@dataclass(frozen=True)
class TooSlow:
    """The response took longer than the total time budget, so reading stopped."""

    limit_seconds: float


FetchResult = (
    Fetched
    | NotModified
    | AlreadyFetchedToday
    | Rejected
    | DisallowedByRobots
    | HttpError
    | NoResponse
    | TooLarge
    | TooSlow
)


@dataclass(frozen=True)
class _Answer:
    """A complete HTTP response whose body stayed within the size and time limits."""

    status: int
    headers: httpx.Headers
    body: str


def _conditional_headers(validators: Validators | None) -> dict[str, str]:
    if validators is None:
        return {}
    headers: dict[str, str] = {}
    if validators.etag is not None:
        headers["If-None-Match"] = validators.etag
    if validators.last_modified is not None:
        headers["If-Modified-Since"] = validators.last_modified
    return headers


def _result_from(answer: _Answer) -> Fetched | NotModified | HttpError:
    if answer.status == httpx.codes.NOT_MODIFIED:
        return NotModified()
    if not httpx.codes.is_success(answer.status):
        return HttpError(status=answer.status)
    return Fetched(
        status=answer.status,
        body=answer.body,
        etag=answer.headers.get("etag"),
        last_modified=answer.headers.get("last-modified"),
    )


class PoliteFetcher:
    def __init__(  # noqa: PLR0913 - every collaborator is injected so tests control it
        self,
        *,
        client: httpx.Client,
        clock: Clock,
        sleeper: Sleeper,
        claims: ClaimStore,
        max_body_bytes: int = MAX_BODY_BYTES,
        max_total_seconds: float = MAX_TOTAL_SECONDS,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._client = client
        self._clock = clock
        self._spacer = HostSpacer(clock, sleeper)
        self._claims = claims
        self._max_body_bytes = max_body_bytes
        self._max_total_seconds = max_total_seconds
        self._monotonic = monotonic
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
        page = self._get_page(url, _conditional_headers(validators), policy.crawl_delay)
        if isinstance(page, TooLarge | TooSlow | NoResponse):
            return page
        return _result_from(page)

    def _get_page(
        self, url: str, headers: dict[str, str], crawl_delay: float | None
    ) -> _Answer | TooLarge | TooSlow | NoResponse:
        """GET the page, retrying only when no response came back at all."""
        host = host_key(url)
        for _ in range(MAX_ATTEMPTS):
            self._spacer.wait_turn(host, crawl_delay)
            try:
                return self._read(url, headers)
            except httpx.TransportError:
                continue
        return NoResponse(attempts=MAX_ATTEMPTS)

    def _read(self, url: str, headers: dict[str, str]) -> _Answer | TooLarge | TooSlow:
        """One request, stopping as soon as the body passes the size cap or the time budget."""
        request_headers = {**headers, "User-Agent": USER_AGENT}
        deadline = self._monotonic() + self._max_total_seconds
        # Never follow a redirect, whatever the client defaults to: a followed redirect
        # would skip the denylist, robots.txt, the claim and the spacing for the new host.
        with self._client.stream(
            "GET",
            url,
            headers=request_headers,
            timeout=REQUEST_TIMEOUT_SECONDS,
            follow_redirects=False,
        ) as response:
            content = bytearray()
            for chunk in response.iter_bytes():
                content.extend(chunk)
                if len(content) > self._max_body_bytes:
                    return TooLarge(limit=self._max_body_bytes)
                if self._monotonic() > deadline:
                    return TooSlow(limit_seconds=self._max_total_seconds)
            return _Answer(
                status=response.status_code,
                headers=response.headers,
                # httpx already falls back to utf-8 for a charset Python does not know.
                body=bytes(content).decode(response.encoding or "utf-8", errors="replace"),
            )

    def _robots_policy(self, url: str, day: date) -> RobotsPolicy:
        """The host's policy, fetched at most once per run."""
        origin = f"https://{host_key(url)}"
        if origin not in self._robots:
            self._robots[origin] = self._load_robots(f"{origin}/robots.txt", day)
        return self._robots[origin]

    def _load_robots(self, robots_url: str, day: date) -> RobotsPolicy:
        # robots.txt is also fetched once per day. If an earlier run took the claim but
        # we never saw its answer, we cannot know what the owner wants, so fail closed.
        if not self._claims.claim(robots_url, day):
            return policy_from_response(None, None, ROBOTS_AGENT)
        self._spacer.wait_turn(host_key(robots_url))
        try:
            answer = self._read(robots_url, {})
        except httpx.TransportError:
            return policy_from_response(None, None, ROBOTS_AGENT)
        if isinstance(answer, TooLarge | TooSlow):
            return policy_from_response(None, None, ROBOTS_AGENT)
        return policy_from_response(answer.status, answer.body, ROBOTS_AGENT)
