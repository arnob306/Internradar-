"""Workers never read the wall clock directly (test plan §1).

The one allowed reader is SystemClock in clock.py, so everything else can be tested
with a FixedClock. The rule is ruff's banned-API check (TID251), which resolves import
aliases, unlike a text search. These tests run the real ruff with the real config, so
they fail if the rule is removed or weakened.
"""

import json
import subprocess  # noqa: S404 - runs ruff, our own dev tool, on code strings
import sys
from pathlib import Path

import pytest

WORKERS_ROOT = Path(__file__).resolve().parents[2]
CONFIG = WORKERS_ROOT / "pyproject.toml"
CLOCK_MODULE = "common/src/internradar_common/clock.py"
OTHER_MODULE = "ingest/src/internradar_ingest/example.py"


def banned_api_hits(code: str, repo_path: str) -> list[str]:
    """Return ruff's TID251 messages for `code` as if it lived at `repo_path`."""
    result = subprocess.run(  # noqa: S603 - fixed argument list, no shell
        [
            sys.executable,
            "-m",
            "ruff",
            "check",
            "--config",
            str(CONFIG),
            "--stdin-filename",
            str(WORKERS_ROOT / repo_path),
            "--output-format",
            "json",
            "-",
        ],
        input=code,
        capture_output=True,
        text=True,
        check=False,
    )
    findings = json.loads(result.stdout or "[]")
    return [f["message"] for f in findings if f["code"] == "TID251"]


CLOCK_READS = {
    "datetime.now": "from datetime import UTC, datetime\nx = datetime.now(UTC)\n",
    "aliased import": (
        "from datetime import UTC\nfrom datetime import datetime as dt\nx = dt.now(UTC)\n"
    ),
    "module attribute": "import datetime\nx = datetime.datetime.now(datetime.UTC)\n",
    "utcnow": "from datetime import datetime\nx = datetime.utcnow()\n",
    "date.today": "from datetime import date\nx = date.today()\n",
    "time.time": "import time\nx = time.time()\n",
    "time.time_ns": "import time\nx = time.time_ns()\n",
}


@pytest.mark.parametrize("code", CLOCK_READS.values(), ids=CLOCK_READS.keys())
def test_wall_clock_reads_are_rejected_outside_the_clock_module(code: str) -> None:
    assert banned_api_hits(code, OTHER_MODULE) != []


@pytest.mark.parametrize("code", CLOCK_READS.values(), ids=CLOCK_READS.keys())
def test_the_clock_module_may_read_the_wall_clock(code: str) -> None:
    assert banned_api_hits(code, CLOCK_MODULE) == []


def test_ordinary_time_code_is_not_flagged() -> None:
    code = (
        "import time\n"
        "from datetime import UTC, datetime\n"
        "t = time.monotonic()\n"
        "d = datetime(2027, 2, 1, tzinfo=UTC)\n"
    )

    assert banned_api_hits(code, OTHER_MODULE) == []
