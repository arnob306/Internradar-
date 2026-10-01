"""PostgresClaimStore: the fetch-once-per-day rule, kept in the database (ADR-015).

Runs against the local Supabase Postgres as the real restricted ingest_worker role, so
a claim here is exactly what production does. Select with `-m db` after `pnpm db:start`.
(psycopg talks to libpq in C, so pytest-socket's Python-level guard does not apply.)
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier

import httpx
import psycopg
import pytest
from internradar_common.claims import claim_key
from internradar_common.fetcher import DisallowedByRobots, Fetched, PoliteFetcher
from internradar_common.postgres_claims import PostgresClaimStore
from internradar_common.testing import FakeSleeper, ManualClock
from internradar_common.testing_db import worker_connection
from pytest_httpx import HTTPXMock

pytestmark = pytest.mark.db

DAY = date(2026, 10, 2)
URL = "https://careers.example.com/graduates"


def test_the_first_claim_wins_and_the_second_is_refused(worker_db: psycopg.Connection) -> None:
    store = PostgresClaimStore(worker_db)

    assert store.claim(URL, DAY) is True
    assert store.claim(URL, DAY) is False


def test_the_same_url_can_be_claimed_on_another_day_and_another_url_on_the_same_day(
    worker_db: psycopg.Connection,
) -> None:
    store = PostgresClaimStore(worker_db)
    store.claim(URL, DAY)

    assert store.claim(URL, date(2026, 10, 3)) is True
    assert store.claim("https://careers.example.com/internships", DAY) is True


def test_the_claim_is_stored_under_the_normalised_url(
    worker_db: psycopg.Connection, admin_db: psycopg.Connection
) -> None:
    store = PostgresClaimStore(worker_db)

    assert store.claim("https://CAREERS.example.com/graduates#apply", DAY) is True
    assert store.claim(URL, DAY) is False
    rows = admin_db.execute("select url_key, fetch_day from public.fetch_claims").fetchall()
    assert rows == [(claim_key(URL), DAY)]


def test_a_claim_outlives_the_connection_that_took_it(worker_db: psycopg.Connection) -> None:
    PostgresClaimStore(worker_db).claim(URL, DAY)

    with worker_connection() as later_run:
        assert PostgresClaimStore(later_run).claim(URL, DAY) is False


def test_simultaneous_runs_cannot_both_take_the_same_claim(
    worker_db: psycopg.Connection,
) -> None:
    runs = 8
    # The timeout turns a thread that dies early into an error instead of a hang.
    barrier = Barrier(runs, timeout=15)

    def attempt() -> bool:
        with worker_connection() as connection:
            barrier.wait()
            return PostgresClaimStore(connection).claim(URL, DAY)

    with ThreadPoolExecutor(max_workers=runs) as pool:
        results = list(pool.map(lambda _: attempt(), range(runs)))

    assert results.count(True) == 1


def test_a_connection_that_is_not_autocommit_is_refused() -> None:
    # A claim must be durable the moment it is taken, even if the run later fails.
    with (
        worker_connection(autocommit=False) as connection,
        pytest.raises(ValueError, match="autocommit"),
    ):
        PostgresClaimStore(connection)


def test_a_second_run_the_same_day_cannot_refetch_and_fails_closed_on_robots(
    worker_db: psycopg.Connection, clock: ManualClock, sleeper: FakeSleeper, httpx_mock: HTTPXMock
) -> None:
    httpx_mock.add_response(url="https://careers.example.com/robots.txt", status_code=404)
    httpx_mock.add_response(url=URL, text="<html>ok</html>")
    first_run = PoliteFetcher(
        client=httpx.Client(),
        clock=clock,
        sleeper=sleeper,
        claims=PostgresClaimStore(worker_db),
    )
    assert isinstance(first_run.fetch(URL), Fetched)

    with worker_connection() as second_connection:
        second_run = PoliteFetcher(
            client=httpx.Client(),
            clock=clock,
            sleeper=sleeper,
            claims=PostgresClaimStore(second_connection),
        )
        # robots.txt was already claimed today, and this run never saw its answer.
        assert second_run.fetch(URL) == DisallowedByRobots()

    assert len(httpx_mock.get_requests()) == 2
