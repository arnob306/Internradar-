"""The curated seed file: what a valid catalog looks like and what is refused.

The seed is the only way programs and windows enter the catalog (workers never write them), so
the parser is strict: every problem in the file is reported at once, nothing is loaded if
anything is wrong, and a program is never published unless a person has verified it.
"""

import json
from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import Any

import pytest
import yaml
from internradar_ingest.seed import SeedError, parse_catalog

RULES_SCHEMA = json.loads(
    (Path(__file__).parents[3] / "packages/domain/schemas/eligibility-rules.v1.json").read_text(
        encoding="utf-8"
    )
)


def window() -> dict[str, Any]:
    return {
        "cycle_year": 2026,
        "opens_on": date(2025, 3, 1),
        "opens_precision": "month",
        "closes_on": date(2025, 4, 30),
        "closes_precision": "day",
        "status": "closed",
        "source_url": "https://careers.example.com.au/2026-graduates",
    }


def program() -> dict[str, Any]:
    return {
        "slug": "graduate-program",
        "name": "Graduate Program",
        "program_type": "graduate",
        "cities": ["melbourne"],
        "disciplines": ["computer_science"],
        "source_url": "https://careers.example.com.au/graduates",
        "eligibility_rules": {"schemaVersion": 1},
        "windows": [window()],
    }


def company() -> dict[str, Any]:
    return {
        "slug": "example-co",
        "name": "Example Co",
        "careers_url": "https://careers.example.com.au",
        "programs": [program()],
    }


def catalog(*companies: dict[str, Any]) -> str:
    return yaml.safe_dump({"companies": list(companies or [company()])})


def problems_for(text: str) -> list[str]:
    with pytest.raises(SeedError) as caught:
        parse_catalog(text, rules_schema=RULES_SCHEMA)
    return caught.value.problems


def test_a_valid_catalog_parses_into_companies_programs_and_windows() -> None:
    parsed = parse_catalog(catalog(), rules_schema=RULES_SCHEMA)

    (co,) = parsed.companies
    (prog,) = co.programs
    (win,) = prog.windows
    assert (co.slug, prog.slug, prog.program_type) == ("example-co", "graduate-program", "graduate")
    assert prog.cities == ("melbourne",)
    assert win.cycle_year == 2026
    assert win.window_seq == 1
    assert win.closes_on == date(2025, 4, 30)


def test_a_program_is_unverified_and_unpublished_by_default() -> None:
    (co,) = parse_catalog(catalog(), rules_schema=RULES_SCHEMA).companies

    assert co.programs[0].verified_on is None
    assert co.programs[0].is_published is False


def test_a_catalog_can_carry_an_ats_board_for_a_company() -> None:
    raw = company()
    raw["ats"] = {"kind": "greenhouse", "board_key": "imc"}

    (co,) = parse_catalog(catalog(raw), rules_schema=RULES_SCHEMA).companies

    assert co.ats is not None
    assert (co.ats.kind, co.ats.board_key) == ("greenhouse", "imc")


def test_invalid_yaml_and_the_wrong_shape_are_reported_not_raised_as_yaml_errors() -> None:
    assert problems_for("companies: [unclosed")
    assert problems_for("- just\n- a list\n")
    assert problems_for("companies: not-a-list\n")


def test_every_problem_in_the_file_is_reported_at_once() -> None:
    bad_one = company()
    bad_one["slug"] = "Bad Slug"
    bad_two = company()
    bad_two["slug"] = "other-co"
    bad_two["careers_url"] = "http://insecure.example.com"

    problems = problems_for(catalog(bad_one, bad_two))

    assert len(problems) >= 2
    assert any("Bad Slug" in p for p in problems)
    assert any("insecure.example.com" in p for p in problems)


def test_duplicate_company_and_program_slugs_are_refused() -> None:
    dup_program = company()
    dup_program["programs"] = [program(), program()]

    assert any("duplicate" in p for p in problems_for(catalog(company(), company())))
    assert any("duplicate" in p for p in problems_for(catalog(dup_program)))


def test_the_test_data_prefix_is_reserved() -> None:
    raw = company()
    raw["slug"] = "dbtest-example"

    assert any("reserved" in p for p in problems_for(catalog(raw)))


@pytest.mark.parametrize(
    "url",
    [
        "http://careers.example.com",
        "https://www.seek.com.au/graduate-jobs",
        "https://www.prosple.com/x",
        "https://gradconnection.com/x",
        "https://127.0.0.1/careers",
        "not a url",
    ],
)
def test_urls_must_pass_the_same_checks_as_anything_we_fetch(url: str) -> None:
    raw = company()
    raw["careers_url"] = url
    other = company()
    other["slug"] = "other-co"
    other["programs"][0]["source_url"] = url
    other["programs"][0]["windows"][0]["source_url"] = url

    assert problems_for(catalog(raw))
    assert len(problems_for(catalog(other))) >= 2


def test_unknown_enum_values_and_empty_cities_are_refused() -> None:
    raw = company()
    raw["programs"][0]["program_type"] = "apprenticeship"
    raw["programs"][0]["cities"] = []
    raw["programs"][0]["disciplines"] = ["underwater_basket_weaving"]

    assert len(problems_for(catalog(raw))) >= 3


def test_unknown_keys_are_refused_so_a_typo_cannot_silently_drop_a_field() -> None:
    raw = company()
    raw["programs"][0]["eligibilty_rules"] = {"schemaVersion": 1}

    assert any("eligibilty_rules" in p for p in problems_for(catalog(raw)))


