"""robots.txt decisions (docs/ethics-policy.md, RFC 9309).

Parsing is delegated to protego, which implements wildcards, end anchors, longest-match
precedence and Crawl-delay. This module only decides what each kind of response means.
"""

from dataclasses import dataclass
from http import HTTPStatus

from protego import Protego

_FIRST_SERVER_ERROR = 500


@dataclass(frozen=True)
class RobotsPolicy:
    """What we may fetch from one host today."""

    parser: Protego | None
    user_agent: str
    allow_all: bool

    def can_fetch(self, url: str) -> bool:
        if self.parser is None:
            return self.allow_all
        return bool(self.parser.can_fetch(url, self.user_agent))

    @property
    def crawl_delay(self) -> float | None:
        if self.parser is None:
            return None
        delay = self.parser.crawl_delay(self.user_agent)
        return None if delay is None else float(delay)


def policy_from_response(status: int | None, body: str | None, user_agent: str) -> RobotsPolicy:
    """Turn the robots.txt response (status None means no response) into a policy.

    Parsed when it exists, allowed when it is absent (other 4xx), and forbidden when we
    could not learn what the owner wants (no response, 5xx, 429, unresolved redirect).
    """
    if status == HTTPStatus.OK and body is not None:
        return RobotsPolicy(Protego.parse(body), user_agent, allow_all=False)
    is_absent = (
        status is not None
        and HTTPStatus.BAD_REQUEST <= status < _FIRST_SERVER_ERROR
        and status != HTTPStatus.TOO_MANY_REQUESTS
    )
    return RobotsPolicy(None, user_agent, allow_all=is_absent)
