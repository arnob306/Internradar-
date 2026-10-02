"""Write a parsed seed catalog to the database, idempotently, in one transaction.

This needs a connection that may write the catalog (an admin or migration role): the
ingest_worker role can only read it. Loading the same catalog twice changes nothing. The seed
never deletes, and it never overwrites a window that someone else (the monitor or an admin) now
owns, so a human correction survives a reload.
"""

from dataclasses import dataclass
from datetime import datetime, time
from typing import Any
from uuid import UUID

import psycopg
from internradar_common.melbourne import MELBOURNE
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from internradar_ingest.seed import Catalog, SeedAts, SeedCompany, SeedProgram, SeedWindow

Connection = psycopg.Connection[tuple[Any, ...]]

_WINDOW_FIELDS = (
    "opens_on",
    "opens_precision",
    "closes_on",
    "closes_precision",
    "program_starts_on",
    "program_ends_on",
    "status",
    "source_url",
)


@dataclass(frozen=True)
class LoadSummary:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped: int = 0

    def __add__(self, other: "LoadSummary") -> "LoadSummary":
        return LoadSummary(
            self.inserted + other.inserted,
            self.updated + other.updated,
            self.unchanged + other.unchanged,
            self.skipped + other.skipped,
        )


INSERTED = LoadSummary(inserted=1)
UPDATED = LoadSummary(updated=1)
UNCHANGED = LoadSummary(unchanged=1)
SKIPPED = LoadSummary(skipped=1)


def _one(connection: Connection, query: str, params: tuple[object, ...]) -> dict[str, Any] | None:
    with connection.cursor(row_factory=dict_row) as cursor:
        return cursor.execute(query, params).fetchone()


def _returning_id(connection: Connection, query: str, params: tuple[object, ...]) -> UUID:
    row = connection.execute(query, params).fetchone()
    if row is None:  # pragma: no cover - INSERT ... RETURNING always returns its row
        msg = "insert returned no row"
        raise RuntimeError(msg)
    new_id: UUID = row[0]
    return new_id


def _load_company(connection: Connection, company: SeedCompany) -> tuple[UUID, LoadSummary]:
    row = _one(
        connection,
        "select id, name, careers_url from public.companies where slug = %s",
        (company.slug,),
    )
    if row is None:
        company_id = _returning_id(
            connection,
            "insert into public.companies (slug, name, careers_url) values (%s, %s, %s) "
            "returning id",
            (company.slug, company.name, company.careers_url),
        )
        return company_id, INSERTED
    if (row["name"], row["careers_url"]) == (company.name, company.careers_url):
        return row["id"], UNCHANGED
    connection.execute(
        "update public.companies set name = %s, careers_url = %s where id = %s",
        (company.name, company.careers_url, row["id"]),
    )
    return row["id"], UPDATED


def _load_ats(connection: Connection, company_id: UUID, ats: SeedAts | None) -> LoadSummary:
    if ats is None:
        return LoadSummary()
    found = _one(
        connection,
        "select id from public.ats_sources where company_id = %s and kind = %s and board_key = %s",
        (company_id, ats.kind, ats.board_key),
    )
    if found is not None:
        return UNCHANGED
    # (kind, board_key) is unique across companies, so a board already owned by another
    # company raises here and the whole load rolls back.
    connection.execute(
        "insert into public.ats_sources (company_id, kind, board_key) values (%s, %s, %s)",
        (company_id, ats.kind, ats.board_key),
    )
    return INSERTED


def _verified_at(program: SeedProgram) -> datetime | None:
    """The verification date as midnight in Melbourne, the project's calendar."""
    if program.verified_on is None:
        return None
    return datetime.combine(program.verified_on, time.min, tzinfo=MELBOURNE)


def _program_values(program: SeedProgram) -> dict[str, Any]:
    return {
        "name": program.name,
        "program_type": program.program_type,
        "cities": list(program.cities),
        "disciplines": list(program.disciplines),
        "source_url": program.source_url,
        "eligibility_rules": program.eligibility_rules,
        "eligibility_verified_at": _verified_at(program),
        "is_published": program.is_published,
    }


