# InternRadar v2: Test plan

This plan is test-driven: in every phase the tests below are written first and must fail (RED), then the minimal code makes them pass (GREEN), then the code is refactored with the tests staying green.

It builds on the [architecture overview](../architecture/overview.md) and the [decision log](../architecture/decisions.md). Where they disagree with this plan, they win. Decision IDs (D1–D13) and ADR numbers refer to those documents.

**Fixed assumptions:**
- pnpm workspaces and a uv workspace, no Turborepo (ADR-001).
- Node 24, Python 3.13 and TypeScript 6.0.x (decision D14).
- Local Postgres through the Supabase CLI.
- "Now" is always injected, never read from the system clock.
- Calendar dates are Melbourne dates (`Australia/Melbourne`) and timestamps are UTC (ADR-015).

---

## 1. Tooling

| Concern | Choice | Notes |
|---|---|---|
| TS unit and integration tests | **Vitest** with v8 coverage | Native ESM and TS. `it.each` for table tests, fake timers for time. |
| Property tests (domain) | **fast-check** | Eligibility invariants: determinism, monotonicity. |
| Validation | **Zod** | Schema tests live beside each route. |
| API integration | Vitest calling Next.js route handlers directly (`GET(new Request(...))`) against local Supabase | No server boot. Real Supabase JWTs for two seeded users. |
| HTTP mocking (TS) | **msw** with `onUnhandledRequest: 'error'` | Any unmocked network call fails the test. |
| RLS tests | **pgTAP** (`supabase test db`), plus a Vitest suite using supabase-js with real user JWTs | pgTAP proves the policies in SQL; supabase-js proves the client path. |
| Python tests | **pytest**, pytest-cov, **pytest-httpx**, **hypothesis**, **pytest-socket** (`--disable-socket`, allowing only the local DB host) | Time comes from an injected `Clock`, not freezegun. |
| Python DB tests | pytest against the same local Postgres via psycopg, connecting as the real worker roles (ADR-005) | Idempotency needs the real unique constraints and grants. |
| E2E | **Playwright**: Chromium on PRs, all browsers nightly | Runs against `next build && next start` with local Supabase and a seeded user. |
| Mutation testing | **Stryker** on `packages/domain` | Reported nightly first, gated in Phase 8. |
| Clock lint | ESLint rule banning `Date.now()` and argument-less `new Date()` in `packages/domain`; ruff `DTZ` rules plus a test that fails on `datetime.now(` in `workers/` | Makes time injection mechanical. |

### GitHub Actions jobs

CI uses path filters so a change to only one half of the repo skips the other (ADR-001).

| Job | Runs | Blocks merge? |
|---|---|---|
| `lint` | tsc strict, ESLint, ruff, mypy, actionlint | Yes |
| `ts-unit` | `vitest run --coverage` for `packages/domain` and `apps/web` unit tests. No services. | Yes |
| `python-unit` | `uv run pytest -m "not db" --disable-socket --cov` for `workers/*` | Yes |
| `db` | `supabase start`, `supabase db reset`, `supabase test db` (pgTAP), then the Vitest RLS and API-integration suites, then Python `-m db` tests. Also migration lint and a schema-drift check. | Yes |
| `schema-contract` | Regenerates `packages/domain/schemas/eligibility-rules.v1.json` from Zod and fails if the committed file differs (ADR-002) | Yes |
| `e2e` | Build web, start Supabase, run Playwright. Traces and video uploaded on failure only. | Yes |
| `eval-smoke` | Scorer unit tests plus the stub provider on 5 fixtures (§6) | Yes |
| `security` | gitleaks, dependency audit (high severity), the no-PII-logging grep test | Yes |
| `nightly` (cron) | Repeat the domain, idempotency and concurrency suites 3 times; cross-browser E2E; Stryker; 10k-row load tests | No |

The full extraction eval (`eval.yml`) is manual only, to control LLM cost (§6).

---

## 2. RED-first test lists by phase

### Phase 0: Foundations
1. `pnpm workspace resolves packages/domain from apps/web`
2. `pytest discovers tests in workers/common, workers/ingest and workers/monitor`
3. `a trivial domain function is importable and covered` (proves runner and coverage wiring)
4. `a Python test that opens a real socket fails` (pytest-socket guard self-test)
5. `a TS test with an unmocked fetch fails` (msw guard self-test)
6. `Date.now() in packages/domain is rejected by lint`
7. `env schema throws naming the missing variable when SUPABASE_URL is absent`
8. `parsed config never includes secret values in its string or JSON form`
9. `FixedClock returns the injected instant`
10. `API envelope helpers produce {success, data, error, meta}`
11. `importing the service-role module outside apps/web/src/server/admin/ fails lint` (ADR-005, §6 of the overview)

