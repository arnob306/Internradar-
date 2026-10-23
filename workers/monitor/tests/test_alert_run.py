"""The alert command (D30): settings from the environment, one run, and nothing secret in output."""

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

import pytest
from internradar_common.clock import FixedClock
from internradar_monitor.alerts import run as run_module
from internradar_monitor.alerts.run import SettingsError, load_settings, main, unsubscribe_links
from internradar_monitor.alerts.store import SendSummary

ENV = {
    "NOTIFY_DATABASE_URL": "postgresql://notify_worker:s3cret@127.0.0.1:54322/postgres",
    "ALERT_SENDER": "InternRadar <alerts@internradar.example>",
    "SITE_URL": "https://internradar.example",
    "SMTP_HOST": "127.0.0.1",
}
CLOCK = FixedClock(datetime(2026, 10, 21, 20, 0, tzinfo=UTC))


def test_settings_are_read_with_safe_defaults() -> None:
    settings = load_settings(ENV)

    assert (settings.smtp_port, settings.starttls, settings.login) == (1025, False, None)
    assert settings.sender == "InternRadar <alerts@internradar.example>"


def test_a_login_needs_both_a_user_and_a_password() -> None:
    both = load_settings({**ENV, "SMTP_USER": "u", "SMTP_PASSWORD": "p", "SMTP_STARTTLS": "1"})
    assert (both.login, both.starttls) == (("u", "p"), True)

    with pytest.raises(SettingsError, match="SMTP_PASSWORD"):
        load_settings({**ENV, "SMTP_USER": "u"})


@pytest.mark.parametrize("name", sorted(ENV))
def test_a_missing_setting_is_named(name: str) -> None:
    env = {key: value for key, value in ENV.items() if key != name}

    with pytest.raises(SettingsError, match=name):
        load_settings(env)


def test_the_unsubscribe_links_name_the_alert() -> None:
    links = unsubscribe_links("https://internradar.example", "alert-1")

    # the email's footer opens a page that asks first; the header is the one-click address
    assert links.page == "https://internradar.example/unsubscribe?alert=alert-1"
    assert links.one_click == "https://internradar.example/api/v1/alerts/unsubscribe?alert=alert-1"


def test_a_trailing_slash_on_the_site_address_makes_no_double_slash() -> None:
    links = unsubscribe_links("https://internradar.example/", "a")

    assert links.page == "https://internradar.example/unsubscribe?alert=a"
    assert links.one_click == "https://internradar.example/api/v1/alerts/unsubscribe?alert=a"


def run_main(env: Mapping[str, str], **fakes: Any) -> int:
    return main(
        env,
        clock=CLOCK,
        open_db=fakes.get("open_db", lambda url: object()),
        open_notifier=fakes.get("open_notifier", lambda settings: object()),
    )


def test_a_run_reports_counts_and_never_the_database_password(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    seen: dict[str, Any] = {}

    def fake_create(db: Any, *, now: datetime, today: Any) -> int:
        seen["today"] = today
        return 3

    monkeypatch.setattr(run_module, "create_alerts", fake_create)
    monkeypatch.setattr(run_module, "send_due", lambda *a, **k: SendSummary(2, 1, 0, 0))

    code = run_main(ENV)

    out = capsys.readouterr()
    assert code == 0
    assert "created=3 sent=2 retrying=1 failed=0 skipped=0" in out.out
    assert "s3cret" not in out.out + out.err
    # 20:00 UTC on 21 October is already the 22nd in Melbourne
    assert str(seen["today"]) == "2026-10-22"


def test_a_crash_reports_only_its_type(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def crash(*args: Any, **kwargs: Any) -> int:
        raise RuntimeError("could not connect as notify_worker:s3cret to 127.0.0.1")

    monkeypatch.setattr(run_module, "create_alerts", crash)

    code = run_main(ENV)

    err = capsys.readouterr().err
    assert code == 1
    assert "RuntimeError" in err
    assert "s3cret" not in err


def test_missing_settings_stop_the_run_before_anything_connects(
    capsys: pytest.CaptureFixture[str],
) -> None:
    def never(*args: Any) -> Any:
        raise AssertionError("must not connect")

    code = run_main({}, open_db=never, open_notifier=never)

    assert code == 2
    assert "NOTIFY_DATABASE_URL" in capsys.readouterr().err
