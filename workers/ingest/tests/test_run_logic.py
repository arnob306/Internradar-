"""The run entrypoint's pure logic: which extra host a company may use, and how a run is graded.

No database or network here. A company's own careers host is allowed for its listing URLs, but
only if it passes the same checks as any URL we would fetch, so an aggregator or an address can
never become an allowed host by being written into the seed data.
"""

import pytest
from internradar_ingest.ingest import BoardOutcome
from internradar_ingest.run import company_host, summarise_run
from internradar_ingest.upsert import UpsertSummary


@pytest.mark.parametrize(
    ("careers_url", "expected"),
    [
        ("https://careers.imc.example/jobs", "careers.imc.example"),
        ("https://www.imc.com/au/careers", "imc.com"),
        ("https://WWW.IMC.COM./au", "imc.com"),
        ("https://imc.com:8443/x", "imc.com"),
        ("https://boards.greenhouse.io/imc", "boards.greenhouse.io"),
    ],
)
def test_the_company_host_is_the_careers_site_without_www(careers_url: str, expected: str) -> None:
    assert company_host(careers_url) == expected


@pytest.mark.parametrize(
    "careers_url",
    [
        None,
        "",
        "not a url",
        "http://imc.com/careers",
        "https://www.seek.com.au/imc",
        "https://au.prosple.com/graduate-employers/imc",
        "https://10.0.0.1/careers",
        "https://localhost/careers",
        "https://user:pass@imc.com/careers",
    ],
)
def test_an_unusable_or_forbidden_careers_url_gives_no_extra_host(careers_url: str | None) -> None:
    assert company_host(careers_url) is None


def outcome(kind: str, summary: UpsertSummary | None = None) -> BoardOutcome:
    return BoardOutcome(kind, None, summary)  # type: ignore[arg-type]


def upsert(**counts: int) -> UpsertSummary:
    base = {"inserted": 0, "updated": 0, "unchanged": 0, "reopened": 0, "closed": 0}
    return UpsertSummary(**{**base, **counts})


def test_a_run_with_no_boards_succeeds_with_all_counts_at_zero() -> None:
    status, counts = summarise_run([])

    assert status == "succeeded"
    assert counts["boards"] == 0
    assert all(value == 0 for value in counts.values())


def test_boards_that_were_ingested_or_already_done_today_succeed() -> None:
    status, counts = summarise_run(
        [outcome("ingested", upsert(inserted=3)), outcome("already_fetched")]
    )

    assert status == "succeeded"
    assert counts["boards"] == 2
    assert counts["ingested"] == 1
    assert counts["already_fetched"] == 1


@pytest.mark.parametrize(
    "bad_kind",
    ["not_fetched", "invalid_board", "invalid_source", "database_error", "unexpected_error"],
)
def test_one_failing_board_makes_the_run_partial(bad_kind: str) -> None:
    status, counts = summarise_run([outcome("ingested", upsert()), outcome(bad_kind)])

    assert status == "partial"
    assert counts[bad_kind] == 1


def test_a_run_where_every_board_failed_is_failed() -> None:
    status, _ = summarise_run([outcome("not_fetched"), outcome("database_error")])

    assert status == "failed"


def test_listing_counts_are_summed_across_boards() -> None:
    status, counts = summarise_run(
        [
            outcome("ingested", upsert(inserted=3, updated=1, unchanged=10)),
            outcome("ingested", upsert(inserted=2, reopened=1, closed=4, close_blocked=0)),
            outcome("ingested", UpsertSummary(0, 0, 0, 0, 0, close_blocked=7)),
        ]
    )

    assert status == "succeeded"
    assert counts["inserted"] == 5
    assert counts["updated"] == 1
    assert counts["unchanged"] == 10
    assert counts["reopened"] == 1
    assert counts["closed"] == 4
    assert counts["close_blocked"] == 7


def test_the_counts_always_have_the_same_keys_so_they_are_easy_to_query() -> None:
    _, empty = summarise_run([])
    _, busy = summarise_run([outcome("ingested", upsert(inserted=1)), outcome("not_fetched")])

    assert set(empty) == set(busy)
