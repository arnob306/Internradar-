-- fetch_claims: one fetch per URL per Melbourne day, enforced across runs (ADR-015).
--
-- The worker claims a URL by inserting (url_key, fetch_day) ON CONFLICT DO NOTHING; if no
-- row was inserted the claim was already taken. ats_fetches stays as the per-board status
-- row (HTTP status, is_complete); this table covers every URL, robots.txt included.
create table public.fetch_claims (
  url_key    text not null check (url_key <> '' and length(url_key) <= 2048),
  fetch_day  date not null,
  claimed_at timestamptz not null default now(),
  primary key (url_key, fetch_day)
);

alter table public.fetch_claims enable row level security;

-- Clients get nothing; the worker may read and take claims but never rewrite or release them.
revoke all on public.fetch_claims from anon, authenticated;
grant select, insert on public.fetch_claims to ingest_worker;

create policy fetch_claims_worker_read on public.fetch_claims
  for select to ingest_worker using (true);
create policy fetch_claims_worker_insert on public.fetch_claims
  for insert to ingest_worker with check (true);
