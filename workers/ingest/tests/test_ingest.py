"""ingest_board: fetch, parse, upsert and record one Greenhouse board, never crashing the run.

Runs the real PoliteFetcher, the Postgres claim store, the parser, the upsert and the status
row against the local database, with only HTTP mocked. Every way a board can fail is
recorded in ats_fetches and returned as an outcome. Select with `-m db`.
"""

import json
from datetime import timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
import psycopg
import pytest
from internradar_common.fetcher import (
    FetchResult,
    NotModified,
    PoliteFetcher,
    Rejected,
    TooLarge,
    TooSlow,
)
from internradar_common.melbourne import melbourne_day
from internradar_common.postgres_claims import PostgresClaimStore
from internradar_common.testing import FakeSleeper, ManualClock
from internradar_ingest import ingest as ingest_module
from internradar_ingest.ingest import BoardOutcome, BoardSource, ingest_board
from internradar_ingest.upsert import UpsertSummary
from psycopg.rows import dict_row
from pytest_httpx import HTTPXMock

pytestmark = pytest.mark.db

Connection = psycopg.Connection[tuple[Any, ...]]
API = "https://boards-api.greenhouse.io"
ROBOTS = f"{API}/robots.txt"
JOBS = f"{API}/v1/boards/imc/jobs"
FIXTURES = Path(__file__).parent / "fixtures" / "greenhouse"
ONE_DAY = 24 * 60 * 60


def job(number: int, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": number,
        "title": f"Graduate Role {number}",
        "location": {"name": "Sydney, Australia"},
        "absolute_url": f"https://job-boards.greenhouse.io/imc/jobs/{number}",
        "first_published": "2026-07-29T04:39:58-04:00",
        "updated_at": "2026-09-30T06:15:59-04:00",
        "requisition_id": f"REQ-{number}",
    }
    return {**base, **overrides}


def board_body(*jobs: dict[str, Any], total: int | None = None) -> str:
    return json.dumps(
        {"jobs": list(jobs), "meta": {"total": len(jobs) if total is None else total}}
    )


@pytest.fixture
def fetcher(worker_db: Connection, clock: ManualClock, sleeper: FakeSleeper) -> PoliteFetcher:
    return PoliteFetcher(
        client=httpx.Client(),
        clock=clock,
        sleeper=sleeper,
        claims=PostgresClaimStore(worker_db),
    )


@pytest.fixture
def robots_ok(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=ROBOTS, status_code=404)


def run(
    worker_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    *,
    board_key: str = "imc",
    extra_hosts: tuple[str, ...] = (),
) -> BoardOutcome:
    return ingest_board(
        connection=worker_db,
        fetcher=fetcher,
        source=BoardSource(
            ats_source_id=source, company="imc", board_key=board_key, extra_hosts=extra_hosts
        ),
        clock=clock,
        run_id=uuid4(),
    )


def fetch_rows(admin_db: Connection, source: UUID) -> list[dict[str, Any]]:
    with admin_db.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            "select fetch_day, run_id, http_status, is_complete, error, fetched_at "
            "from public.ats_fetches where ats_source_id = %s order by fetch_day",
            (source,),
        )
        return cursor.fetchall()


def listing_state(admin_db: Connection, source: UUID) -> dict[str, bool]:
    """external_id -> is open."""
    rows = admin_db.execute(
        "select external_id, closed_at is null from public.listings where ats_source_id = %s",
        (source,),
    ).fetchall()
    return dict(rows)