def test_eligibility_rules_must_match_the_domain_schema() -> None:
    wrong_shape = company()
    wrong_shape["programs"][0]["eligibility_rules"] = {"schemaVersion": 1, "yearLevel": "final"}
    unknown_key = company()
    unknown_key["slug"] = "other-co"
    unknown_key["programs"][0]["eligibility_rules"] = {"schemaVersion": 1, "wam": 70}

    assert any("eligibility_rules" in p for p in problems_for(catalog(wrong_shape)))
    assert any("eligibility_rules" in p for p in problems_for(catalog(unknown_key)))


def test_valid_rules_are_kept_as_given() -> None:
    raw = company()
    raw["programs"][0]["eligibility_rules"] = {
        "schemaVersion": 1,
        "yearLevel": {"preset": "penultimate"},
        "acceptsMidYearGraduates": True,
    }

    (co,) = parse_catalog(catalog(raw), rules_schema=RULES_SCHEMA).companies

    assert co.programs[0].eligibility_rules["yearLevel"] == {"preset": "penultimate"}


def test_publishing_requires_a_verification_date() -> None:
    raw = company()
    raw["programs"][0]["is_published"] = True

    assert any("verified_on" in p for p in problems_for(catalog(raw)))

    raw["programs"][0]["verified_on"] = date(2026, 10, 2)
    (co,) = parse_catalog(catalog(raw), rules_schema=RULES_SCHEMA).companies
    assert co.programs[0].is_published is True
    assert co.programs[0].verified_on == date(2026, 10, 2)


def test_a_verification_date_cannot_be_in_the_future() -> None:
    raw = company()
    raw["programs"][0]["verified_on"] = date(2999, 1, 1)

    assert any("future" in p for p in problems_for(catalog(raw)))


def test_every_window_needs_a_source_url_and_a_precision_for_each_date() -> None:
    no_source = company()
    del no_source["programs"][0]["windows"][0]["source_url"]
    no_precision = company()
    no_precision["slug"] = "other-co"
    del no_precision["programs"][0]["windows"][0]["opens_precision"]

    assert any("source_url" in p for p in problems_for(catalog(no_source)))
    assert any("precision" in p for p in problems_for(catalog(no_precision)))


def test_a_precision_without_a_date_is_refused() -> None:
    raw = company()
    win = raw["programs"][0]["windows"][0]
    del win["closes_on"]

    assert any("precision" in p for p in problems_for(catalog(raw)))


def test_a_window_cannot_close_before_it_opens() -> None:
    raw = company()
    raw["programs"][0]["windows"][0]["closes_on"] = date(2025, 2, 1)

    assert any("closes_on" in p for p in problems_for(catalog(raw)))


def test_window_numbers_are_bounded_and_not_repeated() -> None:
    bad_year = company()
    bad_year["programs"][0]["windows"][0]["cycle_year"] = 1999
    repeated = company()
    repeated["slug"] = "other-co"
    repeated["programs"][0]["windows"] = [window(), deepcopy(window())]

    assert any("cycle_year" in p for p in problems_for(catalog(bad_year)))
    assert any("duplicate" in p for p in problems_for(catalog(repeated)))

    second_round = window()
    second_round["window_seq"] = 2
    ok = company()
    ok["programs"][0]["windows"] = [window(), second_round]
    parse_catalog(catalog(ok), rules_schema=RULES_SCHEMA)


def test_an_unverified_program_may_carry_unknown_dates() -> None:
    raw = company()
    raw["programs"][0]["windows"] = [
        {
            "cycle_year": 2027,
            "status": "unknown",
            "source_url": "https://careers.example.com.au/graduates",
        }
    ]

    (co,) = parse_catalog(catalog(raw), rules_schema=RULES_SCHEMA).companies

    win = co.programs[0].windows[0]
    assert win.opens_on is None
    assert win.closes_on is None
    assert win.status == "unknown"


def test_ats_kind_and_board_key_are_checked() -> None:
    bad_kind = company()
    bad_kind["ats"] = {"kind": "taleo", "board_key": "x"}
    bad_key = company()
    bad_key["slug"] = "other-co"
    bad_key["ats"] = {"kind": "greenhouse", "board_key": "../etc"}

    assert problems_for(catalog(bad_kind))
    assert problems_for(catalog(bad_key))


def test_a_program_without_windows_is_allowed() -> None:
    raw = company()
    del raw["programs"][0]["windows"]

    (co,) = parse_catalog(catalog(raw), rules_schema=RULES_SCHEMA).companies

    assert co.programs[0].windows == ()


@pytest.mark.parametrize(
    ("where", "key", "value", "message"),
    [
        ("company", "programs", "nope", "programs must be a list"),
        ("program", "windows", "nope", "windows must be a list"),
        ("program", "windows", ["nope"], "must be a mapping"),
        ("program", "eligibility_rules", ["nope"], "eligibility_rules must be a mapping"),
        ("program", "is_published", "yes", "is_published must be true or false"),
        ("program", "verified_on", "last week", "must be a date"),
        ("window", "window_seq", 10, "window_seq"),
        ("window", "opens_on", "March", "must be a date"),
    ],
)
def test_wrongly_shaped_values_are_reported_not_crashed_on(
    where: str, key: str, value: object, message: str
) -> None:
    raw = company()
    target = {
        "company": raw,
        "program": raw["programs"][0],
        "window": raw["programs"][0]["windows"][0],
    }[where]
    target[key] = value

    assert any(message in p for p in problems_for(catalog(raw)))


def test_a_company_that_is_not_a_mapping_is_reported() -> None:
    assert any("must be a mapping" in p for p in problems_for("companies:\n  - just text\n"))
