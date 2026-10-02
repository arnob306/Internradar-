"""How the workers open their database connection.

psycopg prepares a query automatically once it has run a few times. Transaction-mode
poolers (Supabase's is one) hand each statement to a different server session, so a prepared
statement then "does not exist" and runs fail at random. Preparing is therefore turned off.
The connection is autocommit so a fetch claim is durable the moment it is taken; code that
needs a transaction (the listing upsert) opens one explicitly.
"""

from typing import Any

import psycopg


def connect_worker(conninfo: str) -> psycopg.Connection[tuple[Any, ...]]:
    if not conninfo.strip():
        # libpq would quietly read PGHOST, PGDATABASE and friends and connect somewhere
        # unintended, so an empty string is an error, not a default.
        msg = "the database connection string is empty"
        raise ValueError(msg)
    return psycopg.connect(conninfo, autocommit=True, prepare_threshold=None)
