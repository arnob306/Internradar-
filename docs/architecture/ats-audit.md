# Seed-employer ATS audit (spike D13)

**Date:** 2026-09-30. **Question:** which seed employers publish jobs on a public Greenhouse or Lever board? The answer decides how much of Phase 3 is worth building. The rule from the [architecture overview](overview.md#9-mvp-vs-v2-scope-and-yagni-flags): if fewer than about 10 employers are on Greenhouse or Lever, shrink Phase 3.

## Method

- A one-off script that followed the [data sourcing policy](../ethics-policy.md): it read `robots.txt` on both API hosts first (both allowed access), made one request per URL, waited at least 5 seconds between requests to the same host, and stored only HTTP status codes.
- Greenhouse: `GET boards-api.greenhouse.io/v1/boards/{slug}` (board metadata). Lever: `GET api.lever.co/v0/postings/{slug}?mode=json&limit=1`.
- For each employer I tried one or two obvious slugs (for example `atlassian`, or `commbank` and `cba`). That's 38 requests in total.
- The script was a throwaway and isn't in the repo.

## Results

| Employer | Greenhouse | Lever |
|---|---|---|
| Optiver | **found** (`optiver`) | not found |
| IMC | **found** (`imc`) | not found |
| KPMG | not found | **found** (`kpmg`) |
| Atlassian, Canva, DXC, Sportsbet, RACV | not found | not found |
| CBA, NAB, ANZ, Westpac | not found | not found |
| Deloitte, PwC, EY | not found | not found |
| Amazon | not found | not found |
| APS Data & Digital Cadet | not tested (a government recruitment site, not an ATS board) | not tested |

## What this does and doesn't tell me

- **A 404 only means my guessed slug doesn't exist.** A company can be on Greenhouse or Lever under a different name. I haven't confirmed which system any of the 13 "not found" employers actually use, so I'm not claiming that.
- **Even so, the count is nowhere near 10.** With three hits from sixteen employers, an unlucky slug guess couldn't plausibly change the conclusion.
- **The three hits aren't fully verified.** A board existing doesn't mean it lists Australian graduate roles. In particular `kpmg` on Lever may be a different KPMG member firm. I'll check the locations when I build the adapter.
- **Identification gap.** The policy says requests carry a User-Agent with a contact URL. The audit's User-Agent named the project but had no URL, because the repo has no public home yet. I'll fix that before the first real ingestion run.

## Conclusion and effect on the plan

- Phase 3 shrinks, as the architecture overview anticipated: a **curated seed loader** (programs and historical windows, reviewed in a pull request) plus **one adapter, Greenhouse**, which covers Optiver and IMC.
- The **Lever adapter is deferred**, since it would serve one employer that isn't verified.
- Most programs (the banks, Big 4, Atlassian, Canva and the rest) will be tracked through **page monitoring in Phase 5**, which is now where most of the product's value sits.
- The seed list itself stays at 50 to 100 programs. This audit changes how listings get in, not which programs are tracked.

## Addendum, 2026-10-02: what the first real recording found

When I recorded the Greenhouse fixtures (one polite request per board, through the production fetcher), two of the points above got answers:

- **Optiver's Greenhouse board is empty.** `boards-api.greenhouse.io/v1/boards/optiver/jobs` returned 200 with 0 jobs. The audit's "found" only meant the slug resolves, so the claim above that Greenhouse "covers Optiver and IMC" was wrong for Optiver. In practice the Greenhouse adapter serves **IMC only** (169 jobs, mostly European and APAC), and Optiver joins the page-monitoring group. The empty board stays as a fixture, because "a board with no jobs" is a case the adapter must handle.
- **The identification gap is closed.** Every request now sends `InternRadar/0.1 (+https://github.com/arnob306/Internradar-)`, including `robots.txt`.

Still unverified: whether IMC lists any Australian roles. The recorded sample had one APAC expression-of-interest posting and no Australian graduate roles.
