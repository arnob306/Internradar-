"""The ingest command line: python -m internradar_ingest.cli

Environment in, one summary line and an exit code out:

  INGEST_DATABASE_URL  required; the restricted ingest_worker connection string. A secret:
                       it is never printed, and neither is a crash's message (database errors
                       can embed connection details, and CI logs on a public repo are public).
  GITHUB_RUN_ID        optional; recorded on the pipeline_runs row.

Exit codes: 0 for a clean run or one degraded only by expected failures (an HTTP 503, a robots
refusal); 1 if every board failed, if a bug or database error occurred, or if the run crashed,
so a bad day shows up as a red workflow; 2 if the database URL is missing.
"""

import os
import sys
from collections.abc import Callable, Mapping

import httpx
from internradar_common.clock import SystemClock
from internradar_common.database import connect_worker
from internradar_common.fetcher import PoliteFetcher
from internradar_common.postgres_claims import PostgresClaimStore
from internradar_common.spacing import SystemSleeper

from internradar_ingest.run import RunResult, run_ingest

ENV_DATABASE_URL = "INGEST_DATABASE_URL"
ENV_GITHUB_RUN_ID = "GITHUB_RUN_ID"

# Takes the database URL and the GitHub run id and performs the run.
Runner = Callable[[str, str | None], RunResult]


def _summary(result: RunResult) -> str:
    counts = " ".join(f"{name}={value}" for name, value in result.counts.items())
    return f"ingest run {result.run_id}: status={result.status} {counts}"


def main(env: Mapping[str, str], runner: Runner) -> int:
    database_url = env.get(ENV_DATABASE_URL, "").strip()
    if not database_url:
        print(f"{ENV_DATABASE_URL} is not set", file=sys.stderr)
        return 2

    try:
        result = runner(database_url, env.get(ENV_GITHUB_RUN_ID) or None)
    except Exception as error:
        # Only the type: the message may contain the connection string or host.
        print(f"ingest run crashed: {type(error).__name__}", file=sys.stderr)
        return 1

    print(_summary(result))
    return 1 if result.status == "failed" or result.has_errors else 0


def run_from_environment(database_url: str, gh_run_id: str | None) -> RunResult:  # pragma: no cover
    """The real wiring: system clock and sleeper, a real HTTP client, Postgres claims."""
    clock = SystemClock()
    with connect_worker(database_url) as connection, httpx.Client() as client:
        fetcher = PoliteFetcher(
            client=client,
            clock=clock,
            sleeper=SystemSleeper(),
            claims=PostgresClaimStore(connection),
        )
        return run_ingest(connection=connection, fetcher=fetcher, clock=clock, gh_run_id=gh_run_id)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(os.environ, run_from_environment))
