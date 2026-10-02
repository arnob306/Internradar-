"""run_ingest: one whole ingest run, recorded in pipeline_runs, against the local database.

Real fetcher, Postgres claims, parser, upsert and status rows; only HTTP is mocked. A run
ingests every active Greenhouse source, is graded succeeded, partial or failed, and leaves a
metrics event. Select with `-m db` after `pnpm db:start`.
"""

import json
from collections.abc import Callable
from typing import Any
from uuid import UUID

import httpx
import psycopg
import pytest
from internradar_common.fetcher import PoliteFetcher
from internradar_common.postgres_claims import PostgresClaimStore
from internradar_common.testing import FakeSleeper, ManualClock
from internradar_ingest import run as run_module
from internradar_ingest.run import RunResult, run_ingest
from psycopg.rows import dict_row
from pytest_httpx import HTTPXMock

pytestmark = pytest.mark.db

Connection = psycopg.Connection[tuple[Any, ...]]
API = "https://boards-api.greenhouse.io"
ROBOTS = f"{API}/robots.txt"
GH_RUN = "dbtest-1"


def jobs_url(slug: str) -> str:
    return f"{API}/v1/boards/{slug}/jobs"


def job(number: int, **overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": number,
        "title": f"Graduate Role {number}",
        "location": {"name": "Sydney, Australia"},
        "absolute_url": f"https://job-boards.greenhouse.io/x/jobs/{number}",
        "first_published": "2026-07-29T04:39:58-04:00",
        "requisition_id": f"REQ-{number}",
    }
    return {**base, **overrides}


def board_body(*jobs: dict[str, Any]) -> str:
    return json.dumps({"jobs": list(jobs), "meta": {"total": len(jobs)}})


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


def go(
    worker_db: Connection,
    fetcher: Any,
    clock: ManualClock,
    gh_run_id: str | None = GH_RUN,
) -> RunResult:
    return run_ingest(connection=worker_db, fetcher=fetcher, clock=clock, gh_run_id=gh_run_id)


def run_row(admin_db: Connection, gh_run_id: str = GH_RUN) -> dict[str, Any]:
    with admin_db.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            "select id, job, gh_run_id, started_at, finished_at, status, counts "
            "from public.pipeline_runs where gh_run_id = %s",
            (gh_run_id,),
        )
        row = cursor.fetchone()
    assert row is not None
    return row


def listing_count(admin_db: Connection, *sources: UUID) -> int:
    row = admin_db.execute(
        "select count(*) from public.listings where ats_source_id = any(%s)", (list(sources),)
    ).fetchone()
    assert row is not None
    return int(row[0])


@pytest.mark.usefixtures("robots_ok")
def test_every_active_greenhouse_source_is_ingested_and_nothing_else(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    make_source_with: Callable[..., UUID],
) -> None:
    imc = make_source_with("imc")
    optiver = make_source_with("optiver")
    dormant = make_source_with("dormant", active=False)
    other_ats = make_source_with("levco", kind="lever")
    httpx_mock.add_response(url=jobs_url("imc"), text=board_body(job(1), job(2)))
    httpx_mock.add_response(url=jobs_url("optiver"), text=board_body(job(3)))

    result = go(worker_db, fetcher, clock)

    assert result.status == "succeeded"
    assert result.counts["boards"] == 2
    assert result.counts["ingested"] == 2
    assert result.counts["inserted"] == 3
    assert listing_count(admin_db, imc, optiver) == 3
    assert listing_count(admin_db, dormant, other_ats) == 0
    # pytest-httpx rejects any request nobody registered, so no other board was fetched.


@pytest.mark.usefixtures("robots_ok")
def test_the_run_is_recorded_in_pipeline_runs_with_its_counts(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    make_source_with: Callable[..., UUID],
) -> None:
    make_source_with("imc")
    make_source_with("optiver")
    httpx_mock.add_response(url=jobs_url("imc"), text=board_body(job(1)))
    httpx_mock.add_response(url=jobs_url("optiver"), text=board_body(job(2)))
    started = clock.now()

    result = go(worker_db, fetcher, clock)

    row = run_row(admin_db)
    assert row["id"] == result.run_id
    assert row["job"] == "ingest"
    assert row["status"] == "succeeded"
    assert row["started_at"] == started
    assert row["finished_at"] == clock.now()  # after the 5 second spacing waits
    assert row["finished_at"] > started
    assert row["counts"] == result.counts


@pytest.mark.usefixtures("robots_ok")
def test_every_boards_status_row_carries_the_runs_id(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    make_source_with: Callable[..., UUID],
) -> None:
    make_source_with("imc")
    make_source_with("optiver")
    httpx_mock.add_response(url=jobs_url("imc"), text=board_body(job(1)))
    httpx_mock.add_response(url=jobs_url("optiver"), text=board_body(job(2)))

    result = go(worker_db, fetcher, clock)

    run_ids = admin_db.execute(
        "select distinct f.run_id from public.ats_fetches f "
        "join public.ats_sources s on s.id = f.ats_source_id "
        "join public.companies c on c.id = s.company_id where c.slug like 'dbtest-%'"
    ).fetchall()
    assert run_ids == [(result.run_id,)]


@pytest.mark.usefixtures("robots_ok")
def test_a_completed_run_leaves_one_metrics_event_with_the_counts(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    make_source_with: Callable[..., UUID],
) -> None:
    make_source_with("imc")
    make_source_with("optiver")
    httpx_mock.add_response(url=jobs_url("imc"), text=board_body(job(1)))
    httpx_mock.add_response(url=jobs_url("optiver"), text=board_body(job(2)))

    result = go(worker_db, fetcher, clock)

    events = admin_db.execute(
        "select event, source, value, props from public.metrics_events where run_id = %s",
        (result.run_id,),
    ).fetchall()
    assert events == [("ingest_run_completed", "ingest", 2, result.counts)]


