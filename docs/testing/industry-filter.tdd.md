# Evidence: the industry filter (D23)

Source plan: derived in this run from the approved `/ecc:plan` (the author confirmed the six values, renamed
`professional_services` to `consulting`, and approved the tags below). Branch: `feat/program-detail`.
Decision: D23.

## User journeys

- As a student, I want to narrow the timeline to banks, consulting firms or tech employers, so I only plan for the
  kinds of employer I would apply to.
- As a student, I want the industry filter to combine with Graduate or Vacationer, so "graduate programs at banks" is
  one click, not a search.
- As a developer using the public API, I want to filter by industry and see each program's industry.
- As the author, I want a program that I have not tagged to show only under "All", never under a wrong industry.

## Task report (each is a RED commit, then a GREEN commit)

| Behaviour | RED | GREEN |
|---|---|---|
| `programs.industry`: a nullable enum of six values | `774aa22` (pgTAP 009 failed: no column) | `4020224` (pgTAP 176 pass) |
| Domain list `INDUSTRIES`, `isIndustry`, plain labels | `e2df486` (the list and labels were missing) | `d7aeb44` |
| Seed parser and loader carry `industry` | `8d8d0f9` (3 parse and 2 load tests failed) | `6a31dcd` |
| Query parameter, listing filter, `industry` on the public view | `cbe1888` (9 unit and 2 integration failed) | `b80b6ff` (with `openapi.yaml`) |
| Home timeline filter, combined with the type | `a06b8f6` (18 failed) | `9f810e1` |
| Layout: industry row under the type row | no test (CSS) | `994fb90`, checked in a browser |
| Programs list filter | `63b6dbc` (6 failed) | `29eb950` |
| Seed tags for the 13 programs | `12d5b2d` (test failed: untagged) | `99c5ad1` |
| Card titles are level 2 headings (found by the audit) | `d436490` | `d2bc823` |


The `openapi.yaml` change was driven by the contract test: once the API returned `industry`, `openapi.test.ts`
failed until the file described the field, the parameter and the enum, so it sits in the same GREEN commit as the API.

## What the tests guarantee

| # | Guarantee | Type |
|---|---|---|
| 1 | The database accepts exactly the six industries, allows null, refuses anything else, and a visitor can read it | pgTAP |
| 2 | The list in code matches the enum, and every industry has a plain label | unit |
| 3 | The seed rejects an unknown industry, treats a missing one as none, stores it, and a reload changes nothing | unit, database |
| 4 | `industry` is accepted once, from the list; a repeated, empty or unknown value is a field error | unit |
| 5 | Filtering returns only that industry; an untagged program matches none but still lists under no filter | integration |
| 6 | The public view and `openapi.yaml` agree on the field, the parameter and the enum | unit (contract) |
| 7 | The timeline reads the industry, keeps the type, ignores a bad value and says so, and names the filter when nothing matches | component |
| 8 | Links keep the other filter, mark the current one with `aria-current`, and are reachable by keyboard in order | component, accessibility |
| 9 | The programs list toggles industries the same way and keeps its other filters | component, unit |
| 10 | Every seed company's programs carry the author's tag, and a new company must be tagged on purpose | catalogue |

## Mutation check (each defence removed in turn, then restored)

| Defence removed | Result |
|---|---|
| The check that the industry is one of the six | 4 tests failed |
| The database filter `eq("industry", ...)` | 1 test failed |

After restoring: all pass.

## Tags the author approved

| Industry | Employers |
|---|---|
| `banking_finance` | CommBank, NAB, ANZ, Westpac |
| `consulting` | Deloitte, PwC, EY, KPMG |
| `technology` | Atlassian |
| `government_defence` | Australian Public Service |

`engineering_resources` and `other` are offered but no program uses them yet, so those two links show "No programs in
... to show yet".

## Gates (all exit 0)

- `pnpm lint`, `pnpm typecheck`, `pnpm --filter @internradar/web build`, `pnpm --filter @internradar/guards test`
- `pnpm test:coverage`: 1020 tests; statements 97.24%, branches 96.29%
- `pnpm test:integration --coverage` (in `apps/web`): 79 tests; statements 91.6%, branches 81.81%
- `pnpm --filter @internradar/db test:db`: 176 tests on a freshly reset database; `types:check` up to date
- Python (`workers`): pytest 415 passed plus 95 database tests; `ruff check`, `ruff format --check`, `mypy`

## Live check (local database, draft catalogue)

- API: `?industry=consulting` returns 5 programs; `?industry=banking_finance&type=vacationer` returns CommBank and NAB
  only; `?industry=mining` answers `VALIDATION_ERROR` naming the field.
- Home: `/?industry=consulting` highlights Consulting and All programs and lists the 5. `/?industry=technology&type=vacationer`
  says "No vacationer programs in Technology to show yet." with a way back.
- Layout at 1280x720: the first chart row is at 495px. It was 451px before the filter, and 543px with the first
  version of the row, so the link to all programs now sits beside the type filter to save space.
- Lighthouse (desktop): 100 in accessibility, best practices and SEO on the home page with filters. On the programs
  list it found a skipped heading level (h1 straight to h3 card titles), which existed before this change; the card
  titles are now h2 and the test above pins it. I did not re-run Lighthouse on that page after the fix.

## Known gaps

- Reading order and focus rings were checked by test and by Lighthouse, not by a person using a keyboard or screen reader.
- Two of the six industries have no program yet, so their links lead to an empty message.
- A program can only have one industry. If a real program straddles two, that needs a decision.
- Phone-width layout of the industry row (seven links wrap) was not checked in a real 390px browser.
