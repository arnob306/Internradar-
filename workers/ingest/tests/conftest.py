from collections.abc import Callable, Iterator
from typing import Any
from uuid import UUID

import psycopg
import pytest
from internradar_common.testing import FakeSleeper, ManualClock
from internradar_common.testing_db import admin_connection, worker_connection

Connection = psycopg.Connection[tuple[Any, ...]]


@pytest.fixture
def clock() -> ManualClock:
    return ManualClock()


@pytest.fixture
def sleeper(clock: ManualClock) -> FakeSleeper:
    return FakeSleeper(clock)


@pytest.fixture
def admin_db() -> Iterator[Connection]:
    """Setup and inspection only; the code under test always uses the worker role."""
    with admin_connection() as connection:
        connection.execute(
            "truncate public.listings, public.ats_fetches, public.ats_sources, "
            "public.programs, public.companies, public.fetch_claims cascade"
        )
        yield connection


@pytest.fixture
def worker_db(admin_db: Connection) -> Iterator[Connection]:
    with worker_connection() as connection:
        yield connection


@pytest.fixture
def make_source(admin_db: Connection) -> Callable[[str], UUID]:
    """Create a company and its Greenhouse board; returns the ats_source id."""

    def make(slug: str) -> UUID:
        company = admin_db.execute(
            "insert into public.companies (slug, name, careers_url) "
            "values (%s, %s, %s) returning id",
            (slug, slug.upper(), f"https://careers.{slug}.example"),
        ).fetchone()
        assert company is not None
        source = admin_db.execute(
            "insert into public.ats_sources (company_id, kind, board_key) "
            "values (%s, 'greenhouse', %s) returning id",
            (company[0], slug),
        ).fetchone()
        assert source is not None
        return source[0]

    return make


@pytest.fixture
def source(make_source: Callable[[str], UUID]) -> UUID:
    return make_source("imc")
