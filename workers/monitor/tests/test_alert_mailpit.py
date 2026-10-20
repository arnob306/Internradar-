"""A real email through the local Mailpit (D30), from a window opening to the message arriving.

Needs the Supabase dev stack with Mailpit and its SMTP port (`pnpm --filter @internradar/db
db:start:dev`; `smtp_port` in config.toml). Without it the test is skipped, and says so.
"""

import json
import smtplib
import urllib.request
from collections.abc import Callable, Iterator
from datetime import timedelta
from typing import Any
from urllib.error import URLError

import psycopg
import pytest
from internradar_common.clock import SystemClock
from internradar_monitor.alerts.run import run_once
from internradar_monitor.alerts.smtp import SmtpNotifier

pytestmark = [pytest.mark.db, pytest.mark.allow_hosts(["127.0.0.1"])]

Connection = psycopg.Connection[tuple[Any, ...]]
API = "http://127.0.0.1:54324/api/v1"
SMTP_PORT = 54325
# a little ahead of the database clock, so alerts the database just stamped are already due
NOW = SystemClock().now() + timedelta(minutes=5)


def mailpit(path: str, *, method: str = "GET", body: dict[str, Any] | None = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(  # noqa: S310 - a fixed local http address
        f"{API}{path}", data=data, method=method, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=5) as response:  # noqa: S310
        return json.loads(response.read() or b"null")


@pytest.fixture
def local_mailpit() -> Iterator[None]:
    try:
        mailpit("/messages?limit=1")
    except (URLError, OSError):
        pytest.skip("Mailpit is not running: `pnpm --filter @internradar/db db:start:dev`")
    yield


def test_an_alert_arrives_in_mailpit_with_the_unsubscribe_headers(
    local_mailpit: None,
    notify_db: Connection,
    world: Any,
    open_window: Callable[..., None],
) -> None:
    open_window()
    notifier = SmtpNotifier(
        sender="InternRadar <alerts@internradar.example>",
        connect=lambda: smtplib.SMTP("127.0.0.1", SMTP_PORT, timeout=10),
    )

    summary = run_once(
        notify_db,
        notifier,
        now=NOW,
        today=NOW.date(),
        unsubscribe_base="https://internradar.example/unsubscribe",
    )

    found = mailpit(f"/search?query=to:{world.email}")["messages"]
    try:
        assert (summary.created, summary.sent.sent) == (1, 1)
        (message,) = found
        assert message["Subject"] == "Acme Graduate Program is now open"
        headers = mailpit(f"/message/{message['ID']}/headers")
        assert headers["List-Unsubscribe-Post"] == ["List-Unsubscribe=One-Click"]
        unsubscribe = headers["List-Unsubscribe"][0]
        assert unsubscribe.startswith("<https://internradar.example/unsubscribe?alert=")
        text = mailpit(f"/message/{message['ID']}")["Text"]
        assert "Check the employer's page before you apply" in text
    finally:
        mailpit("/messages", method="DELETE", body={"IDs": [m["ID"] for m in found]})
