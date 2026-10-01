"""The DB test helpers must never touch a non-local database.

They set the ingest_worker role's password, which is only acceptable on a throwaway local
database. The check runs before any connection is attempted, so these tests need no DB.
"""

import pytest
from internradar_common import testing_db


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
