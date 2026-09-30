"""Which URLs may be fetched at all (docs/ethics-policy.md).

Only employer pages and public ATS feeds are fetched. Aggregators are refused by host,
subdomains included, before any network activity.
"""

import ipaddress
from urllib.parse import urlsplit

AGGREGATOR_HOSTS = frozenset({"seek.com.au", "seek.com", "prosple.com", "gradconnection.com"})


class RejectedUrlError(ValueError):
    """The URL must not be fetched."""


def _is_address(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


def _is_aggregator(host: str) -> bool:
    return any(host == banned or host.endswith(f".{banned}") for banned in AGGREGATOR_HOSTS)


def validate_fetch_url(url: str) -> str:
    """Return the URL unchanged if it may be fetched, else raise RejectedUrlError."""
    try:
        parts = urlsplit(url)
        host = (parts.hostname or "").rstrip(".")
    except ValueError as error:
        msg = f"malformed URL: {error}"
        raise RejectedUrlError(msg) from error

    if parts.scheme != "https":
        msg = "URL must use https"
        raise RejectedUrlError(msg)
    if not host:
        msg = "URL has no host"
        raise RejectedUrlError(msg)
    if parts.username is not None or parts.password is not None:
        msg = "URL must not contain credentials"
        raise RejectedUrlError(msg)
    if _is_address(host):
        msg = "URL host must be a public name, not an address"
        raise RejectedUrlError(msg)
    if _is_aggregator(host):
        msg = f"{host} is an aggregator and is never fetched"
        raise RejectedUrlError(msg)
    return url
