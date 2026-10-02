"""connect_worker: how the workers open their database connection.

psycopg prepares a query automatically after it has run a few times. Transaction-mode
poolers (Supabase's is one) hand each statement to a different server session, so a prepared
statement then "does not exist" and runs fail at random. The worker connection therefore
turns preparing off, and it is autocommit so a claim is durable the moment it is taken.
"""

import psycopg
import pytest
from internradar_common.database import connect_worker
from internradar_common.testing_db import worker_conninfo

RUNS = 12  # comfortably past psycopg's default prepare threshold of 5


def prepared_statement_count(connection: psycopg.Connection) -> int:
    row = connection.execute("select count(*) from pg_prepared_statements").fetchone()
    assert row is not None
    return int(row[0])


def run_same_query_repeatedly(connection: psycopg.Connection) -> None:
    for number in range(RUNS):
        connection.execute("select %s::int", (number,))


@pytest.mark.db
def test_the_worker_connection_never_prepares_statements() -> None:
    with connect_worker(worker_conninfo()) as connection:
        run_same_query_repeatedly(connection)

        assert prepared_statement_count(connection) == 0


@pytest.mark.db
def test_a_default_connection_does_prepare_so_the_check_above_is_meaningful() -> None:
    with psycopg.connect(worker_conninfo(), autocommit=True) as connection:
        run_same_query_repeatedly(connection)

        assert prepared_statement_count(connection) > 0


@pytest.mark.db
def test_the_worker_connection_is_autocommit_and_has_preparing_turned_off() -> None:
    with connect_worker(worker_conninfo()) as connection:
        assert connection.autocommit is True
        assert connection.prepare_threshold is None


@pytest.mark.parametrize("conninfo", ["", "   ", "\n"])
def test_an_empty_connection_string_is_refused_instead_of_falling_back_to_defaults(
    conninfo: str,
) -> None:
    # libpq would quietly read PGHOST, PGDATABASE and friends and connect somewhere unintended.
    with pytest.raises(ValueError, match="empty"):
        connect_worker(conninfo)
