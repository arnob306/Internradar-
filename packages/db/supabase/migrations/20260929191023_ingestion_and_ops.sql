-- Ingestion, ops and metrics; the restricted ingest_worker role; log_event; rate limiting.
-- (architecture overview §2.3, §2.7, §2.8, §6.5, §7.1)

create type public.ats_kind as enum ('greenhouse', 'lever', 'workday');

create table public.ats_sources (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies on delete cascade,
  kind       public.ats_kind not null,
  board_key  text not null,
  is_active  boolean not null default true,
  unique (kind, board_key)
);

-- The claim row that keeps a board to one fetch per Melbourne day.
create table public.ats_fetches (
  id            bigint generated always as identity primary key,
  ats_source_id uuid not null references public.ats_sources on delete cascade,
  fetch_day     date not null,
  run_id        uuid not null,
  http_status   smallint,
  -- true only if the whole board was parsed; a partial fetch must never close listings
  is_complete   boolean not null default false,
  error         text,
  fetched_at    timestamptz not null default now(),
  unique (ats_source_id, fetch_day)
);

-- Identity is (source, external id). content_hash is NOT part of the key: it only
-- detects edits, so a changed listing updates its row instead of adding a duplicate.
create table public.listings (
  id            uuid primary key default gen_random_uuid(),
  ats_source_id uuid not null references public.ats_sources on delete cascade,
  external_id   text not null,
  program_id    uuid references public.programs on delete set null,
  title         text not null,
  location      text,
  url           text not null,
  posted_at     timestamptz,
  -- key facts only, never the full description (ethics policy)
  key_facts     jsonb not null default '{}',
  content_hash  text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  -- sha256(company|normalised title|normalised location); indexed, not unique
  dedupe_key    text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  closed_at     timestamptz,
  unique (ats_source_id, external_id)
);
create index listings_dedupe_idx on public.listings (dedupe_key);
create index listings_program_idx on public.listings (program_id) where closed_at is null;

create table public.listing_program_rules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies on delete cascade,
  title_regex text not null,
  program_id  uuid not null references public.programs on delete cascade,
  unique (company_id, title_regex)
);

create table public.pipeline_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null check (job in ('ingest', 'monitor', 'dispatch', 'purge', 'eval')),
  gh_run_id   text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running'
              check (status in ('running', 'succeeded', 'failed', 'partial')),
  counts      jsonb not null default '{}'
);

create table public.metrics_events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  event        text not null check (event in (
    'user_signed_up', 'profile_completed', 'program_followed', 'program_unfollowed',
    'listing_ingested', 'ingest_run_completed', 'page_fetched', 'change_detected',
    'extraction_completed', 'review_decided', 'change_approved',
    'alert_created', 'alert_duplicate_suppressed', 'alert_sent', 'alert_failed', 'alert_feedback',
    'application_status_changed', 'resume_uploaded', 'account_deleted')),
  source       text not null check (source in ('web', 'ingest', 'monitor', 'dispatch', 'eval')),
  -- set null on user deletion, so aggregates survive without personal data
  user_ref     uuid references auth.users on delete set null,
  subject_type text,
  subject_id   uuid,
  run_id       uuid references public.pipeline_runs on delete set null,
  value        numeric,
  props        jsonb not null default '{}' check (pg_column_size(props) <= 2048)
);
create index metrics_event_time_idx on public.metrics_events (event, occurred_at desc);

-- Fixed-window counters for rate limiting write endpoints. Old windows can be purged later.
create table public.rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         int not null default 0,
  primary key (key, window_start)
);

-- Row-level security everywhere; clients get almost nothing. ---------------------
alter table public.ats_sources           enable row level security;
alter table public.ats_fetches           enable row level security;
alter table public.listings              enable row level security;
alter table public.listing_program_rules enable row level security;
alter table public.pipeline_runs         enable row level security;
alter table public.metrics_events        enable row level security;
alter table public.rate_limits           enable row level security;

revoke all on public.ats_sources, public.ats_fetches, public.listings,
  public.listing_program_rules, public.pipeline_runs, public.metrics_events,
  public.rate_limits from anon, authenticated;

-- Clients may read listings that belong to a published program.
grant select on public.listings to anon, authenticated;
create policy listings_read_published on public.listings
  for select to anon, authenticated
  using (exists (
    select 1 from public.programs p
    where p.id = listings.program_id and p.is_published
  ));

-- The ingest worker: its own login role with only the grants it needs (ADR-005).
-- The password is set out-of-band, never in a migration.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ingest_worker') then
    create role ingest_worker login noinherit;
  end if;
end $$;

grant usage on schema public to ingest_worker;
grant select on public.companies, public.programs, public.ats_sources,
  public.listing_program_rules to ingest_worker;
grant select, insert, update on public.listings, public.ats_fetches,
  public.pipeline_runs to ingest_worker;
grant insert on public.metrics_events to ingest_worker;

create policy companies_worker_read on public.companies
  for select to ingest_worker using (true);
create policy programs_worker_read on public.programs
  for select to ingest_worker using (true);
create policy ats_sources_worker_read on public.ats_sources
  for select to ingest_worker using (true);
create policy rules_worker_read on public.listing_program_rules
  for select to ingest_worker using (true);
create policy listings_worker on public.listings
  for all to ingest_worker using (true) with check (true);
create policy ats_fetches_worker on public.ats_fetches
  for all to ingest_worker using (true) with check (true);
create policy pipeline_runs_worker on public.pipeline_runs
  for all to ingest_worker using (true) with check (true);
create policy metrics_worker_insert on public.metrics_events
  for insert to ingest_worker with check (true);

-- log_event: the only way the web app writes metrics. It allow-lists events and
-- prop keys so personal data cannot slip into metrics (decision D3, overview §7.1).
create function public.log_event(event text, props jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  allowed_events constant text[] := array[
    'user_signed_up', 'profile_completed', 'program_followed', 'program_unfollowed',
    'application_status_changed', 'resume_uploaded', 'account_deleted'];
  allowed_keys constant text[] := array['kind', 'status', 'program_id', 'count'];
begin
  if event <> all (allowed_events) then
    raise exception 'event % is not allowed from the web app', event
      using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(props) is distinct from 'object' then
    raise exception 'props must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from jsonb_object_keys(props) as k where k <> all (allowed_keys)) then
    raise exception 'props contains a key that is not allowed' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.metrics_events (event, source, user_ref, props)
  values (
    event, 'web',
    -- account_deleted carries no user reference
    case when event = 'account_deleted' then null else (select auth.uid()) end,
    props);
end $$;
revoke all on function public.log_event(text, jsonb) from public, anon;
grant execute on function public.log_event(text, jsonb) to authenticated;

-- rate_limit_hit: true while the caller is within max_hits per window_len.
create function public.rate_limit_hit(bucket text, max_hits int, window_len interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  current_hits int;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = 'invalid_authorization_specification';
  end if;
  insert into public.rate_limits as r (key, window_start, hits)
  values (uid::text || ':' || bucket,
          date_bin(window_len, clock_timestamp(), timestamptz '2000-01-01'), 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into current_hits;
  return current_hits <= max_hits;
end $$;
revoke all on function public.rate_limit_hit(text, int, interval) from public, anon;
grant execute on function public.rate_limit_hit(text, int, interval) to authenticated;
