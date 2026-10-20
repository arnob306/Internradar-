"""Sending one alert (D29): success, retry with backoff, giving up, and never storing error detail."""

from datetime import UTC, datetime, timedelta

from internradar_monitor.alerts.send import (
    BACKOFF,
    MAX_ATTEMPTS,
    OutgoingEmail,
    SendError,
    deliver,
)

NOW = datetime(2026, 11, 24, 1, 0, tzinfo=UTC)
EMAIL = OutgoingEmail(
    to="alice@example.test",
    subject="Acme Graduate Program is now open",
    body="Body",
    idempotency_key="alert-1",
    unsubscribe_url="https://internradar.example/unsubscribe?token=abc",
)


class FakeNotifier:
    def __init__(self, error: BaseException | None = None) -> None:
        self.error = error
        self.sent: list[OutgoingEmail] = []

    def send(self, email: OutgoingEmail) -> None:
        if self.error is not None:
            raise self.error
        self.sent.append(email)


def test_a_sent_alert_is_marked_sent_with_when() -> None:
    notifier = FakeNotifier()

    result = deliver(EMAIL, 0, notifier, NOW)

    assert (result.status, result.attempts, result.sent_at) == ("sent", 1, NOW)
    assert result.last_error_code is None
    assert notifier.sent == [EMAIL]


def test_the_provider_gets_the_alert_id_so_a_repeat_is_not_a_second_email() -> None:
    notifier = FakeNotifier()

    deliver(EMAIL, 0, notifier, NOW)

    assert notifier.sent[0].idempotency_key == "alert-1"


def test_a_success_after_earlier_failures_counts_every_try() -> None:
    result = deliver(EMAIL, 2, FakeNotifier(), NOW)

    assert (result.status, result.attempts) == ("sent", 3)


def test_a_temporary_failure_waits_and_tries_again() -> None:
    result = deliver(EMAIL, 0, FakeNotifier(SendError("PROVIDER_BUSY", retryable=True)), NOW)

    assert (result.status, result.attempts) == ("pending", 1)
    assert result.send_after == NOW + BACKOFF[0]
    assert result.last_error_code == "PROVIDER_BUSY"
    assert result.sent_at is None


def test_each_retry_waits_longer_than_the_last() -> None:
    waits = [
        deliver(EMAIL, tried, FakeNotifier(SendError("X", retryable=True)), NOW).send_after - NOW
        for tried in range(MAX_ATTEMPTS - 1)
    ]

    assert waits == list(BACKOFF)
    assert waits == sorted(waits)
    assert waits[0] == timedelta(minutes=5)


def test_the_last_allowed_try_gives_up() -> None:
    result = deliver(EMAIL, MAX_ATTEMPTS - 1, FakeNotifier(SendError("X", retryable=True)), NOW)

    assert (result.status, result.attempts) == ("failed", MAX_ATTEMPTS)
    assert result.last_error_code == "X"


def test_a_failure_that_will_not_get_better_gives_up_at_once() -> None:
    result = deliver(EMAIL, 0, FakeNotifier(SendError("BAD_ADDRESS", retryable=False)), NOW)

    assert (result.status, result.attempts, result.last_error_code) == ("failed", 1, "BAD_ADDRESS")


def test_an_unexpected_error_is_retried_and_its_text_is_never_kept() -> None:
    leaky = RuntimeError("550 mailbox alice@example.test does not exist")

    result = deliver(EMAIL, 0, FakeNotifier(leaky), NOW)

    assert (result.status, result.last_error_code) == ("pending", "SEND_FAILED")
    assert "alice" not in repr(result)
