"""The seed command line: validate a YAML file, then (optionally) load it.

The loader is injected, so none of this needs a database. What matters: an invalid file loads
nothing and every problem is shown; --check needs no database at all (so a pull request can
validate the seed in CI); the admin database URL is a secret and is never printed; and a crash
prints only the exception's type.
"""

import json
from datetime import date
from pathlib import Path
from typing import Any

import pytest
import yaml
from internradar_ingest.seed import Catalog
from internradar_ingest.seed_cli import main
from internradar_ingest.seed_load import LoadSummary

RULES_SCHEMA = json.loads(
    (Path(__file__).parents[3] / "packages/domain/schemas/eligibility-rules.v1.json").read_text(
        encoding="utf-8"
    )
)
SECRET_URL = "postgresql://postgres:s3cr3t-pa55@db.example.supabase.co:5432/postgres"  # noqa: S105
ENV = {"SEED_DATABASE_URL": SECRET_URL}


def valid_document() -> dict[str, Any]:
    return {
        "companies": [
            {
                "slug": "example-co",
                "name": "Example Co",
                "careers_url": "https://careers.example.com.au",
                "programs": [
                    {
                        "slug": "graduate-program",
                        "name": "Graduate Program",
                        "program_type": "graduate",
                        "cities": ["melbourne"],
                        "disciplines": ["computer_science"],
                        "source_url": "https://careers.example.com.au/graduates",
                        "windows": [
                            {
                                "cycle_year": 2026,
                                "status": "unknown",
                                "source_url": "https://careers.example.com.au/graduates",
                            }
                        ],
                    }
                ],
            }
        ]
    }


@pytest.fixture
def seed_file(tmp_path: Path) -> Path:
    path = tmp_path / "catalog.yaml"
    path.write_text(yaml.safe_dump(valid_document()), encoding="utf-8")
    return path


class Recorder:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Catalog]] = []

    def __call__(self, database_url: str, catalog: Catalog) -> LoadSummary:
        self.calls.append((database_url, catalog))
        return LoadSummary(inserted=3, updated=1, unchanged=2, skipped=0)


def run(
    argv: list[str], env: dict[str, str], recorder: Recorder | None = None
) -> tuple[int, Recorder]:
    recorder = recorder or Recorder()
    code = main(argv, env, loader=recorder, rules_schema=RULES_SCHEMA)
    return code, recorder


def test_a_valid_file_is_loaded_and_summarised(
    seed_file: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, recorder = run([str(seed_file)], ENV)

    out = capsys.readouterr().out
    assert code == 0
    assert [url for url, _ in recorder.calls] == [SECRET_URL]
    assert recorder.calls[0][1].companies[0].slug == "example-co"
    assert "inserted=3" in out
    assert "updated=1" in out


def test_check_validates_without_a_database(
    seed_file: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    code, recorder = run(["--check", str(seed_file)], {})

    assert code == 0
    assert recorder.calls == []
    assert "1 companies, 1 programs, 1 windows" in capsys.readouterr().out


def test_an_invalid_file_loads_nothing_and_shows_every_problem(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    document = valid_document()
    document["companies"][0]["slug"] = "Bad Slug"
    document["companies"][0]["careers_url"] = "http://insecure.example.com"
    bad = tmp_path / "bad.yaml"
    bad.write_text(yaml.safe_dump(document), encoding="utf-8")

    code, recorder = run([str(bad)], ENV)

    err = capsys.readouterr().err
    assert code == 1
    assert recorder.calls == []
    assert "Bad Slug" in err
    assert "insecure.example.com" in err


def test_a_missing_database_url_exits_2_without_loading(seed_file: Path) -> None:
    for env in ({}, {"SEED_DATABASE_URL": "  "}):
        code, recorder = run([str(seed_file)], env)
        assert code == 2
        assert recorder.calls == []


@pytest.mark.parametrize("argv", [[], ["a.yaml", "b.yaml"], ["--check"], ["--bogus", "a.yaml"]])
def test_the_wrong_arguments_exit_2(argv: list[str]) -> None:
    code, recorder = run(argv, ENV)

    assert code == 2
    assert recorder.calls == []


def test_an_unreadable_file_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    code, recorder = run([str(tmp_path / "missing.yaml")], ENV)

    assert code == 2
    assert recorder.calls == []
    assert "missing.yaml" in capsys.readouterr().err


def test_a_crash_exits_1_and_prints_only_the_exception_type(
    seed_file: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    def crashing(database_url: str, _catalog: Catalog) -> LoadSummary:
        raise RuntimeError(f"could not connect to {database_url}")

    code = main([str(seed_file)], ENV, loader=crashing, rules_schema=RULES_SCHEMA)

    captured = capsys.readouterr()
    assert code == 1
    assert "RuntimeError" in captured.err
    for text in (captured.out, captured.err):
        assert "s3cr3t-pa55" not in text
        assert "supabase.co" not in text


def test_the_database_url_is_never_printed(
    seed_file: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    run([str(seed_file)], ENV)

    captured = capsys.readouterr()
    assert "s3cr3t-pa55" not in captured.out + captured.err
    assert "supabase.co" not in captured.out + captured.err


def test_a_future_verification_date_is_a_problem_not_a_crash(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    document = valid_document()
    document["companies"][0]["programs"][0]["verified_on"] = date(2999, 1, 1)
    path = tmp_path / "future.yaml"
    path.write_text(yaml.safe_dump(document), encoding="utf-8")

    code, _ = run([str(path)], ENV)

    assert code == 1
    assert "future" in capsys.readouterr().err
