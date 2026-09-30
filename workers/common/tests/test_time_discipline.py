"""Workers never read the system clock directly (test plan §1).

The one allowed reader is SystemClock, so the rest of the code can be tested
with a FixedClock.
"""

import re
from pathlib import Path

WORKERS_ROOT = Path(__file__).resolve().parents[2]
ALLOWED = {Path("common/src/internradar_common/clock.py")}
NOW_CALL = re.compile(r"\b(datetime|date)\.(now|utcnow|today)\s*\(")


def _python_sources() -> list[Path]:
    return [
        path
        for path in WORKERS_ROOT.rglob("*.py")
        if ".venv" not in path.parts and "tests" not in path.parts
    ]


def test_finds_worker_sources_to_check() -> None:
    assert any(p.name == "clock.py" for p in _python_sources())


def test_no_worker_code_reads_the_system_clock_outside_the_clock_module() -> None:
    offenders = [
        str(path.relative_to(WORKERS_ROOT))
        for path in _python_sources()
        if path.relative_to(WORKERS_ROOT) not in ALLOWED
        and NOW_CALL.search(path.read_text(encoding="utf-8"))
    ]

    assert offenders == []
