"""The idempotent listing upsert, run as the real restricted ingest_worker role.

Identity is (ats_source, external_id); content_hash only detects edits. A whole board is
written in one transaction, listings are closed only when the board was complete, and a
listing's program link is never overwritten by a later sync (architecture overview §2.3).
Select with `-m db` after `pnpm db:start`.
"""

from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import psycopg
import pytest
from internradar_ingest.listing import Listing, make_listing
from internradar_ingest.upsert import UpsertSummary, upsert_board
from psycopg.rows import dict_row

pytestmark = pytest.mark.db

Connection = psycopg.Connection[tuple[Any, ...]]
NOW = datetime(2026, 10, 2, 3, 0, 0, tzinfo=UTC)
LATER = NOW + timedelta(days=1)
POSTED = datetime(2026, 7, 29, 8, 39, 58, tzinfo=UTC)


def listing(external_id: str, title: str = "Graduate Trader", **overrides: Any) -> Listing:
    fields: dict[str, Any] = {
        "company": "imc",
        "external_id": external_id,
        "title": title,
        "location": "Sydney, Australia",
        "url": f"https://job-boards.greenhouse.io/imc/jobs/{external_id}",
        "posted_at": POSTED,
        "key_facts": {"requisition_id": f"REQ-{external_id}"},
    }
    return make_listing(**{**fields, **overrides})


def rows(db: Connection, source: UUID) -> dict[str, dict[str, Any]]:
    with db.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            "select id, external_id, title, location, url, posted_at, key_facts, content_hash, "
            "dedupe_key, first_seen_at, last_seen_at, closed_at, program_id "
            "from public.listings where ats_source_id = %s",
            (source,),
        )
        return {row["external_id"]: row for row in cursor.fetchall()}


def sync(
    db: Connection,
    source: UUID,
    listings: list[Listing],
    *,
    complete: bool = True,
    now: datetime = NOW,
    allow_mass_close: bool = False,
) -> UpsertSummary:
    extra: dict[str, Any] = {"allow_mass_close": True} if allow_mass_close else {}
    return upsert_board(
        db, ats_source_id=source, listings=listings, is_complete=complete, now=now, **extra
    )


def board(count: int) -> list[Listing]:
    return [listing(str(number)) for number in range(count)]


def open_ids(db: Connection, source: UUID) -> set[str]:
    return {k for k, v in rows(db, source).items() if v["closed_at"] is None}


