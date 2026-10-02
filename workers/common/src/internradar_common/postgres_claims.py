"""The fetch-once-per-day claim, kept in Postgres so it holds across runs (ADR-015).

A claim is an INSERT ... ON CONFLICT DO NOTHING on public.fetch_claims: if a row came back
the claim was ours, otherwise someone already took it. The database makes that atomic, so
simultaneous runs cannot both win.
"""

from datetime import date
from typing import Any

import psycopg

from internradar_common.claims import claim_key


class PostgresClaimStore:
    def __init__(self, connection: psycopg.Connection[tuple[Any, ...]]) -> None:
        # A claim must be durable the moment it is taken, even if the run later fails;
        # inside an open transaction a crash would quietly release it.
        if not connection.autocommit:
            msg = "the connection must use autocommit so a claim is durable at once"
            raise ValueError(msg)
        self._connection = connection

    def claim(self, url: str, day: date) -> bool:
        row = self._connection.execute(
            "insert into public.fetch_claims (url_key, fetch_day) values (%s, %s) "
            "on conflict do nothing returning 1",
            (claim_key(url), day),
        ).fetchone()
        return row is not None
