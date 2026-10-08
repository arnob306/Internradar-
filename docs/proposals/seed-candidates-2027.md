# Proposed additions and updates to the seed catalogue (not applied)

Status: **proposal only.** Nothing here has been written to `data/seed/catalog.yaml`. The repo rule is
that published and seed data are not edited without the author's go-ahead, and every item below needs
checking against the employer's own page first (the sources found are secondary).

Found on 2026-10-09 while comparing InternRadar with other platforms (see decision D24 for why the
calendar comes first). Once you have confirmed an item, tell me and I will write the YAML and run the
seed check.

## 1. A program missing from the catalogue

| Program | What was found | Source (secondary) | What to confirm on the employer's page |
|---|---|---|---|
| Australian Government Graduate Program (the APS graduate program) | Applications for the **2027** intake are open, announced on the Department of Finance news page. | [finance.gov.au news, 2026](https://www.finance.gov.au/about-us/news/2026/applications-are-now-open-2027-australian-government-graduate-program) | The opening and closing dates, the program year, and the official application site. **I could not read the dates: the page timed out twice.** Read them from the page. Note that individual departments also run their own graduate programs. |

Why it matters: it is a large, predictable, student-relevant stream that is not in the seed, and a
government program is a different "stream" from banks and consulting firms.

## 2. Dates for programs already in the catalogue

| Program (in seed) | What the seed has now | What was found | Source (secondary) | Notes |
|---|---|---|---|---|
| CommBank Graduate | Only an unknown 2027 window, no dates | The 2027 graduate program **opened 30 March 2026 and closed 8 September 2026 (11:55pm)** | [2027 CommBank Graduate Campaign listing](https://jobs.hia.com.au/jobview/detail/053fb43e-9618-11f1-a578-0231708ce3cd) | If confirmed on commbank.com.au, this is the past-cycle evidence the timeline needs: it would give an "Estimated: usually opens around March" row for 2027. It would be a past window, so it would not be drawn as a stated date. |
| Westpac Graduate | An estimated 1 Jul to 1 Aug 2026 window | The Institutional Bank graduate programs for 2027 **opened 16 March 2026**; all other 2027 Westpac programs **open in July** | [Westpac listing](https://internationaljobs.aut.ac.nz/employers/westpac-au) | The seed's July estimate may match the "other programs". Confirm which Westpac program the seed entry stands for, and whether the Institutional Bank one should be a separate program. |

## 3. Patterns (not dates)

These are useful as sanity checks only. They are not evidence for a specific program and must not be
entered as windows.

- Most large graduate programs open between February and April the year before they start, with a
  second wave from July to September (GradConnection and UTS career advice).
- Big four and consulting firms commonly open in early January and close in late February or March
  ([hackingthecaseinterview.com guide](https://www.hackingthecaseinterview.com/pages/consulting-recruiting-australia)).
  Deloitte, PwC and EY are in the seed with no past windows, so this would fit them, but check each
  firm's own page for the last cycle.

## How to apply any of this

1. Open the employer's own careers page and note the opening and closing dates and the year, plus the
   page address and the day you looked.
2. Tell me the result, with the page address. I will write the YAML, run the seed check
   (`workers` `seed_cli`), and load it into the local database.
