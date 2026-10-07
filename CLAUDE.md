# InternRadar

A platform for Australian university students to find internship and graduate programs, check their
eligibility, and track applications. Public repository, and the author's portfolio journal: decisions
are written down in `docs/architecture/decisions.md` (D1 onwards) and a change that makes a decision
needs an entry there.

## Layout

- `packages/domain`: pure TypeScript rules (eligibility engine, application status machine). No I/O.
- `packages/db`: Supabase migrations, pgTAP tests, generated types.
- `apps/web`: Next.js 16 (App Router, `proxy.ts`), React 19. Unit tests beside the code, integration
  tests in `apps/web/test/integration` (need a local database).
- `tests/guards`: lint-rule tests. `workers/`: Python (uv) ingest and monitor workers.

## Commands (from the repo root unless noted)

- `pnpm install --frozen-lockfile`
- `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`
- `pnpm --filter @internradar/web build`
- `pnpm --filter @internradar/guards test`
- Needs local Supabase: `pnpm --filter @internradar/db db:start`, then from `apps/web`
  `pnpm test:integration --coverage`, and `pnpm --filter @internradar/db test:db`.
- Python, from `workers`: `uv sync --locked`, `uv run ruff check .`, `uv run ruff format --check .`,
  `uv run mypy common/src ingest/src monitor/src`, `uv run pytest`.

A change is done only when every command that applies exits 0. Report the real result. If a command
could not be run (for example no database in your environment), say so; do not claim it passed.

## How changes are made: test first, always

1. Write the failing test. Run it and confirm it fails for the intended reason (RED).
2. Commit it: `test: <what> (RED)`.
3. Write the minimal fix. Run the same test and the gates; confirm GREEN with real exit codes.
4. Commit: `feat|fix: <what> (GREEN)`, only if everything exits 0.
5. For security-relevant code, mutation-check: commit, remove each defence in turn, confirm a test
   fails each time, then restore the file.
6. At the end of a phase, add an evidence report under `docs/testing/`.

Coverage gates: unit 85% (modules that need the database are listed in the exclude list in
`apps/web/vitest.config.ts` and measured by the integration suite instead, gate 90% with 75% branches).
A new database-bound module goes in both lists.

## Rules that must not be broken

- Row-level security is the security boundary. Pages and handlers use the signed-in student's session
  client, never a service-role key.
- Every write request must send `content-type: application/json` (even with no body); the origin check
  and content-type check live in `guardMutation`.
- Responses use the `ok`/`fail` envelope (`success`, `data`, `error`, `meta`). Errors shown to students
  and written to logs carry only a safe code, never database or server detail.
- Dates are shown as the Melbourne calendar day (ADR-015, `melbourneDate`). Never slice
  `toISOString()`. A date is never shown more precisely than its source proves.
- Interface wording is plain and calm: say what happened and what to do next. No jargon.
- Keep files focused (aim under 400 lines, never over 800 without a reason) and prefer immutable updates.

## Pull requests

- PR #8 (`fix/slice-2-review`) and PR #9 (`feat/program-detail`, stacked on #8) are drafts. Branch from
  the branch you were told to, open a draft PR into it, and never merge any PR. The author merges.
- The PR body lists what was verified (commands and results) and anything that could not be.
- Do not edit published or seed data (`data/seed`), and do not change `eslint.config.mjs` to make
  code pass: fix the code.
