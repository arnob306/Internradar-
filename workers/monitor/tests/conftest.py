"""Fixtures for the alert store tests: a real local database, reached as the restricted role."""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any
from uuid import UUID

import psycopg
import pytest
from internradar_common.testing_db import (
    TEST_SLUG_PREFIX,
    admin_connection,
    clean_test_data,
    notify_connection,
)

Connection = psycopg.Connection[tuple[Any, ...]]


@dataclass(frozen=True)
class World:
    """One student who follows one program whose window has no dates yet."""

    user_id: UUID
    email: str
    program_id: UUID
    window_id: UUID


@pytest.fixture
def admin_db() -> Iterator[Connection]:
    """Setup and inspection only; the code under test always uses the notify_worker role."""
    with admin_connection() as connection:
        clean_test_data(connection)
        yield connection
        clean_test_data(connection)


@pytest.fixture
def notify_db(admin_db: Connection) -> Iterator[Connection]:
    with notify_connection() as connection:
        yield connection


def add_student(db: Connection, name: str, *, email_alerts: bool = True) -> tuple[UUID, str]:
    email = f"{TEST_SLUG_PREFIX}{name}@example.test"
    user = db.execute(
        "insert into auth.users (id, email) values (gen_random_uuid(), %s) returning id", (email,)
    )
    row = user.fetchone()
    assert row is not None
    db.execute(
        "insert into public.profiles (user_id, email_alerts) values (%s, %s)",
        (row[0], email_alerts),
    )
    return row[0], email


def follow(db: Connection, user_id: UUID, program_id: UUID, *, notify: bool = True) -> None:
    db.execute(
        "insert into public.program_follows (user_id, program_id, notify) values (%s, %s, %s)",
        (user_id, program_id, notify),
    )


@pytest.fixture
def new_student(admin_db: Connection) -> Callable[..., tuple[UUID, str]]:
    return lambda name, **options: add_student(admin_db, name, **options)


@pytest.fixture
def follow_program(admin_db: Connection) -> Callable[..., None]:
    return lambda user_id, program_id, **options: follow(admin_db, user_id, program_id, **options)


@pytest.fixture
def world(admin_db: Connection) -> World:
    company = admin_db.execute(
        "insert into public.companies (slug, name, careers_url) "
        "values (%s, 'Acme', %s) returning id",
        (f"{TEST_SLUG_PREFIX}acme", "https://acme.example/careers"),
    ).fetchone()
    assert company is not None
    program = admin_db.execute(
        "insert into public.programs "
        "(company_id, slug, name, program_type, source_url, is_published) "
        "values (%s, %s, 'Graduate Program', 'graduate', 'https://acme.example/grad', true) "
        "returning id",
        (company[0], f"{TEST_SLUG_PREFIX}acme-grad"),
    ).fetchone()
    assert program is not None
    window = admin_db.execute(
        "insert into public.program_windows "
        "(program_id, cycle_year, window_seq, status, provenance, source_url) "
        "values (%s, 2027, 1, 'unknown', 'seed', 'https://acme.example/grad') returning id",
        (program[0],),
    ).fetchone()
    assert window is not None
    user_id, email = add_student(admin_db, "alice")
    follow(admin_db, user_id, program[0])
    return World(user_id, email, program[0], window[0])


@pytest.fixture
def open_window(admin_db: Connection, world: World) -> Callable[..., None]:
    """Open the window; the database trigger records the event the worker reads."""

    def open_it(*, closes_on: str | None = None, closes_precision: str | None = None) -> None:
        admin_db.execute(
            "update public.program_windows set status = 'open', closes_on = %s, "
            "closes_precision = %s where id = %s",
            (closes_on, closes_precision, world.window_id),
        )

    return open_it
