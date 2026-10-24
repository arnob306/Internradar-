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
- A consulting guide says big four and strategy firms open in early January and close in late February
  or March ([hackingthecaseinterview.com guide](https://www.hackingthecaseinterview.com/pages/consulting-recruiting-australia)).
  **Do not use it for the big four's graduate or vacationer programs.** The firms' own pages (section 4)
  describe different timings, so treat that guide as being about strategy-consulting recruiting.

## 4. Your research (pasted 2026-10-12) checked against official pages

The pasted text looked like AI search summaries, so each claim was checked against the employer's own
site. These come from search results on official domains; I did not open every page in full, so confirm
the exact dates on the page before anything is written to the seed.

| Claim in your paste | Result | Official source | Notes |
|---|---|---|---|
| Big 4 (Deloitte, PwC, EY, KPMG) open between July and November, peaking August to October | **Not supported** | [Deloitte](https://www.deloitte.com/au/en/careers/students/graduate-program-careers.html), [PwC](https://jobs-au.pwc.com/au/en/job/720054WD/FY27-W2-Vacationer-Brisbane-Accounting-Assurance-Audit), [KPMG](https://kpmg.com/au/en/careers/graduates/vacation-program.html), [EY](https://www.ey.com/en_au/careers/2026-27-vacationer-program-student-opportunities) | **Deloitte:** opens in February/March and again in July; the 2026 graduate and vacationer round was 1 to 22 July, with a few audit and tax roles left. **PwC:** one FY27 vacationer role opened 8 June and closed 22 June 2026. **KPMG:** vacationer applications are closed and 2027/28 dates are not announced; the program starts in November or December. **EY:** the 2027 graduate and 2026/27 vacationer programs are open now, reviewed on a rolling basis, with no dates listed. A possible source of the mix-up: vacationer programs *start* around November and December. |
| Australian Government Graduate Program (and its Data stream) opens 1 March | **Confirmed for the opening** | [APS Jobs, Data Stream](https://content.apsjobs.gov.au/career-pathways/graduate-programs/data-stream) | The page says applications open 1 March 2027 (for people finishing by 31 December 2026). **No closing date found**: the "about 31 March" in your paste is not on that page (a 2024 post said open until 3 April 2024). Do not enter a close date until one is published. |
| NAB summer internship opens early July, closes early August | **Confirmed** | [NAB](https://www.nab.com.au/about-us/careers/early-careers/summer-intern-program) | 2026: opened Monday 6 July, closed 11:59pm AEST Sunday 9 August. |
| Westpac summer internship opens July, closes August | **Confirmed as typical** | [Westpac](https://www.westpac.com.au/about-westpac/careers/pathways/grad-program/summer-intern/) | The page says typical key dates are July to August and the 2026 round is closed. Exact days not found. |
| CommBank summer internship mid-August to early September | **Matches your seed** | (already in `catalog.yaml`) | The seed has 12 August to 8 September 2026. |
| ANZ summer internship June to July | **Not found** | [ANZ](https://www.anz.com.au/careers/programs/summer-intern/) | Eligibility (penultimate year) is stated; I found no dates. |
| Data and Digital Cadet opens 1 April; student placements open 1 December; Treasury and Defence internships | **Not checked** | | Check on APS Jobs and each department's page. |

### KPMG details pasted on 2026-10-12

You pasted: a main vacationer intake opened 16 February 2026 and closed 3 October 2026 (November 2026
start), and a rolling graduate intake open until 31 October 2026 (February 2027 start). I read KPMG's
two pages ([vacationer](https://kpmg.com/au/en/careers/graduates/vacation-program.html),
[graduates](https://kpmg.com/au/en/careers/graduates.html)):

| Pasted detail | What KPMG's pages say |
|---|---|
| Vacationer applications closed | **Matches:** "applications for 2026/27 have closed", and the 2027/28 opening is not announced. |
| Opened 16 February, closed 3 October 2026 | **Not stated** on either page. Possibly right (the close would be consistent with it being closed now), but unconfirmed. |
| Graduate rolling intake is open | **Matches:** the page says it is accepting applications for the graduate rolling intake. |
| Rolling intake open until 31 October 2026 | **Not stated.** No closing date is given. |
| Graduate program starts in February | **Matches in general:** the program starts in February each year. |

So KPMG's open/closed state is confirmed, but the specific dates are not, and **none of them should go
into the seed yet.** If you have the source for them (an email, a university careers page, or a KPMG
page I did not see), send me the address and I will check it.

### What this means for the catalogue

- **Programs missing from the seed:** KPMG (graduate and vacationer), and the Australian Government
  Graduate Program with its streams (Data, Digital, Accounting and Financial Management, and others).
- **Vacationer or summer programs missing:** the seed has one (CommBank Summer Intern). NAB, Westpac,
  ANZ, Deloitte, PwC, KPMG and EY all run one, with their own windows. They are separate programs with
  separate dates from the graduate programs, which is exactly the "stream" distinction the timeline needs.
- **The Big 4 are not one pattern.** Deloitte opens twice a year, PwC's vacationer round opened in June,
  KPMG has not announced, and EY rolls. A single "usually opens around..." per firm would mislead; each
  program and each round needs its own record.

## How to apply any of this

1. Open the employer's own careers page and note the opening and closing dates and the year, plus the
   page address and the day you looked.
2. Tell me the result, with the page address. I will write the YAML, run the seed check
   (`workers` `seed_cli`), and load it into the local database.
