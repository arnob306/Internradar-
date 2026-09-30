-- User tables: profiles, follows, resumes, applications, application events, admins.
-- Every user table cascades from auth.users and is locked to its owner by RLS
-- (architecture overview §2.5, §6.1).

create type public.citizenship as enum
  ('au_citizen', 'au_pr', 'nz_citizen', 'intl_student', 'other');
create type public.degree_level as enum
  ('undergraduate', 'honours', 'masters_coursework', 'masters_research', 'phd');
create type public.app_status as enum
  ('saved', 'applied', 'online_assessment', 'interview', 'offer', 'rejected');

-- Keep updated_at honest. clock_timestamp() so it changes inside one transaction too.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create trigger programs_set_updated_at before update on public.programs
  for each row execute function public.set_updated_at();
create trigger program_windows_set_updated_at before update on public.program_windows
  for each row execute function public.set_updated_at();

create table public.profiles (
  user_id             uuid primary key references auth.users on delete cascade,
  -- completion of the LAST degree the student will do; month precision (decision D4)
  expected_graduation date check (extract(day from expected_graduation) = 1),
  degree_level        public.degree_level,
  disciplines         text[] not null default '{}',
  is_double_degree    boolean not null default false,
  planning_honours    boolean not null default false,
  -- optional and sensitive: never logged or exported to metrics (decision D3)
  citizenship         public.citizenship,
  university          text,
  email_alerts        boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.program_follows (
  user_id    uuid not null references auth.users on delete cascade,
  program_id uuid not null references public.programs on delete cascade,
  notify     boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, program_id)
);
create index follows_program_idx on public.program_follows (program_id) where notify;

create table public.resumes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  label        text not null check (char_length(label) between 1 and 60),
  version      int not null,
  storage_path text not null unique,
  mime_type    text not null check (mime_type in (
                 'application/pdf',
                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes   int not null check (size_bytes between 1 and 2097152),
  sha256       text not null,
  wrapped_dek  bytea not null,
  iv           bytea not null,
  kek_version  smallint not null,
  -- archived rather than deleted, so an application keeps its record of what was sent
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (user_id, version),
  unique (id, user_id)
);

create table public.applications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  program_id        uuid not null references public.programs on delete restrict,
  program_window_id uuid references public.program_windows on delete set null,
  cycle_year        smallint not null,
  resume_id         uuid,
  status            public.app_status not null default 'saved',
  applied_at        timestamptz,
  notes             text check (char_length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, program_id, cycle_year),
  unique (id, user_id),
  -- the resume must belong to the same user
  foreign key (resume_id, user_id) references public.resumes (id, user_id),
  check (status = 'saved' or applied_at is not null)
);
create index applications_user_idx on public.applications (user_id, status);
create trigger applications_set_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

-- One row per status change: the source for funnel metrics and time-to-apply.
create table public.application_events (
  id             bigint generated always as identity primary key,
  application_id uuid not null,
  user_id        uuid not null,
  from_status    public.app_status,
  to_status      public.app_status not null,
  resume_id      uuid,
  occurred_at    timestamptz not null default now(),
  foreign key (application_id, user_id)
    references public.applications (id, user_id) on delete cascade
);
create index app_events_user_idx on public.application_events (user_id, occurred_at);

create table public.app_admins (
  user_id uuid primary key references auth.users on delete cascade
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()))
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Access ------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.program_follows    enable row level security;
alter table public.resumes            enable row level security;
alter table public.applications       enable row level security;
alter table public.application_events enable row level security;
alter table public.app_admins         enable row level security;

revoke all on public.profiles, public.program_follows, public.resumes,
  public.applications, public.application_events, public.app_admins
  from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.program_follows,
  public.resumes, public.applications, public.application_events to authenticated;
-- app_admins gets no client grants; only is_admin() reads it.

create policy profiles_owner on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy follows_owner on public.program_follows for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy resumes_owner on public.resumes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy applications_owner on public.applications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy app_events_owner on public.application_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
