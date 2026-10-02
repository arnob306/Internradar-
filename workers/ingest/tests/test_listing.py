"""Listing identity: normalising, dedupe_key and content_hash (Phase 1 schema, ADR-003).

dedupe_key finds the same role posted twice (indexed, not unique). content_hash only
detects edits to a listing we already hold; it is never part of the key. Neither may
change because of casing, spacing, or the order of a multi-location list.
"""

import re
from datetime import UTC, datetime, timedelta, timezone

import pytest
from internradar_ingest.listing import (
    Listing,
    content_hash,
    dedupe_key,
    make_listing,
    normalise_location,
    normalise_text,
)

HEX64 = re.compile(r"^[0-9a-f]{64}$")
POSTED = datetime(2026, 7, 29, 8, 39, 58, tzinfo=UTC)
BASE = {
    "title": "Graduate Hardware Engineer",
    "location": "Amsterdam, Netherlands",
    "url": "https://job-boards.eu.greenhouse.io/imc/jobs/4975740101",
    "posted_at": POSTED,
    "key_facts": {"requisition_id": "REQ-1"},
}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Graduate   Trader ", "graduate trader"),
        ("GRADUATE\tTrader\n", "graduate trader"),
        ("Straße", "strasse"),
        ("ﬁnance", "finance"),
        ("", ""),
    ],
)
def test_text_is_normalised_for_comparison(raw: str, expected: str) -> None:
    assert normalise_text(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (None, ""),
        ("", ""),
        ("Sydney", "sydney"),
        (
            "Amsterdam, Netherlands; London, United Kingdom",
            "amsterdam, netherlands; london, united kingdom",
        ),
        (
            "London, United Kingdom;  AMSTERDAM, Netherlands",
            "amsterdam, netherlands; london, united kingdom",
        ),
        ("Sydney;;Melbourne;", "melbourne; sydney"),
    ],
)
def test_a_multi_location_is_sorted_and_normalised(raw: str | None, expected: str) -> None:
    assert normalise_location(raw) == expected


def test_dedupe_key_is_a_sha256_hex_digest() -> None:
    assert HEX64.match(dedupe_key("imc", "Graduate Trader", "Sydney"))


def test_dedupe_key_ignores_case_spacing_and_location_order() -> None:
    first = dedupe_key("IMC", "Graduate  Trader", "Amsterdam; London")
    second = dedupe_key("imc", " graduate trader ", "london;AMSTERDAM")

    assert first == second


@pytest.mark.parametrize(
    "different",
    [
        ("optiver", "Graduate Trader", "Sydney"),
        ("imc", "Graduate Quant", "Sydney"),
        ("imc", "Graduate Trader", "Melbourne"),
        ("imc", "Graduate Trader", None),
    ],
)
def test_dedupe_key_differs_when_company_title_or_location_differs(
    different: tuple[str, str, str | None],
) -> None:
    assert dedupe_key("imc", "Graduate Trader", "Sydney") != dedupe_key(*different)


def test_dedupe_key_fields_cannot_blur_into_each_other() -> None:
    # A plain "|"-joined string would give these two the same key.
    assert dedupe_key("a|b", "c", None) != dedupe_key("a", "b|c", None)


def test_content_hash_is_a_sha256_hex_digest() -> None:
    assert HEX64.match(content_hash(**BASE))


def test_content_hash_is_stable_for_the_same_content() -> None:
    same = {**BASE, "key_facts": {"requisition_id": "REQ-1"}}

    assert content_hash(**BASE) == content_hash(**same)


@pytest.mark.parametrize(
    "change",
    [
        {"title": "Graduate Hardware Engineer II"},
        {"location": "London, United Kingdom"},
        {"url": "https://job-boards.eu.greenhouse.io/imc/jobs/1"},
        {"posted_at": POSTED + timedelta(days=1)},
        {"posted_at": None},
        {"key_facts": {"requisition_id": "REQ-2"}},
        {"key_facts": {}},
    ],
)
def test_content_hash_changes_when_any_stored_field_changes(change: dict[str, object]) -> None:
    assert content_hash(**{**BASE, **change}) != content_hash(**BASE)


def test_content_hash_does_not_depend_on_key_facts_order() -> None:
    one = content_hash(**{**BASE, "key_facts": {"a": "1", "b": "2"}})
    two = content_hash(**{**BASE, "key_facts": {"b": "2", "a": "1"}})

    assert one == two


def test_content_hash_treats_the_same_instant_in_any_timezone_as_equal() -> None:
    eastern = POSTED.astimezone(timezone(timedelta(hours=-4)))

    assert content_hash(**{**BASE, "posted_at": eastern}) == content_hash(**BASE)


def test_content_hash_rejects_a_posting_time_without_a_timezone() -> None:
    with pytest.raises(ValueError, match="timezone"):
        content_hash(**{**BASE, "posted_at": datetime(2026, 7, 29, 8, 39, 58)})  # noqa: DTZ001


def test_make_listing_fills_in_both_hashes_from_the_stored_fields() -> None:
    listing = make_listing(company="imc", external_id="4975740101", **BASE)

    assert isinstance(listing, Listing)
    assert listing.external_id == "4975740101"
    assert listing.title == BASE["title"]
    assert listing.location == BASE["location"]
    assert listing.url == BASE["url"]
    assert listing.posted_at == POSTED
    assert dict(listing.key_facts) == {"requisition_id": "REQ-1"}
    assert listing.content_hash == content_hash(**BASE)
    assert listing.dedupe_key == dedupe_key("imc", str(BASE["title"]), str(BASE["location"]))


def test_a_listing_does_not_change_when_the_caller_mutates_the_key_facts_afterwards() -> None:
    facts = {"requisition_id": "REQ-1"}
    listing = make_listing(company="imc", external_id="1", **{**BASE, "key_facts": facts})

    facts["requisition_id"] = "CHANGED"

    assert dict(listing.key_facts) == {"requisition_id": "REQ-1"}
