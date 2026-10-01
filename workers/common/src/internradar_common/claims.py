"""One fetch per URL per Melbourne day (ADR-015).

Callers take a claim before fetching. The Postgres-backed store (unique per source and
fetch day) arrives with the database layer; the in-memory one serves tests and dry runs.
"""

from datetime import date
from typing import Protocol
from urllib.parse import urlsplit, urlunsplit


class ClaimStore(Protocol):
    def claim(self, url: str, day: date) -> bool:
        """Take the claim for this URL on this Melbourne day; False if already taken."""
        ...


def claim_key(url: str) -> str:
    """The URL as one page: scheme and host lower-cased, fragment dropped."""
    parts = urlsplit(url)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, ""))


class InMemoryClaimStore:
    def __init__(self) -> None:
        self._claimed: set[tuple[str, date]] = set()

    def claim(self, url: str, day: date) -> bool:
        entry = (claim_key(url), day)
        if entry in self._claimed:
            return False
        self._claimed.add(entry)
        return True
