"""The fixture recorder keeps what Greenhouse really sent and never invents fields.

An earlier version wrote meta.total itself (from len(jobs)), so the committed fixtures looked
like real responses when that field had in fact been synthesised. The parser's is_complete
depends on meta.total, so the recorder must pass the real one through, or leave it out.
"""

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "record_greenhouse_fixtures.py"


def load_script() -> ModuleType:
    spec = importlib.util.spec_from_file_location("record_greenhouse_fixtures", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def job(number: int, title: str = "Software Engineer", **extra: Any) -> dict[str, Any]:
    return {
        "id": number,
        "title": title,
        "location": {"name": "Sydney"},
        "absolute_url": f"https://job-boards.greenhouse.io/imc/jobs/{number}",
        "first_published": "2026-07-29T04:39:58-04:00",
        "updated_at": "2026-09-30T06:15:59-04:00",
        "requisition_id": f"REQ-{number}",
        **extra,
    }


@pytest.fixture(scope="module")
def trim() -> Any:
    return load_script().trim


def test_the_real_meta_is_kept_exactly_as_received(trim: Any) -> None:
    meta = {"total": 169, "something_new": {"nested": True}}

    result = trim({"jobs": [job(1)], "meta": meta})

    assert result["meta"] == meta


def test_a_response_without_meta_gets_no_invented_meta(trim: Any) -> None:
    result = trim({"jobs": [job(1), job(2)]})

    assert "meta" not in result


def test_how_many_jobs_were_kept_out_of_how_many_is_recorded_separately(trim: Any) -> None:
    jobs = [job(n, "Graduate Trader") for n in range(10)] + [job(n + 10) for n in range(5)]

    result = trim({"jobs": jobs, "meta": {"total": 15}})

    assert result["_trimmed"] == {"kept": len(result["jobs"]), "of": 15}
    assert result["_trimmed"]["kept"] < 15


def test_only_key_facts_are_kept_never_descriptions(trim: Any) -> None:
    noisy = job(
        1, "Graduate Trader", content="<p>FULL DESCRIPTION TEXT</p>", departments=[{"name": "x"}]
    )

    result = trim({"jobs": [noisy], "meta": {"total": 1}})

    assert "FULL DESCRIPTION TEXT" not in str(result)
    assert set(result["jobs"][0]) == {
        "id",
        "title",
        "updated_at",
        "first_published",
        "requisition_id",
        "absolute_url",
        "location",
    }


def test_internship_and_graduate_roles_are_preferred_over_others(trim: Any) -> None:
    jobs = [job(n, "Cook") for n in range(5)] + [
        job(100, "Graduate Trader"),
        job(101, "Summer Intern"),
    ]

    result = trim({"jobs": jobs, "meta": {"total": 7}})

    titles = [j["title"] for j in result["jobs"]]
    assert titles[:2] == ["Graduate Trader", "Summer Intern"]
