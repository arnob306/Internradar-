"""The seed command line: python -m internradar_ingest.seed_cli [--check] FILE

Validates the curated seed YAML and, unless --check is given, loads it:

  --check              validate only; needs no database (so CI can check a seed pull request).
  SEED_DATABASE_URL    required to load; a connection string for a role that may write the
                       catalog (not the restricted ingest_worker). A secret: never printed,
                       and neither is a crash's message.

Exit codes: 0 valid and (unless --check) loaded; 1 the file is invalid or the load crashed;
2 wrong arguments, an unreadable file, or no database URL. An invalid file loads nothing.
"""

import json
import os
import sys
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

import psycopg

from internradar_ingest.seed import Catalog, SeedError, parse_catalog
from internradar_ingest.seed_load import LoadSummary, load_catalog

ENV_DATABASE_URL = "SEED_DATABASE_URL"
RULES_SCHEMA_PATH = (
    Path(__file__).parents[4] / "packages" / "domain" / "schemas" / "eligibility-rules.v1.json"
)

# Takes the database URL and the validated catalog and loads it.
Loader = Callable[[str, Catalog], LoadSummary]


def _usage() -> int:
    print("usage: python -m internradar_ingest.seed_cli [--check] FILE", file=sys.stderr)
    return 2


def _describe(catalog: Catalog) -> str:
    programs = [p for c in catalog.companies for p in c.programs]
    windows = sum(len(p.windows) for p in programs)
    return f"{len(catalog.companies)} companies, {len(programs)} programs, {windows} windows"


def main(
    argv: Sequence[str],
    env: Mapping[str, str],
    *,
    loader: Loader,
    rules_schema: Mapping[str, Any],
) -> int:
    flags = [a for a in argv if a.startswith("-")]
    paths = [a for a in argv if not a.startswith("-")]
    if len(paths) != 1 or any(flag != "--check" for flag in flags):
        return _usage()
    check_only = bool(flags)

    try:
        text = Path(paths[0]).read_text(encoding="utf-8")
    except OSError as error:
        print(f"cannot read {paths[0]}: {type(error).__name__}", file=sys.stderr)
        return 2

    try:
        catalog = parse_catalog(text, rules_schema=rules_schema)
    except SeedError as error:
        for problem in error.problems:
            print(problem, file=sys.stderr)
        return 1

    if check_only:
        print(f"seed file is valid: {_describe(catalog)}")
        return 0

    database_url = env.get(ENV_DATABASE_URL, "").strip()
    if not database_url:
        print(f"{ENV_DATABASE_URL} is not set", file=sys.stderr)
        return 2

    try:
        summary = loader(database_url, catalog)
    except Exception as error:
        # Only the type: the message may contain the connection string or host.
        print(f"seed load crashed: {type(error).__name__}", file=sys.stderr)
        return 1

    print(
        f"seed loaded ({_describe(catalog)}): inserted={summary.inserted} "
        f"updated={summary.updated} unchanged={summary.unchanged} skipped={summary.skipped}"
    )
    return 0


def load_into_database(database_url: str, catalog: Catalog) -> LoadSummary:  # pragma: no cover
    """The real wiring: an autocommit connection, so load_catalog's transaction is the unit."""
    with psycopg.connect(database_url, autocommit=True) as connection:
        return load_catalog(connection, catalog)


if __name__ == "__main__":  # pragma: no cover
    schema = json.loads(RULES_SCHEMA_PATH.read_text(encoding="utf-8"))
    raise SystemExit(main(sys.argv[1:], os.environ, loader=load_into_database, rules_schema=schema))
