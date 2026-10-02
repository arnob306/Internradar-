"""load_catalog: the parsed seed written to the local database, idempotently.

Runs on an admin connection (the ingest_worker role can only read the catalog). Test companies
use the `dbtest-` prefix so cleanup removes them; the parser reserves that prefix, so these
tests build the Catalog directly. Select with `-m db` after `pnpm db:start`.
"""

from dataclasses import replace
from datetime import date
from typing import Any

import psycopg
import pytest
from internradar_ingest.seed import (
    Catalog,
    SeedAts,
    SeedCompany,
    SeedProgram,
    SeedWindow,
)
from internradar_ingest.seed_load import LoadSummary, load_catalog
from psycopg.rows import dict_row

pytestmark = pytest.mark.db

Connection = psycopg.Connection[tuple[Any, ...]]
SLUG = "dbtest-seed-co"
BOARD = "dbtest-seed-board"
VERIFIED = date(2026, 10, 2)

_OF_THIS_COMPANY = (
    "from public.program_windows w join public.programs p on p.id = w.program_id "
    "join public.companies c on c.id = p.company_id where c.slug = %s"
)


def make_window(**changes: Any) -> SeedWindow:
    base = SeedWindow(
        cycle_year=2026,
        window_seq=1,
        opens_on=date(2025, 3, 1),
        opens_precision="month",
        closes_on=date(2025, 4, 30),
        closes_precision="day",
        program_starts_on=None,
        program_ends_on=None,
        status="closed",
        source_url="https://careers.example.com.au/2026",
    )
    return replace(base, **changes)


def make_program(**changes: Any) -> SeedProgram:
    base = SeedProgram(
        slug="graduate-program",
        name="Graduate Program",
        program_type="graduate",
        cities=("melbourne",),
        disciplines=("computer_science",),
        source_url="https://careers.example.com.au/graduates",
        eligibility_rules={"schemaVersion": 1, "yearLevel": {"preset": "final_year"}},
        verified_on=None,
        is_published=False,
        windows=(make_window(),),
    )
    return replace(base, **changes)


def make_catalog(*programs: SeedProgram, ats: SeedAts | None = None) -> Catalog:
    company = SeedCompany(
        slug=SLUG,
        name="Seed Co",
        careers_url="https://careers.example.com.au",
        ats=ats,
        programs=programs or (make_program(),),
    )
    return Catalog(companies=(company,))


def rows(db: Connection, query: str, *params: object) -> list[dict[str, Any]]:
    with db.cursor(row_factory=dict_row) as cursor:
        return cursor.execute(query, params).fetchall()


def program_row(db: Connection) -> dict[str, Any]:
    (row,) = rows(
        db,
        "select p.* from public.programs p join public.companies c on c.id = p.company_id "
        "where c.slug = %s",
        SLUG,
    )
    return row


def window_rows(db: Connection) -> list[dict[str, Any]]:
    return rows(db, f"select w.* {_OF_THIS_COMPANY} order by w.window_seq", SLUG)


def event_rows(db: Connection) -> list[dict[str, Any]]:
    return rows(
        db,
        "select e.* from public.program_window_events e "
        "join public.program_windows w on w.id = e.program_window_id "
        "join public.programs p on p.id = w.program_id "
        "join public.companies c on c.id = p.company_id where c.slug = %s order by e.id",
        SLUG,
    )


def count(db: Connection, table: str) -> int:
    queries = {
        "companies": ("select count(*) as n from public.companies where slug = %s", SLUG),
        "ats": ("select count(*) as n from public.ats_sources where board_key = %s", BOARD),
        "programs": (
            "select count(*) as n from public.programs p "
            "join public.companies c on c.id = p.company_id where c.slug = %s",
            SLUG,
        ),
    }
    query, param = queries[table]
    return int(rows(db, query, param)[0]["n"])


def test_a_catalog_is_written_with_seed_provenance(admin_db: Connection) -> None:
    ats = SeedAts(kind="greenhouse", board_key=BOARD)

    summary = load_catalog(admin_db, make_catalog(ats=ats))

    assert summary == LoadSummary(inserted=4, updated=0, unchanged=0, skipped=0)
    assert (count(admin_db, "companies"), count(admin_db, "ats")) == (1, 1)
    (window,) = window_rows(admin_db)
    assert window["provenance"] == "seed"
    assert window["source_url"] == "https://careers.example.com.au/2026"
    assert window["opens_precision"] == "month"
    program = program_row(admin_db)
    assert program["eligibility_rules"]["yearLevel"] == {"preset": "final_year"}
    assert program["eligibility_verified_at"] is None
    assert program["is_published"] is False
    (event,) = event_rows(admin_db)
    assert (event["event_type"], event["actor"]) == ("created", "seed")


