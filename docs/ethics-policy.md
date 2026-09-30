# Data sourcing and privacy policy

This policy is binding on every scraper, monitor and feature in InternRadar. It implements [ADR-013](adr/ADR-013.md) and the decisions in the [decision log](architecture/decisions.md). Code that breaks it is a bug, and several rules below are enforced by tests.

## What we fetch, and from where

- **Allowed:** employer career pages and public ATS feeds (Greenhouse and Lever job-board endpoints), for programs in the curated catalog.
- **Not allowed:** SEEK, SEEK Grad, Prosple, GradConnection and similar aggregators. We don't scrape them, republish their listings or link to them as a source. A hard denylist in `workers/common` refuses these hosts, and a test proves it.
- **Deferred:** Workday. Its JSON endpoints aren't an official public feed. It stays off until the tenant's terms and robots.txt have been reviewed, and we monitor the program page instead.
- **Only admins and seed files add URLs.** No user-supplied URL is ever fetched.

## How we fetch

- Read and honour `robots.txt` on every host before fetching. If it can't be fetched because of a server error or timeout, treat the host as disallowed for that day.
- Honour `Crawl-delay`.
- Fetch each URL at most once per Melbourne calendar day. The database records a claim before any request, so reruns, overlapping runs and manual triggers can't refetch.
- Space requests to one host at least 5 seconds apart.
- Back off on 403 and 429 responses.
- Send an identifying `User-Agent` that includes a contact URL.
- Send conditional requests (`If-None-Match`, `If-Modified-Since`) when validators exist.
- Honour opt-out requests at once by setting the page or source inactive.
- Employer terms of use can be stricter than robots.txt. Record a review note per host, and don't enable a source that prohibits automated access.

## What we store and show

- **Key facts only:** program name, dates and their precision, status, eligibility rules, and a link to the original page. We never republish a listing's full text.
- Normalised page text is kept only for diffing and review, and is nulled after 90 days (D12). Short evidence quotes are kept.
- Every public page links back to the employer's own page.

## Personal data

- **Resumes** are encrypted before storage (AES-256-GCM envelope encryption, ADR-007), never shared, never sent to an LLM without the user's explicit opt-in, and never used for training.
- **Citizenship** is optional and sensitive. It's never logged and never written to metrics (D3).
- **Logs** use an allow-list of fields. They never contain emails, profile data, resume names or contents, request bodies or tokens. Because the repository and its Actions logs are public (D10), workers log alert IDs, never addresses.
- **Deletion:** users can delete their account and everything tied to it, including stored resumes.
- **LLM providers** receive only public page text, never personal data. The provider must offer zero-retention or no-training terms.
- Privacy notice at sign-up; the Australian Privacy Principles apply.
