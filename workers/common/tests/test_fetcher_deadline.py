"""PoliteFetcher: a response must finish within a total time budget.

httpx's timeout applies to each read, not to the whole response, so a server that drips
one byte every few seconds would never trip it (found in code review). The fetcher keeps
its own deadline on a monotonic clock and stops reading when it passes.
"""

from collections.abc import Iterator

import httpx
import pytest
from internradar_common.claims import InMemoryClaimStore
from internradar_common.fetcher import (
    MAX_TOTAL_SECONDS,
    DisallowedByRobots,
    Fetched,
    PoliteFetcher,
    TooSlow,
)
from internradar_common.testing import FakeSleeper, ManualClock

PAGE = "https://careers.example.com/graduates"
BUDGET = 30


class Ticker:
    """A fake monotonic clock that moves only when a slow stream produces a chunk."""

    def __init__(self) -> None:
        self.now = 0.0
        self.chunks_sent = 0

    def __call__(self) -> float:
        return self.now


def slow_body(ticker: Ticker, chunks: int, seconds_per_chunk: float) -> Iterator[bytes]:
    for _ in range(chunks):
        ticker.now += seconds_per_chunk
        ticker.chunks_sent += 1
        yield b"x"


def fetcher_for(
    ticker: Ticker,
    *,
    slow_path: str,
    chunks: int,
    seconds_per_chunk: float,
    claims: InMemoryClaimStore,
    clock: ManualClock,
    sleeper: FakeSleeper,
) -> PoliteFetcher:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == slow_path:
            return httpx.Response(200, content=slow_body(ticker, chunks, seconds_per_chunk))
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        return httpx.Response(200, text="ok")

    return PoliteFetcher(
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        clock=clock,
        sleeper=sleeper,
        claims=claims,
        monotonic=ticker,
        max_total_seconds=BUDGET,
    )


def test_the_default_total_budget_is_thirty_seconds() -> None:
    assert MAX_TOTAL_SECONDS == 30


def test_a_slow_drip_response_is_abandoned_once_the_budget_is_spent(
    claims: InMemoryClaimStore, clock: ManualClock, sleeper: FakeSleeper
) -> None:
    ticker = Ticker()
    fetcher = fetcher_for(
        ticker,
        slow_path="/graduates",
        chunks=100,
        seconds_per_chunk=9,
        claims=claims,
        clock=clock,
        sleeper=sleeper,
    )

    result = fetcher.fetch(PAGE)

    assert result == TooSlow(limit_seconds=BUDGET)
    # 9 seconds a chunk passes 30 seconds on the fourth chunk, and reading stops there.
    assert ticker.chunks_sent <= 5


def test_a_response_that_finishes_inside_the_budget_is_returned_whole(
    claims: InMemoryClaimStore, clock: ManualClock, sleeper: FakeSleeper
) -> None:
    ticker = Ticker()
    fetcher = fetcher_for(
        ticker,
        slow_path="/graduates",
        chunks=3,
        seconds_per_chunk=9,
        claims=claims,
        clock=clock,
        sleeper=sleeper,
    )

    assert fetcher.fetch(PAGE) == Fetched(status=200, body="xxx")


@pytest.mark.parametrize("seconds_per_chunk", [0, 0.5])
def test_a_fast_response_is_never_affected(
    claims: InMemoryClaimStore, clock: ManualClock, sleeper: FakeSleeper, seconds_per_chunk: float
) -> None:
    ticker = Ticker()
    fetcher = fetcher_for(
        ticker,
        slow_path="/graduates",
        chunks=10,
        seconds_per_chunk=seconds_per_chunk,
        claims=claims,
        clock=clock,
        sleeper=sleeper,
    )

    assert fetcher.fetch(PAGE) == Fetched(status=200, body="x" * 10)


def test_a_slow_robots_file_forbids_the_whole_host(
    claims: InMemoryClaimStore, clock: ManualClock, sleeper: FakeSleeper
) -> None:
    ticker = Ticker()
    fetcher = fetcher_for(
        ticker,
        slow_path="/robots.txt",
        chunks=100,
        seconds_per_chunk=9,
        claims=claims,
        clock=clock,
        sleeper=sleeper,
    )

    assert fetcher.fetch(PAGE) == DisallowedByRobots()