def test_loading_twice_changes_nothing(admin_db: Connection) -> None:
    catalog = make_catalog(ats=SeedAts(kind="greenhouse", board_key=BOARD))
    load_catalog(admin_db, catalog)
    before = program_row(admin_db)

    summary = load_catalog(admin_db, catalog)

    assert summary == LoadSummary(inserted=0, updated=0, unchanged=4, skipped=0)
    assert (count(admin_db, "programs"), len(window_rows(admin_db))) == (1, 1)
    assert len(event_rows(admin_db)) == 1
    assert program_row(admin_db)["updated_at"] == before["updated_at"]


def test_a_changed_program_is_updated_in_place(admin_db: Connection) -> None:
    load_catalog(admin_db, make_catalog())
    first_id = program_row(admin_db)["id"]

    summary = load_catalog(admin_db, make_catalog(make_program(name="Graduate Program 2027")))

    assert (summary.updated, summary.inserted) == (1, 0)
    assert program_row(admin_db)["id"] == first_id
    assert program_row(admin_db)["name"] == "Graduate Program 2027"


def test_a_renamed_company_is_updated_in_place(admin_db: Connection) -> None:
    load_catalog(admin_db, make_catalog())
    renamed = replace(make_catalog().companies[0], name="Seed Co Australia")

    summary = load_catalog(admin_db, Catalog(companies=(renamed,)))

    assert (summary.updated, summary.inserted) == (1, 0)
    assert rows(admin_db, "select name from public.companies where slug = %s", SLUG) == [
        {"name": "Seed Co Australia"}
    ]


def test_verification_is_stored_as_a_melbourne_date_and_can_be_withdrawn(
    admin_db: Connection,
) -> None:
    load_catalog(admin_db, make_catalog(make_program(verified_on=VERIFIED, is_published=True)))
    row = program_row(admin_db)
    (check,) = rows(
        admin_db,
        "select %s::timestamptz at time zone 'Australia/Melbourne' as local",
        row["eligibility_verified_at"],
    )
    assert check["local"].date() == VERIFIED
    assert check["local"].hour == 0
    assert row["is_published"] is True

    load_catalog(admin_db, make_catalog(make_program(verified_on=None, is_published=False)))

    assert program_row(admin_db)["eligibility_verified_at"] is None
    assert program_row(admin_db)["is_published"] is False


def test_a_changed_window_is_corrected_with_a_history_event(admin_db: Connection) -> None:
    load_catalog(admin_db, make_catalog())

    summary = load_catalog(
        admin_db, make_catalog(make_program(windows=(make_window(closes_on=date(2025, 5, 15)),)))
    )

    assert summary.updated == 1
    created, corrected = event_rows(admin_db)
    assert created["event_type"] == "created"
    assert (corrected["event_type"], corrected["actor"]) == ("corrected", "seed")
    assert corrected["before"]["closes_on"] == "2025-04-30"
    assert corrected["after"]["closes_on"] == "2025-05-15"


def test_a_new_round_is_added_beside_the_existing_window(admin_db: Connection) -> None:
    load_catalog(admin_db, make_catalog())

    summary = load_catalog(
        admin_db,
        make_catalog(make_program(windows=(make_window(), make_window(window_seq=2)))),
    )

    assert (summary.inserted, summary.unchanged) == (1, 3)
    assert len(window_rows(admin_db)) == 2


def test_a_window_owned_by_someone_else_is_never_overwritten(admin_db: Connection) -> None:
    load_catalog(admin_db, make_catalog())
    admin_db.execute(
        "update public.program_windows set provenance = 'admin', status = 'open' "
        "where program_id = %s",
        (program_row(admin_db)["id"],),
    )

    summary = load_catalog(
        admin_db, make_catalog(make_program(windows=(make_window(status="upcoming"),)))
    )

    assert summary.skipped == 1
    (window,) = window_rows(admin_db)
    assert (window["provenance"], window["status"]) == ("admin", "open")


def test_nothing_absent_from_the_file_is_deleted(admin_db: Connection) -> None:
    load_catalog(admin_db, make_catalog(make_program(), make_program(slug="second-program")))

    load_catalog(admin_db, make_catalog(make_program()))

    assert count(admin_db, "programs") == 2


def test_a_failure_part_way_loads_nothing(admin_db: Connection) -> None:
    other = admin_db.execute(
        "insert into public.companies (slug, name, careers_url) "
        "values ('dbtest-other-owner', 'Other', 'https://other.example.com.au') returning id"
    ).fetchone()
    assert other is not None
    admin_db.execute(
        "insert into public.ats_sources (company_id, kind, board_key) "
        "values (%s, 'greenhouse', %s)",
        (other[0], BOARD),
    )
    clash = make_catalog(ats=SeedAts(kind="greenhouse", board_key=BOARD))

    with pytest.raises(psycopg.errors.UniqueViolation):
        load_catalog(admin_db, clash)

    assert (count(admin_db, "companies"), count(admin_db, "programs")) == (0, 0)
