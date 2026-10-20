"""Who is owed which alert (D29). Pure decisions: no database, no clock, no email."""

from dataclasses import replace
from datetime import date

from internradar_monitor.alerts.plan import (
    CLOSING_SOON_DAYS,
    Follower,
    ProgramRef,
    WindowEvent,
    WindowSnapshot,
    alerts_for_event,
    closing_soon_alerts,
)

PROGRAM = ProgramRef(
    program_id="p1",
    program_name="Graduate Program",
    company_name="Acme",
    source_url="https://acme.example/grad",
)
ALICE = Follower(user_id="alice", follow_notify=True, email_alerts=True)
BOB = Follower(user_id="bob", follow_notify=True, email_alerts=True)


def snapshot(**changes: object) -> WindowSnapshot:
    base = WindowSnapshot(
        status="open",
        opens_on=date(2026, 10, 1),
        opens_precision="day",
        closes_on=date(2026, 12, 1),
        closes_precision="day",
    )
    return replace(base, **changes)  # type: ignore[arg-type]


def event(event_type: str, *, before: WindowSnapshot | None = None, **after: object) -> WindowEvent:
    return WindowEvent(
        event_id=42, window_id="w1", event_type=event_type, before=before, after=snapshot(**after)
    )


def test_a_window_that_opens_alerts_every_follower() -> None:
    drafts = alerts_for_event(event("opened"), PROGRAM, (ALICE, BOB))

    assert [(d.user_id, d.kind, d.dedupe_key) for d in drafts] == [
        ("alice", "opened", "event:42"),
        ("bob", "opened", "event:42"),
    ]


def test_an_alert_freezes_what_the_email_will_say() -> None:
    (draft,) = alerts_for_event(event("opened"), PROGRAM, (ALICE,))

    assert draft.program_id == "p1"
    assert draft.window_id == "w1"
    assert draft.details == {
        "program_name": "Graduate Program",
        "company_name": "Acme",
        "program_url": "https://acme.example/grad",
        "opens_on": "2026-10-01",
        "opens_precision": "day",
        "closes_on": "2026-12-01",
        "closes_precision": "day",
    }


def test_a_date_keeps_the_precision_its_source_gave() -> None:
    month_only = event("opened", closes_on=date(2026, 12, 1), closes_precision="month")

    (draft,) = alerts_for_event(month_only, PROGRAM, (ALICE,))

    assert (draft.details["closes_on"], draft.details["closes_precision"]) == (
        "2026-12-01",
        "month",
    )


def test_a_date_that_is_not_known_stays_unknown() -> None:
    no_close = event("opened", closes_on=None, closes_precision=None)

    (draft,) = alerts_for_event(no_close, PROGRAM, (ALICE,))

    assert (draft.details["closes_on"], draft.details["closes_precision"]) == (None, None)


def test_a_follower_who_turned_this_program_off_gets_nothing() -> None:
    muted = replace(ALICE, follow_notify=False)

    drafts = alerts_for_event(event("opened"), PROGRAM, (muted, BOB))

    assert [d.user_id for d in drafts] == ["bob"]


def test_a_student_who_turned_email_alerts_off_gets_nothing() -> None:
    unsubscribed = replace(ALICE, email_alerts=False)

    drafts = alerts_for_event(event("opened"), PROGRAM, (unsubscribed, BOB))

    assert [d.user_id for d in drafts] == ["bob"]


def test_a_window_that_closes_sends_nothing() -> None:
    assert alerts_for_event(event("closed", status="closed"), PROGRAM, (ALICE,)) == ()


def test_changed_dates_alert_with_the_dates_before() -> None:
    before = snapshot(closes_on=date(2026, 11, 20))

    (draft,) = alerts_for_event(event("dates_changed", before=before), PROGRAM, (ALICE,))

    assert draft.kind == "dates_changed"
    assert draft.dedupe_key == "event:42"
    assert draft.details["closes_on"] == "2026-12-01"
    assert (draft.details["previous_closes_on"], draft.details["previous_closes_precision"]) == (
        "2026-11-20",
        "day",
    )


