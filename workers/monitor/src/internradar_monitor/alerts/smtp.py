"""Send alerts over SMTP (D29). Locally that is Mailpit; a hosted provider can use it too.

The connection is made by a callable the caller gives, so tests need no network. Whatever goes
wrong becomes a SendError with a short safe code: SMTP replies quote the address, so their text
is never passed on.
"""

import smtplib
from collections.abc import Callable
from email.message import EmailMessage
from email.policy import SMTP
from typing import Any

from internradar_monitor.alerts.send import OutgoingEmail, SendError

_TEMPORARY_REPLY = range(400, 500)
# Header lines may run to the RFC limit. At the default 78, a link with no spaces cannot be folded
# and is turned into an encoded word, which mail clients cannot follow for one-click unsubscribe.
_POLICY = SMTP.clone(max_line_length=998)


class SmtpNotifier:
    def __init__(
        self,
        *,
        sender: str,
        connect: Callable[[], Any],
        starttls: bool = False,
        login: tuple[str, str] | None = None,
    ) -> None:
        self._sender = sender
        self._connect = connect
        self._starttls = starttls
        self._login = login

    def _message(self, email: OutgoingEmail) -> EmailMessage:
        message = EmailMessage(policy=_POLICY)
        try:
            message["To"] = email.to
        except ValueError:
            raise SendError("BAD_ADDRESS", retryable=False) from None
        try:
            message["From"] = self._sender
            message["Subject"] = email.subject
            message["List-Unsubscribe"] = f"<{email.unsubscribe_url}>"
            message["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
            message["X-InternRadar-Alert"] = email.idempotency_key
        except ValueError:
            raise SendError("INVALID_MESSAGE", retryable=False) from None
        message.set_content(email.body)
        return message

    def send(self, email: OutgoingEmail) -> None:
        message = self._message(email)
        try:
            with self._connect() as smtp:
                if self._starttls:
                    smtp.starttls()
                if self._login is not None:
                    smtp.login(*self._login)
                smtp.send_message(message)
        except smtplib.SMTPRecipientsRefused:
            raise SendError("BAD_ADDRESS", retryable=False) from None
        except smtplib.SMTPResponseException as error:
            if error.smtp_code in _TEMPORARY_REPLY:
                raise SendError("TEMPORARY_FAILURE", retryable=True) from None
            raise SendError("REJECTED", retryable=False) from None
        except (smtplib.SMTPException, OSError):
            raise SendError("CONNECTION_FAILED", retryable=True) from None
