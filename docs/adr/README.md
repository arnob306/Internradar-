# Architecture decision records

Each ADR records one key decision with its context, the alternatives considered and the trade-offs. They are extracted from §8 of the [architecture overview](../architecture/overview.md). Product decisions that refine them are in the [decision log](../architecture/decisions.md).

| ADR | Decision |
|---|---|
| [ADR-001](ADR-001.md) | Monorepo tooling: pnpm workspaces and a uv workspace, no Turborepo or Nx |
| [ADR-002](ADR-002.md) | TS/Python split along the I/O-versus-domain line |
| [ADR-003](ADR-003.md) | Scheduling with GitHub Actions cron, with Postgres as the queue |
| [ADR-004](ADR-004.md) | Supabase RLS as the primary authorization control |
| [ADR-005](ADR-005.md) | Workers authenticate as dedicated Postgres roles, not with the service-role key |
| [ADR-006](ADR-006.md) | Versioned REST API (`/api/v1`) with a response envelope |
| [ADR-007](ADR-007.md) | Application-layer envelope encryption for resumes |
| [ADR-008](ADR-008.md) | Human review by default, auto-approve only after eval calibration (refined by D8) |
| [ADR-009](ADR-009.md) | LLM provider deferred behind an interface with a deterministic stub |
| [ADR-010](ADR-010.md) | Alerts table as a transactional outbox, Resend for email |
| [ADR-011](ADR-011.md) | Eligibility modelled in semesters remaining, pure TS, with explicit `unknown` |
| [ADR-012](ADR-012.md) | Metrics kept in Postgres, no external analytics in MVP |
| [ADR-013](ADR-013.md) | Content policy: key facts only, 90-day text retention, no aggregators |
| [ADR-014](ADR-014.md) | Supabase CLI migrations, generated TS types and pgTAP tests |
| [ADR-015](ADR-015.md) | UTC timestamps, Melbourne calendar dates |

To add an ADR, create the next numbered file, set its status, and add a row here. Don't edit an accepted ADR's decision; supersede it with a new one.
