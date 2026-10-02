# Phase 3 evidence: ingestion (TDD report)

**Source plan:** the Phase 3 section of the [test plan](test-plan.md) and decision D13 (Phase 3 shrank to a seed loader plus a Greenhouse adapter, see the [ATS audit](../architecture/ats-audit.md)). Journeys were derived during the work, one RED/GREEN cycle per behaviour. Every cycle is a `test: ... (RED)` commit followed by a `feat/fix: ... (GREEN)` commit, so `git log` is the primary evidence.

## What Phase 3 delivers

| Area | What it does | Tests (file: count) |
|---|---|---|
| Polite fetcher | Robots first (fail closed), one fetch per URL per Melbourne day, 5 s per-host spacing, `Crawl-delay`, conditional GETs, retries for no-response only, never follows redirects, size cap, total deadline, identifying User-Agent | `test_fetcher_*` (76), `test_robots` (19), `test_spacing` (13), `test_fetch_url` (33), `test_url_keys` (14), `test_melbourne` (13), `test_claims` (6) |
| Claims in Postgres | `fetch_claims` table, atomic `ON CONFLICT DO NOTHING` claim | `test_postgres_claims` (7), pgTAP `005_fetch_claims` (25) |
| Greenhouse adapter | Parser to canonical listings, completeness only when the count matches, URLs restricted to allowed hosts | `test_greenhouse` (65), `test_listing` (32) |
| Upsert and guard | Idempotent upsert as the restricted `ingest_worker`, closes only on a complete board, mass-close guard | `test_upsert` (16) |
| Status and orchestration | `ats_fetches` row per board per day, `ingest_board` never crashes the run | `test_fetch_log` (9), `test_ingest` (31) |
| Run entrypoint | `run_ingest` records a `pipeline_runs` row and a metrics event; CLI exit codes 0/1/2; secrets never printed | `test_run_logic` (24), `test_run` (12), `test_cli` (13) |
| Seed catalog | Strict YAML parser, idempotent loader (history events, never overwrites windows owned by others, never deletes), CLI with `--check` | `test_seed_parse` (35), `test_seed_load` (10), `test_seed_cli` (12) |
| Test hygiene | DB tests delete only their own data (`dbtest-` slugs, 2020 clocks) | `test_testing_db` (4), `test_database` (6) |

## Results (last run, commit `853f9b7`)

| Check | Command | Result |
|---|---|---|
| Worker tests, including DB | `pytest -m "db or not db" --cov --cov-branch --cov-fail-under=90` | 480 passed, 99.75% coverage, exit 0 |
| Lint and format | `ruff check .`, `ruff format --check .` | exit 0 |
| Types | `mypy common/src ingest/src monitor/src` (strict) | exit 0 |
| Database | pgTAP suite | 153 tests (the last run, before the seed work; no SQL changed since) |
| CI | GitHub Actions on PR #6 (before the seed loader commits) | workflows, TypeScript, database, Python all passed |

## Defects found by review and fixed test-first

Three code-review rounds found real bugs, each fixed with a failing test first (RED commit, then GREEN):

- a redirect could bypass the allowed-host rules, so the fetcher now never follows redirects;
- a 401 or 403 on `robots.txt` was treated as "allowed", and now forbids the host;
- one page could have several identities depending on how its URL was spelled;
- overlong URLs and invalid ports crashed instead of being rejected;
- a slow response had no total time budget;
- listing URLs from a feed could point at any host;
- a clock stepping backwards could stall the spacer;
- a run crossing Melbourne midnight left a stuck "in progress" row;
- DB test cleanup truncated shared tables, so it could delete real data;
- the CI coverage gate was measured on the wrong run (82%, now 99%+).

## Real-world checks

- **Greenhouse fixtures** were recorded with one polite request per board (Optiver, IMC). Optiver's board was empty, so the adapter serves IMC only. The IMC fixture is a trimmed sample whose `meta` was synthesised by an earlier recorder; the recorder now keeps the real `meta` and invents none. The fixture should be re-recorded on a later day (one fetch per URL per day).
- **Seed research attempt (2026-10-03):** one polite request per guessed careers URL for 13 employers found no usable page: 8 returned 404 (my guessed URLs were wrong), 3 redirected (never followed by design), and Optiver and KPMG forbid the path in `robots.txt`, so those pages stay unfetched. No seed data was invented to fill the gap.
- **CLI smoke tests** against the empty local database: ingest exits 0 and records a run; the seed CLI loads a throwaway file, a reload reports `unchanged`, and the test rows were removed.

## Known gaps

- No ingestion has run against a hosted database yet (Phase 0 spikes for the pooler role still need hosted Supabase), so `ingest.yml` skips itself until the `INGEST_DATABASE_URL` secret exists.
- The real seed catalog (10 to 15 programs) is not written. Every program in it must be verified by a person before it is published, and the loader refuses to publish an unverified one.
- Mutation testing (Stryker) was not run.
- Low-severity review items still open: a retention purge for `fetch_claims`, and test helpers living in the production package.
