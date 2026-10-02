"""ats_fetches: one status row per board per Melbourne day, written as ingest_worker.

The URL claim (fetch_claims) is what enforces fetch-once; this row is the record of how the
day's fetch went: the HTTP status, whether the whole board parsed, and any error. A rerun
the same day overwrites it rather than adding a second row.
Select with `-m db` after `pnpm db:start`.
"""

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import psycopg
import pytest
from internradar_ingest.fetch_log import ERROR_MAX_LENGTH, record_fetch
from psycopg.rows import dict_row

pytestmark = pytest.mark.db

Connection = psycopg.Connection[tuple[Any, ...]]
DAY = date(2026, 10, 2)
NOW = datetime(2026, 10, 2, 3, 0, 0, tzinfo=UTC)


def log(db: Connection, source: UUID) -> list[dict[str, Any]]:
    with db.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            "select fetch_day, run_id, http_status, is_complete, error, fetched_at "
            "from public.ats_fetches where ats_source_id = %s order by fetch_day",
            (source,),
        )
        return cursor.fetchall()


def record(db: Connection, source: UUID, **overrides: Any) -> None:
    fields: dict[str, Any] = {
        "ats_source_id": source,
        "fetch_day": DAY,
        "run_id": uuid4(),
        "http_status": 200,
        "is_complete": True,
        "error": None,
        "now": NOW,
    }
    record_fetch(db, **{**fields, **overrides})


def test_a_fetch_is_recorded_with_its_outcome(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    run = uuid4()

    record(worker_db, source, run_id=run)

    assert log(admin_db, source) == [
        {
            "fetch_day": DAY,
            "run_id": run,
            "http_status": 200,
            "is_complete": True,
            "error": None,
            "fetched_at": NOW,
        }
    ]


def test_a_failed_fetch_records_the_error_and_no_status_when_nothing_answered(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    record(worker_db, source, http_status=None, is_complete=False, error="NoResponse(attempts=3)")

    (row,) = log(admin_db, source)
    assert row["http_status"] is None
    assert row["is_complete"] is False
    assert row["error"] == "NoResponse(attempts=3)"


def test_a_rerun_the_same_day_overwrites_the_row_instead_of_adding_one(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    record(worker_db, source, http_status=503, is_complete=False, error="HttpError(status=503)")
    second_run = uuid4()

    record(worker_db, source, run_id=second_run, now=NOW + timedelta(hours=1))

    (row,) = log(admin_db, source)
    assert row["run_id"] == second_run
    assert row["http_status"] == 200
    assert row["is_complete"] is True
    assert row["error"] is None
    assert row["fetched_at"] == NOW + timedelta(hours=1)


def test_each_day_and_each_source_has_its_own_row(
    worker_db: Connection,
    admin_db: Connection,
    source: UUID,
    make_source: Callable[[str], UUID],
) -> None:
    other = make_source("optiver")

    record(worker_db, source)
    record(worker_db, source, fetch_day=DAY + timedelta(days=1))
    record(worker_db, other)

    assert [row["fetch_day"] for row in log(admin_db, source)] == [DAY, DAY + timedelta(days=1)]
    assert len(log(admin_db, other)) == 1


def test_a_very_long_error_is_cut_to_a_sensible_length(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    record(worker_db, source, error="x" * (ERROR_MAX_LENGTH + 500))

    (row,) = log(admin_db, source)
    assert row["error"] == "x" * ERROR_MAX_LENGTH


def test_an_error_within_the_limit_is_stored_whole(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    record(worker_db, source, error="y" * ERROR_MAX_LENGTH)

    (row,) = log(admin_db, source)
    assert row["error"] == "y" * ERROR_MAX_LENGTH
