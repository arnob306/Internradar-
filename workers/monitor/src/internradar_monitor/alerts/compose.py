"""What an alert email says (D29).

Plain words. A date is shown no more exactly than its source gave it, an estimate says so, and
every message says why it was sent and how to stop. Student-visible text never promises more than
the employer's page does, and always sends the student back to that page before they apply.
"""

from dataclasses import dataclass
from datetime import date
from typing import Any

_MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)
_NO_OPENING = "the employer has not given an opening date"
_NO_CLOSING = "the employer has not given a closing date"


@dataclass(frozen=True)
class EmailContent:
    subject: str
    body: str


def _one_line(text: str) -> str:
    """Collapse whitespace, so a name can never add a line (or a header) to a subject."""
    return " ".join(text.split())


def _say(iso: str | None, precision: str | None) -> str | None:
    if iso is None:
        return None
    day = date.fromisoformat(iso)
    month = f"{_MONTHS[day.month - 1]} {day.year}"
    if precision == "day":
        return f"{day.day} {month}"
    if precision == "estimated":
        return f"around {month}"
    # a month, or anything we do not recognise: say the least we can prove
    return month


def _line(label: str, missing: str, details: dict[str, Any], field: str) -> str:
    now = _say(details[f"{field}_on"], details[f"{field}_precision"])
    text = now if now is not None else missing
    previous_key = f"previous_{field}_on"
    if previous_key in details:
        before = _say(details[previous_key], details[f"previous_{field}_precision"])
        if before != now:
            text += f" (was {before if before is not None else 'not published'})"
    return f"{label}: {text}"


def _footer(unsubscribe_url: str) -> str:
    return (
        "Check the employer's page before you apply. Dates come from the employer and can change.\n"
        "\n"
        "You are getting this email because you follow this program on InternRadar. "
        "To stop all alert emails, use this link:\n"
        f"{unsubscribe_url}\n"
    )


def compose_email(kind: str, details: dict[str, Any], unsubscribe_url: str) -> EmailContent:
    program = _one_line(details["program_name"])
    company = _one_line(details["company_name"])
    url = details["program_url"]
    dates = (
        f"{_line('Opens', _NO_OPENING, details, 'opens')}\n"
        f"{_line('Closes', _NO_CLOSING, details, 'closes')}\n"
    )
    apply_line = f"Apply on the employer's page: {url}\n"

    if kind == "opened":
        subject = f"{company} {program} is now open"
        lead = f"{program} at {company} is now open for applications."
    elif kind == "dates_changed":
        subject = f"{company} changed the dates for {program}"
        lead = f"{company} has changed the dates for {program}."
    elif kind == "closing_soon":
        closing = _say(details["closes_on"], details["closes_precision"])
        subject = f"{company} {program} closes on {closing}"
        lead = f"Applications for {program} at {company} close on {closing}."
    else:
        msg = f"unknown alert kind: {kind!r}"
        raise ValueError(msg)

    body = f"{lead}\n\n{dates}\n{apply_line}\n{_footer(unsubscribe_url)}"
    return EmailContent(subject=subject, body=body)
