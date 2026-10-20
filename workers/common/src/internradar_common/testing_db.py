"""Connections to the LOCAL Supabase Postgres for the `db`-marked tests.

Tests connect as the real restricted ingest_worker role, so they prove what the worker is
actually allowed to do. Setting that role's password needs an admin connection, so this
refuses to run against anything but a local database.
"""

import os
from datetime import date
from threading import Lock
from typing import Any

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict, make_conninfo

# The documented local Supabase defaults (port 54322 by `supabase start`).
ADMIN_URL = os.environ.get(
    "INTERNRADAR_TEST_ADMIN_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
)
WORKER_TEST_PASSWORD = "local-test-only"  # noqa: S105 - set only on a local throwaway database
_LOCAL_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})

# ALTER ROLE from several threads at once fails ("tuple concurrently updated"), so each
# role's password is set once per process, under a lock.
_password_lock = Lock()
_roles_with_password: set[str] = set()


# Test data is recognisable, so cleanup deletes only it and never real local data (such as
# loaded seed programs): test companies carry this slug prefix, and test claims are dated
# before the cutoff (the tests use clocks set in 2020).
TEST_SLUG_PREFIX = "dbtest-"
TEST_CLAIM_CUTOFF = date(2021, 1, 1)


def clean_test_data(connection: psycopg.Connection[tuple[Any, ...]]) -> None:
    """Delete what the DB tests create, and nothing else.

    A test company's sources, listings and status rows go with it by cascade, but
    programs.company_id is ON DELETE RESTRICT, so its programs are deleted first.
    """
    pattern = f"{TEST_SLUG_PREFIX}%"
    # Test pipeline runs carry the same prefix in gh_run_id. Their metrics events go first,
    # otherwise deleting the run would only null the event's run_id and leave it behind.
    connection.execute(
        "delete from public.metrics_events where run_id in "
        "(select id from public.pipeline_runs where gh_run_id like %s)",
        (pattern,),
    )
    connection.execute("delete from public.pipeline_runs where gh_run_id like %s", (pattern,))
    connection.execute(
        "delete from public.programs "
        "where company_id in (select id from public.companies where slug like %s)",
        (pattern,),
    )
    connection.execute("delete from public.companies where slug like %s", (pattern,))
    connection.execute("delete from public.fetch_claims where fetch_day < %s", (TEST_CLAIM_CUTOFF,))
    # test students: their profiles, follows and alerts go with them by cascade
    connection.execute("delete from auth.users where email like %s", (f"{TEST_SLUG_PREFIX}%",))


def _require_local(url: str) -> None:
    host = conninfo_to_dict(url).get("host")
    if host not in _LOCAL_HOSTS:
        msg = f"refusing to run DB tests against a non-local database host: {host!r}"
        raise RuntimeError(msg)


def admin_connection() -> psycopg.Connection[tuple[Any, ...]]:
    """An autocommit superuser-ish connection, for setup and cleanup only."""
    _require_local(ADMIN_URL)
    return psycopg.connect(ADMIN_URL, autocommit=True)


def _ensure_role_password(role: str) -> None:
    with _password_lock:
        if role in _roles_with_password:
            return
        with admin_connection() as admin:
            admin.execute(
                sql.SQL("alter role {} with password {}").format(
                    sql.Identifier(role), sql.Literal(WORKER_TEST_PASSWORD)
                )
            )
        _roles_with_password.add(role)


def _role_conninfo(role: str) -> str:
    _require_local(ADMIN_URL)
    _ensure_role_password(role)
    return make_conninfo(ADMIN_URL, user=role, password=WORKER_TEST_PASSWORD)


def worker_conninfo() -> str:
    """The connection string for the restricted ingest_worker login role (local only)."""
    return _role_conninfo("ingest_worker")


def worker_connection(*, autocommit: bool = True) -> psycopg.Connection[tuple[Any, ...]]:
    """A connection as the restricted ingest_worker login role."""
    return psycopg.connect(worker_conninfo(), autocommit=autocommit)


def notify_connection(*, autocommit: bool = True) -> psycopg.Connection[tuple[Any, ...]]:
    """A connection as the restricted notify_worker login role (local only)."""
    return psycopg.connect(_role_conninfo("notify_worker"), autocommit=autocommit)