def test_changed_dates_on_a_window_that_has_ended_send_nothing() -> None:
    for status in ("closed", "unknown"):
        changed = event("dates_changed", before=snapshot(), status=status)
        assert alerts_for_event(changed, PROGRAM, (ALICE,)) == ()


def test_changed_dates_on_an_upcoming_window_alert() -> None:
    upcoming = event("dates_changed", before=snapshot(status="upcoming"), status="upcoming")

    assert [d.kind for d in alerts_for_event(upcoming, PROGRAM, (ALICE,))] == ["dates_changed"]


def test_an_event_nobody_follows_makes_no_alerts() -> None:
    assert alerts_for_event(event("opened"), PROGRAM, ()) == ()


# Closing soon: time-based, so it needs today's Melbourne date -----------------------------------
TODAY = date(2026, 11, 24)


def test_a_window_closing_within_a_week_alerts() -> None:
    closing = snapshot(closes_on=date(2026, 12, 1))  # exactly CLOSING_SOON_DAYS away

    (draft,) = closing_soon_alerts("w1", closing, PROGRAM, (ALICE,), TODAY)

    assert CLOSING_SOON_DAYS == 7
    assert (draft.user_id, draft.kind) == ("alice", "closing_soon")
    assert draft.dedupe_key == "closing:w1:2026-12-01"
    assert draft.details["closes_on"] == "2026-12-01"


def test_a_window_closing_today_still_alerts() -> None:
    assert closing_soon_alerts("w1", snapshot(closes_on=TODAY), PROGRAM, (ALICE,), TODAY)


def test_a_window_closing_after_a_week_waits() -> None:
    later = snapshot(closes_on=date(2026, 12, 2))

    assert closing_soon_alerts("w1", later, PROGRAM, (ALICE,), TODAY) == ()


def test_a_window_that_already_closed_sends_nothing() -> None:
    yesterday = snapshot(closes_on=date(2026, 11, 23))

    assert closing_soon_alerts("w1", yesterday, PROGRAM, (ALICE,), TODAY) == ()


def test_a_closing_month_is_not_a_closing_day() -> None:
    """The source only says December, so we cannot say it is closing within a week."""
    month_only = snapshot(closes_on=date(2026, 12, 1), closes_precision="month")

    assert closing_soon_alerts("w1", month_only, PROGRAM, (ALICE,), TODAY) == ()


def test_only_an_open_window_can_be_closing_soon() -> None:
    for status in ("upcoming", "closed", "unknown"):
        not_open = snapshot(status=status, closes_on=date(2026, 11, 28))
        assert closing_soon_alerts("w1", not_open, PROGRAM, (ALICE,), TODAY) == ()


def test_a_window_with_no_closing_date_is_never_closing_soon() -> None:
    no_close = snapshot(closes_on=None, closes_precision=None)

    assert closing_soon_alerts("w1", no_close, PROGRAM, (ALICE,), TODAY) == ()


def test_closing_soon_respects_both_ways_to_opt_out() -> None:
    closing = snapshot(closes_on=date(2026, 11, 28))
    muted = replace(ALICE, follow_notify=False)
    unsubscribed = replace(BOB, email_alerts=False)

    assert closing_soon_alerts("w1", closing, PROGRAM, (muted, unsubscribed), TODAY) == ()


def test_a_new_closing_date_makes_a_new_closing_soon_alert() -> None:
    """The reason includes the date, so extending a deadline does not hide the next reminder."""
    first = closing_soon_alerts(
        "w1", snapshot(closes_on=date(2026, 11, 28)), PROGRAM, (ALICE,), TODAY
    )
    second = closing_soon_alerts(
        "w1", snapshot(closes_on=date(2026, 11, 30)), PROGRAM, (ALICE,), TODAY
    )

    assert first[0].dedupe_key != second[0].dedupe_key
