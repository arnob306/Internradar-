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
from internradar_common.spacing import Sleeper

# The product token robots.txt groups are matched against.
ROBOTS_AGENT = "InternRadar"


@dataclass(frozen=True)
class Fetched:
    status: int
    body: str


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


FetchResult = Fetched | AlreadyFetchedToday | Rejected | DisallowedByRobots


class PoliteFetcher:
    def __init__(
        self, *, client: httpx.Client, clock: Clock, sleeper: Sleeper, claims: ClaimStore
    ) -> None:
        self._client = client
        self._clock = clock
        self._sleeper = sleeper
        self._claims = claims
        self._robots: dict[str, RobotsPolicy] = {}

    def fetch(self, url: str) -> FetchResult:
        try:
            validate_fetch_url(url)
        except RejectedUrlError as error:
            return Rejected(str(error))
        day = melbourne_day(self._clock.now())
        if not self._robots_policy(url, day).can_fetch(url):
            return DisallowedByRobots()
        if not self._claims.claim(url, day):
            return AlreadyFetchedToday()
        response = self._client.get(url)
        return Fetched(status=response.status_code, body=response.text)

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
        try:
            response = self._client.get(robots_url)
        except httpx.TransportError:
            return policy_from_response(None, None, ROBOTS_AGENT)
        return policy_from_response(response.status_code, response.text, ROBOTS_AGENT)
