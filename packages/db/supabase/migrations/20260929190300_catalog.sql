-- Catalog: companies, programs, program windows and their history.
-- Public, read-only for clients. Writes come from seed migrations and, later,
-- security-definer approval functions (architecture overview §0, §2.2, §6.1).

create extension if not exists citext with schema extensions;

create type public.program_type as enum
  ('internship', 'vacationer', 'graduate', 'cadetship', 'discovery');
create type public.window_status as enum ('upcoming', 'open', 'closed', 'unknown');
create type public.date_precision as enum ('day', 'month', 'estimated');
create type public.provenance as enum ('seed', 'ats', 'monitor', 'admin');

create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  slug        extensions.citext not null unique,
  name        text not null,
  careers_url text not null,
  created_at  timestamptz not null default now()
);

create table public.programs (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references public.companies on delete restrict,
  slug                      extensions.citext not null,
  name                      text not null,
  program_type              public.program_type not null,
  cities                    text[] not null default '{melbourne}',
  disciplines               text[] not null default '{}',
  source_url                text not null,
  eligibility_rules         jsonb not null default '{"schemaVersion":1}'
                            check (jsonb_typeof(eligibility_rules) = 'object'),
  eligibility_rules_version int not null default 1,
  -- null means the rules are unverified, so the engine answers "unknown"
  eligibility_verified_at   timestamptz,
  is_published              boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (company_id, slug)
);
create index programs_published_idx on public.programs (program_type) where is_published;

create table public.program_windows (
  id                     uuid primary key default gen_random_uuid(),
  program_id             uuid not null references public.programs on delete cascade,
  -- the calendar year the program STARTS (decision D1)
  cycle_year             smallint not null check (cycle_year between 2015 and 2100),
  -- several application rounds can exist within one cycle
  window_seq             smallint not null default 1 check (window_seq between 1 and 9),
  opens_on               date,
  opens_precision        public.date_precision,
  closes_on              date,
  closes_precision       public.date_precision,
  -- eligibility is computed against the window's start, not the program's
  program_starts_on      date,
  program_ends_on        date,
  status                 public.window_status not null default 'unknown',
  -- when we first saw it open (used to measure alert latency)
  first_observed_open_at timestamptz,
  provenance             public.provenance not null,
  source_url             text not null,
  last_verified_at       timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (program_id, cycle_year, window_seq),
  check (opens_on is null or closes_on is null or closes_on >= opens_on),
  check ((opens_on is null) = (opens_precision is null)),
  check ((closes_on is null) = (closes_precision is null))
);
create index program_windows_active_idx on public.program_windows (closes_on)
  where status in ('upcoming', 'open');

-- Append-only history. This is the timeline's source of truth over time.
create table public.program_window_events (
  id                bigint generated always as identity primary key,
  program_window_id uuid not null references public.program_windows on delete cascade,
  event_type        text not null check (event_type in
                      ('created', 'opened', 'closed', 'dates_changed', 'corrected', 'rules_changed')),
  before            jsonb,
  after             jsonb not null,
  -- foreign key to extractions is added in the monitoring phase
  extraction_id     uuid,
  actor             public.provenance not null,
  occurred_at       timestamptz not null default now()
);
create index pwe_window_time_idx
  on public.program_window_events (program_window_id, occurred_at);

-- Access: clients may only read. RLS limits reads to published programs. ------
alter table public.companies            enable row level security;
alter table public.programs             enable row level security;
alter table public.program_windows      enable row level security;
alter table public.program_window_events enable row level security;

revoke all on public.companies, public.programs, public.program_windows,
  public.program_window_events from anon, authenticated;
grant select on public.companies, public.programs, public.program_windows,
  public.program_window_events to anon, authenticated;

create policy companies_read on public.companies
  for select to anon, authenticated using (true);

create policy programs_read_published on public.programs
  for select to anon, authenticated using (is_published);

create policy windows_read_published on public.program_windows
  for select to anon, authenticated
  using (exists (
    select 1 from public.programs p
    where p.id = program_windows.program_id and p.is_published
  ));

create policy events_read_published on public.program_window_events
  for select to anon, authenticated
  using (exists (
    select 1
    from public.program_windows w
    join public.programs p on p.id = w.program_id
    where w.id = program_window_events.program_window_id and p.is_published
  ));
