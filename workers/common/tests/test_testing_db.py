"""The DB test helpers must never touch a non-local database.

They set the ingest_worker role's password, which is only acceptable on a throwaway local
database. The check runs before any connection is attempted, so these tests need no DB.
"""

import pytest
from internradar_common import testing_db


@pytest.mark.db
def test_cleanup_removes_only_test_data_and_leaves_everything_else_alone() -> None:
    # The DB tests used to TRUNCATE shared tables, which would wipe real local data such as
    # loaded seed programs. Test data is now recognisable (a slug prefix, claims dated 2020)
    # and cleanup deletes only that.
    with testing_db.admin_connection() as db:
        for slug in ("dbtest-acme", "real-co"):
            company = db.execute(
                "insert into public.companies (slug, name, careers_url) values (%s, %s, %s) "
                "returning id",
                (slug, slug, "https://careers.example"),
            ).fetchone()
            assert company is not None
            db.execute(
                "insert into public.ats_sources (company_id, kind, board_key) "
                "values (%s, 'greenhouse', %s)",
                (company[0], slug),
            )
            # programs.company_id is ON DELETE RESTRICT, so cleanup must remove them first
            db.execute(
                "insert into public.programs (company_id, slug, name, program_type, source_url) "
                "values (%s, %s, 'Grad', 'graduate', 'https://careers.example/grad')",
                (company[0], f"{slug}-grad"),
            )
        db.execute(
            "insert into public.fetch_claims (url_key, fetch_day) values "
            "('https://test.example/a', '2020-10-02'), ('https://real.example/a', '2026-10-02')"
        )
        metric_ids: dict[str, int] = {}
        for gh_run_id in ("dbtest-run", "real-run"):
            run = db.execute(
                "insert into public.pipeline_runs (job, gh_run_id) values ('ingest', %s) "
                "returning id",
                (gh_run_id,),
            ).fetchone()
            assert run is not None
            metric = db.execute(
                "insert into public.metrics_events (event, source, run_id) "
                "values ('ingest_run_completed', 'ingest', %s) returning id",
                (run[0],),
            ).fetchone()
            assert metric is not None
            metric_ids[gh_run_id] = metric[0]
        try:
            testing_db.clean_test_data(db)

            runs = db.execute(
                "select gh_run_id from public.pipeline_runs "
                "where gh_run_id in ('dbtest-run', 'real-run')"
            ).fetchall()
            surviving_metrics = db.execute(
                "select id from public.metrics_events where id = any(%s)",
                (list(metric_ids.values()),),
            ).fetchall()
            assert runs == [("real-run",)]
            # the real run's metric is untouched, and the test run's was deleted, not orphaned
            assert surviving_metrics == [(metric_ids["real-run"],)]

            companies = db.execute(
                "select slug from public.companies where slug in ('dbtest-acme', 'real-co')"
            ).fetchall()
            sources = db.execute(
                "select board_key from public.ats_sources "
                "where board_key in ('dbtest-acme', 'real-co')"
            ).fetchall()
            claims = db.execute(
                "select url_key from public.fetch_claims "
                "where url_key in ('https://test.example/a', 'https://real.example/a')"
            ).fetchall()
            programs = db.execute(
                "select slug from public.programs "
                "where slug in ('dbtest-acme-grad', 'real-co-grad')"
            ).fetchall()
            assert companies == [("real-co",)]
            assert sources == [("real-co",)]  # the test company's source went with it
            assert programs == [("real-co-grad",)]  # and its program
            assert claims == [("https://real.example/a",)]
        finally:
            db.execute(
                "delete from public.metrics_events where id = any(%s)",
                (list(metric_ids.values()),),
            )
            db.execute(
                "delete from public.pipeline_runs where gh_run_id in ('dbtest-run', 'real-run')"
            )
            db.execute(
                "delete from public.programs where slug in ('dbtest-acme-grad', 'real-co-grad')"
            )
            db.execute("delete from public.companies where slug in ('dbtest-acme', 'real-co')")
            db.execute(
                "delete from public.fetch_claims "
                "where url_key in ('https://test.example/a', 'https://real.example/a')"
            )


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://postgres:secret@db.abcdefgh.supabase.co:5432/postgres",
        "postgresql://postgres:secret@10.0.0.5:5432/postgres",
        "postgresql://postgres:secret@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres",
    ],
)
def test_a_non_local_database_is_refused_before_any_connection(
    monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    monkeypatch.setattr(testing_db, "ADMIN_URL", url)
    # As if an earlier local connection had already set the worker password in this process:
    # the worker connection must still check the host itself.
    monkeypatch.setattr(testing_db, "_password_set", True)

    with pytest.raises(RuntimeError, match="non-local"):
        testing_db.admin_connection()
    with pytest.raises(RuntimeError, match="non-local"):
        testing_db.worker_connection()
