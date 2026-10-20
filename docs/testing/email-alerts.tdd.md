# Evidence: email alerts, first half (D28, D29)

Source plan: derived in this run from the approved `/ecc:plan` for email alerts (the author said "start" for the
parts that need no outside account). Branch: `feat/email-alerts`. Decisions: D28 and D29.

This is the first half. It builds what decides, writes and sends an alert. It does **not** switch alerts on for
students: there is no follow button, unsubscribe page or worker command yet, and the site says nothing about alerts.

## User journeys

- As a student who follows a program, I want an email when its application opens, so I do not find out by chance.
- As a student, I want an email when the employer moves a date, with the old date beside the new one.
- As a student, I want one reminder in the last week before a closing date, and only when the employer gave that
  date to the day.
- As a student, I want to stop all alert emails, and to know why I got each one.
- As the author, I want a changed date to be recorded whoever changes it, without anyone remembering to log it.

## Task report (each is a RED commit, then a GREEN commit)

| Behaviour | RED | GREEN |
|---|---|---|
| A trigger records `opened`, `closed` and `dates_changed` events; the seed loader stops writing its own `corrected` event | `6da3fcd` (10 of 13 pgTAP checks failed), `7028e2e` (loader wrote a second event) | `4f38585` |
| Going back to upcoming or unknown must not look like a close (found by mutation) | `b30091c` | the same trigger |
| `alerts` outbox: unique per student and reason, students read their own rows and write none | `c4fea10` (no table) | `e70d304` |
| Who is owed which alert: follow and email switches, kinds, the seven-day rule, day precision only | `bed11b3` (no module) | `38e4fd1` |
| Email text: plain words, dates no more exact than the source, reason and unsubscribe link, no header injection | `bf483f7` (no module) | `8f3e60f` |
| Sending: success, retry with growing waits, giving up, safe error codes only | `922ee7b` (no module) | `2181cfa` |
| SMTP sender: headers, permanent against temporary errors, no address in an error | `20cd32d` (no module) | `989ca6e` |
| The server's own error is not chained where a log would print it (found by mutation) | `283f953` | the same sender |

## Results on this branch (all exit 0)

| Check | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | pass |
| `pnpm test:coverage` (unit) | 1020 tests pass, 100% statements and branches on the measured modules |
| `pnpm --filter @internradar/web build` and `pnpm --filter @internradar/guards test` | pass |
| `pnpm test:integration --coverage` | 79 tests pass |
| `pnpm --filter @internradar/db test:db` on a freshly reset database | 203 tests pass (was 176) |
| `types:check` | up to date after `types:write` added `alerts` |
| Workers: `pytest` | 465 pass, plus 95 database tests; `ruff check`, `ruff format --check` and `mypy` clean |

## Mutation checks

Each defence was removed in turn and the tests were run. Every removal made a test fail, except where noted.

- **Trigger (4 mutations):** always recording a date change, recording on insert, naming the wrong actor, and
  recording any status change. The fourth survived and showed a real gap: a window going back to `upcoming` would
  have been recorded as `closed`. `b30091c` closes it.
- **Alerts table (5 mutations):** letting any student read every alert, giving students write access, dropping the
  uniqueness rule, dropping the "sent needs a sent time" rule, and leaving the table open to a visitor who is not
  signed in. One first attempt broke the SQL and tested nothing; it was redone.
- **Decision rules (8 mutations):** ignoring either switch, treating a closing month as a day, allowing any status
  to be closing soon, alerting on a window that already closed, the off-by-one at seven days, and alerting on dates
  of an ended window. One more (alerting on `closed` events) did not fail a test because the rule that ignores ended
  windows already covers it. That mutant is equivalent, not a gap.
- **Email text (6 mutations):** keeping line breaks in the subject, showing a month as a day, showing an estimate as
  a fixed date, dropping the unsubscribe link, dropping the previous dates, and dropping the reminder to check the
  employer.
- **Sending (6 mutations):** retrying forever, retrying what cannot get better, waiting the same each time, keeping
  the error text, not counting a try, and one try too few.
- **SMTP (6 mutations):** treating a temporary reply as permanent, retrying a refused address, dropping either
  unsubscribe header, logging in when not asked, and chaining the server's error. The last survived and
  `283f953` closes it.

## Known gaps

- Nothing creates alerts from events yet, and nothing claims and sends them. That needs a restricted
  `notify_worker` database role (as `ingest_worker` has), a controlled way to read a student's email address,
  and a command to run it. The worker should not connect as `postgres` once the site is hosted.
- No follow button, unsubscribe page, or profile switch. Until they exist, no page may mention alerts.
- No hosted sender. Resend is planned behind the same `Notifier` interface and needs an account and a verified
  domain. Its idempotency-key support (ADR-010) is still to be checked against its documentation.
- The alert code sits in the `monitor` package because a new workspace package needs a regenerated `uv.lock`, and
  `uv` is not installed on this machine. It can be split out later.
- Nothing has sent a real email yet. The SMTP sender has only been tested with a fake connection, not against
  Mailpit.
