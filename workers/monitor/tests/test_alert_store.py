"""The alert store (D30), against the local database and as the restricted notify_worker role.

It turns window events into alerts, then claims due alerts, sends them and records the result.
"""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

import psycopg
import pytest
from internradar_monitor.alerts.send import OutgoingEmail, SendError
from internradar_monitor.alerts.store import create_alerts, send_due

pytestmark = pytest.mark.db

Connection = psycopg.Connection[tuple[Any, ...]]
NOW = datetime.now(UTC)
TODAY = NOW.date()


class FakeNotifier:
    def __init__(self, error: SendError | None = None) -> None:
        self.error = error
        self.sent: list[OutgoingEmail] = []

    def send(self, email: OutgoingEmail) -> None:
        if self.error is not None:
            raise self.error
        self.sent.append(email)


def unsubscribe_url(alert_id: str) -> str:
    return f"https://internradar.example/unsubscribe?alert={alert_id}"


def alert_rows(db: Connection, user_id: UUID) -> list[tuple[Any, ...]]:
    return db.execute(
        "select kind, status, attempts, last_error_code, sent_at, send_after, details "
        "from public.alerts where user_id = %s order by created_at",
        (user_id,),
    ).fetchall()


def test_a_follower_is_owed_an_alert_when_a_window_opens(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window()

    created = create_alerts(notify_db, now=NOW, today=TODAY)

    ((kind, status, attempts, *_rest, details),) = alert_rows(admin_db, world.user_id)
    assert (created, kind, status, attempts) == (1, "opened", "pending", 0)
    assert details["program_name"] == "Graduate Program"
    assert details["company_name"] == "Acme"


def test_making_alerts_twice_makes_them_once(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window()

    first = create_alerts(notify_db, now=NOW, today=TODAY)
    second = create_alerts(notify_db, now=NOW, today=TODAY)

    assert (first, second) == (1, 0)
    assert len(alert_rows(admin_db, world.user_id)) == 1


def test_a_student_who_turned_email_off_is_owed_nothing(
    notify_db: Connection,
    admin_db: Connection,
    world: Any,
    open_window: Callable[..., None],
    new_student: Callable[..., tuple[UUID, str]],
    follow_program: Callable[..., None],
) -> None:
    quiet_id, _ = new_student("quiet", email_alerts=False)
    muted_id, _ = new_student("muted")
    follow_program(quiet_id, world.program_id)
    follow_program(muted_id, world.program_id, notify=False)
    open_window()

    create_alerts(notify_db, now=NOW, today=TODAY)

    assert alert_rows(admin_db, quiet_id) == []
    assert alert_rows(admin_db, muted_id) == []


def test_a_program_that_is_not_published_makes_no_alerts(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    admin_db.execute(
        "update public.programs set is_published = false where id = %s", (world.program_id,)
    )
    open_window()

    assert create_alerts(notify_db, now=NOW, today=TODAY) == 0


def test_a_closing_date_in_the_last_week_makes_one_reminder(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window(closes_on=(TODAY + timedelta(days=3)).isoformat(), closes_precision="day")

    create_alerts(notify_db, now=NOW, today=TODAY)
    create_alerts(notify_db, now=NOW, today=TODAY)

    kinds = sorted(row[0] for row in alert_rows(admin_db, world.user_id))
    assert kinds == ["closing_soon", "opened"]


def test_a_closing_month_is_not_a_reminder_because_the_day_is_unknown(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window(closes_on=(TODAY + timedelta(days=3)).isoformat(), closes_precision="month")

    create_alerts(notify_db, now=NOW, today=TODAY)

    assert [row[0] for row in alert_rows(admin_db, world.user_id)] == ["opened"]


def test_a_due_alert_is_emailed_and_marked_sent(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window()
    create_alerts(notify_db, now=NOW, today=TODAY)
    notifier = FakeNotifier()

    summary = send_due(notify_db, notifier, now=NOW, unsubscribe_url_for=unsubscribe_url)

    ((_, status, attempts, error, sent_at, *_rest),) = alert_rows(admin_db, world.user_id)
    (email,) = notifier.sent
    assert (summary.sent, status, attempts, error) == (1, "sent", 1, None)
    assert sent_at is not None
    assert email.to == world.email
    assert "now open" in email.subject
    assert email.unsubscribe_url.startswith("https://internradar.example/unsubscribe?alert=")


def test_a_sent_alert_is_never_sent_again(
    notify_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window()
    create_alerts(notify_db, now=NOW, today=TODAY)
    send_due(notify_db, FakeNotifier(), now=NOW, unsubscribe_url_for=unsubscribe_url)
    notifier = FakeNotifier()

    summary = send_due(notify_db, notifier, now=NOW, unsubscribe_url_for=unsubscribe_url)

    assert (summary.sent, notifier.sent) == (0, [])


def test_an_alert_that_is_not_due_yet_waits(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window()
    create_alerts(notify_db, now=NOW, today=TODAY)
    admin_db.execute("update public.alerts set send_after = %s", (NOW + timedelta(hours=1),))
    notifier = FakeNotifier()

    send_due(notify_db, notifier, now=NOW, unsubscribe_url_for=unsubscribe_url)

    assert notifier.sent == []


def test_a_temporary_failure_is_kept_to_try_again_with_only_a_safe_code(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window()
    create_alerts(notify_db, now=NOW, today=TODAY)
    notifier = FakeNotifier(SendError("TEMPORARY_FAILURE", retryable=True))

    summary = send_due(notify_db, notifier, now=NOW, unsubscribe_url_for=unsubscribe_url)

    ((_, status, attempts, error, sent_at, send_after, _),) = alert_rows(admin_db, world.user_id)
    assert (summary.retrying, status, attempts, error, sent_at) == (
        1,
        "pending",
        1,
        "TEMPORARY_FAILURE",
        None,
    )
    assert send_after > NOW


def test_a_permanent_failure_gives_up(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window()
    create_alerts(notify_db, now=NOW, today=TODAY)
    notifier = FakeNotifier(SendError("BAD_ADDRESS", retryable=False))

    summary = send_due(notify_db, notifier, now=NOW, unsubscribe_url_for=unsubscribe_url)

    ((_, status, _, error, *_rest),) = alert_rows(admin_db, world.user_id)
    assert (summary.failed, status, error) == (1, "failed", "BAD_ADDRESS")


def test_a_student_who_turned_email_off_after_the_alert_was_made_is_not_emailed(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window()
    create_alerts(notify_db, now=NOW, today=TODAY)
    admin_db.execute("update public.profiles set email_alerts = false")
    notifier = FakeNotifier()

    summary = send_due(notify_db, notifier, now=NOW, unsubscribe_url_for=unsubscribe_url)

    ((_, status, *_rest),) = alert_rows(admin_db, world.user_id)
    assert (summary.skipped, status, notifier.sent) == (1, "skipped", [])


def test_an_alert_another_worker_is_sending_is_left_alone(
    notify_db: Connection, admin_db: Connection, world: Any, open_window: Callable[..., None]
) -> None:
    open_window()
    create_alerts(notify_db, now=NOW, today=TODAY)
    notifier = FakeNotifier()

    with admin_db.transaction():
        admin_db.execute("select id from public.alerts for update")
        summary = send_due(notify_db, notifier, now=NOW, unsubscribe_url_for=unsubscribe_url)

    assert (summary.sent, notifier.sent) == (0, [])
    again = send_due(notify_db, notifier, now=NOW, unsubscribe_url_for=unsubscribe_url)
    assert again.sent == 1
