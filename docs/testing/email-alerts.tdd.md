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

## Known gaps (first half)

- No follow button, unsubscribe page, or profile switch. Until they exist, no page may mention alerts.
- No hosted sender. Resend is planned behind the same `Notifier` interface and needs an account and a verified
  domain. Its idempotency-key support (ADR-010) is still to be checked against its documentation.
- The alert code sits in the `monitor` package because a new workspace package needs a regenerated `uv.lock`, and
  `uv` is not installed on this machine. It can be split out later.

# Second half: the restricted role, the store and the command (D30)

This half connects the pieces. A worker that logs in as a restricted database role makes alerts from window
events, sends the due ones, and records only a safe result. A real email goes through Mailpit.

## User journeys

- As the author, I want the sender to hold only the access it needs, so a leaked credential cannot list students.
- As a student who follows a program, I want one email when it opens, even if the employer also set the closing date
  in the same edit.
- As a student who turned email off after an alert was queued, I want it not to be sent.
- As the author, I want two workers, or a repeated run, never to send the same email twice.

## Task report

| Behaviour | RED | GREEN |
|---|---|---|
| `notify_worker` role, scoped policies, one-address-at-a-time lookup | `e446ea4` (role did not exist) | `a022f6e` |
| Create alerts from events and closing dates, claim and send due alerts, record a safe code | `ff61699` (no store) | `36a6d80` |
| A date set in the update that opens a window is not a second email | `b7fe42e` | `36a6d80` |
| The command: settings, counts only, crash by type name, Melbourne day; a real email through Mailpit | `cccdbd0` | `d676b69` |
| A long unsubscribe link stays a plain `<url>` on the wire | `c7433a5` | `d676b69` |

Three things the tests found while the GREEN code was being written, all fixed:

- The repo's own guard in `000_meta` rejected `using (true)` policies on student tables. The policies now have real
  conditions: follows with notify on, profiles with email on, alerts that are pending or recent.
- Postgres checks an updated row against the select policy, so a worker that could only see pending alerts could not
  mark one sent. The select policy now also allows alerts from the last 30 days.
- Opening a window and setting its closing date in one edit queued two emails. The history keeps both events; the
  planner now alerts once, about the opening.

The first real send also found that a long unsubscribe link was encoded in the header, which mail clients cannot
follow. The fake-connection tests could not have seen that.

## Results on this branch (all exit 0)

| Check | Result |
|---|---|
| `pnpm lint`, `typecheck`, `test:coverage`, web `build`, guards | pass (run after the migration; no web code has changed since) |
| `pnpm test:integration --coverage` | 79 tests pass |
| `pnpm --filter @internradar/db test:db` on a freshly reset database | 232 tests pass (was 203): 29 new for the role |
| `types:check` | up to date after `types:write` added the lookup function |
| Workers: `pytest` | 477 pass, plus 109 database tests (13 store, 1 Mailpit); `ruff check`, `ruff format --check`, `mypy` clean |

The Mailpit test needs the dev stack (`db:start:dev`) and the SMTP port `smtp_port = 54325` in `config.toml`, which
this branch turns on. Without Mailpit the test is skipped and says why; CI does not start Mailpit, so it is skipped
there.

## Mutation checks

- **Database role (13 mutations, all caught):** reading the accounts table, changing who an alert is for, changing
  what it says, reading citizenship, letting students call the lookup, a lookup that ignores status, opening the
  profiles, follows, alerts-read, alerts-insert and alerts-update policies, writing window events, and deleting
  alerts. Each was applied to the live local database and the pgTAP suite failed every time.
- **Python store, command and sender (16 planned, not completed):** the run was stopped by the machine after the
  first mutation because the system ran short of memory, and it has not been restarted. The tree was checked and
  restored to the commit. **These mutations still need running**: no `skip locked`, no unique-reason rule, ignoring
  the switches at send time, sending with no address, unpublished programs, month-precision reminders, the
  same-update rule, not-due alerts, outcome not recorded, error text kept, UTC day instead of Melbourne, crash
  message printed, password not required, and the header line limit.

## Known gaps

- The Python mutation checks above are unfinished, so the store, command and sender are tested but not yet
  mutation-checked.
- The sender is not wired to run on a schedule. Nothing calls `alerts.run` yet.
- Delivery is at least once, not exactly once (see D30).
- The unsubscribe link is a placeholder until the web half exists: no follow button, no unsubscribe page, no profile
  switch. The site still says nothing about alerts.
- No hosted sender (Resend), and no role password outside the local test helper.
