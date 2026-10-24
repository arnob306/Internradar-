"""The alert command (D30): queue what is owed, send what is due, print the counts.

    python -m internradar_monitor.alerts.run

Settings come from the environment. The database login is the restricted notify_worker role. The
output carries counts and exception type names only, never an address, a password or server text.
"""

import os
import smtplib
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from urllib.parse import urlsplit

from internradar_common.clock import Clock, SystemClock
from internradar_common.database import connect_worker
from internradar_common.melbourne import melbourne_day

from internradar_monitor.alerts.send import Notifier, UnsubscribeLinks
from internradar_monitor.alerts.smtp import SmtpNotifier
from internradar_monitor.alerts.store import SendSummary, create_alerts, send_due

DEFAULT_SMTP_PORT = 1025
SMTP_TIMEOUT_SECONDS = 20
_TRUE = frozenset({"1", "true", "yes"})
_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
_SPACE = 32  # anything below this is a control character


class SettingsError(Exception):
    """A setting is missing. The message names the setting, never a value."""


@dataclass(frozen=True)
class Settings:
    database_url: str
    sender: str
    site_url: str
    smtp_host: str
    smtp_port: int
    starttls: bool
    login: tuple[str, str] | None


@dataclass(frozen=True)
class RunSummary:
    created: int
    sent: SendSummary


def _required(env: Mapping[str, str], name: str) -> str:
    value = env.get(name, "").strip()
    if not value:
        msg = f"{name} is not set"
        raise SettingsError(msg)
    return value


def _site_url(env: Mapping[str, str]) -> str:
    """The address alert links are built from. It must keep the alert id out of clear text.

    https, or http for a local test. No login, query or fragment (the link adds its own `?alert=`),
    and no whitespace or control characters, which could split a mail header. The message names the
    setting and never repeats the value.
    """
    value = _required(env, "SITE_URL")
    problem = "SITE_URL must be an https address (http is allowed only for localhost)"
    if any(char.isspace() or ord(char) < _SPACE for char in value):
        raise SettingsError(problem)
    try:
        parts = urlsplit(value)
        host = parts.hostname
        parts.port  # noqa: B018 - reading it raises ValueError for a bad port
    except ValueError:
        raise SettingsError(problem) from None
    if parts.query or parts.fragment or parts.username is not None or parts.password is not None:
        raise SettingsError(problem)
    if (parts.scheme == "https" and host) or (parts.scheme == "http" and host in _LOCAL_HOSTS):
        return value
    raise SettingsError(problem)


def load_settings(env: Mapping[str, str]) -> Settings:
    user = env.get("SMTP_USER", "").strip()
    password = env.get("SMTP_PASSWORD", "").strip()
    if user and not password:
        msg = "SMTP_PASSWORD is not set"
        raise SettingsError(msg)
    if password and not user:
        msg = "SMTP_USER is not set"
        raise SettingsError(msg)
    return Settings(
        database_url=_required(env, "NOTIFY_DATABASE_URL"),
        sender=_required(env, "ALERT_SENDER"),
        site_url=_site_url(env),
        smtp_host=_required(env, "SMTP_HOST"),
        smtp_port=int(env.get("SMTP_PORT", "").strip() or DEFAULT_SMTP_PORT),
        starttls=env.get("SMTP_STARTTLS", "").strip().lower() in _TRUE,
        login=(user, password) if user else None,
    )


def unsubscribe_links(site_url: str, alert_id: str) -> UnsubscribeLinks:
    """The alert id is the capability: a random uuid that only appears in the owner's email."""
    site = site_url.rstrip("/")
    return UnsubscribeLinks(
        page=f"{site}/unsubscribe?alert={alert_id}",
        one_click=f"{site}/api/v1/alerts/unsubscribe?alert={alert_id}",
    )


def run_once(
    db: Any, notifier: Notifier, *, now: datetime, today: date, site_url: str
) -> RunSummary:
    created = create_alerts(db, now=now, today=today)
    sent = send_due(
        db,
        notifier,
        now=now,
        unsubscribe_links_for=lambda alert_id: unsubscribe_links(site_url, alert_id),
    )
    return RunSummary(created, sent)


def main(
    env: Mapping[str, str],
    *,
    clock: Clock,
    open_db: Callable[[str], Any],
    open_notifier: Callable[[Settings], Notifier],
) -> int:
    try:
        settings = load_settings(env)
    except SettingsError as error:
        print(error, file=sys.stderr)
        return 2

    db = None
    try:
        db = open_db(settings.database_url)
        now = clock.now()
        summary = run_once(
            db,
            open_notifier(settings),
            now=now,
            today=melbourne_day(now),
            site_url=settings.site_url,
        )
    except Exception as error:  # noqa: BLE001 - reported by type only: the text could hold secrets
        print(f"alert run crashed: {type(error).__name__}", file=sys.stderr)
        return 1
    finally:
        close = getattr(db, "close", None)
        if callable(close):
            close()

    sent = summary.sent
    print(
        f"alerts: created={summary.created} sent={sent.sent} retrying={sent.retrying} "
        f"failed={sent.failed} skipped={sent.skipped}"
    )
    return 0


def smtp_notifier(settings: Settings) -> SmtpNotifier:  # pragma: no cover - real wiring
    return SmtpNotifier(
        sender=settings.sender,
        connect=lambda: smtplib.SMTP(
            settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS
        ),
        starttls=settings.starttls,
        login=settings.login,
    )


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(
        main(os.environ, clock=SystemClock(), open_db=connect_worker, open_notifier=smtp_notifier)
    )
