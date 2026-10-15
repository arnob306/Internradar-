# InternRadar

A web app for Australian university students applying for internships and graduate programs. I'm building it as a student project, and this README is where I record what I'm building, what I decided, and why.

**Status: Phases 0 to 3 of 8 are done, and Phase 4 (the web app) is well along.** A student can open the home page and see a 12-month timeline of when graduate and vacationer programs open and close, narrow it to one program type, open a program to read how the employer's application process works, check their eligibility, and save the program to a tracker. The 13-program seed catalog is an unverified draft and is not published, so nothing here is claimed as fact yet. It runs locally, and it is not hosted, has no real users, and sends no alerts or email. What must happen before real students use it is in the [launch checklist](docs/architecture/launch-checklist.md). I've tried to keep this README honest about which is which.

## What a student can do today

- **See when applications open.** The home page is a year chart with one bar per program. Solid bars are dates the employer published. Dashed bars are guesses from earlier years, labelled "Estimated" and sourced. A program with no information says "Not announced" instead of guessing. Each row says when to start preparing, using a 4-week lead (decision D22).
- **Narrow it to Graduate or Vacationer** with plain links that work without JavaScript (decision D26).
- **Narrow it by industry** (banking and finance, consulting, technology, and so on). The industry row combines with the type filter, on the timeline and on the Programs list, and the public API takes the same filter (decision D23).
- **Read how the process works.** Each program page has a "How to prepare and apply" section: the steps the employer's own page describes (for example online application, online assessment, video interview, assessment centre), each with a link to where it is described. Eleven of the thirteen programs have stages so far. The rest say they aren't published rather than invent any (decision D25).
- **Add the dates to a calendar.** A program page can download a calendar file with its opening and closing dates, but only the ones the employer gives to the day and that are still ahead. It adds a "start preparing" day four weeks before an opening. Month-only and estimated dates are left out. It is a one-off download, not an alert (decision D27).
- **Check eligibility** from year level, graduation date and citizenship, answered as eligible, ineligible or unknown with reasons.
- **Save programs to a tracker** and badge them on the timeline.

![The home timeline: a year chart with solid, dashed and not-announced rows](docs/images/timeline.png)

![A program page with its sourced application stages and the apply link](docs/images/program-page.png)

*Screenshots of the app running locally on the unverified draft catalogue. The dates and stages shown are drafts that a person still has to check against each employer's page, so they are not published facts.*

The accessibility checks for these screens (axe rules for WCAG A and AA, and keyboard order through the filters) are tests that run with the rest of the suite.

## Why I'm building this

Applying for internships as a student is mostly logistics. Programs open and close on different dates, most of them are limited to certain year levels and citizenships, and I end up keeping it all in a spreadsheet.

