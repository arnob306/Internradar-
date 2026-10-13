# Evidence: the home timeline filter and the accessibility guard

Source plan: derived during this run from the presentation plan agreed in chat (no `*.plan.md` file).
Branch: `feat/program-detail`. Decision: D26.

## User journeys

- As a student, I want to narrow the timeline to graduate or vacationer programs, so that I only see
  the ones I can still apply to.
- As a student following a shared link with a mistyped filter, I want to be told it was ignored, so a
  wrong link never looks like "no programs".
- As a student using only a keyboard or a screen reader, I want the filters and the chart to be
  reachable and named, so I can use the page.

## Task report

| Behaviour | RED | GREEN |
|---|---|---|
| `parseTimelineFilter` and `timelineHref` (new module) | `b16ab10`: the test file failed to import the missing module | `c183518`: 9 of 9 pass |
| The home page reads `?type=`, passes it to `listPrograms`, shows the filter bar, the invalid-filter notice and the empty state | `b16ab10`: 5 of 6 new page tests failed. The sixth (tracking codes are ignored) already held, as expected. The 10 existing page tests still passed. | `c183518`: `page.test.tsx` and `timeline-filter.test.ts`, 25 of 25 pass |
| Accessibility guard (axe WCAG A/AA rules, keyboard order) | None: written as a guard, it passed on the first run, so there was no RED. To show it can fail, I emptied the filter links' text: axe reported `link-name` and the keyboard test failed (2 failures). The file was then restored. | `c45493c`: 7 of 7 pass |

## What the tests guarantee

| # | Guarantee | Test | Type | Result |
|---|---|---|---|---|
| 1 | No `type` shows every program | `timeline-filter.test.ts` | unit | PASS |
| 2 | `graduate` and `vacationer` are accepted | `timeline-filter.test.ts` | unit | PASS |
| 3 | A type that is not offered, empty, or repeated is ignored and reported | `timeline-filter.test.ts` | unit | PASS |
| 4 | Other parameters (tracking codes) are left alone | `timeline-filter.test.ts`, `page.test.tsx` | unit | PASS |
| 5 | The chosen type reaches the program query | `page.test.tsx` | component | PASS |
| 6 | Filter links, their order and `aria-current` | `page.test.tsx` | component | PASS |
| 7 | An invalid filter shows a notice with a way back | `page.test.tsx` | component | PASS |
| 8 | A filter with no programs says so with a link back | `page.test.tsx` | component | PASS |
| 9 | No axe A/AA violations in the filter bar, every chart row kind, an empty chart, and the program page with and without stages | `accessibility.test.tsx` | component | PASS |
| 10 | A keyboard reaches All programs, Graduate, Vacationer in order | `accessibility.test.tsx` | component | PASS |

## Mutation check (the input validation)

| Defence removed | Result |
|---|---|
| The single-value check (allow a repeated `type`) | `does not guess when type is given twice` failed |
| The allowed-types check | `ignores a type the timeline does not offer...` failed |

The file was restored and 9 of 9 passed again.

## Commands run

- `pnpm lint`: exit 0. `pnpm typecheck`: exit 0.
- `pnpm test:coverage` at the filter's GREEN commit: 939 tests, 97.11% statements, 95.86% branches.
- `pnpm --filter @internradar/web build`: exit 0. `pnpm --filter @internradar/guards test`: 11 passed.

## Known gaps

- **Not run:** the integration tests, the database (pgTAP) tests, and the Python tests, because Docker
  Desktop was off. No database or Python code changed in this work.
- **Not checked in a browser:** the filter and the pages have not been seen running. jsdom cannot
  check colour contrast, focus rings or layout, so those still need a pass in a real browser.
- The axe checks cover components, not full pages with the header and layout.
