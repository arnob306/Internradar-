"""The committed seed catalog (data/seed/catalog.yaml) must always be valid.

A pull request that edits the catalog runs this in CI, so a typo, a bad URL or a published but
unverified program fails the build instead of reaching the database.
"""

import json
from pathlib import Path

from internradar_ingest.seed import parse_catalog

REPO = Path(__file__).parents[3]
CATALOG = REPO / "data" / "seed" / "catalog.yaml"
RULES_SCHEMA = json.loads(
    (REPO / "packages/domain/schemas/eligibility-rules.v1.json").read_text(encoding="utf-8")
)


def test_the_committed_catalog_is_valid() -> None:
    catalog = parse_catalog(CATALOG.read_text(encoding="utf-8"), rules_schema=RULES_SCHEMA)

    assert catalog.companies


def test_every_program_and_window_cites_the_employers_own_page() -> None:
    catalog = parse_catalog(CATALOG.read_text(encoding="utf-8"), rules_schema=RULES_SCHEMA)

    for company in catalog.companies:
        for program in company.programs:
            assert program.source_url, (company.slug, program.slug)
            for window in program.windows:
                assert window.source_url, (company.slug, program.slug, window.cycle_year)


def test_nothing_is_published_without_a_verification_date() -> None:
    catalog = parse_catalog(CATALOG.read_text(encoding="utf-8"), rules_schema=RULES_SCHEMA)

    for company in catalog.companies:
        for program in company.programs:
            assert program.verified_on is not None or not program.is_published
