"""The polite fetcher: the one place the ethics policy is enforced (ADR-015).

Expected outcomes are returned as typed results, never raised.
"""

from dataclasses import dataclass

import httpx

from internradar_common.claims import ClaimStore
from internradar_common.clock import Clock
from internradar_common.fetch_url import RejectedUrlError, validate_fetch_url
from internradar_common.melbourne import melbourne_day
from internradar_common.spacing import Sleeper


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


FetchResult = Fetched | AlreadyFetchedToday | Rejected


class PoliteFetcher:
    def __init__(
        self, *, client: httpx.Client, clock: Clock, sleeper: Sleeper, claims: ClaimStore
    ) -> None:
        self._client = client
        self._clock = clock
        self._sleeper = sleeper
        self._claims = claims

    def fetch(self, url: str) -> FetchResult:
        try:
            validate_fetch_url(url)
        except RejectedUrlError as error:
            return Rejected(str(error))
        if not self._claims.claim(url, melbourne_day(self._clock.now())):
            return AlreadyFetchedToday()
        response = self._client.get(url)
        return Fetched(status=response.status_code, body=response.text)
