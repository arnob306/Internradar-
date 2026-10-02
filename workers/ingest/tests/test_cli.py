"""The ingest command line: environment in, exit code and one summary line out.

The runner is injected, so none of this needs a database or the network. Two rules matter most:
the database URL is a secret and is never printed, and a crash prints only the exception's
type, because database error messages can embed connection details and CI logs are public.
"""

from collections.abc import Callable
from uuid import UUID

import pytest
from internradar_ingest.cli import main
from internradar_ingest.ingest import BoardOutcome
from internradar_ingest.run import RunResult, RunStatus, summarise_run

# A made-up credential: the tests prove it is never printed.
SECRET_URL = "postgresql://ingest_worker:s3cr3t-pa55@db.example.supabase.co:6543/postgres"  # noqa: S105
RUN_ID = UUID(int=42)


def result(status: RunStatus = "succeeded", *kinds: str) -> RunResult:
    outcomes = [BoardOutcome(kind) for kind in kinds]  # type: ignore[arg-type]
    _, counts = summarise_run(outcomes)
    return RunResult(run_id=RUN_ID, status=status, counts=counts)


def runner_returning(value: RunResult) -> Callable[[str, str | None], RunResult]:
    def run(_database_url: str, _gh_run_id: str | None) -> RunResult:
        return value

    return run


def never_called(_database_url: str, _gh_run_id: str | None) -> RunResult:
    message = "the runner must not be called"
    raise AssertionError(message)


@pytest.mark.parametrize("env", [{}, {"INGEST_DATABASE_URL": ""}, {"INGEST_DATABASE_URL": "  \n"}])
def test_a_missing_or_blank_database_url_exits_2_without_running_anything(
    env: dict[str, str], capsys: pytest.CaptureFixture[str]
) -> None:
    code = main(env, never_called)

    captured = capsys.readouterr()
    assert code == 2
    assert "INGEST_DATABASE_URL" in captured.err
    assert captured.out == ""


def test_the_runner_gets_the_database_url_and_the_github_run_id() -> None:
    seen: list[tuple[str, str | None]] = []

    def run(database_url: str, gh_run_id: str | None) -> RunResult:
        seen.append((database_url, gh_run_id))
        return result()

    main({"INGEST_DATABASE_URL": SECRET_URL, "GITHUB_RUN_ID": "9876543210"}, run)
    main({"INGEST_DATABASE_URL": SECRET_URL}, run)

    assert seen == [(SECRET_URL, "9876543210"), (SECRET_URL, None)]


def test_a_successful_run_exits_0_and_prints_one_summary_line(
    capsys: pytest.CaptureFixture[str],
) -> None:
    ok = result("succeeded", "ingested", "ingested", "already_fetched")

    code = main({"INGEST_DATABASE_URL": SECRET_URL}, runner_returning(ok))

    out = capsys.readouterr().out
    assert code == 0
    assert out.count("\n") == 1
    assert str(RUN_ID) in out
    assert "status=succeeded" in out
    assert "boards=3" in out
    assert "ingested=2" in out


def test_a_partial_run_with_only_expected_failures_still_exits_0(
    capsys: pytest.CaptureFixture[str],
) -> None:
    partial = result("partial", "ingested", "not_fetched")

    code = main({"INGEST_DATABASE_URL": SECRET_URL}, runner_returning(partial))

    assert code == 0
    assert "status=partial" in capsys.readouterr().out


def test_a_run_where_every_board_failed_exits_1_so_the_workflow_goes_red(
    capsys: pytest.CaptureFixture[str],
) -> None:
    failed = result("failed", "not_fetched", "not_fetched")

    code = main({"INGEST_DATABASE_URL": SECRET_URL}, runner_returning(failed))

    assert code == 1
    assert "status=failed" in capsys.readouterr().out


@pytest.mark.parametrize("bad_kind", ["database_error", "unexpected_error"])
def test_a_bug_or_database_error_exits_1_even_if_other_boards_were_fine(bad_kind: str) -> None:
    partial_with_a_bug = result("partial", "ingested", bad_kind)

    code = main({"INGEST_DATABASE_URL": SECRET_URL}, runner_returning(partial_with_a_bug))

    assert code == 1


def test_a_crash_exits_1_and_prints_only_the_exception_type(
    capsys: pytest.CaptureFixture[str],
) -> None:
    def crashing(database_url: str, _gh_run_id: str | None) -> RunResult:
        raise RuntimeError(f"could not connect to {database_url} as ingest_worker")

    code = main({"INGEST_DATABASE_URL": SECRET_URL}, crashing)

    captured = capsys.readouterr()
    assert code == 1
    assert "RuntimeError" in captured.err
    assert captured.out == ""
    for text in (captured.out, captured.err):
        assert "s3cr3t-pa55" not in text
        assert "db.example.supabase.co" not in text


@pytest.mark.parametrize("status", ["succeeded", "partial", "failed"])
def test_the_database_url_is_never_printed(
    status: RunStatus, capsys: pytest.CaptureFixture[str]
) -> None:
    main({"INGEST_DATABASE_URL": SECRET_URL}, runner_returning(result(status, "ingested")))

    captured = capsys.readouterr()
    assert "s3cr3t-pa55" not in captured.out + captured.err
    assert "supabase.co" not in captured.out + captured.err
