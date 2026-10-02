"""The curated seed catalog: parse and validate the YAML file that programs enter through.

Workers never write programs or windows (architecture overview section 0), so this file,
reviewed in a pull request, is how the catalog is built. The parser is strict on purpose: it
reports every problem in one pass, and nothing is loaded unless the whole file is valid. A
program is never published unless a person has recorded verifying it (verified_on).
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any, Literal, get_args

import yaml
from internradar_common.clock import SystemClock
from internradar_common.fetch_url import RejectedUrlError, validate_fetch_url
from internradar_common.melbourne import melbourne_day
from jsonschema import Draft202012Validator

# Test companies use this prefix and are deleted by the DB tests' cleanup, so a seed company
# may never use it.
RESERVED_SLUG_PREFIX = "dbtest-"

ProgramType = Literal["internship", "vacationer", "graduate", "cadetship", "discovery"]
Precision = Literal["day", "month", "estimated"]
WindowStatus = Literal["upcoming", "open", "closed", "unknown"]
AtsKind = Literal["greenhouse", "lever", "workday"]

_PROGRAM_TYPES = frozenset(get_args(ProgramType))
_PRECISIONS = frozenset(get_args(Precision))
_STATUSES = frozenset(get_args(WindowStatus))
_ATS_KINDS = frozenset(get_args(AtsKind))

_SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_BOARD_KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")
_CYCLE_YEARS = range(2015, 2101)
_WINDOW_SEQS = range(1, 10)

_COMPANY_KEYS = {"slug", "name", "careers_url", "ats", "programs"}
_PROGRAM_KEYS = {
    "slug",
    "name",
    "program_type",
    "cities",
    "disciplines",
    "source_url",
    "eligibility_rules",
    "verified_on",
    "is_published",
    "windows",
}
_WINDOW_KEYS = {
    "cycle_year",
    "window_seq",
    "opens_on",
    "opens_precision",
    "closes_on",
    "closes_precision",
    "program_starts_on",
    "program_ends_on",
    "status",
    "source_url",
}


class SeedError(Exception):
    """The seed file is invalid. `problems` lists every problem found, one line each."""

    def __init__(self, problems: list[str]) -> None:
        super().__init__(f"{len(problems)} problem(s) in the seed file")
        self.problems = problems


@dataclass(frozen=True)
class SeedAts:
    kind: AtsKind
    board_key: str


@dataclass(frozen=True)
class SeedWindow:
    cycle_year: int
    window_seq: int
    opens_on: date | None
    opens_precision: Precision | None
    closes_on: date | None
    closes_precision: Precision | None
    program_starts_on: date | None
    program_ends_on: date | None
    status: WindowStatus
    source_url: str


@dataclass(frozen=True)
class SeedProgram:
    slug: str
    name: str
    program_type: ProgramType
    cities: tuple[str, ...]
    disciplines: tuple[str, ...]
    source_url: str
    eligibility_rules: dict[str, Any]
    verified_on: date | None
    is_published: bool
    windows: tuple[SeedWindow, ...]


@dataclass(frozen=True)
class SeedCompany:
    slug: str
    name: str
    careers_url: str
    ats: SeedAts | None
    programs: tuple[SeedProgram, ...]


@dataclass(frozen=True)
class Catalog:
    companies: tuple[SeedCompany, ...]


class _Context:
    """What the validators share: the problem list, today, and the rules schema."""

    def __init__(self, rules_schema: Mapping[str, Any], today: date) -> None:
        self.problems: list[str] = []
        self.today = today
        self.rules = Draft202012Validator(rules_schema)
        self.disciplines = frozenset(
            rules_schema["properties"]["disciplines"]["properties"]["anyOf"]["items"]["enum"]
        )

    def fail(self, where: str, message: str) -> None:
        self.problems.append(f"{where}: {message}")


def _mapping(raw: object, where: str, keys: set[str], ctx: _Context) -> Mapping[str, Any]:
    if not isinstance(raw, Mapping):
        ctx.fail(where, "must be a mapping")
        return {}
    for unknown in sorted(set(raw) - keys, key=str):
        ctx.fail(where, f"unknown key {unknown!r}")
    return raw


def _text(raw: Mapping[str, Any], key: str, where: str, ctx: _Context) -> str:
    value = raw.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    ctx.fail(where, f"{key} must be a non-empty string")
    return ""


def _slug(raw: Mapping[str, Any], where: str, ctx: _Context) -> str:
    value = raw.get("slug")
    if not isinstance(value, str) or not _SLUG.fullmatch(value):
        ctx.fail(where, f"slug {value!r} must be lowercase letters, digits and single hyphens")
        return ""
    if value.startswith(RESERVED_SLUG_PREFIX):
        ctx.fail(where, f"slug {value!r} uses the reserved test prefix {RESERVED_SLUG_PREFIX!r}")
    return value


def _url(raw: Mapping[str, Any], key: str, where: str, ctx: _Context) -> str:
    value = _text(raw, key, where, ctx)
    if value:
        try:
            validate_fetch_url(value)
        except RejectedUrlError as error:
            ctx.fail(where, f"{key} {value!r} is not an allowed URL: {error}")
    return value


def _choice(
    raw: Mapping[str, Any], key: str, options: frozenset[str], where: str, ctx: _Context
) -> Any:  # noqa: ANN401 - the caller narrows it to its own Literal
    value = raw.get(key)
    if value in options:
        return value
    ctx.fail(where, f"{key} {value!r} must be one of {sorted(options)}")
    return None


def _date(raw: Mapping[str, Any], key: str, where: str, ctx: _Context) -> date | None:
    value = raw.get(key)
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    ctx.fail(where, f"{key} must be a date like 2026-03-31")
    return None


def _strings(
    raw: Mapping[str, Any], key: str, allowed: frozenset[str] | None, where: str, ctx: _Context
) -> tuple[str, ...]:
    value = raw.get(key)
    if not isinstance(value, list) or not value or not all(isinstance(v, str) for v in value):
        ctx.fail(where, f"{key} must be a non-empty list of strings")
        return ()
    if allowed is not None:
        for item in value:
            if item not in allowed:
                ctx.fail(where, f"{key} has unknown value {item!r}")
    return tuple(value)


def _window_dates(
    data: Mapping[str, Any], name: str, where: str, ctx: _Context
) -> tuple[date | None, Precision | None]:
    """One end of a window: its date and, if there is a date, the precision it needs."""
    on = _date(data, f"{name}_on", where, ctx)
    if on is not None:
        return on, _choice(data, f"{name}_precision", _PRECISIONS, where, ctx)
    if data.get(f"{name}_precision") is not None:
        ctx.fail(where, f"{name}_precision is set but {name}_on is missing")
    return None, None


def _window(raw: object, where: str, ctx: _Context) -> SeedWindow:
    data = _mapping(raw, where, _WINDOW_KEYS, ctx)
    cycle_year = data.get("cycle_year")
    if not isinstance(cycle_year, int) or cycle_year not in _CYCLE_YEARS:
        ctx.fail(where, f"cycle_year {cycle_year!r} must be a year from 2015 to 2100")
    seq = data.get("window_seq", 1)
    if not isinstance(seq, int) or seq not in _WINDOW_SEQS:
        ctx.fail(where, f"window_seq {seq!r} must be from 1 to 9")

    opens_on, opens_precision = _window_dates(data, "opens", where, ctx)
    closes_on, closes_precision = _window_dates(data, "closes", where, ctx)
    if opens_on and closes_on and closes_on < opens_on:
        ctx.fail(where, f"closes_on {closes_on} is before opens_on {opens_on}")

    return SeedWindow(
        cycle_year=cycle_year if isinstance(cycle_year, int) else 0,
        window_seq=seq if isinstance(seq, int) else 1,
        opens_on=opens_on,
        opens_precision=opens_precision,
        closes_on=closes_on,
        closes_precision=closes_precision,
        program_starts_on=_date(data, "program_starts_on", where, ctx),
        program_ends_on=_date(data, "program_ends_on", where, ctx),
        status=_choice(data, "status", _STATUSES, where, ctx) or "unknown",
        source_url=_url(data, "source_url", where, ctx),
    )


def _windows(raw: object, where: str, ctx: _Context) -> tuple[SeedWindow, ...]:
    if raw is None:
        return ()
    if not isinstance(raw, list):
        ctx.fail(where, "windows must be a list")
        return ()
    windows = tuple(_window(item, f"{where} window {i + 1}", ctx) for i, item in enumerate(raw))
    seen: set[tuple[int, int]] = set()
    for win in windows:
        key = (win.cycle_year, win.window_seq)
        if key in seen:
            ctx.fail(where, f"duplicate window for cycle_year {key[0]} window_seq {key[1]}")
        seen.add(key)
    return windows


def _rules(raw: Mapping[str, Any], where: str, ctx: _Context) -> dict[str, Any]:
    rules = raw.get("eligibility_rules", {"schemaVersion": 1})
    if not isinstance(rules, dict):
        ctx.fail(where, "eligibility_rules must be a mapping")
        return {"schemaVersion": 1}
    for error in ctx.rules.iter_errors(rules):
        path = "/".join(str(part) for part in error.absolute_path) or "(top level)"
        ctx.fail(where, f"eligibility_rules at {path}: {error.message}")
    return rules


def _verification(data: Mapping[str, Any], where: str, ctx: _Context) -> tuple[date | None, bool]:
    """verified_on and is_published, which must agree: nothing is published unverified."""
    verified_on = _date(data, "verified_on", where, ctx)
    if verified_on is not None and verified_on > ctx.today:
        ctx.fail(where, f"verified_on {verified_on} is in the future")
    is_published = data.get("is_published", False)
    if not isinstance(is_published, bool):
        ctx.fail(where, "is_published must be true or false")
        return verified_on, False
    if is_published and verified_on is None:
        ctx.fail(where, "a published program needs verified_on, the date a person checked it")
    return verified_on, is_published


def _program(raw: object, where: str, ctx: _Context) -> SeedProgram:
    data = _mapping(raw, where, _PROGRAM_KEYS, ctx)
    verified_on, is_published = _verification(data, where, ctx)
    return SeedProgram(
        slug=_slug(data, where, ctx),
        name=_text(data, "name", where, ctx),
        program_type=_choice(data, "program_type", _PROGRAM_TYPES, where, ctx) or "graduate",
        cities=_strings(data, "cities", None, where, ctx),
        disciplines=_strings(data, "disciplines", ctx.disciplines, where, ctx),
        source_url=_url(data, "source_url", where, ctx),
        eligibility_rules=_rules(data, where, ctx),
        verified_on=verified_on,
        is_published=is_published,
        windows=_windows(data.get("windows"), where, ctx),
    )


def _ats(raw: object, where: str, ctx: _Context) -> SeedAts | None:
    if raw is None:
        return None
    data = _mapping(raw, f"{where} ats", {"kind", "board_key"}, ctx)
    kind = _choice(data, "kind", _ATS_KINDS, f"{where} ats", ctx)
    board_key = data.get("board_key")
    if not isinstance(board_key, str) or not _BOARD_KEY.fullmatch(board_key):
        ctx.fail(f"{where} ats", f"board_key {board_key!r} is not a valid board key")
        return None
    return SeedAts(kind=kind, board_key=board_key) if kind else None


def _check_unique(slugs: list[str], name: str, where: str, ctx: _Context) -> None:
    seen: set[str] = set()
    for slug in slugs:
        if slug and slug in seen:
            ctx.fail(where, f"duplicate {name} {slug!r}")
        seen.add(slug)


def _company(raw: object, index: int, ctx: _Context) -> SeedCompany:
    data = _mapping(raw, f"company {index}", _COMPANY_KEYS, ctx)
    slug = _slug(data, f"company {index}", ctx)
    where = f"company {slug or index}"
    programs_raw = data.get("programs", [])
    if not isinstance(programs_raw, list):
        ctx.fail(where, "programs must be a list")
        programs_raw = []
    programs = tuple(
        _program(item, f"{where} program {i + 1}", ctx) for i, item in enumerate(programs_raw)
    )
    _check_unique([p.slug for p in programs], "program slug", where, ctx)
    return SeedCompany(
        slug=slug,
        name=_text(data, "name", where, ctx),
        careers_url=_url(data, "careers_url", where, ctx),
        ats=_ats(data.get("ats"), where, ctx),
        programs=programs,
    )


def parse_catalog(
    text: str, *, rules_schema: Mapping[str, Any], today: date | None = None
) -> Catalog:
    """Parse and validate the seed YAML, or raise SeedError listing every problem."""
    ctx = _Context(rules_schema, today or melbourne_day(SystemClock().now().astimezone(UTC)))
    try:
        document = yaml.safe_load(text)
    except yaml.YAMLError as error:
        raise SeedError([f"the file is not valid YAML: {type(error).__name__}"]) from error
    if not isinstance(document, Mapping) or not isinstance(document.get("companies"), list):
        raise SeedError(["the file must be a mapping with a 'companies' list"])

    companies = tuple(_company(item, i + 1, ctx) for i, item in enumerate(document["companies"]))
    _check_unique([c.slug for c in companies], "company slug", "catalog", ctx)
    if ctx.problems:
        raise SeedError(ctx.problems)
    return Catalog(companies=companies)
