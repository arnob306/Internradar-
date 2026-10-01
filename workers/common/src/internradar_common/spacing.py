"""At least 5 seconds between requests to the same host (docs/ethics-policy.md).

Time comes from an injected Clock and Sleeper, so tests never really wait.
"""

import time
from datetime import datetime
from typing import Protocol

from internradar_common.clock import Clock

MIN_SPACING_SECONDS = 5


class Sleeper(Protocol):
    def sleep(self, seconds: float) -> None:
        """Block for the given number of seconds."""
        ...


class SystemSleeper:
    """The real sleep. Use only at process entrypoints."""

    def sleep(self, seconds: float) -> None:
        time.sleep(seconds)


class HostSpacer:
    """Makes each request to a host wait until the host's spacing has elapsed."""

    def __init__(self, clock: Clock, sleeper: Sleeper) -> None:
        self._clock = clock
        self._sleeper = sleeper
        self._last_request: dict[str, datetime] = {}

    def wait_turn(self, host: str, crawl_delay: float | None = None) -> None:
        """Block until a request to this host is allowed, then record it as made now.

        The spacing is the larger of the 5-second floor and the host's Crawl-delay.
        """
        key = host.lower()
        spacing = max(MIN_SPACING_SECONDS, crawl_delay or 0)
        last = self._last_request.get(key)
        if last is not None:
            remaining = spacing - (self._clock.now() - last).total_seconds()
            if remaining > 0:
                self._sleeper.sleep(remaining)
        self._last_request[key] = self._clock.now()