def test_new_listings_are_inserted_with_every_field(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    one, two = listing("1"), listing("2", location=None, key_facts={})

    summary = sync(worker_db, source, [one, two])

    assert summary == UpsertSummary(inserted=2, updated=0, unchanged=0, reopened=0, closed=0)
    stored = rows(admin_db, source)
    assert set(stored) == {"1", "2"}
    first = stored["1"]
    assert first["title"] == "Graduate Trader"
    assert first["location"] == "Sydney, Australia"
    assert first["url"] == "https://job-boards.greenhouse.io/imc/jobs/1"
    assert first["posted_at"] == POSTED
    assert first["key_facts"] == {"requisition_id": "REQ-1"}
    assert first["content_hash"] == one.content_hash
    assert first["dedupe_key"] == one.dedupe_key
    assert first["first_seen_at"] == NOW
    assert first["last_seen_at"] == NOW
    assert first["closed_at"] is None
    assert first["program_id"] is None
    assert stored["2"]["location"] is None
    assert stored["2"]["key_facts"] == {}


def test_running_the_same_board_again_changes_nothing_but_last_seen(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, [listing("1"), listing("2")])
    before = rows(admin_db, source)

    summary = sync(worker_db, source, [listing("1"), listing("2")], now=LATER)

    assert summary == UpsertSummary(inserted=0, updated=0, unchanged=2, reopened=0, closed=0)
    after = rows(admin_db, source)
    assert {k: v["id"] for k, v in after.items()} == {k: v["id"] for k, v in before.items()}
    assert all(row["last_seen_at"] == LATER for row in after.values())
    assert all(row["first_seen_at"] == NOW for row in after.values())
    assert all(row["content_hash"] == before[k]["content_hash"] for k, row in after.items())


def test_an_edited_listing_is_updated_in_place_not_duplicated(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, [listing("1")])
    original = rows(admin_db, source)["1"]
    edited = listing("1", title="Graduate Quant Trader", location="Melbourne, Australia")

    summary = sync(worker_db, source, [edited], now=LATER)

    assert summary == UpsertSummary(inserted=0, updated=1, unchanged=0, reopened=0, closed=0)
    stored = rows(admin_db, source)
    assert len(stored) == 1
    row = stored["1"]
    assert row["id"] == original["id"]
    assert row["title"] == "Graduate Quant Trader"
    assert row["location"] == "Melbourne, Australia"
    assert row["content_hash"] == edited.content_hash
    assert row["dedupe_key"] == edited.dedupe_key
    assert row["first_seen_at"] == NOW
    assert row["last_seen_at"] == LATER


def test_a_listing_missing_from_a_complete_board_is_closed(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, [listing("1"), listing("2")])

    summary = sync(worker_db, source, [listing("1")], complete=True, now=LATER)

    assert summary == UpsertSummary(inserted=0, updated=0, unchanged=1, reopened=0, closed=1)
    stored = rows(admin_db, source)
    assert stored["1"]["closed_at"] is None
    assert stored["2"]["closed_at"] == LATER
    assert stored["2"]["last_seen_at"] == NOW  # not seen this time


def test_nothing_is_closed_when_the_board_was_not_complete(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, [listing("1"), listing("2")])

    summary = sync(worker_db, source, [listing("1")], complete=False, now=LATER)

    assert summary.closed == 0
    assert rows(admin_db, source)["2"]["closed_at"] is None


def test_a_closed_listing_that_comes_back_is_reopened(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, [listing("1"), listing("2")])
    sync(worker_db, source, [listing("1")], now=LATER)
    assert rows(admin_db, source)["2"]["closed_at"] == LATER

    summary = sync(worker_db, source, [listing("1"), listing("2")], now=LATER + timedelta(days=1))

    assert summary == UpsertSummary(inserted=0, updated=0, unchanged=1, reopened=1, closed=0)
    reopened = rows(admin_db, source)["2"]
    assert reopened["closed_at"] is None
    assert reopened["last_seen_at"] == LATER + timedelta(days=1)


def test_closing_only_touches_the_source_being_synced(
    worker_db: Connection,
    admin_db: Connection,
    source: UUID,
    make_source: Callable[[str], UUID],
) -> None:
    other = make_source("optiver")
    sync(worker_db, source, [listing("1")])
    sync(worker_db, other, [listing("1", company="optiver")])

    sync(worker_db, source, [], complete=True, now=LATER)

    assert rows(admin_db, source)["1"]["closed_at"] == LATER
    assert rows(admin_db, other)["1"]["closed_at"] is None


def test_a_program_link_survives_a_later_sync(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, [listing("1")])
    program = admin_db.execute(
        "insert into public.programs (company_id, slug, name, program_type, source_url) "
        "select company_id, 'grad', 'Graduate Program', 'graduate', "
        "'https://careers.imc.example/grad' "
        "from public.ats_sources where id = %s returning id",
        (source,),
    ).fetchone()
    assert program is not None
    admin_db.execute("update public.listings set program_id = %s", (program[0],))

    sync(worker_db, source, [listing("1", title="Graduate Trader (updated)")], now=LATER)

    row = rows(admin_db, source)["1"]
    assert row["title"] == "Graduate Trader (updated)"
    assert row["program_id"] == program[0]


def test_a_failure_part_way_through_rolls_back_the_whole_board(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, [listing("1"), listing("2")])
    broken = replace(listing("3"), content_hash="not-hex")  # violates the table's CHECK

    with pytest.raises(psycopg.errors.CheckViolation):
        sync(worker_db, source, [listing("1", title="Edited"), broken], now=LATER)

    stored = rows(admin_db, source)
    assert set(stored) == {"1", "2"}
    assert stored["1"]["title"] == "Graduate Trader"  # the edit was rolled back
    assert stored["2"]["closed_at"] is None  # nor was the missing listing closed
    assert stored["1"]["last_seen_at"] == NOW


# --- the mass-close guard ---------------------------------------------------------------
# A glitchy feed that returns an empty (or tiny) but "complete" board must not wipe a
# company's live roles overnight. Up to half of a source's open listings may close in one
# run (once it has at least 5 open); beyond that nothing closes and the sync says so.


def test_closing_up_to_half_of_the_open_listings_is_allowed(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, board(10))

    summary = sync(worker_db, source, board(5), now=LATER)  # exactly half missing

    assert summary.closed == 5
    assert summary.close_blocked == 0
    assert open_ids(admin_db, source) == {str(n) for n in range(5)}


def test_closing_more_than_half_is_blocked_but_everything_else_still_applies(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, board(10))
    edited = [listing("0", title="Edited"), *board(4)[1:], listing("new")]

    summary = sync(worker_db, source, edited, now=LATER)  # 6 of 10 would close

    assert summary.closed == 0
    assert summary.close_blocked == 6
    assert summary.inserted == 1
    assert summary.updated == 1
    stored = rows(admin_db, source)
    assert len(open_ids(admin_db, source)) == 11  # nothing closed, one added
    assert stored["0"]["title"] == "Edited"


def test_an_empty_complete_board_cannot_wipe_a_source_with_many_open_listings(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, board(8))

    summary = sync(worker_db, source, [], complete=True, now=LATER)

    assert summary.closed == 0
    assert summary.close_blocked == 8
    assert len(open_ids(admin_db, source)) == 8


def test_a_small_source_is_not_protected_so_a_genuinely_emptied_board_closes(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, board(4))

    summary = sync(worker_db, source, [], complete=True, now=LATER)

    assert summary.closed == 4
    assert summary.close_blocked == 0
    assert open_ids(admin_db, source) == set()


def test_the_guard_can_be_overridden_deliberately(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, board(8))

    summary = sync(worker_db, source, [], complete=True, now=LATER, allow_mass_close=True)

    assert summary.closed == 8
    assert summary.close_blocked == 0
    assert open_ids(admin_db, source) == set()


def test_already_closed_listings_do_not_count_as_open_for_the_guard(
    worker_db: Connection, admin_db: Connection, source: UUID
) -> None:
    sync(worker_db, source, board(10))
    sync(worker_db, source, board(5), now=LATER)  # closes 5, leaving 5 open
    assert len(open_ids(admin_db, source)) == 5

    # 3 of the 5 open listings now go missing: 60 percent of what is open, so it is blocked
    # even though only 3 of all 10 rows would change.
    summary = sync(worker_db, source, board(2), now=LATER + timedelta(days=1))

    assert summary.closed == 0
    assert summary.close_blocked == 3


def test_the_same_external_id_on_two_sources_stays_two_listings(
    worker_db: Connection,
    admin_db: Connection,
    source: UUID,
    make_source: Callable[[str], UUID],
) -> None:
    other = make_source("optiver")

    sync(worker_db, source, [listing("1")])
    sync(worker_db, other, [listing("1", company="optiver", title="Other firm")])

    assert rows(admin_db, source)["1"]["title"] == "Graduate Trader"
    assert rows(admin_db, other)["1"]["title"] == "Other firm"
