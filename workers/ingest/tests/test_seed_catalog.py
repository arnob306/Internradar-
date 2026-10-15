"""The committed seed catalog (data/seed/catalog.yaml) must always be valid.

A pull request that edits the catalog runs this in CI, so a typo, a bad URL or a published but
unverified program fails the build instead of reaching the database.
"""

import json
from pathlib import Path

from internradar_ingest.seed import SeedProgram, parse_catalog

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


def test_graduate_programs_use_a_graduation_window_not_a_year_level() -> None:
    """D16: a year-level rule counts someone who already graduated as ineligible, but graduate
    programs take recent graduates, so they must say so with a graduation window."""
    catalog = parse_catalog(CATALOG.read_text(encoding="utf-8"), rules_schema=RULES_SCHEMA)

    for company in catalog.companies:
        for program in company.programs:
            if program.program_type == "graduate":
                assert "yearLevel" not in program.eligibility_rules, (company.slug, program.slug)


def test_nothing_is_published_without_a_verification_date() -> None:
    catalog = parse_catalog(CATALOG.read_text(encoding="utf-8"), rules_schema=RULES_SCHEMA)

    for company in catalog.companies:
        for program in company.programs:
            assert program.verified_on is not None or not program.is_published


def _program(slug_company: str, slug_program: str) -> SeedProgram:
    catalog = parse_catalog(CATALOG.read_text(encoding="utf-8"), rules_schema=RULES_SCHEMA)
    for company in catalog.companies:
        if company.slug == slug_company:
            for program in company.programs:
                if program.slug == slug_program:
                    return program
    raise AssertionError(f"{slug_company}/{slug_program} is not in the catalog")


def test_kpmgs_last_vacationer_round_is_given_only_as_months() -> None:
    """The dates came from the author's research, not from KPMG's page, so they are approximate:
    months only, never a day. The program stays unverified and unpublished."""
    program = _program("kpmg-australia", "vacationer-program")

    assert program.program_type == "vacationer"
    assert program.eligibility_rules["yearLevel"] == {"preset": "penultimate"}
    (window,) = program.windows
    assert window.cycle_year == 2026
    assert window.status == "closed"
    assert (str(window.opens_on), window.opens_precision) == ("2026-02-01", "month")
    assert (str(window.closes_on), window.closes_precision) == ("2026-10-01", "month")
    assert not program.is_published and program.verified_on is None


def test_kpmgs_graduate_rolling_intake_is_open_with_no_closing_date() -> None:
    """KPMG's page says the rolling intake is open with no closing date, so none is recorded."""
    program = _program("kpmg-australia", "graduate-program")

    assert program.program_type == "graduate"
    (window,) = program.windows
    assert window.cycle_year == 2027
    assert window.status == "open"
    assert window.closes_on is None
    assert not program.is_published


def test_deloittes_july_2026_round_is_a_past_window_beside_the_unknown_current_one() -> None:
    program = _program("deloitte-australia", "graduate-program")

    by_seq = {window.window_seq: window for window in program.windows}
    assert by_seq[1].status == "unknown"
    july = by_seq[2]
    assert july.cycle_year == 2027
    assert july.status == "closed"
    assert (str(july.opens_on), july.opens_precision) == ("2026-07-01", "month")
    assert july.closes_precision == "month"


def test_nabs_summer_intern_program_has_its_2026_dates_from_its_page() -> None:
    program = _program("nab", "summer-intern-program")

    assert program.program_type == "vacationer"
    assert program.eligibility_rules["yearLevel"] == {"preset": "penultimate"}
    (window,) = program.windows
    assert window.cycle_year == 2026
    assert window.status == "closed"
    assert (str(window.opens_on), window.opens_precision) == ("2026-07-06", "day")
    assert (str(window.closes_on), window.closes_precision) == ("2026-08-09", "day")


def test_the_government_data_stream_opens_on_1_march_2027_and_states_no_close() -> None:
    program = _program("australian-public-service", "data-stream")

    assert program.program_type == "graduate"
    assert program.eligibility_rules["citizenship"] == {"allowed": ["au_citizen"]}
    (window,) = program.windows
    assert window.cycle_year == 2028
    assert window.status == "upcoming"
    assert (str(window.opens_on), window.opens_precision) == ("2027-03-01", "day")
    assert window.closes_on is None


def _stage_names(program: SeedProgram) -> list[str]:
    return [stage.name for stage in program.application_stages]


def test_kpmgs_vacationer_stages_come_from_its_vacation_program_page() -> None:
    program = _program("kpmg-australia", "vacationer-program")

    assert _stage_names(program) == [
        "Online application",
        "Online assessments",
        "Shortlisting",
        "Interview",
        "Outcome",
    ]
    for stage in program.application_stages:
        assert stage.source_url == "https://kpmg.com/au/en/careers/graduates/vacation-program.html"


def test_nabs_summer_intern_stages_come_from_its_summer_intern_page() -> None:
    program = _program("nab", "summer-intern-program")

    assert _stage_names(program) == [
        "Online application",
        "Online assessment",
        "Video interview",
        "Engagement Centre",
    ]
    for stage in program.application_stages:
        assert stage.source_url == (
            "https://www.nab.com.au/about-us/careers/early-careers/summer-intern-program"
        )


def test_commbanks_summer_intern_uses_the_how_to_apply_page_it_shares_with_graduates() -> None:
    """CommBank's page gives one process for all its programs, so the intern row cites it too."""
    program = _program("commbank", "summer-intern-program")

    assert _stage_names(program) == [
        "Online application",
        "Online assessment",
        "Digital interview",
        "Assessment centre",
    ]
    for stage in program.application_stages:
        assert stage.source_url == (
            "https://www.commbank.com.au/about-us/careers/graduate-intern-programs/how-to-apply.html"
        )


# D23: the author's tagging of each employer's industry. A new company has to be added here on
# purpose, so a program is never left untagged by accident.
INDUSTRY_OF_COMPANY = {
    "commbank": "banking_finance",
    "nab": "banking_finance",
    "anz": "banking_finance",
    "westpac": "banking_finance",
    "deloitte-australia": "consulting",
    "pwc-australia": "consulting",
    "ey-australia": "consulting",
    "kpmg-australia": "consulting",
    "atlassian": "technology",
    "australian-public-service": "government_defence",
}


def test_every_program_carries_its_employers_industry() -> None:
    catalog = parse_catalog(CATALOG.read_text(encoding="utf-8"), rules_schema=RULES_SCHEMA)

    assert {company.slug for company in catalog.companies} == set(INDUSTRY_OF_COMPANY)
    for company in catalog.companies:
        for program in company.programs:
            assert program.industry == INDUSTRY_OF_COMPANY[company.slug], (company.slug, program.slug)
