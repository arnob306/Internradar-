"""Write one board's listings to Postgres, idempotently, as the restricted ingest_worker.

Identity is (ats_source_id, external_id); content_hash only detects edits. The whole board
goes in one transaction, so a failure part-way leaves nothing half-written. Listings are
closed only when the board was complete, so a partial fetch can never close a live role.
program_id is never in the UPDATE list: links made by rules or by hand survive a sync.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from internradar_ingest.listing import Listing

_EXISTING = (
    "select external_id, content_hash, closed_at from public.listings where ats_source_id = %s"
)

_UPSERT = """
insert into public.listings
  (ats_source_id, external_id, title, location, url, posted_at, key_facts,
   content_hash, dedupe_key, first_seen_at, last_seen_at)
values
  (%(source)s, %(external_id)s, %(title)s, %(location)s, %(url)s, %(posted_at)s, %(key_facts)s,
   %(content_hash)s, %(dedupe_key)s, %(now)s, %(now)s)
on conflict (ats_source_id, external_id) do update set
  title = excluded.title,
  location = excluded.location,
  url = excluded.url,
  posted_at = excluded.posted_at,
  key_facts = excluded.key_facts,
  content_hash = excluded.content_hash,
  dedupe_key = excluded.dedupe_key,
  last_seen_at = excluded.last_seen_at,
  closed_at = null
"""

_CLOSE_MISSING = """
update public.listings set closed_at = %s
where ats_source_id = %s and closed_at is null and not (external_id = any(%s))
"""


@dataclass(frozen=True)
class UpsertSummary:
    inserted: int
    updated: int
    unchanged: int
    reopened: int
    closed: int


def _params(listing: Listing, source: UUID, now: datetime) -> dict[str, Any]:
    return {
        "source": source,
        "external_id": listing.external_id,
        "title": listing.title,
        "location": listing.location,
        "url": listing.url,
        "posted_at": listing.posted_at,
        "key_facts": Jsonb(dict(listing.key_facts)),
        "content_hash": listing.content_hash,
        "dedupe_key": listing.dedupe_key,
        "now": now,
    }


def upsert_board(
    connection: psycopg.Connection[tuple[Any, ...]],
    *,
    ats_source_id: UUID,
    listings: Sequence[Listing],
    is_complete: bool,
    now: datetime,
) -> UpsertSummary:
    inserted = updated = unchanged = reopened = closed = 0
    with connection.transaction():
        existing = {
            external_id: (content_hash, closed_at)
            for external_id, content_hash, closed_at in connection.execute(
                _EXISTING, (ats_source_id,)
            )
        }
        for listing in listings:
            connection.execute(_UPSERT, _params(listing, ats_source_id, now))
            before = existing.get(listing.external_id)
            if before is None:
                inserted += 1
            elif before[1] is not None:
                reopened += 1
            elif before[0] != listing.content_hash:
                updated += 1
            else:
                unchanged += 1
        if is_complete:
            seen = [listing.external_id for listing in listings]
            closed = connection.execute(_CLOSE_MISSING, (now, ats_source_id, seen)).rowcount
    return UpsertSummary(
        inserted=inserted, updated=updated, unchanged=unchanged, reopened=reopened, closed=closed
    )