**Phase 0 status:** items 1–10 are done. Item 11 is enforced by the ESLint guard in `tests/guards`. The msw guard uses msw 3's `onUnhandledFrame: "error"` option, and its test checks msw's own error rather than any rejection.

**Phase 0 spikes** (not TDD, each at most half a day; D13 and overview §10):
- a custom Postgres role connecting from a GitHub-hosted runner through the pooler;
- Storage RLS with an upload using the user's JWT;
- `supabase start` plus pgTAP running in CI in acceptable time;
- the seed-employer ATS audit. **Done**: see [ats-audit.md](../architecture/ats-audit.md). Phase 3 is now the seed loader plus a Greenhouse adapter only, so the Lever adapter tests in Phase 3 move to a later phase.

### Phase 1: Data model and RLS
**Phase 1 status:** done, with 100 pgTAP tests in `packages/db/supabase/tests/database/`. The seed-script idempotency test (item 14) moves to Phase 3, where the seed loader is built. Generated TypeScript types and the schema-drift check (ADR-014) wait for Phase 4, when the web app first reads the schema. Monitoring, alert and extraction tables are created in Phase 5.

pgTAP and migration tests, written before the migrations:
1. `migrations apply cleanly from empty and survive db reset`
2. `every table in public has RLS enabled` (meta test; fails for any new table without RLS)
3. `every user table has user_id NOT NULL referencing auth.users ON DELETE CASCADE`
4. `listings are unique on (ats_source_id, external_id)`, and `content_hash is not part of any unique key`
5. `program_windows are unique on (program_id, cycle_year, window_seq)` (D1)
6. `program_windows reject closes_on earlier than opens_on`, and `a date without a precision (or the reverse) is rejected`
7. `applications.status accepts only saved, applied, online_assessment, interview, offer, rejected`
8. `applications cannot reference another user's resume` (composite FK on `(resume_id, user_id)`)
9. `application_events cascade-delete with their application`
10. `resumes are unique on (user_id, version)`, and `size_bytes above 2 MB is rejected`
11. `profiles.expected_graduation must be the first of a month`
12. `profiles.citizenship is nullable` (D3)
13. `updated_at is bumped on update`
14. `the seed script is idempotent`
15. the RLS matrix in §5

### Phase 2: Eligibility engine (pure TS)
In this order, each group red before its implementation:
1. `semestersRemaining and evaluateEligibility never read the system clock` (a spy on `Date` that throws)
2. The semester table (§3A)
3. Year-level presets (§3B)
4. Graduation window (§3C)
5. Citizenship (§3D)
6. Disciplines and degree levels (§3E)
7. Combination and reasons (§3F)
8. Unknown handling and verified rules (§3G)
9. Property tests (§3H)
10. `inputs are not mutated` (deep-frozen inputs) and `the result carries rulesVersion and engineVersion`
11. Application status machine (§3I)

### Phase 3: Ingestion (Python)
1. Seed loader: `seed YAML for programs and historical windows validates against the schema`, `each historical window has a source_url citation and a precision`, `loading twice creates no new rows`.
2. Adapters, from recorded payloads:
   - `greenhouse adapter maps a job to a canonical listing`
   - `lever adapter maps a posting to a canonical listing`
   - `a posting without an external id is skipped with a logged reason`
   - `an unexpected payload shape raises AdapterSchemaError` (never silent)
   - `HTML is stripped and whitespace and unicode are normalised`
   - `only key facts are stored; the full description is never persisted` (ADR-013)
   - `a 404 board is recorded as source_gone`
3. Hashing: `content_hash is stable across key order`, `ignores volatile fields and tracking parameters`, and `changes when the title, location or dates change`.
4. Cross-source duplicates: `the same role on two boards gets the same dedupe_key and both rows are kept` (flagged, not merged); `distinct roles at one company get different keys`; hypothesis: `dedupe_key is deterministic`.
5. Program linking: `listing_program_rules link a listing to its program by title regex`, and `an unmatched listing keeps program_id null`.
6. Idempotency: §4.
7. Errors: `429 with Retry-After backs off (fake sleep)`, `a failed board is recorded and the run continues with other boards`, and `one bad posting does not abort the batch`.
8. Run bookkeeping: `pipeline_runs.counts records new, updated, unchanged and failed`.
9. Politeness: §7.

### Phase 4: Web MVP
**Validation and listings API**
- `GET /api/v1/programs rejects limit=0, limit=101 and a negative offset with 400 and field errors`
- `unknown query keys are rejected`
- `the paginated envelope has meta.total, meta.page and meta.limit`
- `filters by program type, discipline and open-now (injected clock)`
- `only published programs are returned`
- `service-only columns (content_hash, key_facts internals) are never exposed`
- `cross-source duplicates appear once in the feed` (`distinct on dedupe_key`)

