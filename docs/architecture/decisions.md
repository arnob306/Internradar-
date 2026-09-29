# Decision log

Product decisions that resolve the open questions in the [architecture overview](overview.md) and the [test plan](../testing/test-plan.md). Recorded 2026-09-30. Where this log and the overview disagree, this log wins.

| ID | Decision | Choice | Why |
|---|---|---|---|
| D1 | Definition of `cycle_year` | The calendar year the program **starts**. | It is part of the unique keys on `program_windows` and `applications`, so it needs one unambiguous meaning. Default program start months derive from it (vacationer and internship: Nov; graduate: Feb). |
| D2 | Discipline vocabulary | Freeze about 15 controlled terms plus a `stem_any` group. Extracted text that doesn't map to a term gives `unknown`. | The engine never guesses a discipline. Adding terms later requires a migration of the rules JSON. |
| D3 | Citizenship | Optional profile field. If it's blank, citizenship criteria evaluate to `unknown`. Never logged and never written to `metrics_events`. | It is sensitive personal information (Australian Privacy Principles). A missing value must not produce a false "eligible" or "ineligible". |
| D4 | Mid-year graduates and honours | One semester remaining gives `unknown` with reason `MID_YEAR_GRADUATE_CHECK_EMPLOYER`, unless the program's rules set `acceptsMidYearGraduates`. Onboarding asks "Are you planning to do honours?" and uses the graduation date of the last degree. | Employers treat mid-year graduates inconsistently, so the honest answer is "check with the employer". Honours intent changes the graduation date, which changes the year level. |
| D5 | Year-level model | The semester model: S1 runs Feb–Jun and S2 runs Jul–Nov. Year level is the number of semesters remaining, measured against the program window's start date (§4). This replaces the TDD plan's Feb–Dec academic-year assumption. | It handles mid-year graduation and double degrees. Trimester universities are out of scope for cycle 1. |
| D6 | Alert targeting | P5 alerts go only to users who follow or saved the program. Eligibility-based targeting waits for v2. | It keeps the dispatcher off `profiles` and keeps alert volume low while human review is the bottleneck. |
| D7 | Who creates alerts | Only the server (the `alert_dispatcher` role) inserts or updates alerts. Users can read their own alerts and change their alert preferences. | The alerts table is the delivery outbox and the source of the accuracy metrics. User writes would corrupt both. |
| D8 | Auto-accept threshold | No extraction is auto-accepted at first; every change is reviewed. After the Phase 6 eval, date-only and status-only changes with confidence of at least 0.9 **and** at or above the calibrated tau can skip review. Eligibility-rule changes are always reviewed. | Alert accuracy is the product's credibility, and tau must come from measured precision, not a guess. Refines ADR-008. |
| D9 | Tracker transitions | Forward moves only: `saved → applied → online_assessment → interview → offer`, with the online assessment skippable. `rejected` is reachable from any state except `offer`. The user can undo their most recent transition. Every change writes an `application_events` row. | Forward-only keeps the funnel metrics clean. Undo stops a misclick from stranding a user, which admin-only correction would not. |
| D10 | Repo visibility | Public, with strict log hygiene (§6.3). | Portfolio value. Because GitHub Actions logs are public, workers log IDs only, never email addresses. |
| D11 | Admin and review load | One admin (the maintainer), in a single `app_admins` row. The README states a 48-hour review turnaround. | It's a solo project. Promising a turnaround that can actually be met is better than a 24-hour target that slips. |
| D12 | Page text retention | Keep normalised page text (`norm_text`) for 90 days, then purge it weekly. Evidence quotes are kept. | Reviewers and the eval need context. The 90-day limit bounds storage and republishing risk (ADR-013). |
| D13 | Seed employer ATS audit | Do it as a Phase 0 spike before sizing Phase 3: record which seed employers use Greenhouse, Lever, Workday or a bespoke page. | If fewer than about 10 use Greenhouse or Lever, Phase 3 shrinks to the seed loader plus one adapter. |
| D14 | Toolchain versions | Node 24, Python 3.13, pnpm 12, uv. TypeScript is pinned to 6.0.x. | These match the developer machine and CI, so local and CI runs behave alike. The original plan assumed Node 22 and Python 3.12. TypeScript 7.0 is excluded for now because typescript-eslint 8.71 supports only `<6.1.0`; revisit when it adds 7.x support. |

## Deferred decisions

| Topic | Decide in | Notes |
|---|---|---|
| LLM provider | Phase 5 | Criteria in overview §5.1: JSON-schema output, zero-retention and no-training terms, cost per 1k pages. |
| Telegram notifier | v2 | Email (Resend) first, behind the notifier interface in §5.2. |
