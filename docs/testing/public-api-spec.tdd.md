# Evidence: the public program API spec (`docs/api/openapi.yaml`)

Source plan: derived during this run from the request to write `openapi.yaml` for the public program API
(no `*.plan.md` file). Branch: `feat/program-detail`.

## What was written

An OpenAPI 3.1 file for the two public routes, `GET /api/v1/programs` and
`GET /api/v1/programs/{company}/{program}`: the query parameters, the program, window, company and
application-stage shapes (including `applicationStages`), the `success / data / error / meta` envelope, the four
error codes, the cache headers, `Retry-After`, and the rate limit (`x-rate-limit`: 60 requests a minute, shared by
both routes). It was written from the handlers, not from memory.

## How it is kept honest

A spec is a second copy of facts that live in the code, so a contract test holds it to the code:
`apps/web/src/server/programs/openapi.test.ts` (13 tests). It parses the YAML and compares it with the real
things: the fields returned by `toPublicProgram`, the window and stage types, the program-type and discipline lists,
the query parser, the slug rule, the status and precision values, the errors the two handlers really send (run with
fakes), and the rate-limit constants. A field, enum value, error code or limit that changes in only one place fails.

## RED and GREEN

| Stage | Commit | Result |
|---|---|---|
| RED | `2c0bcdb` | The test failed with `ENOENT` on `docs/api/openapi.yaml`: the spec did not exist |
| GREEN | `2d828b5` | 13 of 13 pass |

Two things went wrong on the way, both caught by the test:
- The first draft of the spec was not valid YAML (a description held `: ` unquoted, which YAML reads as a nested
  mapping). The test failed to load; I quoted the line.
- One assertion demanded exactly three keys under `x-rate-limit`, but the spec also carries two explanatory notes.
  I changed that assertion to check the numbers that matter (`toMatchObject`), not the exact key set. This was the
  test being stricter than its purpose, not a way to hide a mismatch.

## Mutation check (the spec was broken one way at a time, then restored)

| Break | Test that failed |
|---|---|
| A Program field renamed away (`applicationStages`) | the exact-fields test and the stages test |
| `vacationer` removed from the `type` filter | the allowed-values test |
| Rate limit changed from 60 to 30 | the rate-limit test |
| `PROGRAM_NOT_FOUND` removed from the error codes | the errors test |
| `Retry-After` removed from the 429 response | the headers test |

(An earlier attempt at this check did not run, because the backup file was in a place the script could not read, and
its "13 passed" lines were discarded. It was redone with the backup beside the spec.) After restoring: 13 of 13.

## Live check against the running API (local database, draft catalogue)

- `GET /api/v1/programs?limit=2`: 200, `cache-control: public, s-maxage=60, stale-while-revalidate=300`; the program,
  window and company field names equal the spec's; `meta` is `{total: 13, page: 1, limit: 2}`; open programs sort first.
- `GET /api/v1/programs/commbank/graduate-program`: 200 with four `applicationStages`, each with `name`,
  `description`, `sourceUrl`.
- A real-looking missing slug: 404 `PROGRAM_NOT_FOUND`, `cache-control: public, s-maxage=30`. A malformed slug: the
  same 404 with `cache-control: no-store`.
- `?limt=5&limit=0`: 400 `VALIDATION_ERROR` with `fields` naming both problems, `no-store`.
- 61 requests from one client split across both routes: exactly 60 answered 200, the 61st was 429 with
  `retry-after` and `no-store`.

## Commands run

- `pnpm lint`: exit 0. `pnpm typecheck`: exit 0.
- `pnpm test:coverage`: 962 tests, 97.11% statements, 95.86% branches. `pnpm --filter @internradar/guards test`: 11 passed.
- Added `yaml` as a dev dependency of `apps/web`, used only by this test.

## Known gaps

- The spec is validated by this test and by the live check, not by an OpenAPI linter or a generated client.
- Integration, database and Python suites were not rerun: no code they cover changed.
- The API is not hosted and the catalogue is an unverified draft, which the spec says in its description.
- Not documented, because it has not been checked: CORS behaviour and what a non-GET method returns (a 405).
