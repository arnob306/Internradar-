"""The ats_fetches status row: one per board per Melbourne day, written as ingest_worker.

The URL claim (fetch_claims) is what enforces fetch-once. This row records how the day's
fetch went, so a rerun the same day overwrites it instead of adding a second row.

A row is written as IN_PROGRESS before the fetch starts. The day's claim is taken inside the
fetch, so a run killed between the claim and the result would otherwise lose the day with no
trace; this way a row stuck in progress is the visible sign.
"""

from datetime import date, datetime
from typing import Any
from uuid import UUID

import psycopg

ERROR_MAX_LENGTH = 1000
IN_PROGRESS = "in progress"

_START = """
insert into public.ats_fetches
  (ats_source_id, fetch_day, run_id, http_status, is_complete, error, fetched_at)
values (%s, %s, %s, null, false, %s, %s)
on conflict (ats_source_id, fetch_day) do nothing
"""

_RECORD = """
insert into public.ats_fetches
  (ats_source_id, fetch_day, run_id, http_status, is_complete, error, fetched_at)
values (%s, %s, %s, %s, %s, %s, %s)
on conflict (ats_source_id, fetch_day) do update set
  run_id = excluded.run_id,
  http_status = excluded.http_status,
  is_complete = excluded.is_complete,
  error = excluded.error,
  fetched_at = excluded.fetched_at
"""


def start_fetch(
    connection: psycopg.Connection[tuple[Any, ...]],
    *,
    ats_source_id: UUID,
    fetch_day: date,
    run_id: UUID,
    now: datetime,
) -> None:
    """Mark the day's fetch as started, never overwriting a row that already exists.

    An existing row is either a finished result or a crashed earlier run, and both are
    information we must not erase.
    """
    connection.execute(_START, (ats_source_id, fetch_day, run_id, IN_PROGRESS, now))


def record_fetch(  # noqa: PLR0913 - one keyword per column of the status row
    connection: psycopg.Connection[tuple[Any, ...]],
    *,
    ats_source_id: UUID,
    fetch_day: date,
    run_id: UUID,
    http_status: int | None,
    is_complete: bool,
    error: str | None,
    now: datetime,
) -> None:
    """Record how a board's fetch went; error text is cut to ERROR_MAX_LENGTH."""
    shortened = None if error is None else error[:ERROR_MAX_LENGTH]
    connection.execute(
        _RECORD, (ats_source_id, fetch_day, run_id, http_status, is_complete, shortened, now)
    )