**Eligibility badge**
- `returns eligible with reasons for a complete profile`
- `unverified rules return unknown with RULES_UNVERIFIED`
- `a missing profile field returns unknown, never ineligible`
- component test: `the badge shows Eligible, Not eligible or Check requirements as text, not colour alone`
- component test: `the badge expands to show reasons`

**Tracker (D9)**
- `POST /api/v1/applications creates a saved application; saving again returns the existing row`
- `each forward move writes an application_events row`
- `skipping online_assessment is allowed`
- `rejected is reachable from every state except offer`
- `a backward move other than undo returns 409`
- `undo returns the application to its previous status and logs an event`
- `undo with no previous transition returns 409`
- `moving to applied requires applied_at and records the resume version sent`
- `another user's application returns 404, not 403`

**Resumes**
- `upload accepts PDF and DOCX up to 2 MB`
- `other MIME types, oversize files and mismatched magic bytes are rejected`
- `the eleventh active resume is rejected` (quota of 10)
- `a new upload increments the version and keeps older versions`
- `the stored object is ciphertext, and download decrypts to the original bytes`
- `tampered ciphertext fails GCM authentication and returns an error`
- `KEK rotation re-wraps data keys without changing file contents`
- `download is proxied with Cache-Control: no-store; no signed storage URL is ever returned`
- `a resume attached to an application is archived, not deleted`

**Auth, security and deletion**
- `protected pages redirect to /login when logged out`
- `the session cookie is httpOnly, secure and SameSite=Lax`
- `mutating routes reject a foreign Origin and a non-JSON content type`
- `user_id always comes from the session; a user_id in the body is ignored`
- `error responses never include stack traces or SQL`
- `write endpoints return 429 past the rate limit` (the `rate_limit_hit` RPC)
- `DELETE /api/v1/me requires typed confirmation and a session under 10 minutes old`
- `account deletion removes storage objects, cascades all user rows and nulls metrics_events.user_ref`
- `rerunning deletion after a partial failure completes safely`

**E2E (Playwright)**
- E1: sign up, complete the profile (including the honours question, D4), see the feed with eligibility badges.
- E2: save a program, move it through the tracker to interview, undo once, reload, and the state persists.
- E3: upload two resume versions, attach one to an application, and see which version was sent.
- E4: user B opening user A's application URL gets a 404.
- E5: a logged-out visitor is redirected from `/tracker`.
- axe accessibility checks on the feed and tracker pages.

### Phase 5: Monitor and alerts
**Fetch and change detection**
- `an unchanged page (same normalised hash) records outcome unchanged and makes no snapshot`
- `cookie banners, timestamps and CSRF tokens are normalised away`
- `a changed page creates one snapshot`
- `the first fetch of a page records a baseline and emits no change`
- `304 records not_modified`
- `403 or 429 sets next_fetch_after with 2^n-day backoff capped at 14 days`
- `404 or 410 marks the page inactive pending admin review`

**Extraction and review**
- `StubProvider returns the canned extraction for a fixture hash`
- `an unknown input to the stub raises StubMissError` (no silent defaults)
- `schema-invalid output gets one repair attempt, then status failed`
- `a provider timeout is retried twice, then status failed, with no partial writes`
- `confidence is computed by us: an evidence quote missing from the page text lowers grounding to 0.3`
- `sanity failures (close before open, dates more than 18 months out, open regressing to upcoming) set confidence to 0`
- `page_is_about_program = false forces review`
- `until tau is configured, every extraction is pending_review` (D8)
- `with tau configured, a date-only change at or above max(tau, 0.9) is auto-approved`
- `an eligibility-rule change is never auto-approved, whatever its confidence` (D8)
- `a newer snapshot supersedes a pending extraction for the same page and program`
- `page text containing instructions ("ignore previous instructions...") cannot add fields outside the schema`
- `the prompt template wraps page text as untrusted data` (snapshot test)

**Approval (`approve_extraction`)**
- `approving writes program_windows, program_window_events and change_events in one transaction`
- `a failure part-way through leaves no partial rows`
- `approving twice is a no-op`
- `a non-admin caller is rejected`
- `a review patch overrides the extracted values and is stored`
- `first_observed_open_at is set on the first open only`

**Alerts (D6, D7)**
- `a window opening creates one alert per follower with notify = true`
- `non-followers get no alert`
- `closing_soon_7d and closing_soon_1d go only to followers whose application is absent or saved`
- `a user who turned off email alerts gets none`
- `FakeNotifier records exactly one send per alert`
- `ResendEmailNotifier sends Idempotency-Key = alert.id` (mocked HTTP)
- `a transient send failure retries with backoff 5m × 4^attempts; after 5 attempts the alert is dead`
- `the email escapes HTML in program names`
- `the email includes signed unsubscribe and "was this correct?" links`
- `a tampered or expired signed link is rejected`
- `dispatcher logs contain alert ids only, never email addresses` (D10)

