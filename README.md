# InternRadar

A platform for Australian university students that goes deep on three things instead of listing every internship:

1. **Eligibility.** "Am I eligible?" per program, from year level, graduation date and citizenship.
2. **Timeline.** A personal calendar built from historical open and close dates.
3. **Requirements.** What employers look for, matched against your resume to show gaps.

It also has a full application tracker that records which resume version went to which employer.

**Status:** Phase 0 (foundations). The design is done; the product isn't built yet.

## Documents

| Document | What it covers |
|---|---|
| [Architecture overview](docs/architecture/overview.md) | Components, trust boundaries, data model, pipeline, eligibility engine, security |
| [Decision log](docs/architecture/decisions.md) | Product decisions D1–D14 and why |
| [ADRs](docs/adr/README.md) | One record per key technical decision, with alternatives and trade-offs |
| [Test plan](docs/testing/test-plan.md) | Test-first plan for every phase |
| [Data sourcing and privacy policy](docs/ethics-policy.md) | What we fetch, how politely, and how personal data is handled |

## Layout

```
apps/web/          Next.js app and /api/v1 (a plain TypeScript package until Phase 4)
packages/domain/   Pure TypeScript domain logic: eligibility, clock, API envelope
tests/guards/      Tests that prove the lint guards and other repo rules work
workers/           Python uv workspace: common, ingest, monitor
docs/              Architecture, ADRs, test plan, policy
```

## Setup

Requirements: Node 24, pnpm 12, Python 3.13, uv.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test

cd workers
uv sync
uv run pytest
uv run ruff check . && uv run mypy common/src ingest/src monitor/src
```

## Rules the tooling enforces

- `packages/domain` never reads the system clock. "Now" is passed in, so results are reproducible.
- Worker code reads the clock only in `clock.py`.
- The Supabase service-role key is referenced only under `apps/web/src/server/admin/`.
- Tests can't reach the real network. The TypeScript tests use msw and the Python tests use pytest-socket.
- Configuration errors name the bad variable and never print its value, and secrets never appear in logs or JSON.

Trade-offs for each of these are in the ADRs.
