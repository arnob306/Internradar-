"""The SMTP notifier (D29): right headers, safe error codes, and no address in an error."""

import smtplib
from dataclasses import replace
from email.message import EmailMessage
from typing import Any

import pytest
from internradar_monitor.alerts.send import OutgoingEmail, SendError
from internradar_monitor.alerts.smtp import SmtpNotifier

EMAIL = OutgoingEmail(
    to="alice@example.test",
    subject="Acme Graduate Program is now open",
    body="Body text\n",
    idempotency_key="alert-1",
    unsubscribe_url="https://internradar.example/unsubscribe?token=abc",
)


class FakeSmtp:
    """Stands in for smtplib.SMTP and records what the notifier does with it."""

    def __init__(self, error: BaseException | None = None) -> None:
        self.error = error
        self.calls: list[tuple[str, Any]] = []
        self.sent: list[EmailMessage] = []

    def __enter__(self) -> "FakeSmtp":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def starttls(self) -> None:
        self.calls.append(("starttls", None))

    def login(self, user: str, password: str) -> None:
        self.calls.append(("login", user))

    def send_message(self, message: EmailMessage) -> None:
        if self.error is not None:
            raise self.error
        self.sent.append(message)


def notifier(smtp: FakeSmtp, **options: Any) -> SmtpNotifier:
    return SmtpNotifier(
        sender="InternRadar <alerts@internradar.example>", connect=lambda: smtp, **options
    )


def test_the_message_has_the_addresses_subject_and_body() -> None:
    smtp = FakeSmtp()

    notifier(smtp).send(EMAIL)

    (message,) = smtp.sent
    assert message["To"] == "alice@example.test"
    assert message["From"] == "InternRadar <alerts@internradar.example>"
    assert message["Subject"] == "Acme Graduate Program is now open"
    assert message.get_content() == "Body text\n"


def test_the_message_offers_one_click_unsubscribe_and_names_its_alert() -> None:
    smtp = FakeSmtp()

    notifier(smtp).send(EMAIL)

    (message,) = smtp.sent
    assert message["List-Unsubscribe"] == "<https://internradar.example/unsubscribe?token=abc>"
    assert message["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert message["X-InternRadar-Alert"] == "alert-1"


def test_a_long_unsubscribe_link_stays_readable_in_the_sent_message() -> None:
    long_link = "https://internradar.example/unsubscribe?alert=" + "0123456789abcdef" * 4
    smtp = FakeSmtp()

    notifier(smtp).send(replace(EMAIL, unsubscribe_url=long_link))

    (message,) = smtp.sent
    # on the wire the link must be a plain <url>, not an encoded word a mail client cannot follow
    assert f"List-Unsubscribe: <{long_link}>".encode() in message.as_bytes()


def test_a_secure_login_is_used_only_when_asked_for() -> None:
    plain, secure = FakeSmtp(), FakeSmtp()

    notifier(plain).send(EMAIL)
    notifier(secure, starttls=True, login=("user", "secret")).send(EMAIL)

    assert plain.calls == []
    assert secure.calls == [("starttls", None), ("login", "user")]


def test_a_refused_address_will_never_work() -> None:
    refused = smtplib.SMTPRecipientsRefused({"alice@example.test": (550, b"no such user")})

    with pytest.raises(SendError) as caught:
        notifier(FakeSmtp(refused)).send(EMAIL)

    assert (caught.value.code, caught.value.retryable) == ("BAD_ADDRESS", False)


def test_a_temporary_server_error_can_be_retried() -> None:
    busy = smtplib.SMTPResponseException(451, b"try again later for alice@example.test")

    with pytest.raises(SendError) as caught:
        notifier(FakeSmtp(busy)).send(EMAIL)

    assert (caught.value.code, caught.value.retryable) == ("TEMPORARY_FAILURE", True)


def test_a_permanent_server_error_is_not_retried() -> None:
    rejected = smtplib.SMTPResponseException(554, b"rejected alice@example.test")

    with pytest.raises(SendError) as caught:
        notifier(FakeSmtp(rejected)).send(EMAIL)

    assert (caught.value.code, caught.value.retryable) == ("REJECTED", False)


def test_a_dropped_connection_can_be_retried() -> None:
    for error in (smtplib.SMTPServerDisconnected("gone"), ConnectionRefusedError(), TimeoutError()):
        with pytest.raises(SendError) as caught:
            notifier(FakeSmtp(error)).send(EMAIL)

        assert (caught.value.code, caught.value.retryable) == ("CONNECTION_FAILED", True)


def test_no_error_carries_the_address_or_the_server_text() -> None:
    busy = smtplib.SMTPResponseException(451, b"try again later for alice@example.test")

    with pytest.raises(SendError) as caught:
        notifier(FakeSmtp(busy)).send(EMAIL)

    assert "alice" not in str(caught.value) + repr(caught.value)


def test_the_servers_own_error_is_not_chained_where_a_log_would_print_it() -> None:
    busy = smtplib.SMTPResponseException(451, b"try again later for alice@example.test")

    with pytest.raises(SendError) as caught:
        notifier(FakeSmtp(busy)).send(EMAIL)

    assert caught.value.__suppress_context__
    assert caught.value.__cause__ is None


def test_a_recipient_with_a_line_break_is_refused_not_turned_into_a_header() -> None:
    sneaky = OutgoingEmail(
        to="alice@example.test\r\nBcc: someone@example.test",
        subject=EMAIL.subject,
        body=EMAIL.body,
        idempotency_key="alert-2",
        unsubscribe_url=EMAIL.unsubscribe_url,
    )
    smtp = FakeSmtp()

    with pytest.raises(SendError) as caught:
        notifier(smtp).send(sneaky)

    assert (caught.value.code, caught.value.retryable) == ("BAD_ADDRESS", False)
    assert smtp.sent == []