@pytest.mark.usefixtures("robots_ok")
def test_one_failing_board_makes_the_run_partial_and_the_others_still_run(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    make_source_with: Callable[..., UUID],
) -> None:
    imc = make_source_with("imc")
    make_source_with("optiver")
    httpx_mock.add_response(url=jobs_url("imc"), text=board_body(job(1)))
    httpx_mock.add_response(url=jobs_url("optiver"), status_code=503)

    result = go(worker_db, fetcher, clock)

    assert result.status == "partial"
    assert result.counts["not_fetched"] == 1
    assert result.counts["ingested"] == 1
    assert listing_count(admin_db, imc) == 1
    assert run_row(admin_db)["status"] == "partial"
    assert result.has_errors is False  # an HTTP error is an expected operational outcome


@pytest.mark.usefixtures("robots_ok")
def test_a_run_where_every_board_failed_is_failed_but_not_an_error_to_page_someone_about(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    make_source_with: Callable[..., UUID],
) -> None:
    make_source_with("imc")
    make_source_with("optiver")
    httpx_mock.add_response(url=jobs_url("imc"), status_code=503)
    httpx_mock.add_response(url=jobs_url("optiver"), status_code=503)

    result = go(worker_db, fetcher, clock)

    assert result.status == "failed"
    assert run_row(admin_db)["status"] == "failed"
    assert result.has_errors is False


def test_a_bug_in_a_board_is_a_real_error(
    worker_db: Connection,
    admin_db: Connection,
    clock: ManualClock,
    make_source_with: Callable[..., UUID],
) -> None:
    make_source_with("imc")

    class Exploding:
        def fetch(self, _url: str) -> Any:
            message = "boom"
            raise RuntimeError(message)

    result = go(worker_db, Exploding(), clock)

    assert result.counts["unexpected_error"] == 1
    assert result.has_errors is True
    assert result.status == "failed"


def test_a_run_with_no_active_sources_succeeds_and_makes_no_requests(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    make_source_with: Callable[..., UUID],
) -> None:
    make_source_with("dormant", active=False)

    result = go(worker_db, fetcher, clock)

    assert result.status == "succeeded"
    assert result.counts["boards"] == 0
    assert httpx_mock.get_requests() == []
    assert run_row(admin_db)["finished_at"] is not None


@pytest.mark.usefixtures("robots_ok")
def test_a_companys_own_careers_host_is_allowed_but_an_aggregator_never_is(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    make_source_with: Callable[..., UUID],
) -> None:
    imc = make_source_with("imc", careers_url="https://www.imc.example/careers")
    optiver = make_source_with("optiver", careers_url="https://www.seek.com.au/optiver")
    httpx_mock.add_response(
        url=jobs_url("imc"),
        text=board_body(job(1, absolute_url="https://careers.imc.example/jobs/1")),
    )
    httpx_mock.add_response(
        url=jobs_url("optiver"),
        text=board_body(job(2, absolute_url="https://www.seek.com.au/job/2")),
    )

    go(worker_db, fetcher, clock)

    assert listing_count(admin_db, imc) == 1
    assert listing_count(admin_db, optiver) == 0


@pytest.mark.usefixtures("robots_ok")
def test_a_second_run_the_same_day_fetches_nothing_and_is_still_a_success(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    httpx_mock: HTTPXMock,
    make_source_with: Callable[..., UUID],
) -> None:
    make_source_with("imc")
    make_source_with("optiver")
    httpx_mock.add_response(url=jobs_url("imc"), text=board_body(job(1)))
    httpx_mock.add_response(url=jobs_url("optiver"), text=board_body(job(2)))
    go(worker_db, fetcher, clock)
    requests_after_first = len(httpx_mock.get_requests())

    second = go(worker_db, fetcher, clock, gh_run_id="dbtest-2")

    assert second.status == "succeeded"
    assert second.counts["already_fetched"] == 2
    assert len(httpx_mock.get_requests()) == requests_after_first
    assert run_row(admin_db, "dbtest-2")["id"] != run_row(admin_db)["id"]


def test_a_failure_of_the_whole_run_marks_it_failed_and_is_raised(
    worker_db: Connection,
    admin_db: Connection,
    fetcher: PoliteFetcher,
    clock: ManualClock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def explode(_connection: Connection) -> list[Any]:
        message = "the database went away"
        raise RuntimeError(message)

    monkeypatch.setattr(run_module, "load_sources", explode)

    with pytest.raises(RuntimeError, match="database went away"):
        go(worker_db, fetcher, clock)

    row = run_row(admin_db)
    assert row["status"] == "failed"
    assert row["finished_at"] is not None


def test_a_run_without_a_github_run_id_is_allowed(
    worker_db: Connection, admin_db: Connection, fetcher: PoliteFetcher, clock: ManualClock
) -> None:
    result = go(worker_db, fetcher, clock, gh_run_id=None)

    row = admin_db.execute(
        "select gh_run_id, status from public.pipeline_runs where id = %s", (result.run_id,)
    ).fetchone()
    admin_db.execute("delete from public.metrics_events where run_id = %s", (result.run_id,))
    admin_db.execute("delete from public.pipeline_runs where id = %s", (result.run_id,))
    assert row == (None, "succeeded")