Sites like [Prepped](https://preppedstudent.com) already cover a lot: hundreds of employers, deadline alerts, mock interviews. I can't beat that on breadth as a solo student, so I'm not trying to. I'm going deep on three things instead:

1. **Eligibility.** "Am I eligible for this program?" answered from my year level, graduation date and citizenship. Most bank, Big 4 and big-tech internships want penultimate-year students, and discovery programs like Optiver FutureFocus want earlier years. Working that out by hand for 50 programs is tedious and easy to get wrong.
2. **Timeline.** Large companies rarely say when applications will open, and neither I nor my friends could tell. One page lays out every program's opening window on a single time axis: confirmed dates where the employer has published them, and "usually opens around..." estimates from past cycles, clearly labelled as estimates. Some windows are short, and missing one is the most common way to lose an application.
3. **What employers look for.** How each employer's process works today, and later the requirements pulled from each listing and compared with my resume, so I can see the gaps for each role. The first part is built; the resume comparison is not.

On top of that sits an application tracker that also records which resume version I sent to which employer, so I can eventually see which version gets more interviews.

I'm starting small: the first release covers about 10 to 15 hand-verified programs for Melbourne students, spread across tech, consulting, engineering, commerce and research. Once eligibility, review and alerts work, I'll grow the list in waves toward broad STEM and commerce coverage, using only allowed sources. Verified data matters more to me than a big number (decision D15).

## What works today

- A pnpm and uv monorepo with strict TypeScript and Python tooling.
- A small domain library with an injectable clock and a standard API response shape.
- Environment config that fails clearly when something's missing and never prints secrets.
- Guards, each with its own test, that stop me breaking my own rules later (see [Rules the tooling enforces](#rules-the-tooling-enforces)).
- A GitHub Actions workflow that runs all of it, passing on the first pull request. It caught a real mistake on its first run: one action I'd pinned to a version tag that doesn't exist.
- A Postgres schema on Supabase with row-level security: the program catalog, user data (profiles, follows, resumes, applications), ingestion tables, metrics, and a restricted database role for the ingest worker. Users can only ever read and write their own rows.
- Tests, all passing in CI at the last check: the TypeScript suite, 153 database (pgTAP) tests, and 484 Python worker tests at 99.76% branch coverage (see the [Phase 3 evidence report](docs/testing/phase-3-ingestion.tdd.md)).
- An eligibility engine that answers "am I eligible?" with eligible, ineligible or unknown, and a reason for each. It's pure code with no database or clock. The database tests are written before each migration, and they include checks that fail the build if a new table has no row-level security.

## What isn't built yet

Alerts and email, page monitoring, resume storage, delete-my-data, and the verified catalog (the seed loader and a 13-program draft exist, but nothing is verified or published). Student-shared interview experiences and an industry filter are planned and deliberately left out for now. The roadmap is below.

## How I'm building it

Before writing code I wrote a plan and had it reviewed from two angles: system architecture and testing. The output is in `docs/`:

| Document | What it covers |
|---|---|
| [Architecture overview](docs/architecture/overview.md) | Components, trust boundaries, data model, pipeline, eligibility engine, security |
| [Decision log](docs/architecture/decisions.md) | Product decisions D1 to D26 and the reasoning behind each |
| [ADRs](docs/adr/README.md) | 15 records of technical decisions, with alternatives and trade-offs |
| [Test plan](docs/testing/test-plan.md) | The tests for every phase, written before the code |
| [Data sourcing and privacy policy](docs/ethics-policy.md) | What I fetch, how politely, and how personal data is handled |
| [Public API spec](docs/api/openapi.yaml) | OpenAPI 3.1 for the two public program routes: fields, filters, errors, caching and the rate limit. A test keeps it in step with the code |
| [Demo script](docs/demo-script.md) | A two-minute walkthrough, what not to claim, and answers to likely questions |
| [Evidence reports](docs/testing/timeline-filter.tdd.md) | What each test-first change proved, with the failing and passing runs (also [application stages](docs/testing/application-stages.tdd.md), [industry filter](docs/testing/industry-filter.tdd.md)) |

I use test-driven development: write a failing test, write the minimum code to pass it, then tidy up. Phase 0 followed that loop, and it caught real problems (see [What went wrong](#what-went-wrong-and-what-i-learned)).

## The stack, and why

| Choice | Why |
|---|---|
| **Next.js and TypeScript** for the web app and API | One language for the UI and the API, and strict types catch mistakes early. |
| **Postgres on Supabase**, with row-level security | Users must only ever see their own applications and resumes. Row-level security enforces that in the database, so a bug in my API code can't leak another user's data. |
| **Python workers** for scraping and extraction | Python has the better tools for parsing pages and talking to LLM APIs. |
| **GitHub Actions** for scheduling | Free, already where the code lives, and a daily job is all I need. |
| **Vercel and Supabase** for hosting | Both have free tiers that fit a student project. AWS is reserved for my separate CloudOps project. |

## Design decisions

The full reasoning is in the [ADRs](docs/adr/README.md) and the [decision log](docs/architecture/decisions.md). These are the ones that shaped the most.

**Eligibility answers "unknown" instead of guessing.** The engine returns eligible, ineligible or unknown, with reasons. If I haven't given my graduation date, or a program's rules haven't been checked, the answer is unknown. A wrong "eligible" could make someone skip a real requirement or waste an application, so the app is allowed to say "I don't know". Eligibility is pure TypeScript with no database or clock access, so it's easy to test thoroughly.

**Year level is counted in semesters remaining.** "Penultimate year" sounds simple until you hit mid-year graduates, double degrees and honours. Counting how many semesters are left when the program starts handles all of them with one rule. Trimester universities aren't supported in the first cycle.

**A human reviews every extracted date.** The plan is to detect page changes and use an LLM to pull out dates and rules. LLMs make mistakes, and a wrong alert damages trust quickly. So every extraction goes to a review queue at first. Only after I've measured accuracy on about 50 hand-labelled listings will I let simple date changes skip review. Eligibility-rule changes will always be reviewed.

**Postgres is the job queue.** Instead of adding Redis or a queue service, the database's own status columns and unique constraints handle work claims and duplicate prevention. It's one fewer thing to run, and it's enough for a daily job.

**Duplicates are prevented in the database, not just in code.** Re-running ingestion or the alert job must never create a duplicate listing or a second email. Unique constraints do this. One correction came out of the design review: my first idea was to include a content hash in the listing's unique key, but then an edited listing would insert a second row. The key is the source and external ID, and the hash only detects changes.

**Workers get their own restricted database roles.** Rather than giving GitHub Actions a key that can do anything, each worker connects as a role that can only touch the tables it needs. If a token leaks, the damage is limited.

**Resumes are encrypted before they're stored.** They're the most sensitive thing I'll hold. Each file is encrypted with its own key, and those keys are wrapped by a master key kept only in the hosting environment. This protects against a leaked database backup or a misconfigured storage bucket. It doesn't protect against someone stealing the hosting environment variables, and the final README will say so. Resumes are never sent to an LLM without an explicit opt-in, and never used for training.

**I only fetch from sources that allow it.** No SEEK, Prosple or other aggregators. I use employer career pages and public ATS feeds, store key facts only, and link back to the original. Each page is fetched at most once a day, `robots.txt` is honoured, and the code enforces these rules. The full policy is in [docs/ethics-policy.md](docs/ethics-policy.md).

**Workday is deferred.** Its job endpoints aren't an official public feed, and it isn't clear the terms allow automated access. I'd rather monitor the program page than risk it.

## What went wrong, and what I learned

- **A test that passed while the guard was broken.** I wrote a test to prove that unmocked network requests fail, using a fake `.invalid` domain. It passed even when my guard was misconfigured, because that domain fails DNS anyway. I now check for the specific error the mocking library throws.
- **Library versions moving under me.** The newest TypeScript (7.0) isn't supported by the linter yet, and the mocking library renamed the option I was using. I pinned TypeScript to 6.0 and recorded why (decision D14).
- **My own doc contradicted itself.** The design defined "semesters remaining" one way and its worked example needed another. I found it while turning the definition into test cases and fixed the doc.
- **The plan assumed the wrong tool versions.** I planned for Node 22 and Python 3.12, but my machine had Node 24 and Python 3.13. I switched the plan to match what I actually run.
- **My assumption about scrapers was wrong.** The review warned that most of my target employers probably use their own career sites rather than Greenhouse or Lever. I checked: of 16 employers, only Optiver, IMC and KPMG had a public board under the obvious names (details in [the audit](docs/architecture/ats-audit.md)). So Phase 3 shrinks to a hand-curated program list plus one Greenhouse adapter, and page monitoring in Phase 5 carries most of the load. The audit only tried guessed names, so it shows I can't rely on the ATS route, not which system each employer uses.

## Roadmap

| Phase | What | Status |
|---|---|---|
| 0 | Foundations: monorepo, CI, guards, policy | Done, apart from three setup spikes that need Supabase |
| 1 | Data model and row-level security | Done |
| 2 | Eligibility engine, test-first | Done |
| 3 | Ingestion: a curated program list and a Greenhouse adapter (Lever deferred) | Done, apart from verifying the seed catalog (a person has to do that) |
| 4 | Web app: sign-up, listings feed, eligibility badges, tracker, resume versions, opening-dates timeline (D19) | In progress: the timeline home page with type filter, programs feed, sign-in, profile, eligibility, program pages with application stages, and the tracker are built; resumes and delete-my-data are not |
| 5 | Monitoring and email alerts, with human review | |
| 6 | Measuring extraction accuracy on hand-labelled listings | |
| 7 | Timeline predictions computed from more history, requirement matching against resumes, funnel analytics | |
| 8 | Hardening and the final write-up | |

Phases 0 to 4 make up the MVP.

After the MVP I'm considering student-contributed outcome reports (stage reached, degree area and WAM band, shown only as anonymous aggregates). The reasoning and the privacy rules are in decision D18 in the [decision log](docs/architecture/decisions.md).

## Open questions and limits

- The LLM provider isn't chosen. It's behind an interface with a stub, and I'll decide in Phase 5 based on cost and whether the provider promises not to keep or train on data.
- The timeline is only as good as its dates. The first version uses confirmed dates plus one or two past cycles that I look up by hand, each with its source. A program with neither is listed as "no date yet" rather than guessed. Computing predictions automatically from more history comes in Phase 7.
- Review is me, alone. I'm promising a 48-hour turnaround because that's what I can keep.
- Free tiers have limits (database size, email volume, pausing after inactivity), and several vendor details are marked in the design to verify before I rely on them.

## Metrics I'll track from the start

Users, programs tracked, listings ingested, alerts sent, alert accuracy, duplicate alerts (this must stay at zero), extraction accuracy, time to apply, and the interview and offer rate for each resume version.

## Rules the tooling enforces

I made these mechanical because I know I'll forget them otherwise.

- `packages/domain` never reads the system clock. "Now" is passed in, so results are reproducible.
- Worker code reads the clock in exactly one file.
- The Supabase service-role key can only be referenced in one folder of the web app.
- Tests can't reach the real network.
- Config errors name the bad variable and never print its value, and secrets never show up in logs or JSON.

## Repository layout

```
apps/web/          Next.js app and /api/v1 (a plain TypeScript package until Phase 4)
packages/domain/   Pure TypeScript domain logic: clock, API envelope, later eligibility
tests/guards/      Tests that prove the lint guards work
workers/           Python uv workspace: common, ingest, monitor
docs/              Architecture, ADRs, decision log, test plan, policy
```

## Running it

Requirements: Node 24, pnpm 12, Python 3.13, uv, and Docker Desktop for the local database.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test

cd workers
uv sync
uv run pytest
uv run ruff check . && uv run mypy common/src ingest/src monitor/src
```

To see the app, start the local database and load the draft catalog:

```bash
pnpm --filter @internradar/db db:start:dev
cd workers/ingest
SEED_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres   uv run python -m internradar_ingest.seed_cli ../../data/seed/catalog.yaml
cd ../..
pnpm --filter @internradar/db dev:publish-seed   # local only: marks the draft programs published
```

Then run the web app with `SUPABASE_URL=http://127.0.0.1:54321` and `SUPABASE_ANON_KEY` set to the anon key that `supabase status` prints, using `pnpm --filter @internradar/web dev`. The publish step only exists for local development. In a real deployment a person verifies each program first.
