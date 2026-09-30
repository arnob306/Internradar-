# TDD evidence: Phase 2, the eligibility engine

This report indexes what the tests prove and the RED and GREEN evidence behind it. It quotes
the commands and results that were actually run. Test runner: pnpm with Vitest (`pnpm test`,
`pnpm test:coverage`, `pnpm lint`, `pnpm typecheck`), detected from `package.json`.

## Source plan and journeys

- **Plan:** [test plan](test-plan.md) Phase 2 (sections 3A to 3I) and the
  [architecture overview](../architecture/overview.md) section 4.
- **Review that drove cycles 1 to 4:** a local code review of the branch. It found one high,
  two medium and four low findings (H1, M1, M2, L1 to L4).

Journeys:
1. As a student, I want to be told whether I am eligible for a program, so that I do not waste
   an application on one I cannot apply to.
2. As a student, I want "I don't know" when the answer really is unknown, so that I am never
   told "yes" on a guess.
3. As a maintainer, I want a program with broken rules to show as unknown, so that one bad row
   never breaks a whole page of results.

## Evidence by cycle

Cycles 1 to 4 followed the full workflow: a failing test committed and validated (RED), the
minimal fix (GREEN), then refactor. Earlier Phase 2 work (semesters, year level, the four
criteria and the composer, commits `c5a7749` to `f5a7211`) was also written test-first, and
its RED runs were observed (each new test file failed with "Cannot find module"), but the
tests and code went into one commit each, so those have no separate RED commit.

| Cycle | Finding | RED commit | RED result | GREEN commit | GREEN result |
|---|---|---|---|---|---|
| 1 | H1: `final_year` counted people who graduated years ago | `6e646c7` | `6 failed \| 146 passed` | `8989351` | `152 passed` |
| 1 (refactor) | shared month-position helper, unused type removed | | | `0eb13b1` | `155 passed`, coverage 100% |
| 2 | M2: `addMonths` returned a month of 12.5 | `3270c2f` | `4 failed \| 155 passed` | `f4e301e` | `159 passed` |
| 3 | L1: unverified rules exposed criterion reasons | `3ee6f7d` | `3 failed \| 157 passed` | `907c067` | `160 passed` |
| 4 | M1, L3: malformed stored rules crashed the engine; no schema | `c3d5d4d` | exit 1, 2 files fail (modules missing), 160 still pass | `16d7256` | exit 0, `201 passed`, coverage 100% |

**A process error, corrected.** In cycle 3 my first GREEN commit was made while 3 tests were
still failing, because the file edit was blocked and my command chain did not stop on the
failure. I noticed on the next output, applied the real fix, confirmed exit code 0 on tests,
typecheck and lint, and amended that local, unpushed commit (`907c067`). From then on every
GREEN commit was gated on real exit codes.

## Test specification (selected guarantees)

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A student graduating years ago is ineligible for `final_year`, `penultimate` and `pre_penultimate`, and for explicit bounds, with reason `ALREADY_GRADUATED` | `year-level.test.ts` "already graduated" | unit | PASS |
| 2 | Graduating in the very month a program starts, or later, is not treated as graduated | `year-level.test.ts` "does not count someone graduating in the very month" | unit | PASS |
| 3 | Semesters left are counted from the month a program starts or ends, with pinned boundary rows | `semesters.test.ts` (16 rows) | unit | PASS |
| 4 | Semester counts never go negative, never rise as the start moves later, never fall as graduation moves later | `semesters.test.ts` properties | property | PASS |
| 5 | A missing profile value gives `unknown`, never a guess | `profile-criteria.test.ts`, `year-level.test.ts` | unit | PASS |
| 6 | A citizenship result carries no citizenship value (decision D3) | `profile-criteria.test.ts` "does not carry the citizenship value" | unit | PASS |
| 7 | Ineligible beats unknown beats eligible; reasons come in a fixed order | `evaluate-eligibility.test.ts` "combining criteria" | unit | PASS |
| 8 | Blanking a profile field never improves the answer; allowing more citizenships never worsens it | `evaluate-eligibility.test.ts` "properties" | property | PASS |
| 9 | Unverified rules give `unknown` with only `RULES_UNVERIFIED`, are never evaluated, and cannot crash the engine | `evaluate-eligibility.test.ts` "unverified rules" | unit | PASS |
| 10 | `addMonths` refuses fractional, negative-fraction, NaN and infinite counts | `year-month.test.ts` | unit | PASS |
| 11 | The rules schema rejects 22 kinds of bad rule (unknown fields, terms outside the vocabulary, empty lists, month 13, contradictory bounds and more), accepts good ones, and never throws | `rules.schema.test.ts` | unit | PASS |
| 12 | Malformed stored rules give `unknown` with `RULES_INVALID`, not a `TypeError` | `evaluate-stored-eligibility.test.ts` | unit | PASS |
| 13 | The committed JSON Schema equals the one generated from the Zod schema, so Python and TypeScript cannot drift | `rules.schema.test.ts` "JSON Schema contract" | contract | PASS |
| 14 | Every function is pure: inputs are not changed and results are deterministic | `*.test.ts` "does not change its inputs" | unit | PASS |

## Coverage and known gaps

- `pnpm test:coverage` in `packages/domain`: **201 tests, 100% statements, branches, functions
  and lines** (153 statements, 114 branches). Typecheck and lint exit 0.
- **Not covered yet:**
  - Mutation testing (Stryker) is planned for the nightly job and has not been run, so
    "100% coverage" is not yet backed by a mutation score.
  - Python does not yet validate rules against the JSON Schema. That arrives with the ingest
    worker in Phase 3. Until then the contract is checked on the TypeScript side only.
  - The engine has no end-to-end test through the API, because the API does not exist yet
    (Phase 4).
- **Open assumptions, flagged in the code and the decision log:** graduation in February to
  May counts as the running S1; the 16-term discipline vocabulary is a proposal.

## Merge evidence

The checkpoint commits are kept as merge commits, not squashed. If they are ever squashed,
this table and the cycle table above are the record of what was verified.
