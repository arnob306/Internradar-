-- Catalog tables: constraints and public read-only access (overview §2.2, §6.1).
-- Fixtures are inserted as the superuser, then each check switches role.
begin;
select plan(20);

select has_table('public', 'companies', 'companies table exists');
select has_table('public', 'programs', 'programs table exists');
select has_table('public', 'program_windows', 'program_windows table exists');
select has_table('public', 'program_window_events', 'program_window_events table exists');

-- Fixtures ------------------------------------------------------------------
insert into public.companies (id, slug, name, careers_url) values
  ('00000000-0000-0000-0000-0000000000c1', 'acme', 'Acme', 'https://acme.example/careers'),
  ('00000000-0000-0000-0000-0000000000c2', 'globex', 'Globex', 'https://globex.example/careers');

insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
   'grad', 'Acme Graduate Program', 'graduate', 'https://acme.example/grad', true),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1',
   'draft', 'Acme Draft Program', 'internship', 'https://acme.example/draft', false);

insert into public.program_windows
  (id, program_id, cycle_year, window_seq, opens_on, opens_precision, closes_on, closes_precision,
   provenance, source_url)
values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
   2027, 1, '2027-02-01', 'day', '2027-03-15', 'day', 'seed', 'https://acme.example/grad'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a2',
   2027, 1, '2027-02-01', 'day', '2027-03-15', 'day', 'seed', 'https://acme.example/draft');

insert into public.program_window_events (program_window_id, event_type, after, actor) values
  ('00000000-0000-0000-0000-0000000000b1', 'created', '{"status":"open"}', 'seed'),
  ('00000000-0000-0000-0000-0000000000b2', 'created', '{"status":"open"}', 'seed');

-- Constraints ------------------------------------------------------------------
select throws_ok(
  $$insert into public.programs (company_id, slug, name, program_type, source_url)
    values ('00000000-0000-0000-0000-0000000000c1', 'grad', 'Duplicate', 'graduate', 'https://x.example')$$,
  '23505', null, 'a company cannot have two programs with the same slug');

select lives_ok(
  $$insert into public.programs (company_id, slug, name, program_type, source_url)
    values ('00000000-0000-0000-0000-0000000000c2', 'grad', 'Globex Grad', 'graduate', 'https://globex.example/grad')$$,
  'the same slug is fine under a different company');

select throws_ok(
  $$insert into public.program_windows (program_id, cycle_year, window_seq, provenance, source_url)
    values ('00000000-0000-0000-0000-0000000000a1', 2027, 1, 'seed', 'https://x.example')$$,
  '23505', null, 'a program has one window per (cycle_year, window_seq)');

select lives_ok(
  $$insert into public.program_windows (program_id, cycle_year, window_seq, provenance, source_url)
    values ('00000000-0000-0000-0000-0000000000a1', 2027, 2, 'seed', 'https://x.example')$$,
  'a second round in the same cycle is allowed');

select throws_ok(
  $$insert into public.program_windows
      (program_id, cycle_year, window_seq, opens_on, opens_precision, closes_on, closes_precision,
       provenance, source_url)
    values ('00000000-0000-0000-0000-0000000000a1', 2028, 1, '2028-03-15', 'day', '2028-02-01', 'day',
            'seed', 'https://x.example')$$,
  '23514', null, 'a window cannot close before it opens');

select throws_ok(
  $$insert into public.program_windows
      (program_id, cycle_year, window_seq, opens_on, provenance, source_url)
    values ('00000000-0000-0000-0000-0000000000a1', 2028, 1, '2028-02-01', 'seed', 'https://x.example')$$,
  '23514', null, 'a date without a precision is rejected');

select throws_ok(
  $$insert into public.program_windows (program_id, cycle_year, window_seq, provenance, source_url)
    values ('00000000-0000-0000-0000-0000000000a1', 1999, 1, 'seed', 'https://x.example')$$,
  '23514', null, 'cycle_year outside 2015-2100 is rejected');

select throws_ok(
  $$insert into public.program_window_events (program_window_id, event_type, after, actor)
    values ('00000000-0000-0000-0000-0000000000b1', 'bogus', '{}', 'seed')$$,
  '23514', null, 'an unknown event type is rejected');

-- Public read access: anon and authenticated see published programs only ----------
set local role anon;
select is((select count(*)::int from public.programs), 1,
  'anon sees only the published program');
select is((select count(*)::int from public.program_windows where program_id = '00000000-0000-0000-0000-0000000000a2'), 0,
  'anon cannot see windows of an unpublished program');
select is((select count(*)::int from public.program_window_events), 1,
  'anon sees only events of published programs');
select is((select count(*)::int from public.companies), 2,
  'anon can read companies');
reset role;

set local role authenticated;
select is((select count(*)::int from public.programs), 1,
  'authenticated sees only the published program');

select throws_ok(
  $$update public.programs set name = 'Hacked' where slug = 'grad'$$,
  '42501', null, 'authenticated cannot update programs');

select throws_ok(
  $$insert into public.companies (slug, name, careers_url) values ('evil', 'Evil', 'https://evil.example')$$,
  '42501', null, 'authenticated cannot insert companies');
reset role;

set local role anon;
select throws_ok(
  $$delete from public.program_windows$$,
  '42501', null, 'anon cannot delete windows');
reset role;

select * from finish();
rollback;