def _program_params(values: dict[str, Any]) -> tuple[object, ...]:
    return tuple(Jsonb(v) if k == "eligibility_rules" else v for k, v in values.items())


def _load_program(
    connection: Connection, company_id: UUID, program: SeedProgram
) -> tuple[UUID, LoadSummary]:
    values = _program_values(program)
    row = _one(
        connection,
        "select * from public.programs where company_id = %s and slug = %s",
        (company_id, program.slug),
    )
    if row is None:
        program_id = _returning_id(
            connection,
            "insert into public.programs (company_id, slug, name, program_type, cities, "
            "disciplines, source_url, eligibility_rules, eligibility_verified_at, is_published) "
            "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id",
            (company_id, program.slug, *_program_params(values)),
        )
        return program_id, INSERTED
    if all(row[key] == value for key, value in values.items()):
        return row["id"], UNCHANGED
    connection.execute(
        "update public.programs set name = %s, program_type = %s, cities = %s, "
        "disciplines = %s, source_url = %s, eligibility_rules = %s, "
        "eligibility_verified_at = %s, is_published = %s where id = %s",
        (*_program_params(values), row["id"]),
    )
    return row["id"], UPDATED


def _window_values(window: SeedWindow) -> dict[str, Any]:
    return {name: getattr(window, name) for name in _WINDOW_FIELDS}


def _as_json(values: dict[str, Any]) -> Jsonb:
    return Jsonb({k: v.isoformat() if hasattr(v, "isoformat") else v for k, v in values.items()})


def _record_event(
    connection: Connection,
    window_id: UUID,
    event_type: str,
    before: dict[str, Any] | None,
    after: dict[str, Any],
) -> None:
    connection.execute(
        "insert into public.program_window_events (program_window_id, event_type, before, "
        "after, actor) values (%s, %s, %s, %s, 'seed')",
        (window_id, event_type, _as_json(before) if before is not None else None, _as_json(after)),
    )


def _load_window(connection: Connection, program_id: UUID, window: SeedWindow) -> LoadSummary:
    values = _window_values(window)
    row = _one(
        connection,
        "select * from public.program_windows "
        "where program_id = %s and cycle_year = %s and window_seq = %s",
        (program_id, window.cycle_year, window.window_seq),
    )
    if row is None:
        window_id = _returning_id(
            connection,
            "insert into public.program_windows (program_id, cycle_year, window_seq, opens_on, "
            "opens_precision, closes_on, closes_precision, program_starts_on, program_ends_on, "
            "status, source_url, provenance) "
            "values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'seed') returning id",
            (program_id, window.cycle_year, window.window_seq, *values.values()),
        )
        _record_event(connection, window_id, "created", None, values)
        return INSERTED
    if row["provenance"] != "seed":
        return SKIPPED
    before = {name: row[name] for name in _WINDOW_FIELDS}
    if before == values:
        return UNCHANGED
    assignments = ", ".join(f"{name} = %s" for name in _WINDOW_FIELDS)
    connection.execute(
        f"update public.program_windows set {assignments} where id = %s",  # noqa: S608 - fixed names
        (*values.values(), row["id"]),
    )
    _record_event(connection, row["id"], "corrected", before, values)
    return UPDATED


def load_catalog(connection: Connection, catalog: Catalog) -> LoadSummary:
    """Write the catalog in one transaction; any failure rolls the whole load back."""
    summary = LoadSummary()
    with connection.transaction():
        for company in catalog.companies:
            company_id, result = _load_company(connection, company)
            summary += result + _load_ats(connection, company_id, company.ats)
            for program in company.programs:
                program_id, result = _load_program(connection, company_id, program)
                summary += result
                for window in program.windows:
                    summary += _load_window(connection, program_id, window)
    return summary
