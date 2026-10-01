import httpx
import pytest
from internradar_common.claims import InMemoryClaimStore
from internradar_common.fetcher import PoliteFetcher
from internradar_common.testing import FakeSleeper, ManualClock
from pytest_httpx import HTTPXMock


@pytest.fixture
def clock() -> ManualClock:
    return ManualClock()


@pytest.fixture
def sleeper(clock: ManualClock) -> FakeSleeper:
    return FakeSleeper(clock)


@pytest.fixture
def claims() -> InMemoryClaimStore:
    return InMemoryClaimStore()


@pytest.fixture
def fetcher(claims: InMemoryClaimStore, clock: ManualClock, sleeper: FakeSleeper) -> PoliteFetcher:
    return PoliteFetcher(client=httpx.Client(), clock=clock, sleeper=sleeper, claims=claims)


@pytest.fixture
def robots_missing(httpx_mock: HTTPXMock) -> None:
    """careers.example.com has no robots.txt, so everything on it is allowed."""
    httpx_mock.add_response(url="https://careers.example.com/robots.txt", status_code=404)
