# Evidence: email alerts, the web half (D31)

Source plan: derived in this run from the approved `/ecc:plan` for the web half of alerts (the author said "yes"
to the plan, then ran the test-first workflow). Branch: `feat/alerts-web`, stacked on `feat/email-alerts` (PR #23).
Decision: D31.

This half lets a student follow a program, and lets anyone stop alert emails from the link in an email. It is
**not switched on**. Everything a student can see about alerts sits behind `ALERTS_ENABLED`, which is off unless it
is exactly `true`, and nothing sends email on a schedule yet.

## User journeys

- As a student, I want to follow a program, so that I am told when it opens or changes.
- As a student who gets an alert email, I want to stop all alert emails from the link in it, without signing in.
- As a student whose mail app has an unsubscribe button, I want that button to work in one click.
- As the author, I want the site to say nothing about alerts while they cannot be sent.
- As the author, I want a stranger holding a link to be able to do one thing only: stop that student's emails.

## Task report (each is a RED commit, then a GREEN commit)

| Behaviour | RED | GREEN |
|---|---|---|
| `unsubscribe_from_alert(uuid)` for visitors, and a `follow` rate-limit bucket | `781805f` (function missing) | `e84f531` |
| Follow and unfollow API: guards, limit, safe errors | `d9b6e50` (no handler) | `b3d8b25` |
| Follow button: states, focus, calm errors | `cd327e8` (no component) | `b3d8b25` |
| Follow storage: own rows only, unpublished programs refused | `5ed5356` (no repo, no bucket) | `b3d8b25` |
| Alerts switch: off by default, nothing about alerts while off | `10a221a` | `93807c7` |
| One-click unsubscribe route, confirm page, button, storage | `6f07649` (no handler, repo, page or button) | `2022b40` |
| Email footer opens the page, header carries the one-click address | `81279e7` (one link for both) | `dc6f715` |

The switch RED found something real: the profile form already said "Email me when a program I follow opens or
changes" before any alert could be sent. That broke the rule that the site never promises alerts early. The
checkbox is now hidden while the switch is off, and saving keeps the stored value.

## Results on this branch (all exit 0)

| Check | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | pass |
| `pnpm test:coverage` (unit) | 1111 tests pass (was 1020), 97.3% statements |
| `pnpm --filter @internradar/web build` | pass; new routes `/unsubscribe`, `/api/v1/alerts/unsubscribe`, `/api/v1/me/follows/[programId]` |
| `pnpm --filter @internradar/guards test` | 11 pass |
| `pnpm test:integration --coverage` (from `apps/web`) | 94 tests pass (was 79) |
| `pnpm --filter @internradar/db test:db` on a freshly reset database | 250 tests pass (was 232) |
| `types:check` | up to date after `types:write` |
| Workers: `pytest` | 478 pass, plus 109 database tests |
| Workers: `ruff check`, `ruff format --check`, `mypy` | clean |

One full run of the 109 worker database tests had 5 failures and took 6 minutes, against about 30 seconds
otherwise. Three reruns passed all 109. I did not find the cause, so I am not claiming it is fixed. It looked like
timeouts while the machine was busy.

## Mutation checks

- **Database (10 of 10 caught):** the function changing other columns, unsubscribing everyone, running as the caller
  instead of its owner, not pinning the search path, being uncallable by visitors, ignoring alerts that are already
  sent, letting visitors read alerts or write profiles, raising an error for an unknown id, and a missing `follow`
  bucket.
- **Web (21 of 24 caught).** Caught: no rate limit, any content type, any alert id, no one-click field, huge bodies,
  caching, leaked error text, no origin or JSON guard on follow, no follow limit, any program id, public caching of
  follows, a switch that anything turns on, a case-insensitive switch, the follow button shown to visitors, the page
  ignoring the switch, the profile page always showing alerts, an indexed or referrer-leaking unsubscribe page, an id
  that is any text, a follow button that always sends PUT, and a wrong one-click body.
- **Three survived.** One was a real gap: the profile form's safe default (`showAlerts` off) was never tested,
  because the test helper always passed the prop. It now has its own test, which passes on the real code and fails
  when the default is flipped. The other two remove an early-return guard in the follow and unsubscribe buttons.
  They are equivalent mutants: the button is already `disabled` while a request is in flight, so the guard cannot be
  reached.

## Live check (real build, real local database, no cookies for the unsubscribe calls)

With alerts off, the profile page and a program page said nothing about alerts or following, and Save still worked.
With alerts on:

- Follow: 200 and one row in `program_follows`; `text/plain` 415; a bad id 404; a foreign `Origin` 403; no session
  401; delete 200 and the row gone. A visitor saw no Follow button.
- A real alert row for a test student. `GET /unsubscribe?alert=…` showed the question and changed nothing.
  `POST /api/v1/alerts/unsubscribe?alert=…` with only the form body and no cookies answered 200 and turned
  `email_alerts` off. A made-up id gave the identical answer and changed nobody. JSON gave 415, a missing form field
  or a bad id gave 400, and a GET on the route gave 405.
- A burst of 25 posts: the first 15 got 200 and the rest 429 (the earlier calls had used part of the 20 a minute).
- The page carries `noindex, nofollow` and `referrer: no-referrer`, and reads well at desktop and 390 pixel width.

The test student and their rows were deleted afterwards, and the local database was reseeded (13 programs).

## Security review

AgentShield (`npx ecc-agentshield scan`) graded the project B, 80 out of 100. Secrets, permissions, hooks and MCP
servers scored 100. Its 12 findings were 11 "missing prompt defense" notes on `CLAUDE.md` (it audits agent
configuration, not application code, and this app has no model reading user input, so nothing was changed) and one
info note that pnpm had no release-age gate. That one is fixed: `minimumReleaseAge: 4320` (3 days) in
`pnpm-workspace.yaml`, with a frozen install still passing and the lockfile unchanged.

A manual review of the unsubscribe path found the alert ids are `gen_random_uuid()` (random, 122 bits), the
function is the only thing visitors can call, and the public key cannot read `alerts` or `profiles` (both 401). It
also found four things:

- **The site's rate limit does not cover the database function.** I confirmed that
  `POST /rest/v1/rpc/unsubscribe_from_alert` works directly with the public key (204), which skips the route's
  limit. The id's randomness is what protects it. A platform rate limit should be set when hosting is chosen.
  **Open.**
- **`SITE_URL` was not checked.** An `http://` value would have put alert ids in clear text links. It must now be
  https (http only for localhost), with no login, query, fragment or whitespace. Test first: RED `bfe4a55`, GREEN
  `ca50faf`, and all 8 mutations of the rule were caught. **Fixed.**
- **The limiter's caller key trusts `x-real-ip` and `x-forwarded-for`.** If the host does not set them, all callers
  share one bucket of 20 a minute. Confirm the host's behaviour before launch. **Open.**
- **The id is the capability.** A forwarded email lets its recipient unsubscribe the original student, and ids appear
  in server and mail-provider logs. Accepted in D31. The worst outcome is one person's alert emails stopping.

## Deviations from the plan

- `docs/api/openapi.yaml` was not updated. It documents only the public program API, and the existing `/me/*`
  routes are not in it, so the follow routes are left out for consistency.
- The follow button is on the program page only. Timeline rows and the tracker do not have one.

## Known gaps

- **Not switched on, and not ready to be:** it needs a hosted sender (Resend), a public site address for `SITE_URL`,
  and the alert command (`alerts.run`) running on a schedule. None exists yet.
- The Python mutation checks for the store, command and sender from D30 are still unfinished, and the new link code
  in `run.py` has not been mutation-checked either.
- A student who follows a program but has email alerts off gets nothing, and the button does not say so. The
  profile switch is the only place that explains it.
- The wording says "open or change" but a closing-soon reminder also exists. The copy should be checked before the
  switch is turned on.
- The limit on the unsubscribe route is held in server memory, so it guards one server and not several.
- No browser end-to-end test (Playwright). The live check above was done by hand with `curl` and one browser view.