**Housekeeping**
- `refresh_window_status moves open to closed after closes_on and upcoming to open after opens_on, without alerts`
- `the purge job nulls norm_text older than 90 days unless an approved extraction references it` (D12)

### Phase 6: Extraction eval
- `every labelled record validates against the extraction schema`
- `the label set has at least 50 records, with a balance report by program type`
- `precision and recall match a hand-computed example` (3 TP, 1 FP, 2 FN gives P = 0.75, R = 0.6)
- `a null prediction on a labelled field is a false negative; a wrong value is both a false positive and a false negative`
- `date fields match exactly, including precision`
- `calibration buckets choose the lowest tau with at least 95% precision on status and date fields`
- `the report is deterministic`
- `the run fails when any metric drops more than 2 points below eval/baseline.json`

### Phase 7: v2 features
**Timeline**
- `predictWindows returns the median open month over at least 2 cycles`
- `fewer than 2 cycles returns insufficient_history`
- `month-precision history is never shown as day-precision`
- `ICS export has one event per followed window, with Melbourne dates across DST changes`

**Requirements and resume gaps**
- `skills are extracted from fixture listings via the stub`
- `an unparseable requirement becomes unknown, not dropped`
- `gap matching is case-insensitive and uses taxonomy synonyms` (JS = JavaScript)
- `an empty resume returns every requirement as a gap`
- `resume text is discarded after skill extraction; only resumes.skills is stored`
- `resume text is never sent to an LLM without the user's opt-in`

**Funnel analytics**
- `counts applications per stage per resume version from application_events`
- `a zero denominator gives null, not NaN`
- `cells with n < 5 are suppressed in shared views`
- `a user only sees their own funnel`

### Phase 8: Hardening
- `security headers are present (CSP, HSTS, X-Content-Type-Options, frame-ancestors)`
- `the feed endpoint p95 stays under target with 10k listings seeded` (nightly)
- `EXPLAIN shows an index scan for the feed query`
- `the adapter processes 10k postings within the memory bound`
- `a DB connection drop mid-ingest leaves no partial rows`
- `the log-redaction helper removes emails and tokens`
- `Stryker mutation score on packages/domain is at least 80%`

---

## 3. Eligibility engine test matrix

Signatures under test (overview §4):
- `semestersRemaining(after: YearMonth, graduation: YearMonth): number`
- `evaluateEligibility(rules, profile, ctx): EligibilityResult`

Tests assert on verdicts and reason **codes**, never on message text. All tables use `it.each`.

### 3A. Semester arithmetic (D5)

Rules being pinned:
- S1 starts in February and S2 in July.
- A graduation month of Jun–Aug means the final semester is S1 of that year.
- Sep–Dec means S2 of that year.
- January means S2 of the previous year.
- `semestersRemaining(after, grad)` counts semester starts in or after the month `after`, up to and including the final semester.

| # | after | graduation | Final semester | Expected |
|---|---|---|---|---|
| 1 | 2027-02 | 2027-11 | S2 2027 | 2 |
| 2 | 2027-02 | 2028-11 | S2 2028 | 4 |
| 3 | 2027-02 | 2027-06 | S1 2027 | 1 |
| 4 | 2027-02 | 2027-08 | S1 2027 | 1 |
| 5 | 2027-02 | 2027-09 | S2 2027 | 2 |
| 6 | 2027-02 | 2028-01 | S2 2027 | 2 |
| 7 | 2027-02 | 2028-06 | S1 2028 | 3 |
| 8 | 2027-02 | 2029-11 | S2 2029 | 6 |
| 9 | 2027-02 | 2026-11 | S2 2026 | 0 |
| 10 | 2027-03 | 2027-11 | S2 2027 | 1 (S1 2027 has already started) |
| 11 | 2027-07 | 2027-11 | S2 2027 | 1 (S2 starts in the month `after`) |
| 12 | 2027-08 | 2027-11 | S2 2027 | 0 |
| 13 | 2027-01 | 2027-11 | S2 2027 | 2 |
| 14 | 2027-06 | 2027-06 | S1 2027 | 0 |

Rows 6, 10, 11 and 14 are boundary rows. Mark them `// DECISION D5` so any change to them is deliberate.

### 3B. Year-level presets (D4, D5)

Presets are measured at the window's `programEnd` (except `final_year`, measured at `programStart`). The window for rows 1–12 is a summer internship from 2026-11 to 2027-02, so `after` = 2027-02.

