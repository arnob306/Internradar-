from collections.abc import Iterator

import httpx
import psycopg
import pytest
from internradar_common.claims import InMemoryClaimStore
from internradar_common.fetcher import PoliteFetcher
from internradar_common.testing import FakeSleeper, ManualClock
from internradar_common.testing_db import admin_connection, clean_test_data, worker_connection
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
def admin_db() -> Iterator[psycopg.Connection]:
    """Setup and cleanup only; the code under test always uses the worker role."""
    with admin_connection() as connection:
        clean_test_data(connection)
        yield connection
        clean_test_data(connection)


@pytest.fixture
def worker_db(admin_db: psycopg.Connection) -> Iterator[psycopg.Connection]:
    with worker_connection() as connection:
        yield connection


@pytest.fixture
def robots_missing(httpx_mock: HTTPXMock) -> None:
    """careers.example.com has no robots.txt, so everything on it is allowed."""
    httpx_mock.add_response(url="https://careers.example.com/robots.txt", status_code=404)
