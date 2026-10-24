"""Sending one alert (D29).

`deliver` makes one attempt through a Notifier and says what should happen to the alert next:
sent, try again later (waiting longer each time), or give up. Only a short safe code is kept about
a failure. A provider's error text can contain the student's address, so it is never stored.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol

MAX_ATTEMPTS = 5
# the wait after the 1st, 2nd, 3rd and 4th failed try; the 5th failure gives up
BACKOFF = (timedelta(minutes=5), timedelta(minutes=30), timedelta(hours=3), timedelta(hours=12))
UNEXPECTED_ERROR_CODE = "SEND_FAILED"


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    body: str
    # the alert's id, so a provider that sees the same one twice sends one email
    idempotency_key: str
    unsubscribe_url: str


class SendError(Exception):
    """A failure with a safe code. The message never carries an address or provider text."""

    def __init__(self, code: str, *, retryable: bool) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class Notifier(Protocol):
    def send(self, email: OutgoingEmail) -> None:
        """Send or raise SendError."""
        ...


@dataclass(frozen=True)
class Delivery:
    status: str
    attempts: int
    send_after: datetime
    last_error_code: str | None
    sent_at: datetime | None


def _after_failure(code: str, retryable: bool, tried: int, now: datetime) -> Delivery:
    if not retryable or tried >= MAX_ATTEMPTS:
        return Delivery("failed", tried, now, code, None)
    return Delivery("pending", tried, now + BACKOFF[tried - 1], code, None)


def deliver(
    email: OutgoingEmail, attempts_so_far: int, notifier: Notifier, now: datetime
) -> Delivery:
    tried = attempts_so_far + 1
    try:
        notifier.send(email)
    except SendError as error:
        return _after_failure(error.code, error.retryable, tried, now)
    except Exception:  # noqa: BLE001 - anything else is retried, and its text is dropped on purpose
        return _after_failure(UNEXPECTED_ERROR_CODE, True, tried, now)
    return Delivery("sent", tried, now, None, now)
