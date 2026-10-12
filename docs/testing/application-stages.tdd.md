# Evidence: application stages and "How to prepare and apply"

Source plan: the approved "presentable product" plan (item 3). Decision: D25. User journey: as a
student, I want to see the steps an employer says its application involves, with where each came
from, and a clear way to go and apply, so I know how to prepare.

Three slices, each with a RED commit (test written and failing for the intended reason) then a GREEN
commit (minimal change, every gate exits 0).

| Slice | RED | GREEN |
|---|---|---|
| Database column | `test: programs can hold an optional list of application stages (RED)` | `78e6735` |
| Web: parse, expose, show | `5b44e53` | `c6a0b2e` |
| Seed file and loader | `d9d74f9` | `4f580d2` |

## What the tests guarantee

| # | Guarantee | Where | Type |
|---|---|---|---|
| 1 | `programs.application_stages` exists, is jsonb, defaults to an empty list, refuses a non-list, and an anonymous visitor can read it on a published program | `packages/db/supabase/tests/database/008_application_stages.test.sql` | pgTAP (6) |
| 2 | Stages are kept in order and trimmed; a stage with no name, an over-long name, or no safe source (missing, `javascript:`, `http:`, credentials, aggregator) is dropped; a value that is not a list is "no stages"; at most 12 stages and 600 characters of description | `src/features/programs/application-stages.test.ts` | unit (10) |
| 3 | The program page has a "How to prepare and apply" section listing stages in order with a "Where this is described" link (new tab, `noopener noreferrer`), a reminder to confirm on the employer's page, an honest message when there are none, and the Apply link inside it | `src/components/ProgramDetail.test.tsx` | component (4) |
| 4 | The public API exposes `applicationStages` and no other new field | `src/server/programs/programs-handler.test.ts` | unit |
| 5 | Reading from the real database returns the stages in order, drops an unsafe one, and gives `[]` when none | `test/integration/get-program.test.ts` | integration (2) |
| 6 | The seed parser reads stages in order; refuses a stage with no source, an aggregator link, a blank name, an unknown key, a non-list, more than 12, or a non-text description | `workers/ingest/tests/test_seed_parse.py` | unit (7) |
| 7 | The loader stores stages with camelCase keys in order, stores `[]` for none and reloads unchanged, and updates a changed list in place | `workers/ingest/tests/test_seed_load.py` | database (3) |

## Mutation check

With `applicationStages: parseStages(row.application_stages)` in `list-programs.ts` replaced by
`applicationStages: []`, the integration test "reads the application stages, in order, and drops a
stage with no safe source" fails. The file was restored and the test passes.

## Gates (all exit 0)

- `pnpm lint`, `pnpm typecheck`
- `pnpm test:coverage`: 924 tests; statements 97.07%, branches 95.97% (gate 85%)
- `pnpm test:integration --coverage` (in `apps/web`): 78 tests; statements 91.47%, branches 80.23% (gates 90% / 75%)
- `pnpm --filter @internradar/web build`, `pnpm --filter @internradar/guards test`
- `pnpm --filter @internradar/db test:db`: 169 tests, `types:check` up to date
- Python (`workers`): pytest 408 passed plus 92 database tests, `ruff check`, `ruff format --check`, `mypy`

## Live check

Local server (`next start`) and database: `/` and `/programs` return 200; `/timeline` returns 308 to
`/`; a program page shows the new section with a stage, the empty message without one, and the API
returns the field. A single sample stage was set by hand in the local database to see the layout and
removed again. I did not see the page in a browser.

## Known gaps

- **No program has stages yet.** The seed file was not changed (no existing row edited), so every
  program page shows "stages aren't published here yet" until stages are written into
  `data/seed/catalog.yaml` from each employer's own page.
- `application_stages` is returned by the public API, so `openapi.yaml` (not yet written) must list it.
