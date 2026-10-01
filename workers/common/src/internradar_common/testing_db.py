"""Connections to the LOCAL Supabase Postgres for the `db`-marked tests.

Tests connect as the real restricted ingest_worker role, so they prove what the worker is
actually allowed to do. Setting that role's password needs an admin connection, so this
refuses to run against anything but a local database.
"""

import os
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

# ALTER ROLE from several threads at once fails ("tuple concurrently updated"), so the
# password is set once per process, under a lock.
_password_lock = Lock()
_password_set = False


def _require_local(url: str) -> None:
    host = conninfo_to_dict(url).get("host")
    if host not in _LOCAL_HOSTS:
        msg = f"refusing to run DB tests against a non-local database host: {host!r}"
        raise RuntimeError(msg)


def admin_connection() -> psycopg.Connection[tuple[Any, ...]]:
    """An autocommit superuser-ish connection, for setup and cleanup only."""
    _require_local(ADMIN_URL)
    return psycopg.connect(ADMIN_URL, autocommit=True)


def _ensure_worker_password() -> None:
    global _password_set  # noqa: PLW0603 - a once-per-process flag
    with _password_lock:
        if _password_set:
            return
        with admin_connection() as admin:
            admin.execute(
                sql.SQL("alter role ingest_worker with password {}").format(
                    sql.Literal(WORKER_TEST_PASSWORD)
                )
            )
        _password_set = True


def worker_connection(*, autocommit: bool = True) -> psycopg.Connection[tuple[Any, ...]]:
    """A connection as the restricted ingest_worker login role."""
    _require_local(ADMIN_URL)
    _ensure_worker_password()
    conninfo = make_conninfo(ADMIN_URL, user="ingest_worker", password=WORKER_TEST_PASSWORD)
    return psycopg.connect(conninfo, autocommit=autocommit)