| # | Preset | Graduation | Semesters | Expected | Reason code |
|---|---|---|---|---|---|
| 1 | penultimate | 2027-11 | 2 | eligible | — |
| 2 | penultimate | 2028-01 | 2 | eligible | — |
| 3 | penultimate | 2027-06 | 1 | unknown | `MID_YEAR_GRADUATE_CHECK_EMPLOYER` |
| 4 | penultimate + `acceptsMidYearGraduates` | 2027-06 | 1 | eligible | — |
| 5 | penultimate | 2028-06 | 3 | unknown | off-cycle (3 semesters) |
| 6 | penultimate | 2028-11 | 4 | ineligible | `SEMESTERS_REMAINING_OUT_OF_RANGE` |
| 7 | penultimate | 2026-11 | 0 | ineligible | `SEMESTERS_REMAINING_OUT_OF_RANGE` |
| 8 | pre_penultimate | 2028-11 | 4 | eligible | — |
| 9 | pre_penultimate | 2029-11 | 6 | eligible | — |
| 10 | pre_penultimate | 2028-06 | 3 | unknown | — |
| 11 | pre_penultimate | 2027-11 | 2 | ineligible | — |
| 12 | penultimate | null | — | unknown | `PROFILE_INCOMPLETE` |

`final_year`, measured at `programStart`, for a graduate program starting 2027-02:

| # | Graduation | Semesters at start | Expected |
|---|---|---|---|
| 13 | 2027-06 | 1 | eligible |
| 14 | 2026-11 | 0 | eligible |
| 15 | 2027-11 | 2 | ineligible |

Other year-level cases:
- `a double-degree student in year 4 of 5 (graduating 2027-11) is penultimate`: year level comes from the graduation date alone.
- `a student planning honours enters the honours completion date, which changes the preset result` (D4).
- `a 4-year degree needs no special case`.
- `a missing programStart uses defaultProgramStart(type, cycle_year) and adds ASSUMED_PROGRAM_START` (D1): vacationer and internship use Nov of `cycle_year`, graduate uses Feb of `cycle_year`.
- `explicit min/max semesters with measuredAt override presets`.

### 3C. Graduation window

Rule: `graduationWindow: { earliest?, latest? }`, both inclusive, month precision.

| # | Window | Graduation | Expected |
|---|---|---|---|
| 1 | 2027-01..2027-12 | 2027-01 | eligible (lower bound inclusive) |
| 2 | 2027-01..2027-12 | 2026-12 | ineligible |
| 3 | 2027-01..2027-12 | 2027-12 | eligible (upper bound inclusive) |
| 4 | 2027-01..2027-12 | 2028-01 | ineligible |
| 5 | earliest only: 2026-07 | 2030-11 | eligible |
| 6 | latest only: 2027-12 | 2025-11 | eligible |
| 7 | any window | null | unknown (`PROFILE_INCOMPLETE`) |

### 3D. Citizenship (D3)

Profile values are `au_citizen`, `au_pr`, `nz_citizen`, `intl_student`, `other` and `null`. Rules list the allowed values: `citizenship: { allowed: [...] }`.

| Rule `allowed` | au_citizen | au_pr | nz_citizen | intl_student | other | null |
|---|---|---|---|---|---|---|
| `[au_citizen]` (e.g. APS) | eligible | ineligible | ineligible | ineligible | ineligible | unknown |
| `[au_citizen, au_pr]` | eligible | eligible | ineligible | ineligible | ineligible | unknown |
| `[au_citizen, au_pr, nz_citizen]` | eligible | eligible | eligible | ineligible | ineligible | unknown |
| rule absent | not evaluated | not evaluated | not evaluated | not evaluated | not evaluated | not evaluated |

Extra cases:
- `NZ citizens are never treated as PR-equivalent unless listed`.
- `a blank citizenship never produces eligible or ineligible for a citizenship-constrained program`.
- Security clearance (APS) is display text only and is not evaluated.

### 3E. Disciplines and degree levels (D2)

| # | Profile disciplines | Rule | Expected |
|---|---|---|---|
| 1 | [computer_science] | anyOf [computer_science, engineering] | eligible |
| 2 | [law] | anyOf [engineering] | ineligible |
| 3 | [commerce, law] (double degree) | anyOf [law] | eligible (any match across the union) |
| 4 | [commerce, law] | anyOf [engineering, science] | ineligible |
| 5 | [] | anyOf [computer_science] | unknown (`PROFILE_INCOMPLETE`) |
| 6 | [mathematics] | anyOf [stem_any] | eligible (group expansion) |
| 7 | [arts] | anyOf [stem_any] | ineligible |
| 8 | [] | rule absent | not evaluated |

- `the rules schema rejects a discipline outside the controlled vocabulary`. Unmapped text is handled at extraction and becomes `unknown` there, never inside the engine.
- Degree levels: `masters_coursework allowed for [undergraduate, masters_coursework] is eligible`, `phd not allowed is ineligible`, and `null degree level is unknown`.

