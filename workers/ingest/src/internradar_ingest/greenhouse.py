"""Greenhouse board adapter: a board response in, canonical listings out.

It does not classify listings (listing_program_rules does that) and it stores key facts
only, never descriptions. It reports whether the whole board was parsed, because a
partial fetch must never close listings (ats_fetches.is_complete).

updated_at is deliberately ignored: Greenhouse bulk-touches it, so using it would make
every listing look edited at once. posted_at comes from first_published.

A listing's URL is shown to students as an "Apply" link, so it must be on greenhouse.io
(any subdomain) or on a host the caller names, normally the company's own careers domain.
"""

import json
from collections.abc import Collection
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlsplit

from internradar_ingest.listing import Listing, make_listing

GREENHOUSE_HOST = "greenhouse.io"


class InvalidBoardError(ValueError):
    """The response body is not a Greenhouse board."""


@dataclass(frozen=True)
class ParsedBoard:
    listings: tuple[Listing, ...]
    skipped: int
    is_complete: bool


def _text(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _external_id(value: Any) -> str | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value)
    return _text(value)


def _on_allowed_host(host: str, allowed_hosts: Collection[str]) -> bool:
    return any(host == allowed or host.endswith(f".{allowed}") for allowed in allowed_hosts)


def _https_url(value: Any, allowed_hosts: Collection[str]) -> str | None:
    text = _text(value)
    if text is None:
        return None
    parts = urlsplit(text)
    host = (parts.hostname or "").rstrip(".")
    if parts.scheme != "https" or not host or not _on_allowed_host(host, allowed_hosts):
        return None
    return text


def _location(value: Any) -> str | None:
    return _text(value.get("name")) if isinstance(value, dict) else None


def _posted_at(value: Any) -> datetime | None:
    """first_published as UTC; anything missing, malformed or zoneless is None, never a guess."""
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return None if parsed.utcoffset() is None else parsed.astimezone(UTC)


def _listing(raw: Any, company: str, allowed_hosts: Collection[str]) -> Listing | None:
    if not isinstance(raw, dict):
        return None
    external_id = _external_id(raw.get("id"))
    title = _text(raw.get("title"))
    url = _https_url(raw.get("absolute_url"), allowed_hosts)
    if external_id is None or title is None or url is None:
        return None
    requisition = _text(raw.get("requisition_id"))
    return make_listing(
        company=company,
        external_id=external_id,
        title=title,
        location=_location(raw.get("location")),
        url=url,
        posted_at=_posted_at(raw.get("first_published")),
        key_facts={} if requisition is None else {"requisition_id": requisition},
    )


def _reported_total(payload: dict[str, Any]) -> int | None:
    meta = payload.get("meta")
    total = meta.get("total") if isinstance(meta, dict) else None
    return total if isinstance(total, int) and not isinstance(total, bool) else None


def parse_greenhouse_board(
    body: str, company: str, *, extra_hosts: Collection[str] = ()
) -> ParsedBoard:
    try:
        payload = json.loads(body)
    except ValueError as error:
        msg = "board response is not JSON"
        raise InvalidBoardError(msg) from error
    if not isinstance(payload, dict) or not isinstance(payload.get("jobs"), list):
        msg = "board response has no jobs list"
        raise InvalidBoardError(msg)

    allowed_hosts = (GREENHOUSE_HOST, *(host.lower() for host in extra_hosts))
    raw_jobs: list[Any] = payload["jobs"]
    listings: dict[str, Listing] = {}
    for raw in raw_jobs:
        listing = _listing(raw, company, allowed_hosts)
        if listing is not None and listing.external_id not in listings:
            listings[listing.external_id] = listing
    skipped = len(raw_jobs) - len(listings)
    return ParsedBoard(
        listings=tuple(listings.values()),
        skipped=skipped,
        is_complete=skipped == 0 and _reported_total(payload) == len(raw_jobs),
    )