@pytest.mark.usefixtures("robots_ok")
def test_a_complete_board_is_ingested_and_recorded(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(url=JOBS, text=board_body(job(1), job(2), job(3)))

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.kind == "ingested"
    assert outcome.error is None
    assert outcome.summary == UpsertSummary(
        inserted=3, updated=0, unchanged=0, reopened=0, closed=0
    )
    assert listing_state(admin_db, source) == {"1": True, "2": True, "3": True}
    (row,) = fetch_rows(admin_db, source)
    assert row["http_status"] == 200
    assert row["is_complete"] is True
    assert row["error"] is None
    assert row["fetch_day"] == melbourne_day(clock.now())
    assert row["fetched_at"] == clock.now()


@pytest.mark.usefixtures("robots_ok")
def test_the_same_board_the_same_day_is_not_fetched_or_recorded_again(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(url=JOBS, text=board_body(job(1)))
    run(worker_db, fetcher, source, clock)
    (first_row,) = fetch_rows(admin_db, source)

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.kind == "already_fetched"
    assert outcome.summary is None
    assert fetch_rows(admin_db, source) == [first_row]
    assert len([r for r in httpx_mock.get_requests() if r.url.path.endswith("/jobs")]) == 1


@pytest.mark.usefixtures("robots_ok")
def test_a_partial_board_adds_listings_but_closes_nothing_and_is_recorded_incomplete(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(url=JOBS, text=board_body(job(99)))
    run(worker_db, fetcher, source, clock)
    clock.advance(ONE_DAY)
    # The recorded IMC fixture keeps 8 of 169 jobs, so it must parse as incomplete.
    httpx_mock.add_response(url=JOBS, text=(FIXTURES / "imc.json").read_text("utf-8"))

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.kind == "ingested"
    assert outcome.summary is not None
    assert outcome.summary.inserted == 8
    assert outcome.summary.closed == 0
    assert listing_state(admin_db, source)["99"] is True
    assert fetch_rows(admin_db, source)[-1]["is_complete"] is False


def test_a_board_that_robots_forbids_is_recorded_and_never_requested(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(url=ROBOTS, text="User-agent: *\nDisallow: /\n")

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.kind == "not_fetched"
    assert outcome.error == "disallowed by robots.txt"
    (row,) = fetch_rows(admin_db, source)
    assert row["http_status"] is None
    assert row["is_complete"] is False
    assert row["error"] == "disallowed by robots.txt"
    assert [r.url.path for r in httpx_mock.get_requests()] == ["/robots.txt"]
    assert listing_state(admin_db, source) == {}


@pytest.mark.usefixtures("robots_ok")
def test_an_http_error_is_recorded_and_leaves_existing_listings_alone(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(url=JOBS, text=board_body(job(1)))
    run(worker_db, fetcher, source, clock)
    clock.advance(ONE_DAY)
    httpx_mock.add_response(url=JOBS, status_code=503)

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.kind == "not_fetched"
    assert outcome.error == "HTTP 503"
    assert listing_state(admin_db, source) == {"1": True}
    last = fetch_rows(admin_db, source)[-1]
    assert (last["http_status"], last["is_complete"], last["error"]) == (503, False, "HTTP 503")


@pytest.mark.usefixtures("robots_ok")
def test_no_response_is_recorded_with_the_attempt_count(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    for _ in range(3):
        httpx_mock.add_exception(httpx.ReadTimeout("slow"), url=JOBS)

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.kind == "not_fetched"
    assert outcome.error == "no response after 3 attempts"
    (row,) = fetch_rows(admin_db, source)
    assert (row["http_status"], row["is_complete"]) == (None, False)


@pytest.mark.usefixtures("robots_ok")
@pytest.mark.parametrize("body", ["", "not json", "[]", '{"jobs": "nope"}'])
def test_a_body_that_is_not_a_greenhouse_board_is_recorded_without_touching_listings(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    body: str,
) -> None:
    httpx_mock.add_response(url=JOBS, text=body)

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.kind == "invalid_board"
    assert outcome.summary is None
    (row,) = fetch_rows(admin_db, source)
    assert row["http_status"] == 200
    assert row["is_complete"] is False
    assert row["error"] is not None
    assert row["error"].startswith("not a Greenhouse board")
    assert listing_state(admin_db, source) == {}


@pytest.mark.parametrize("board_key", ["../x", "", "a b", "x/y", "x?y=1", "a" * 65, "x\n"])
def test_an_unsafe_board_key_is_refused_before_any_request(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    board_key: str,
) -> None:
    outcome = run(worker_db, fetcher, source, clock, board_key=board_key)

    assert outcome.kind == "invalid_source"
    assert outcome.error == "invalid board key"
    assert httpx_mock.get_requests() == []
    (row,) = fetch_rows(admin_db, source)
    assert (row["http_status"], row["is_complete"], row["error"]) == (
        None,
        False,
        "invalid board key",
    )


@pytest.mark.usefixtures("robots_ok")
def test_the_companys_own_careers_host_is_passed_through_to_the_parser(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    own = job(1, absolute_url="https://careers.imc.example/jobs/1")
    httpx_mock.add_response(url=JOBS, text=board_body(own))

    outcome = run(worker_db, fetcher, source, clock, extra_hosts=("imc.example",))

    assert outcome.summary is not None
    assert outcome.summary.inserted == 1


@pytest.mark.usefixtures("robots_ok")
def test_a_listing_on_an_unnamed_host_is_skipped_and_the_board_recorded_incomplete(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    own = job(1, absolute_url="https://careers.imc.example/jobs/1")
    httpx_mock.add_response(url=JOBS, text=board_body(own))

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.summary is not None
    assert outcome.summary.inserted == 0
    assert fetch_rows(admin_db, source)[0]["is_complete"] is False


@pytest.mark.usefixtures("robots_ok")
def test_a_blocked_mass_close_is_surfaced_in_the_outcome_and_the_log(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(url=JOBS, text=board_body(*[job(n) for n in range(8)]))
    run(worker_db, fetcher, source, clock)
    clock.advance(ONE_DAY)
    httpx_mock.add_response(url=JOBS, text=board_body())  # a "complete" but empty board

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.kind == "ingested"
    assert outcome.summary is not None
    assert (outcome.summary.closed, outcome.summary.close_blocked) == (0, 8)
    assert outcome.error == "close blocked: 8"
    assert all(listing_state(admin_db, source).values())
    assert fetch_rows(admin_db, source)[-1]["error"] == "close blocked: 8"


@pytest.mark.usefixtures("robots_ok")
def test_a_database_error_is_recorded_not_raised(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    httpx_mock.add_response(url=JOBS, text=board_body(job(1)))

    def explode(*_args: Any, **_kwargs: Any) -> UpsertSummary:
        message = "boom"
        raise psycopg.errors.CheckViolation(message)

    monkeypatch.setattr(ingest_module, "upsert_board", explode)

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.kind == "database_error"
    assert outcome.error is not None
    assert outcome.error.startswith("database error: CheckViolation")
    (row,) = fetch_rows(admin_db, source)
    assert (row["http_status"], row["is_complete"]) == (200, False)
    assert row["error"] == outcome.error


class StubFetcher:
    """Returns a fixed fetch result, so each failure shape can be exercised without HTTP."""

    def __init__(self, result: FetchResult) -> None:
        self._result = result

    def fetch(self, _url: str) -> FetchResult:
        return self._result


@pytest.mark.parametrize(
    ("result", "error"),
    [
        (TooLarge(limit=100), "response too large"),
        (TooSlow(limit_seconds=30), "response too slow"),
        (Rejected(reason="x"), "unexpected fetch result: Rejected"),
        (NotModified(), "unexpected fetch result: NotModified"),
    ],
)
def test_every_other_fetch_failure_is_recorded_with_a_clear_message(
    worker_db: Connection,
    admin_db: Connection,
    source: UUID,
    clock: ManualClock,
    result: FetchResult,
    error: str,
) -> None:
    stub: Any = StubFetcher(result)

    outcome = run(worker_db, stub, source, clock)

    assert outcome.kind == "not_fetched"
    assert outcome.error == error
    (row,) = fetch_rows(admin_db, source)
    assert (row["http_status"], row["is_complete"], row["error"]) == (None, False, error)


@pytest.mark.usefixtures("robots_ok")
def test_the_next_day_fetches_again_and_updates_the_same_log_day_separately(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    source: UUID,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(url=JOBS, text=board_body(job(1)))
    run(worker_db, fetcher, source, clock)
    clock.advance(ONE_DAY)
    httpx_mock.add_response(url=JOBS, text=board_body(job(1, title="Edited")))

    outcome = run(worker_db, fetcher, source, clock)

    assert outcome.summary == UpsertSummary(
        inserted=0, updated=1, unchanged=0, reopened=0, closed=0
    )
    days = [row["fetch_day"] for row in fetch_rows(admin_db, source)]
    assert days[1] - days[0] == timedelta(days=1)