### 3F. Combining criteria

The rule: any criterion ineligible makes the overall verdict ineligible; otherwise any unknown makes it unknown; otherwise it's eligible. All reasons are returned in a fixed order (year level, graduation window, citizenship, discipline, degree level).

| # | Year level | Citizenship | Discipline | Expected | Reason codes asserted |
|---|---|---|---|---|---|
| 1 | eligible | eligible | eligible | eligible | all three passing codes |
| 2 | ineligible | eligible | eligible | ineligible | year first |
| 3 | ineligible | ineligible | eligible | ineligible | both, in fixed order |
| 4 | unknown | eligible | eligible | unknown | `PROFILE_INCOMPLETE` |
| 5 | ineligible | unknown | eligible | ineligible | both reasons listed |
| 6 | eligible | unknown | unknown | unknown | two unknown reasons |

### 3G. Unknowns and unverified rules
- `rulesVerified = false gives unknown with RULES_UNVERIFIED even when every criterion passes`
- `an empty rules object for a verified program is eligible`
- `each nullable profile field set to null affects only the criteria that need it`
- `an empty profile gives unknown with a reason per constrained criterion`
- `unknown rule fields are rejected by the schema` (schemaVersion 1 is strict)
- `wrong types (e.g. expectedGraduation: 5) are rejected at the Zod boundary before the engine runs`

### 3H. Properties and time (fast-check)
- Determinism: the same input always gives the same output.
- Monotonic in time: for a fixed graduation date, `semestersRemaining` never increases as `after` moves later.
- A later graduation date never lowers `semestersRemaining`.
- Adding a value to any `allowed` or `anyOf` list never turns eligible into ineligible.
- Nulling a known profile field never turns ineligible or unknown into eligible.
- Inputs are never mutated.
- The whole suite runs under `TZ=UTC`, `TZ=Australia/Melbourne` and `TZ=America/Los_Angeles` with identical results.
- Target: 95% line and 90% branch coverage, and 100% on the rule modules.

### 3I. Application status machine (D9)

| From | Allowed forward targets | Notes |
|---|---|---|
| saved | applied, rejected | |
| applied | online_assessment, interview, rejected | skipping the online assessment is allowed |
| online_assessment | interview, rejected | |
| interview | offer, rejected | |
| offer | — | rejected is not reachable from offer |
| rejected | — | |

- `undo reverts to the from_status of the latest event`
- `undo twice in a row reverts only one step at a time`, and `undo from saved with no events is rejected`
- `every other backward move is rejected`
- The table is tested exhaustively: every (from, to) pair is asserted allowed or rejected.

---

## 4. Idempotency tests

**Ingest** (Python, real Postgres):
1. `ingesting the same payload twice creates no new rows; the second run reports 0 new, 0 updated, N unchanged`
2. `a direct duplicate insert on (ats_source_id, external_id) raises IntegrityError`
3. `an edited listing updates the same row, keeping id and first_seen_at and changing content_hash`
4. `an unchanged content_hash causes no write` (assert `xmin` unchanged)
5. `the same external_id on a different ATS source is a separate row`
6. `a listing missing from a complete fetch is closed once; a second run does not touch it again`
7. `a listing missing from an incomplete fetch (is_complete = false) is not closed`
8. `a closed listing that reappears is reopened without a new row`
9. `a run killed at item k, then rerun, converges to the same state as a clean run`
10. `two ingest processes for the same board in parallel produce one row per listing and no deadlock`
11. `a second run on the same Melbourne day finds the ats_fetches claim and makes no HTTP request`

**Monitor and approval:**
12. `two monitor runs on the same Melbourne day fetch each page once` (the `page_fetches` claim)
13. `re-running extraction for the same snapshot, program, prompt_version and model creates no new row`
14. `approving the same extraction twice creates one set of events`
15. `change_events are unique on (extraction_id, change_type)`

**Alerts:**
16. `running fan-out twice for one change event creates one alert per user`
17. `window_opened and closing_soon alerts are unique per (user, window, type)`
18. `two genuine date changes on one window produce two dates_changed alerts, one per change event`
19. `a crash after the alert insert but before sending leads to one send on rerun`
20. `a crash after sending but before marking sent does not double-send` (same idempotency key)
21. `an alert stuck in sending for more than 15 minutes is reclaimed and sent at most once`
22. `8 dispatchers running in parallel produce exactly one send per alert` (`FOR UPDATE SKIP LOCKED`)

Concurrency tests use barriers, not sleeps, and assert only on the final database state. They run 3 times per PR and 20 times nightly.

---

## 5. RLS and access tests

