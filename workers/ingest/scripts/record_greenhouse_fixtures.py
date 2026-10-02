"""Record trimmed Greenhouse board fixtures for the adapter tests.

One polite request per board, through the same PoliteFetcher production uses, so
robots.txt, spacing, the identifying User-Agent and the size cap all apply. Only key
facts are stored (ids, titles, locations, dates, URLs), never descriptions.

Run from workers/:  python -m uv run python ingest/scripts/record_greenhouse_fixtures.py

A board whose fixture already exists is skipped, because the claim store here is in
memory and cannot remember an earlier run: re-fetching the same URL on the same
Melbourne day would break the fetch-once rule. Delete a fixture to re-record it, on a
later day.
"""

import json
import re
from pathlib import Path
from typing import Any

import httpx
from internradar_common.claims import InMemoryClaimStore
from internradar_common.clock import SystemClock
from internradar_common.fetcher import Fetched, PoliteFetcher
from internradar_common.melbourne import melbourne_day
from internradar_common.spacing import SystemSleeper

BOARDS = ("optiver", "imc")
OUT_DIR = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "greenhouse"
KEY_FIELDS = ("id", "title", "updated_at", "first_published", "requisition_id", "absolute_url")
RELEVANT = re.compile(r"intern|graduate|\bgrad\b|campus|placement|summer|early career", re.I)
MAX_RELEVANT = 6
MAX_OTHER = 2


def trim(payload: dict[str, Any]) -> dict[str, Any]:
    """Keep the real response shape but only the key facts of a few jobs."""
    jobs = payload["jobs"]
    relevant = [j for j in jobs if RELEVANT.search(j.get("title", ""))][:MAX_RELEVANT]
    others = [j for j in jobs if j not in relevant][:MAX_OTHER]
    kept = [
        {
            **{k: j.get(k) for k in KEY_FIELDS},
            "location": {"name": (j.get("location") or {}).get("name")},
        }
        for j in relevant + others
    ]
    result: dict[str, Any] = {"jobs": kept}
    # Pass Greenhouse's own meta through untouched, or leave it out. Never invent it: the
    # parser's is_complete depends on meta.total, so a synthesised one would look real.
    if "meta" in payload:
        result["meta"] = payload["meta"]
    result["_trimmed"] = {"kept": len(kept), "of": len(jobs)}
    return result


def main() -> None:  # pragma: no cover - the live recording, run by hand
    clock = SystemClock()
    fetcher = PoliteFetcher(
        client=httpx.Client(),
        clock=clock,
        sleeper=SystemSleeper(),
        claims=InMemoryClaimStore(),
    )
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for slug in BOARDS:
        target = OUT_DIR / f"{slug}.json"
        if target.exists():
            print(f"{slug}: fixture exists, skipped")
            continue
        url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
        result = fetcher.fetch(url)
        outcome = f"Fetched {result.status}" if isinstance(result, Fetched) else result
        print(f"{slug}: {outcome}")
        if not isinstance(result, Fetched):
            continue
        recorded = {
            "_recorded": {"url": url, "melbourne_day": melbourne_day(clock.now()).isoformat()},
            **trim(json.loads(result.body)),
        }
        target.write_text(json.dumps(recorded, indent=2) + "\n", encoding="utf-8")
        shown, total = recorded["_trimmed"]["kept"], recorded["_trimmed"]["of"]
        print(f"{slug}: wrote {target.name} with {shown} of {total} jobs")


if __name__ == "__main__":
    main()
