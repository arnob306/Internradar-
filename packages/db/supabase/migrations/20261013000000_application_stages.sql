-- The steps of an employer's application process, as their own page describes them. Optional and
-- sourced: a stage is {"name": ..., "description": ..., "sourceUrl": ...}. Empty means not published.
alter table public.programs
  add column application_stages jsonb not null default '[]'::jsonb
  check (jsonb_typeof(application_stages) = 'array');
