"""What an alert email says (D29): plain words, dates no more exact than the source, a way out."""

from typing import Any

import pytest
from internradar_monitor.alerts.compose import compose_email

UNSUBSCRIBE = "https://internradar.example/unsubscribe?token=abc"


def details(**changes: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "program_name": "Graduate Program",
        "company_name": "Acme",
        "program_url": "https://acme.example/grad",
        "opens_on": "2026-10-01",
        "opens_precision": "day",
        "closes_on": "2026-12-01",
        "closes_precision": "day",
    }
    return {**base, **changes}


def test_an_opened_alert_names_the_program_and_links_to_the_employer() -> None:
    email = compose_email("opened", details(), UNSUBSCRIBE)

    assert email.subject == "Acme Graduate Program is now open"
    assert "Graduate Program at Acme is now open for applications." in email.body
    assert "https://acme.example/grad" in email.body


def test_a_closing_day_is_shown_as_a_day() -> None:
    email = compose_email("opened", details(), UNSUBSCRIBE)

    assert "Closes: 1 December 2026" in email.body


def test_a_closing_month_is_shown_as_a_month_only() -> None:
    email = compose_email("opened", details(closes_precision="month"), UNSUBSCRIBE)

    assert "Closes: December 2026" in email.body
    assert "1 December" not in email.body


def test_an_estimated_date_says_so() -> None:
    email = compose_email("opened", details(closes_precision="estimated"), UNSUBSCRIBE)

    assert "Closes: around December 2026" in email.body


def test_a_missing_closing_date_is_said_plainly() -> None:
    email = compose_email("opened", details(closes_on=None, closes_precision=None), UNSUBSCRIBE)

    assert "Closes: the employer has not given a closing date" in email.body


def test_changed_dates_show_what_they_were() -> None:
    email = compose_email(
        "dates_changed",
        details(
            closes_on="2026-12-15",
            previous_opens_on="2026-10-01",
            previous_opens_precision="day",
            previous_closes_on="2026-12-01",
            previous_closes_precision="day",
        ),
        UNSUBSCRIBE,
    )

    assert email.subject == "Acme changed the dates for Graduate Program"
    assert "Closes: 15 December 2026 (was 1 December 2026)" in email.body
    assert "Opens: 1 October 2026\n" in email.body


def test_changed_dates_that_were_not_known_before_say_so() -> None:
    email = compose_email(
        "dates_changed",
        details(
            previous_opens_on=None,
            previous_opens_precision=None,
            previous_closes_on=None,
            previous_closes_precision=None,
        ),
        UNSUBSCRIBE,
    )

    assert "Closes: 1 December 2026 (was not published)" in email.body


def test_a_closing_soon_alert_leads_with_the_day() -> None:
    email = compose_email("closing_soon", details(), UNSUBSCRIBE)

    assert email.subject == "Acme Graduate Program closes on 1 December 2026"
    assert "close on 1 December 2026" in email.body


def test_every_email_says_why_it_was_sent_and_how_to_stop() -> None:
    for kind in ("opened", "dates_changed", "closing_soon"):
        email = compose_email(kind, details(), UNSUBSCRIBE)

        assert "because you follow this program on InternRadar" in email.body
        assert UNSUBSCRIBE in email.body


def test_every_email_reminds_the_student_to_check_the_employer() -> None:
    email = compose_email("opened", details(), UNSUBSCRIBE)

    assert "Check the employer's page before you apply" in email.body


def test_a_program_name_cannot_add_email_headers() -> None:
    sneaky = details(program_name="Graduate\r\nBcc: someone@example.test")

    email = compose_email("opened", sneaky, UNSUBSCRIBE)

    assert "\r" not in email.subject
    assert "\n" not in email.subject


def test_an_unknown_kind_is_an_error_not_a_blank_email() -> None:
    with pytest.raises(ValueError, match="alert kind"):
        compose_email("bogus", details(), UNSUBSCRIBE)
