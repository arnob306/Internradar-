"""Where alerts are made and sent (D30). It runs as the restricted notify_worker role.

`create_alerts` reads recent window events and closing dates, asks the pure planner who is owed
what, and queues it; the unique (student, reason) rule makes a repeat run harmless. `send_due`
claims due alerts while holding their rows (`skip locked`, so two workers never send the same
one), sends each, and records only the outcome. The student's address is read one pending alert
at a time through `alert_recipient_email`, and an alert whose student has since turned email off
is skipped, not sent.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from internradar_monitor.alerts.compose import compose_email
from internradar_monitor.alerts.plan import (
    CLOSING_SOON_DAYS,
    AlertDraft,
    Follower,
    ProgramRef,
    WindowEvent,
    WindowSnapshot,
    alerts_for_event,
    closing_soon_alerts,
)
from internradar_monitor.alerts.send import Delivery, Notifier, OutgoingEmail, deliver

Connection = psycopg.Connection[tuple[Any, ...]]

# Events are re-read for this long, so a run that was down for a day still catches up. The
# unique (student, reason) rule makes the overlap harmless.
LOOKBACK = timedelta(days=2)
BATCH_SIZE = 50


@dataclass(frozen=True)
class SendSummary:
    sent: int
    retrying: int
    failed: int
    skipped: int


def _snapshot(state: dict[str, Any]) -> WindowSnapshot:
    def day(key: str) -> date | None:
        value = state.get(key)
        return date.fromisoformat(value) if value is not None else None

    return WindowSnapshot(
        status=state["status"],
        opens_on=day("opens_on"),
        opens_precision=state.get("opens_precision"),
        closes_on=day("closes_on"),
        closes_precision=state.get("closes_precision"),
    )


def _program(row: tuple[Any, ...]) -> ProgramRef:
    return ProgramRef(
        program_id=str(row[0]), program_name=row[1], company_name=row[2], source_url=row[3]
    )


def _followers(db: Connection, program_id: str) -> tuple[Follower, ...]:
    rows = db.execute(
        "select f.user_id, f.notify, p.email_alerts from public.program_follows f "
        "join public.profiles p on p.user_id = f.user_id where f.program_id = %s",
        (program_id,),
    ).fetchall()
    return tuple(Follower(str(user_id), notify, alerts) for user_id, notify, alerts in rows)


def _queue(db: Connection, drafts: tuple[AlertDraft, ...]) -> int:
    queued = 0
    for draft in drafts:
        cursor = db.execute(
            "insert into public.alerts "
            "(user_id, program_id, program_window_id, kind, dedupe_key, details) "
            "values (%s, %s, %s, %s, %s, %s) on conflict (user_id, dedupe_key) do nothing",
            (
                draft.user_id,
                draft.program_id,
                draft.window_id,
                draft.kind,
                draft.dedupe_key,
                Jsonb(draft.details),
            ),
        )
        queued += cursor.rowcount
    return queued


def _event_drafts(db: Connection, since: datetime) -> list[AlertDraft]:
    rows = db.execute(
        "select e.id, e.program_window_id, e.event_type, e.before, e.after, "
        "exists (select 1 from public.program_window_events o "
        "where o.program_window_id = e.program_window_id and o.event_type = 'opened' "
        "and o.occurred_at = e.occurred_at), "
        "p.id, p.name, c.name, p.source_url "
        "from public.program_window_events e "
        "join public.program_windows w on w.id = e.program_window_id "
        "join public.programs p on p.id = w.program_id "
        "join public.companies c on c.id = p.company_id "
        "where e.occurred_at >= %s and p.is_published order by e.id",
        (since,),
    ).fetchall()
    drafts: list[AlertDraft] = []
    for row in rows:
        program = _program(row[6:])
        event = WindowEvent(
            event_id=row[0],
            window_id=str(row[1]),
            event_type=row[2],
            before=_snapshot(row[3]) if row[3] is not None else None,
            after=_snapshot(row[4]),
            opened_in_same_update=row[5],
        )
        drafts.extend(alerts_for_event(event, program, _followers(db, program.program_id)))
    return drafts


def _closing_drafts(db: Connection, today: date) -> list[AlertDraft]:
    rows = db.execute(
        "select w.id, w.status, w.opens_on, w.opens_precision, w.closes_on, w.closes_precision, "
        "p.id, p.name, c.name, p.source_url from public.program_windows w "
        "join public.programs p on p.id = w.program_id "
        "join public.companies c on c.id = p.company_id "
        "where w.status = 'open' and w.closes_precision = 'day' and p.is_published "
        "and w.closes_on between %s and %s",
        (today, today + timedelta(days=CLOSING_SOON_DAYS)),
    ).fetchall()
    drafts: list[AlertDraft] = []
    for row in rows:
        window = WindowSnapshot(row[1], row[2], row[3], row[4], row[5])
        program = _program(row[6:])
        followers = _followers(db, program.program_id)
        drafts.extend(closing_soon_alerts(str(row[0]), window, program, followers, today))
    return drafts


def create_alerts(db: Connection, *, now: datetime, today: date) -> int:
    """Queue the alerts owed for recent events and closing dates; returns how many were new."""
    drafts = _event_drafts(db, now - LOOKBACK) + _closing_drafts(db, today)
    return _queue(db, tuple(drafts))


def _record(db: Connection, alert_id: Any, outcome: Delivery) -> None:
    db.execute(
        "update public.alerts set status = %s, attempts = %s, send_after = %s, "
        "last_error_code = %s, sent_at = %s where id = %s",
        (
            outcome.status,
            outcome.attempts,
            outcome.send_after,
            outcome.last_error_code,
            outcome.sent_at,
            alert_id,
        ),
    )


def _skip(db: Connection, alert_id: Any, now: datetime) -> None:
    db.execute(
        "update public.alerts set status = 'skipped', send_after = %s where id = %s",
        (now, alert_id),
    )


def send_due(
    db: Connection,
    notifier: Notifier,
    *,
    now: datetime,
    unsubscribe_url_for: Callable[[str], str],
    limit: int = BATCH_SIZE,
) -> SendSummary:
    """Send the alerts that are due, one at a time, and record each outcome."""
    counts = {"sent": 0, "pending": 0, "failed": 0, "skipped": 0}
    with db.transaction():
        due = db.execute(
            "select a.id, a.kind, a.details, a.attempts, exists ("
            "select 1 from public.program_follows f "
            "join public.profiles p on p.user_id = f.user_id "
            "where f.user_id = a.user_id and f.program_id = a.program_id "
            "and f.notify and p.email_alerts) "
            "from public.alerts a where a.status = 'pending' and a.send_after <= %s "
            "order by a.send_after limit %s for update of a skip locked",
            (now, limit),
        ).fetchall()
        for alert_id, kind, details, attempts, still_wanted in due:
            address_row = db.execute(
                "select public.alert_recipient_email(%s)", (alert_id,)
            ).fetchone()
            address = address_row[0] if address_row is not None else None
            if not still_wanted or address is None:
                _skip(db, alert_id, now)
                counts["skipped"] += 1
                continue
            unsubscribe_url = unsubscribe_url_for(str(alert_id))
            content = compose_email(kind, details, unsubscribe_url)
            email = OutgoingEmail(
                to=address,
                subject=content.subject,
                body=content.body,
                idempotency_key=str(alert_id),
                unsubscribe_url=unsubscribe_url,
            )
            outcome = deliver(email, attempts, notifier, now)
            _record(db, alert_id, outcome)
            counts[outcome.status] += 1
    return SendSummary(counts["sent"], counts["pending"], counts["failed"], counts["skipped"])