**Table classes (overview §6.1):**
- **User tables:** `profiles`, `program_follows`, `resumes`, `applications`, `application_events`, `alerts`.
- **Public catalog:** `companies`, `programs` (published only), `program_windows`, `listings`.
- **Pipeline tables:** `ats_*`, `page_*`, `extractions`, `change_events`, `pipeline_runs`, `metrics_events`.

**For each user table** (users A and B, plus anon):

| Action | Actor | Expected |
|---|---|---|
| select own rows | A | only A's rows |
| select B's rows | A | 0 rows |
| select | anon | 0 rows or permission denied |
| insert with user_id = A | A | success (except `alerts`) |
| insert with user_id = B | A | WITH CHECK violation |
| update B's row | A | 0 rows affected |
| change own row's user_id to B | A | rejected |
| delete B's row | A | 0 rows affected; B's row still exists |
| insert an event on B's application | A | rejected |
| JWT without `sub` | any | 0 rows |

**Specific cases:**
- `alerts: owners can select but not insert, update or delete` (D7).
- `profiles: a user cannot insert themselves into app_admins`.
- `programs: anon and authenticated see only published programs and cannot write`.
- `pipeline tables: anon and authenticated get nothing; admins can select through is_admin()`.
- `storage: A can read and write only under resumes/A/; cannot list, read or overwrite B/; anon gets nothing`.
- `views use security_invoker and never leak other users' aggregates`.
- `security-definer RPCs (approve_extraction, log_event, rate_limit_hit) check auth.uid() or is_admin() internally`.
- `no policy on a user table uses USING (true)` (meta test).

**Worker roles (ADR-005):**
- `ingest_worker can write listings, ats_fetches and pipeline_runs, and cannot read profiles, resumes or applications`.
- `monitor_worker can write page_fetches, page_snapshots and extractions, and cannot write program_windows directly`.
- `alert_dispatcher can write alerts and read follows, and cannot read resumes`.
- `no worker role has BYPASSRLS`.

**Service-role key:**
- `the service-role key is used only in apps/web/src/server/admin/deleteAccount.ts` (static check).
- `the service-role key does not appear in the client bundle` (build-output scan in the e2e job).

---

## 6. Extraction pipeline and eval

**Provider contract:**
- `the StubProvider and the recorded-response provider pass the same interface contract suite`.
- `extraction results are cached per (snapshot, program, prompt_version, model)`: a second call makes zero provider calls.
- `an oversized page is truncated deterministically, and the truncation is logged`.
- `review decisions (approve, edit, reject) record the reviewer and time (injected clock)`.

**Eval (ADR-008, D8):**
- **Dataset.** `eval/fixtures/` holds frozen normalised page text; `eval/labels/` holds about 50 hand labels in the extraction schema. Each label has a `split: dev | test` field, and only `test` is used for scoring. Changes to labels or `eval/baseline.json` need an explicit, reviewed commit.
- **CI (`eval-smoke`, blocking).** Scorer unit tests plus the stub provider on 5 fixtures, so the harness never rots. It's free and deterministic.
- **Full eval (`eval.yml`, manual).** Run with a real provider. It writes `eval/results/{date}-{provider}-{prompt}.json` with per-field precision, recall, exact match and calibration buckets. It must be run, and pass, before:
  - enabling or changing tau;
  - changing the prompt version or model.
- **Pass criteria.** At least 95% precision on status and date fields at the chosen tau (D8), and no metric more than 2 points below the baseline. Recall is reported but not gated at first; set a floor once a baseline exists.
- **Recordings.** Recorded provider responses are stamped with the prompt hash. A test fails if a recording's hash doesn't match the current prompt.

---

## 7. Politeness tests

**robots.txt:**
1. `a disallowed page is skipped; the mock sees only the /robots.txt request`
2. `Allow overrides Disallow for the more specific path`
3. `a user-agent-specific group beats *`
4. `Crawl-delay raises the per-host spacing`
5. `wildcard and $ patterns match correctly`
6. `robots.txt 404 means allowed; 5xx or a timeout means disallowed for today`
7. `robots.txt is fetched once per host per day`
8. `a redirect to another host re-checks robots.txt for the new host`
9. `a disallowed page is recorded as robots_disallowed and flagged for the admin`

**One fetch per URL per Melbourne day:**
10. `the page_fetches claim is inserted before any HTTP request`
11. `a second run on the same Melbourne day skips the page with zero HTTP calls`
12. `the fetch day rolls over at Melbourne midnight, not UTC midnight` (both AEST and AEDT)
13. `only failures with no HTTP response are retried, at most 3 attempts within the same claim`
14. `any HTTP response, including 5xx, ends the day for that URL`
15. `two programs on the same page share one fetch` (`page_programs`)
16. `users cannot trigger an upstream fetch`
17. `conditional GET sends If-None-Match and If-Modified-Since when stored`

