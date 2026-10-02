"""Ingest one Greenhouse board: fetch, parse, upsert, record. It never crashes the run.

Every way a board can go wrong (robots refusal, HTTP error, no response, a body that is not a
board, a blocked mass close, a database error, even a bug) is written to ats_fetches and
returned as an outcome, so one bad board never stops the others and nothing fails silently.
A row is marked in progress before the fetch, so a run killed mid-way leaves a visible trace.
KeyboardInterrupt and SystemExit are deliberately not caught.
"""

import re
from dataclasses import dataclass
from typing import Any, Literal, Protocol
from uuid import UUID

import psycopg
from internradar_common.clock import Clock
from internradar_common.fetcher import (
    AlreadyFetchedToday,
    DisallowedByRobots,
    Fetched,
    FetchResult,
    HttpError,
    NoResponse,
    PoliteFetcher,
    TooLarge,
    TooSlow,
)
from internradar_common.melbourne import melbourne_day

from internradar_ingest.fetch_log import record_fetch, start_fetch
from internradar_ingest.greenhouse import InvalidBoardError, parse_greenhouse_board
from internradar_ingest.upsert import UpsertSummary, upsert_board

BOARDS_API = "https://boards-api.greenhouse.io/v1/boards"
# A Greenhouse board token. Anything else could change the path of the request.
_BOARD_KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")

OutcomeKind = Literal[
    "ingested",
    "already_fetched",
    "not_fetched",
    "invalid_board",
    "invalid_source",
    "database_error",
    "unexpected_error",
]


@dataclass(frozen=True)
class BoardSource:
    ats_source_id: UUID
    company: str
    board_key: str
    # Hosts besides greenhouse.io that this company's listing URLs may use.
    extra_hosts: tuple[str, ...] = ()


@dataclass(frozen=True)
class BoardOutcome:
    kind: OutcomeKind
    error: str | None = None
    summary: UpsertSummary | None = None


class Recorder(Protocol):
    """Writes the day's outcome to ats_fetches and hands the outcome back."""

    def __call__(
        self, outcome: BoardOutcome, status: int | None, *, complete: bool
    ) -> BoardOutcome: ...


def _describe_failure(result: FetchResult) -> tuple[str, int | None]:
    """The error text and HTTP status (if the host answered) for a fetch that gave no board."""
    if isinstance(result, DisallowedByRobots):
        return "disallowed by robots.txt", None
    if isinstance(result, HttpError):
        return f"HTTP {result.status}", result.status
    if isinstance(result, NoResponse):
        return f"no response after {result.attempts} attempts", None
    if isinstance(result, TooLarge):
        return "response too large", None
    if isinstance(result, TooSlow):
        return "response too slow", None
    # Rejected and NotModified cannot happen here (the board key is validated and no
    # conditional headers are sent), so anything else is reported rather than guessed at.
    return f"unexpected fetch result: {type(result).__name__}", None


def _fetch_and_store(
    connection: psycopg.Connection[tuple[Any, ...]],
    fetcher: PoliteFetcher,
    source: BoardSource,
    clock: Clock,
    record: Recorder,
) -> BoardOutcome:
    result = fetcher.fetch(f"{BOARDS_API}/{source.board_key}/jobs")
    if isinstance(result, AlreadyFetchedToday):
        return BoardOutcome("already_fetched")
    if not isinstance(result, Fetched):
        error, status = _describe_failure(result)
        return record(BoardOutcome("not_fetched", error), status, complete=False)

    try:
        parsed = parse_greenhouse_board(result.body, source.company, extra_hosts=source.extra_hosts)
    except InvalidBoardError as error:
        outcome = BoardOutcome("invalid_board", f"not a Greenhouse board: {error}")
        return record(outcome, result.status, complete=False)

    try:
        summary = upsert_board(
            connection,
            ats_source_id=source.ats_source_id,
            listings=parsed.listings,
            is_complete=parsed.is_complete,
            now=clock.now(),
        )
    except psycopg.Error as error:
        outcome = BoardOutcome("database_error", f"database error: {type(error).__name__}: {error}")
        return record(outcome, result.status, complete=False)

    blocked = f"close blocked: {summary.close_blocked}" if summary.close_blocked else None
    return record(
        BoardOutcome("ingested", blocked, summary), result.status, complete=parsed.is_complete
    )


def ingest_board(
    *,
    connection: psycopg.Connection[tuple[Any, ...]],
    fetcher: PoliteFetcher,
    source: BoardSource,
    clock: Clock,
    run_id: UUID,
) -> BoardOutcome:
    def record(outcome: BoardOutcome, status: int | None, *, complete: bool) -> BoardOutcome:
        now = clock.now()
        record_fetch(
            connection,
            ats_source_id=source.ats_source_id,
            fetch_day=melbourne_day(now),
            run_id=run_id,
            http_status=status,
            is_complete=complete,
            error=outcome.error,
            now=now,
        )
        return outcome

    if not _BOARD_KEY.fullmatch(source.board_key):
        return record(BoardOutcome("invalid_source", "invalid board key"), None, complete=False)

    now = clock.now()
    start_fetch(
        connection,
        ats_source_id=source.ats_source_id,
        fetch_day=melbourne_day(now),
        run_id=run_id,
        now=now,
    )
    try:
        return _fetch_and_store(connection, fetcher, source, clock, record)
    except Exception as error:
        # A bug in one board must not stop the others, and it must leave a trace. Only the
        # type is recorded: the message could carry internal detail.
        outcome = BoardOutcome("unexpected_error", f"unexpected error: {type(error).__name__}")
        return record(outcome, None, complete=False)
