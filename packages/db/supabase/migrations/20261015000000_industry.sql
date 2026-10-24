-- The kind of employer a program belongs to, so students can narrow the timeline. Optional:
-- null means the program has not been tagged, and it shows only under "All".
create type public.industry as enum (
  'banking_finance',
  'consulting',
  'technology',
  'engineering_resources',
  'government_defence',
  'other'
);

alter table public.programs add column industry public.industry;
