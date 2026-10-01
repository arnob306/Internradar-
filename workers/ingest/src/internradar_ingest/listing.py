"""A canonical listing and its two identifiers (Phase 1 schema, ADR-003).

dedupe_key finds the same role posted twice. content_hash detects edits to a listing we
already hold. Fields are JSON-encoded before hashing, never joined with a separator, so
one field cannot blur into the next.
"""

import hashlib
import json
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from types import MappingProxyType


def normalise_text(value: str) -> str:
    """Compare-friendly text: Unicode-compatible, case-folded, single-spaced."""
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def normalise_location(value: str | None) -> str:
    """A multi-location ("A; B") is sorted so its order never matters."""
    if value is None:
        return ""
    parts = (normalise_text(part) for part in value.split(";"))
    return "; ".join(sorted(part for part in parts if part))


def _sha256(payload: object) -> str:
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def dedupe_key(company: str, title: str, location: str | None) -> str:
    return _sha256([normalise_text(company), normalise_text(title), normalise_location(location)])


def content_hash(
    *,
    title: str,
    location: str | None,
    url: str,
    posted_at: datetime | None,
    key_facts: Mapping[str, str],
) -> str:
    if posted_at is not None and posted_at.utcoffset() is None:
        msg = "posted_at must carry a timezone"
        raise ValueError(msg)
    return _sha256(
        {
            "title": title,
            "location": location,
            "url": url,
            "posted_at": None if posted_at is None else posted_at.astimezone(UTC).isoformat(),
            "key_facts": dict(key_facts),
        }
    )


@dataclass(frozen=True)
class Listing:
    external_id: str
    title: str
    location: str | None
    url: str
    posted_at: datetime | None
    key_facts: Mapping[str, str]
    content_hash: str
    dedupe_key: str


def make_listing(  # noqa: PLR0913 - mirrors the listings table columns
    *,
    company: str,
    external_id: str,
    title: str,
    location: str | None,
    url: str,
    posted_at: datetime | None,
    key_facts: Mapping[str, str],
) -> Listing:
    facts = MappingProxyType(dict(key_facts))
    return Listing(
        external_id=external_id,
        title=title,
        location=location,
        url=url,
        posted_at=posted_at,
        key_facts=facts,
        content_hash=content_hash(
            title=title, location=location, url=url, posted_at=posted_at, key_facts=facts
        ),
        dedupe_key=dedupe_key(company, title, location),
    )
