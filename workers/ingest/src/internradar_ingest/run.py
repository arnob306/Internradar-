"""The ingest run: which boards to ingest, how a whole run is graded, and the run itself.

A run opens a pipeline_runs row, ingests every active Greenhouse source (each board records its
own outcome, see ingest_board), then closes the row with a status and counts and leaves one
metrics event. If something at run level fails, the row is marked failed and the error is
raised, so a crash is never mistaken for a clean run.
"""

from collections.abc import Sequence
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, get_args
from urllib.parse import urlsplit
from uuid import UUID

import psycopg
from internradar_common.clock import Clock
from internradar_common.fetch_url import RejectedUrlError, validate_fetch_url
from internradar_common.fetcher import PoliteFetcher
from psycopg.types.json import Jsonb

from internradar_ingest.ingest import BoardOutcome, BoardSource, OutcomeKind, ingest_board

RunStatus = Literal["succeeded", "partial", "failed"]

# A board that was ingested, or that was already done today, is not a problem.
_OK_KINDS = frozenset({"ingested", "already_fetched"})
# These mean a bug or a broken database, not an ordinary operational outcome like an HTTP 503.
_ERROR_KINDS = ("database_error", "unexpected_error")
_KINDS: tuple[str, ...] = get_args(OutcomeKind)
_LISTING_COUNTS = ("inserted", "updated", "unchanged", "reopened", "closed", "close_blocked")

_START = """
insert into public.pipeline_runs (job, gh_run_id, started_at, status)
values ('ingest', %s, %s, 'running') returning id
"""
_FINISH = """
update public.pipeline_runs set finished_at = %s, status = %s, counts = %s where id = %s
"""
_METRIC = """
insert into public.metrics_events (event, source, run_id, value, props)
values ('ingest_run_completed', 'ingest', %s, %s, %s)
"""
_SOURCES = """
select s.id, c.slug, s.board_key, c.careers_url
from public.ats_sources s join public.companies c on c.id = s.company_id
where s.kind = 'greenhouse' and s.is_active
order by c.slug, s.board_key
"""

Connection = psycopg.Connection[tuple[Any, ...]]


@dataclass(frozen=True)
class RunResult:
    run_id: UUID
    status: RunStatus
    counts: dict[str, int]

    @property
    def has_errors(self) -> bool:
        """True if a board hit a bug or a database error, as opposed to an expected failure."""
        return any(self.counts[kind] for kind in _ERROR_KINDS)


def company_host(careers_url: str | None) -> str | None:
    """The host a company's own listing URLs may use, or None if it cannot be trusted.

    The careers URL has to pass the same checks as any URL we would fetch (https, a public
    name, not an aggregator), so seed data can never turn an aggregator or an address into an
    allowed host. A leading "www." is dropped so the company's subdomains match too.
    """
    if not careers_url:
        return None
    try:
        validate_fetch_url(careers_url)
    except RejectedUrlError:
        return None
    host = (urlsplit(careers_url).hostname or "").rstrip(".").removeprefix("www.")
    return host or None


def summarise_run(outcomes: Sequence[BoardOutcome]) -> tuple[RunStatus, dict[str, int]]:
    """Grade a run and count what happened. The counts always have the same keys."""
    counts: dict[str, int] = {
        "boards": len(outcomes),
        **dict.fromkeys(_KINDS, 0),
        **dict.fromkeys(_LISTING_COUNTS, 0),
    }
    for outcome in outcomes:
        counts[outcome.kind] += 1
        if outcome.summary is not None:
            for name in _LISTING_COUNTS:
                counts[name] += getattr(outcome.summary, name)

    failing = sum(counts[kind] for kind in _KINDS if kind not in _OK_KINDS)
    if failing == 0:
        return "succeeded", counts
    return ("failed" if failing == len(outcomes) else "partial"), counts


def load_sources(connection: Connection) -> list[BoardSource]:
    """Every active Greenhouse board, with the company's own host where it can be trusted."""
    sources: list[BoardSource] = []
    for source_id, slug, board_key, careers_url in connection.execute(_SOURCES).fetchall():
        host = company_host(careers_url)
        sources.append(
            BoardSource(
                ats_source_id=source_id,
                company=slug,
                board_key=board_key,
                extra_hosts=(host,) if host else (),
            )
        )
    return sources


def _finish_run(
    connection: Connection, run_id: UUID, status: str, counts: dict[str, int], now: datetime
) -> None:
    connection.execute(_FINISH, (now, status, Jsonb(counts), run_id))


def run_ingest(
    *,
    connection: Connection,
    fetcher: PoliteFetcher,
    clock: Clock,
    gh_run_id: str | None = None,
) -> RunResult:
    row = connection.execute(_START, (gh_run_id, clock.now())).fetchone()
    if row is None:  # pragma: no cover - INSERT ... RETURNING always returns its row
        msg = "could not open the pipeline run"
        raise RuntimeError(msg)
    run_id: UUID = row[0]

    outcomes: list[BoardOutcome] = []
    try:
        for source in load_sources(connection):
            outcomes.append(
                ingest_board(
                    connection=connection,
                    fetcher=fetcher,
                    source=source,
                    clock=clock,
                    run_id=run_id,
                )
            )
    except Exception:
        # Mark the run failed so it is not mistaken for a clean one, then let the error
        # surface. If the database is what broke, the update may fail too; the original error
        # is the one that matters.
        with suppress(psycopg.Error):
            _finish_run(connection, run_id, "failed", summarise_run(outcomes)[1], clock.now())
        raise

    status, counts = summarise_run(outcomes)
    _finish_run(connection, run_id, status, counts, clock.now())
    connection.execute(_METRIC, (run_id, len(outcomes), Jsonb(counts)))
    return RunResult(run_id=run_id, status=status, counts=counts)
