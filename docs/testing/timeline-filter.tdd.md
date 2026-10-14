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

## Live check and the rest of the gates (Docker Desktop on, 2026-10-14)

- Database reset, then `pnpm --filter @internradar/db test:db`: 169 pgTAP tests pass, `types:check` up to date.
- `pnpm test:integration --coverage` in `apps/web`: 78 tests, 91.47% statements, 80.23% branches.
- Python from `workers`: `ruff check`, `ruff format --check` and `mypy` clean, 408 tests plus 92 database-backed tests pass.
- App run against the local database with the draft catalogue loaded and published. `/` shows 13 programs
  (8 on the chart, 5 under "No date yet"); `/?type=graduate` shows 10; `/?type=vacationer` shows 3, and the summary
  counts follow. The current link carries `aria-current`. `/?type=internship` ignores the type and shows the
  notice; `/?utm_source=club` shows no notice. `/timeline` redirects (308). The CommBank page lists its four
  stages with source links.
- Lighthouse in Chrome (navigation mode): accessibility 100 on `/` (desktop), `/?type=vacationer` (mobile) and
  the CommBank program page (desktop), with best practices, SEO and agentic browsing also 100. This includes the
  colour-contrast checks jsdom cannot run.

## A fix found by looking at the real page

The first look at the running page showed the open rows saying "No closing date listed" twice: once in the
date text ("Open now. No closing date listed.") and again in the advice ("No closing date listed. Apply soon.").

| RED | GREEN |
|---|---|
| `7b948f6`: 3 tests failed (the advice text, a row assertion, and a new "says it once" test) | `3fe8f04`: the advice is now "Apply soon."; the affected files pass, then lint, typecheck, 947 unit tests (97.11% statements, 95.86% branches), build and the 11 guard tests all exit 0 |

## A compact top for the home page (so the chart is on screen)

The chart's first row started below the fold at 1280x720. The intro, five summary pills, the filters, a separate
link, a three-line note and the legend all sat above it. Layout is CSS, which jsdom cannot measure, so the
RED/GREEN here is two parts: structure and copy guarded by unit tests, and the position measured in Chrome.

| | RED (`c3f2be8`) | GREEN |
|---|---|---|
| Guard tests | 2 failed: the intro was over 160 characters, and the filters and the "Browse all programs" link were not in one toolbar | `page.test.tsx` 18 of 18, `accessibility.test.tsx` 7 of 7 |
| First chart row, top edge at 1280x720 | 727 px (below the 720 px fold) | 451 px; the first two rows end by 690 px |
| At 1440x900 | (not measured before) | first row at 451 px, 3 rows fully visible |
| Page height (full-page screenshot) | 3897 px | 3458 px |

What changed: the intro is one sentence (the solid-versus-dashed explanation stays in the chart note, which a test
protects), the summary is a single line of text above the filters, the filters and the link to all programs share a
toolbar, and spacing is tighter. The rules are scoped to `.timeline-page`, so the programs feed is unchanged.

A bug I introduced and fixed on the way: the separator between summary items was written as a CSS escape that was
saved with a NUL byte, so the browser showed "b7" with a replacement character. Seen in the screenshot, replaced
with a literal middle dot, and confirmed in the browser (`::before` content is a middle dot).

After the change: `pnpm lint`, `pnpm typecheck`, the build and the guards (11) exit 0; 949 unit tests, 97.11%
statements, 95.86% branches. Lighthouse accessibility is 100 on `/` for desktop and mobile, so the quieter summary
text keeps its contrast. No page-level horizontal scroll at 501 px, the narrowest the browser window would go.

## Known gaps

- Lighthouse was run on three pages, not every page. Tab order and focus rings were not walked by hand in the
  browser; the keyboard test covers tab order for the filter bar in jsdom only.
- The axe component checks cover components, not full pages with the header and layout.
- The draft catalogue shown in the screenshots is unverified. Dates labelled "Confirmed" in it still need
  checking against the employers' pages before anything is published.

## Follow-ups from a code review

| Finding | RED | GREEN |
|---|---|---|
| `toParams` was copied in two pages, and `HomePage` was 72 lines | `957c680`: the shared helper did not exist | `8b7c188`: `toSearchParams` shared, view split out; 965 unit tests |
| The "·" between summary items could be read aloud by screen readers | `7e9de3e`: the CSS rule had no text alternative | the next commit: `content: "·" / ""`; 966 unit tests. The built CSS keeps it. |

Each GREEN had lint, typecheck, coverage (97.1% statements, 96.13% branches), build and the 11 guard tests at exit 0.
Not verified: whether a particular screen reader skips the dot. The CSS is the standard way to mark it as decoration.