**Rate limiting and scope:**
18. `requests to one host are spaced at least 5 seconds apart` (fake clock and fake sleep)
19. `different hosts don't block each other`
20. `429 or 503 with Retry-After is honoured`
21. `every request carries the identifying User-Agent with a contact URL`
22. `Greenhouse and Lever calls go through the same polite fetcher` (adapters cannot create a raw HTTP client)
23. `aggregator hosts (SEEK, Prosple, GradConnection and similar) are refused by the denylist` (ADR-013)

---

## 8. Fixtures and test data

- **No live network in CI.** pytest-socket, msw with `onUnhandledRequest: 'error'`, and Playwright routes that abort non-local origins. Each guard has a self-test proving it fails.
- **Recorded ATS payloads** in `workers/ingest/tests/fixtures/{greenhouse,lever}/<company>_<yyyymmdd>.json`:
  - captured once by a human-run script, never by CI, and checked for personal data;
  - each paired with a `.meta.json` holding the source URL, capture date and expected canonical output;
  - covering an empty board, unicode titles, HTML entities, missing fields, pagination, duplicate postings, and a synthetic 10k-posting generator.
- **HTML snapshots** in `workers/monitor/tests/fixtures/pages/<slug>/{v1,v2}.html`, covering a real change, a cosmetic-only change and banner or timestamp noise, plus `robots.txt` variants.
- **Recorded LLM responses** in `eval/recordings/<provider>/<content_hash>.json`, stamped with the prompt hash.
- **Golden files** are updated only with an explicit `--update-golden` flag.
- **Builders:**
  - TS: `buildProfile()`, `buildRules()`, `buildWindow()`;
  - Python: `make_listing()`, `make_page()`;
  - tests state only the fields that matter.
- **Seed data:** `supabase/seed.sql` with fixed UUIDs for users A and B and a deterministic catalog.
  - pgTAP tests roll back per transaction.
  - Vitest and pytest DB suites run serially with a truncate helper.
- **Time:** a fixed `NOW = 2026-09-30T00:00:00+10:00` (Melbourne, just before DST starts on 2026-10-04), overridable per test.
- Fixtures are reviewed like code. A README records where each captured page came from and its terms of use.

---

## 9. Coverage targets and gates

| Package | Lines | Branches | Enforced by |
|---|---|---|---|
| `packages/domain` | 95% | 90% (rule modules 100%) | Vitest thresholds |
| `apps/web` (routes, server, components) | 85% | 80% | Vitest thresholds (generated files and page shells excluded; covered by E2E) |
| `packages/db` | — | — | pgTAP, plus the meta tests requiring RLS and policies on every table |
| `workers/common`, `workers/ingest`, `workers/monitor` | 90% | 85% | `--cov-fail-under=90 --cov-branch` |
| `eval/` | 80% | — | pytest-cov |
| Global floor | 80% | 80% | — |

- **Ratchet:** coverage may not fall more than 1 point below `main`.
- **Blocking on PRs:** every job marked "Yes" in §1.
- **Release gate:** everything above, plus the last 3 nightly runs green.
- **Branch protection:** required checks, no merging with red, and a CODEOWNERS review on `packages/db/supabase/migrations/**`, `eval/labels/**`, `eval/baseline.json` and `docs/architecture/decisions.md`.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Flaky time-dependent tests | Injected clock, lint bans on clock reads, three system timezones, fake timers and sleeps |
| Semester-rule mistakes near boundaries | D5 boundary rows are marked, rules carry `rulesVersion`, and property tests cover monotonicity |
| Upstream page or ATS shape changes | No live network in CI; recorded fixtures carry capture dates; an optional manual drift check compares live shapes with fixtures and never blocks |
| Concurrency test flakiness | Barriers instead of sleeps, assertions on final state only, 20 repeats nightly |
| Slow Supabase startup in CI | Cached Docker images, one `supabase start` per job, a timed health-check wait (Phase 0 spike) |
| Test data collisions | Serial DB suites, fixed seed UUIDs, factory-generated IDs |
| Eval overfitting | dev/test split, reviewed label changes, versioned baseline, prompt-hash-stamped recordings |
| LLM nondeterminism | CI uses only the stub or recorded responses; real-provider runs are manual |
| Weak assertions inflating coverage | Stryker on the domain, assertions on reason codes and final state |
| Playwright flakiness | Role-based locators, no fixed waits, reused `storageState`, one retry reported as flaky |
| New tables without RLS | Meta tests fail the build |
| Public Actions logs leaking personal data (D10) | Allow-list loggers and a grep test for email logging in worker and dispatch code |
| Windows development environment | CI runs on Linux; scripts use Node or Python entry points rather than bash; `.gitattributes` fixes line endings |
