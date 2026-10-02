"""The ingest run: which boards to ingest, and how a whole run is graded.

This module grows to hold the database side of a run (the pipeline_runs row and the loop over
boards); the pure logic comes first so it can be tested without a database.
"""

from collections.abc import Sequence
from typing import Literal, get_args
from urllib.parse import urlsplit

from internradar_common.fetch_url import RejectedUrlError, validate_fetch_url

from internradar_ingest.ingest import BoardOutcome, OutcomeKind

RunStatus = Literal["succeeded", "partial", "failed"]

# A board that was ingested, or that was already done today, is not a problem.
_OK_KINDS = frozenset({"ingested", "already_fetched"})
_KINDS: tuple[str, ...] = get_args(OutcomeKind)
_LISTING_COUNTS = ("inserted", "updated", "unchanged", "reopened", "closed", "close_blocked")


def company_host(careers_url: str | None) -> str | None:
    """The host a company's own listing URLs may use, or None if it cannot be trusted.

    The careers URL has to pass the same checks as any URL we would fetch (https, a public
    name, not an aggregator), so seed data can never turn an aggregator or an address into an
    allowed host. A leading "www." is dropped so the company's subdomains match too.
    """
    if not careers_url:
        return None
    try:
        validate_fetch_url(careers_url)
    except RejectedUrlError:
        return None
    host = (urlsplit(careers_url).hostname or "").rstrip(".").removeprefix("www.")
    return host or None


def summarise_run(outcomes: Sequence[BoardOutcome]) -> tuple[RunStatus, dict[str, int]]:
    """Grade a run and count what happened. The counts always have the same keys."""
    counts: dict[str, int] = {
        "boards": len(outcomes),
        **dict.fromkeys(_KINDS, 0),
        **dict.fromkeys(_LISTING_COUNTS, 0),
    }
    for outcome in outcomes:
        counts[outcome.kind] += 1
        if outcome.summary is not None:
            for name in _LISTING_COUNTS:
                counts[name] += getattr(outcome.summary, name)

    failing = sum(counts[kind] for kind in _KINDS if kind not in _OK_KINDS)
    if failing == 0:
        return "succeeded", counts
    return ("failed" if failing == len(outcomes) else "partial"), counts
