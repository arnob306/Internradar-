"""Who is owed which alert (D29).

Pure decisions: the caller reads events and follows from the database, passes them in, and gets
back drafts to store. Nothing here reads a clock, a database or the network, and a date is copied
with the precision its source gave, never made more exact.
"""

from dataclasses import dataclass
from datetime import date
from typing import Any

CLOSING_SOON_DAYS = 7

_EVENT_ALERT_KIND = {"opened": "opened", "dates_changed": "dates_changed"}
# Changed dates matter for a window students can still apply to or are waiting on.
_STILL_LIVE = ("upcoming", "open")


@dataclass(frozen=True)
class WindowSnapshot:
    status: str
    opens_on: date | None
    opens_precision: str | None
    closes_on: date | None
    closes_precision: str | None


@dataclass(frozen=True)
class ProgramRef:
    program_id: str
    program_name: str
    company_name: str
    source_url: str


@dataclass(frozen=True)
class Follower:
    user_id: str
    # the student's switch for this program, and their switch for all email alerts
    follow_notify: bool
    email_alerts: bool


@dataclass(frozen=True)
class WindowEvent:
    event_id: int
    window_id: str
    event_type: str
    before: WindowSnapshot | None
    after: WindowSnapshot
    # the history records both an opening and its dates; the student is told once, about the opening
    opened_in_same_update: bool = False


@dataclass(frozen=True)
class AlertDraft:
    user_id: str
    program_id: str
    window_id: str
    kind: str
    dedupe_key: str
    details: dict[str, Any]


def _iso(day: date | None) -> str | None:
    return day.isoformat() if day is not None else None


def _details(program: ProgramRef, window: WindowSnapshot) -> dict[str, Any]:
    return {
        "program_name": program.program_name,
        "company_name": program.company_name,
        "program_url": program.source_url,
        "opens_on": _iso(window.opens_on),
        "opens_precision": window.opens_precision,
        "closes_on": _iso(window.closes_on),
        "closes_precision": window.closes_precision,
    }


def _previous(window: WindowSnapshot) -> dict[str, Any]:
    return {
        "previous_opens_on": _iso(window.opens_on),
        "previous_opens_precision": window.opens_precision,
        "previous_closes_on": _iso(window.closes_on),
        "previous_closes_precision": window.closes_precision,
    }


def _wants_email(follower: Follower) -> bool:
    return follower.follow_notify and follower.email_alerts


def _drafts(
    program: ProgramRef,
    window_id: str,
    kind: str,
    dedupe_key: str,
    details: dict[str, Any],
    followers: tuple[Follower, ...],
) -> tuple[AlertDraft, ...]:
    return tuple(
        AlertDraft(follower.user_id, program.program_id, window_id, kind, dedupe_key, details)
        for follower in followers
        if _wants_email(follower)
    )


def alerts_for_event(
    event: WindowEvent, program: ProgramRef, followers: tuple[Follower, ...]
) -> tuple[AlertDraft, ...]:
    """The alerts a window event owes its followers: opened, or dates changed."""
    kind = _EVENT_ALERT_KIND.get(event.event_type)
    if kind is None:
        return ()
    if kind == "dates_changed" and (
        event.after.status not in _STILL_LIVE or event.opened_in_same_update
    ):
        return ()
    details = _details(program, event.after)
    if kind == "dates_changed" and event.before is not None:
        details = {**details, **_previous(event.before)}
    return _drafts(program, event.window_id, kind, f"event:{event.event_id}", details, followers)


def closing_soon_alerts(
    window_id: str,
    window: WindowSnapshot,
    program: ProgramRef,
    followers: tuple[Follower, ...],
    today: date,
) -> tuple[AlertDraft, ...]:
    """A reminder in the last week, only when the source gave the closing day itself."""
    if window.status != "open" or window.closes_on is None or window.closes_precision != "day":
        return ()
    if not 0 <= (window.closes_on - today).days <= CLOSING_SOON_DAYS:
        return ()
    key = f"closing:{window_id}:{window.closes_on.isoformat()}"
    return _drafts(program, window_id, "closing_soon", key, _details(program, window), followers)
