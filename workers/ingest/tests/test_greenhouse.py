"""Greenhouse board parser, tested against two real recordings and synthetic edge cases.

The adapter only turns a board into canonical listings. It never decides what a listing
is (that is the listing_program_rules table's job), and it reports whether the whole
board was parsed, because a partial fetch must never close listings (ats_fetches).
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from internradar_ingest.greenhouse import InvalidBoardError, parse_greenhouse_board

FIXTURES = Path(__file__).parent / "fixtures" / "greenhouse"


def job(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": 101,
        "title": "Graduate Trader",
        "location": {"name": "Sydney, Australia"},
        "absolute_url": "https://job-boards.greenhouse.io/imc/jobs/101",
        "first_published": "2026-07-29T04:39:58-04:00",
        "updated_at": "2026-09-30T06:15:59-04:00",
        "requisition_id": "REQ-1",
    }
    return {**base, **overrides}


def board(*jobs: dict[str, Any], total: int | None = None) -> str:
    meta = {"meta": {"total": len(jobs) if total is None else total}}
    return json.dumps({"jobs": list(jobs), **meta})


def parse(*jobs: dict[str, Any], total: int | None = None) -> Any:
    return parse_greenhouse_board(board(*jobs, total=total), company="imc")


# --- the real recordings -----------------------------------------------------------


def test_the_empty_optiver_board_parses_to_nothing_and_is_complete() -> None:
    parsed = parse_greenhouse_board((FIXTURES / "optiver.json").read_text("utf-8"), "optiver")

    assert parsed.listings == ()
    assert parsed.skipped == 0
    assert parsed.is_complete is True


def test_the_imc_recording_parses_every_kept_job() -> None:
    parsed = parse_greenhouse_board((FIXTURES / "imc.json").read_text("utf-8"), "imc")

    assert len(parsed.listings) == 8
    assert parsed.skipped == 0
    titles = [listing.title for listing in parsed.listings]
    assert "Graduate Hardware Engineer" in titles


def test_the_trimmed_imc_recording_is_reported_incomplete_so_it_could_never_close_listings() -> (
    None
):
    # The fixture keeps 8 of 169 jobs, and meta.total still says 169.
    parsed = parse_greenhouse_board((FIXTURES / "imc.json").read_text("utf-8"), "imc")

    assert parsed.is_complete is False


def test_the_adapter_does_not_classify_so_an_internal_auditor_is_still_just_a_listing() -> None:
    parsed = parse_greenhouse_board((FIXTURES / "imc.json").read_text("utf-8"), "imc")

    assert "Global Internal Auditor" in [listing.title for listing in parsed.listings]


def test_a_real_job_is_mapped_field_by_field() -> None:
    parsed = parse_greenhouse_board((FIXTURES / "imc.json").read_text("utf-8"), "imc")
    first = parsed.listings[0]

    assert first.external_id == "4940448101"
    assert first.url == "https://job-boards.eu.greenhouse.io/imc/jobs/4940448101"
    assert first.posted_at == datetime(2026, 7, 29, 8, 39, 58, tzinfo=UTC)


# --- completeness ------------------------------------------------------------------


def test_a_board_whose_job_count_matches_meta_total_is_complete() -> None:
    parsed = parse(job(id=1), job(id=2))

    assert parsed.is_complete is True
    assert len(parsed.listings) == 2


def test_a_board_with_fewer_jobs_than_meta_total_is_incomplete() -> None:
    assert parse(job(id=1), total=2).is_complete is False


@pytest.mark.parametrize("meta", [None, {}, {"total": "2"}, {"total": None}, {"total": True}])
def test_a_board_whose_total_cannot_be_checked_is_incomplete(meta: Any) -> None:
    payload = {"jobs": [job(id=1), job(id=2)]}
    if meta is not None:
        payload["meta"] = meta

    assert parse_greenhouse_board(json.dumps(payload), "imc").is_complete is False


def test_skipping_any_job_makes_the_board_incomplete() -> None:
    parsed = parse(job(id=1), job(id=2, title=""))

    assert parsed.skipped == 1
    assert len(parsed.listings) == 1
    assert parsed.is_complete is False


# --- what makes a job skippable ----------------------------------------------------


@pytest.mark.parametrize(
    "bad",
    [
        {"id": None},
        {"id": True},
        {"id": ""},
        {"id": 1.5},
        {"title": ""},
        {"title": "   "},
        {"title": None},
        {"title": 7},
        {"absolute_url": ""},
        {"absolute_url": None},
        {"absolute_url": "http://job-boards.greenhouse.io/imc/jobs/101"},
        {"absolute_url": "javascript:alert(1)"},
        {"absolute_url": "//job-boards.greenhouse.io/imc/jobs/101"},
    ],
)
def test_a_job_without_a_usable_id_title_or_https_url_is_skipped(bad: dict[str, Any]) -> None:
    parsed = parse(job(**bad))

    assert parsed.listings == ()
    assert parsed.skipped == 1


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.example/apply",
        "https://notgreenhouse.io/imc/jobs/1",
        "https://greenhouse.io.evil.example/imc/jobs/1",
        "https://job-boards.greenhouse.io.evil.example/imc/jobs/1",
    ],
)
def test_a_listing_url_on_an_unexpected_host_is_skipped_not_shown_to_students(url: str) -> None:
    # Students see this as an "Apply" link, so a feed must not be able to point elsewhere.
    parsed = parse(job(absolute_url=url))

    assert parsed.listings == ()
    assert parsed.skipped == 1
    assert parsed.is_complete is False


@pytest.mark.parametrize(
    "url",
    [
        "https://greenhouse.io/imc/jobs/1",
        "https://boards.greenhouse.io/imc/jobs/1",
        "https://job-boards.eu.greenhouse.io/imc/jobs/1",
        "https://JOB-BOARDS.GREENHOUSE.IO/imc/jobs/1",
    ],
)
def test_greenhouse_hosts_and_their_subdomains_are_always_accepted(url: str) -> None:
    assert len(parse(job(absolute_url=url)).listings) == 1


def test_the_companys_own_careers_host_is_accepted_only_when_the_caller_names_it() -> None:
    own = job(absolute_url="https://careers.imc.com/jobs/1")

    assert parse(own).listings == ()
    named = parse_greenhouse_board(board(own), "imc", extra_hosts=("imc.com",))
    assert [listing.url for listing in named.listings] == ["https://careers.imc.com/jobs/1"]


@pytest.mark.parametrize(
    "url", ["https://evilimc.com/jobs/1", "https://imc.com.evil.example/jobs/1"]
)
def test_a_named_company_host_does_not_match_lookalikes(url: str) -> None:
    parsed = parse_greenhouse_board(board(job(absolute_url=url)), "imc", extra_hosts=("imc.com",))

    assert parsed.listings == ()


def test_a_job_that_is_not_an_object_is_skipped() -> None:
    parsed = parse_greenhouse_board(json.dumps({"jobs": ["nope", 3, None, job()]}), "imc")

    assert len(parsed.listings) == 1
    assert parsed.skipped == 3


def test_a_repeated_id_is_kept_once_and_the_repeat_is_skipped() -> None:
    parsed = parse(job(id=5, title="First"), job(id=5, title="Second"))

    assert [listing.title for listing in parsed.listings] == ["First"]
    assert parsed.skipped == 1


def test_a_string_id_is_accepted_and_numeric_ids_become_strings() -> None:
    parsed = parse(job(id="abc-1"), job(id=2))

    assert [listing.external_id for listing in parsed.listings] == ["abc-1", "2"]


# --- optional fields ---------------------------------------------------------------


@pytest.mark.parametrize("location", [None, {}, {"name": None}, {"name": "  "}, "Sydney", 3])
def test_a_missing_or_unusable_location_becomes_none(location: Any) -> None:
    assert parse(job(location=location)).listings[0].location is None


def test_a_location_keeps_its_original_text_including_separators() -> None:
    parsed = parse(job(location={"name": "Amsterdam, Netherlands; London, United Kingdom"}))

    assert parsed.listings[0].location == "Amsterdam, Netherlands; London, United Kingdom"


@pytest.mark.parametrize(
    "published",
    [None, "", "not a date", "2026-07-29T04:39:58", "2026-07-29", 12345],
)
def test_a_missing_or_unparseable_or_zoneless_posting_date_is_none_not_a_guess(
    published: Any,
) -> None:
    parsed = parse(job(first_published=published))

    assert len(parsed.listings) == 1
    assert parsed.listings[0].posted_at is None


def test_the_posting_date_is_converted_to_utc() -> None:
    parsed = parse(job(first_published="2026-10-01T10:22:43-04:00"))

    assert parsed.listings[0].posted_at == datetime(2026, 10, 1, 14, 22, 43, tzinfo=UTC)


def test_updated_at_is_ignored_because_greenhouse_bulk_touches_it() -> None:
    one = parse(job(updated_at="2026-09-30T06:15:59-04:00")).listings[0]
    two = parse(job(updated_at="2026-10-01T09:00:00-04:00")).listings[0]

    assert one.content_hash == two.content_hash


def test_the_requisition_id_is_kept_as_a_key_fact_only_when_present() -> None:
    with_id = parse(job(requisition_id="REQ-9")).listings[0]
    without = parse(job(requisition_id=None)).listings[0]
    blank = parse(job(requisition_id="  ")).listings[0]

    assert dict(with_id.key_facts) == {"requisition_id": "REQ-9"}
    assert dict(without.key_facts) == {}
    assert dict(blank.key_facts) == {}


def test_a_job_description_is_never_stored() -> None:
    parsed = parse(job(content="<p>SECRET-DESCRIPTION-TEXT</p>", departments=[{"name": "x"}]))

    assert "SECRET-DESCRIPTION-TEXT" not in repr(parsed)


def test_the_company_feeds_the_dedupe_key() -> None:
    one = parse_greenhouse_board(board(job()), company="imc").listings[0]
    two = parse_greenhouse_board(board(job()), company="optiver").listings[0]

    assert one.dedupe_key != two.dedupe_key
    assert one.content_hash == two.content_hash


# --- a body we cannot read at all --------------------------------------------------


@pytest.mark.parametrize(
    "body",
    ["", "not json", "[]", "null", '{"jobs": "nope"}', '{"nojobs": []}', '{"jobs": null}'],
)
def test_a_body_that_is_not_a_greenhouse_board_is_an_error(body: str) -> None:
    with pytest.raises(InvalidBoardError):
        parse_greenhouse_board(body, "imc")
