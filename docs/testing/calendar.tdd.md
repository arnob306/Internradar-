# Evidence: add a program's dates to a calendar

Source plan: derived during this run from "continue with other features" (no `*.plan.md` file). Branch:
`feat/program-detail`. Decision: D27.

## User journeys

- As a student, I want to put a program's opening and closing dates in my calendar, so I do not have to remember them.
- As a student, I want the calendar to hold only dates the employer actually gave, so a guess never looks like a deadline.
- As a student who imports the file twice, I want the events updated, not copied.

## Task report

| Behaviour | RED | GREEN |
|---|---|---|
| `buildCalendar` (new pure function) | `e2575c6`: the test file failed to import the missing module | `0c816e3`: 8 of 8 pass |
| The program page offers the download | `33a7066`: the link test failed (the other two tests passed trivially, since nothing rendered a link) | `0c816e3`: 29 of 29 in `ProgramDetail.test.tsx` |

RED and GREEN for the page and the builder share one GREEN commit, because the page test uses a prop that only exists
once the builder is wired in, so a separate GREEN for the builder would have failed typecheck.

## What the tests guarantee

| # | Guarantee | Type | Result |
|---|---|---|---|
| 1 | An all-day event for each opening and closing day (`DTEND` is the next day, including across a year end) | unit | PASS |
| 2 | Lines end in CRLF, as the format requires | unit | PASS |
| 3 | Month-only and estimated dates are left out | unit | PASS |
| 4 | Dates that have passed are left out, judged by the Melbourne day, and today is kept (checked either side of the 14:00 UTC boundary) | unit | PASS |
| 5 | No dates means no file | unit | PASS |
| 6 | Each event tells the student to confirm on the employer's page and links to the source | unit | PASS |
| 7 | Commas, semicolons, backslashes and line breaks are escaped, and no line is over 75 octets | unit | PASS |
| 8 | Event ids are stable between runs and different from each other | unit | PASS |
| 9 | The page shows "Add these dates to your calendar" with a `.ics` file name only when there is a usable date, plus a note on what is included | component | PASS |

## Mutation check (each defence removed in turn, then restored)

| Defence removed | Result |
|---|---|
| The day-precision check | 1 test failed |
| The "not already passed" check | 1 test failed |
| Text escaping | 2 tests failed |
| Line folding | 1 test failed |

After restoring: 8 of 8 passed.

## Commands run

- `pnpm lint`, `pnpm typecheck`: exit 0.
- `pnpm test:coverage`: 977 tests, 97.18% statements, 96.21% branches.
- `pnpm --filter @internradar/web build`: exit 0. `pnpm --filter @internradar/guards test`: 11 passed.

## Live check (local database, draft catalogue, 14 October 2026)

- The APS Data Stream program (opens 1 March 2027, to the day) shows the link, with the file name
  `australian-public-service-data-stream.ics`. The decoded file has one all-day event, `DTSTART` 20270301, with the
  "confirm on the employer's page" text and the source link.
- The CommBank summer intern page (its dates have passed) shows no link.

## Known gaps

- Not tried in a real browser: whether a download from a `data:` link works in every browser, and what each calendar
  app (Apple, Google, Outlook) does with the file. The file follows the standard format, but I did not import it.
- The cycle year in the event id comes from the data; the draft APS row says 2028 for a March 2027 opening, which is a
  data question, not a calendar one.
- Only opening and closing days are included. A "start preparing" reminder (the 4-week lead) is not.
- The integration, database and Python suites were not rerun: nothing they cover changed.
