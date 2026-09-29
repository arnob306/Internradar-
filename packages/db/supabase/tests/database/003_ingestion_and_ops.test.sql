-- Ingestion tables, ops tables, the ingest_worker role, log_event and rate limiting
-- (architecture overview §2.3, §2.7, §2.8, §6.5, §7.1).
begin;
select plan(38);

-- In Supabase, postgres can only SET ROLE into roles it belongs to. Rolled back with the test.
grant ingest_worker to postgres;
-- The worker must also be able to call pgTAP's assertion functions.
grant usage on schema extensions to ingest_worker;

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

select has_table('public', 'ats_sources', 'ats_sources exists');
select has_table('public', 'ats_fetches', 'ats_fetches exists');
select has_table('public', 'listings', 'listings exists');
select has_table('public', 'listing_program_rules', 'listing_program_rules exists');
select has_table('public', 'pipeline_runs', 'pipeline_runs exists');
select has_table('public', 'metrics_events', 'metrics_events exists');

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test');
insert into public.companies (id, slug, name, careers_url)
  values ('00000000-0000-0000-0000-0000000000c1', 'acme', 'Acme', 'https://acme.example');
insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'grad', 'Grad',
   'graduate', 'https://acme.example/grad', true),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', 'draft', 'Draft',
   'internship', 'https://acme.example/draft', false);
insert into public.ats_sources (id, company_id, kind, board_key) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'greenhouse', 'acme'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', 'lever', 'acme');
insert into public.listings (id, ats_source_id, external_id, program_id, title, url, content_hash, dedupe_key) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'ext-1',
   '00000000-0000-0000-0000-0000000000a1', 'Grad role', 'https://acme.example/j/1', repeat('a', 64), 'k1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', 'ext-2',
   '00000000-0000-0000-0000-0000000000a2', 'Draft role', 'https://acme.example/j/2', repeat('b', 64), 'k2');
insert into public.ats_fetches (ats_source_id, fetch_day, run_id)
  values ('00000000-0000-0000-0000-0000000000d1', '2026-10-01', gen_random_uuid());

-- Constraints ---------------------------------------------------------------------
select throws_ok(
  $$insert into public.listings (ats_source_id, external_id, title, url, content_hash, dedupe_key)
    values ('00000000-0000-0000-0000-0000000000d1', 'ext-1', 'Dup', 'https://x.example', repeat('c', 64), 'k')$$,
  '23505', null, 'a listing is unique per (ats source, external id)');

select lives_ok(
  $$insert into public.listings (ats_source_id, external_id, title, url, content_hash, dedupe_key)
    values ('00000000-0000-0000-0000-0000000000d2', 'ext-1', 'Same id, other source', 'https://x.example',
            repeat('c', 64), 'k')$$,
  'the same external id on a different source is a different listing');

select throws_ok(
  $$insert into public.listings (ats_source_id, external_id, title, url, content_hash, dedupe_key)
    values ('00000000-0000-0000-0000-0000000000d2', 'ext-9', 'Bad hash', 'https://x.example', 'nothex', 'k')$$,
  '23514', null, 'content_hash must be 64 hex characters');

select throws_ok(
  $$insert into public.ats_fetches (ats_source_id, fetch_day, run_id)
    values ('00000000-0000-0000-0000-0000000000d1', '2026-10-01', gen_random_uuid())$$,
  '23505', null, 'a source can be claimed only once per day');

select throws_ok(
  $$insert into public.ats_sources (company_id, kind, board_key)
    values ('00000000-0000-0000-0000-0000000000c1', 'greenhouse', 'acme')$$,
  '23505', null, 'a board is registered once');

select throws_ok(
  $$insert into public.metrics_events (event, source, props)
    values ('user_signed_up', 'web', jsonb_build_object('blob', repeat('x', 3000)))$$,
  '23514', null, 'metrics props are limited to 2 KB');

select throws_ok(
  $$insert into public.metrics_events (event, source) values ('made_up_event', 'web')$$,
  '23514', null, 'metrics accept only known events');

select throws_ok(
  $$insert into public.pipeline_runs (job) values ('made_up_job')$$,
  '23514', null, 'pipeline runs accept only known jobs');

-- Client access -----------------------------------------------------------------------
set local role anon;
select is((select count(*)::int from public.listings), 1,
  'anon sees only listings that belong to a published program');
select throws_ok($$select * from public.ats_sources$$, '42501', null, 'anon cannot read ats_sources');
reset role;

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok($$select * from public.pipeline_runs$$, '42501', null, 'clients cannot read pipeline_runs');
select throws_ok($$select * from public.metrics_events$$, '42501', null, 'clients cannot read metrics_events');
select throws_ok($$select * from public.ats_fetches$$, '42501', null, 'clients cannot read ats_fetches');
select throws_ok(
  $$insert into public.listings (ats_source_id, external_id, title, url, content_hash, dedupe_key)
    values ('00000000-0000-0000-0000-0000000000d1', 'x', 'x', 'https://x.example', repeat('d', 64), 'k')$$,
  '42501', null, 'clients cannot insert listings');
reset role;

-- The ingest_worker role ---------------------------------------------------------------
set local role ingest_worker;
select lives_ok(
  $$insert into public.listings (ats_source_id, external_id, title, url, content_hash, dedupe_key)
    values ('00000000-0000-0000-0000-0000000000d1', 'ext-w', 'Worker v1', 'https://x.example',
            repeat('1', 64), 'kw')
    on conflict (ats_source_id, external_id) do update
      set title = excluded.title, content_hash = excluded.content_hash
      where public.listings.content_hash is distinct from excluded.content_hash$$,
  'the worker can upsert a listing');
select lives_ok(
  $$insert into public.listings (ats_source_id, external_id, title, url, content_hash, dedupe_key)
    values ('00000000-0000-0000-0000-0000000000d1', 'ext-w', 'Worker v1', 'https://x.example',
            repeat('1', 64), 'kw')
    on conflict (ats_source_id, external_id) do update
      set title = excluded.title, content_hash = excluded.content_hash
      where public.listings.content_hash is distinct from excluded.content_hash$$,
  'running the same upsert again is safe');
select is((select count(*)::int from public.listings where external_id = 'ext-w'), 1,
  'the repeated upsert left exactly one row');
select throws_ok($$select * from public.profiles$$, '42501', null, 'the worker cannot read profiles');
select throws_ok($$select * from public.applications$$, '42501', null, 'the worker cannot read applications');
select throws_ok(
  $$update public.programs set name = 'x'$$,
  '42501', null, 'the worker cannot write programs');
select lives_ok($$insert into public.pipeline_runs (job) values ('ingest')$$,
  'the worker can record a pipeline run');
select lives_ok(
  $$insert into public.metrics_events (event, source, value) values ('ingest_run_completed', 'ingest', 1)$$,
  'the worker can write metrics');
reset role;
select is((select rolbypassrls from pg_roles where rolname = 'ingest_worker'), false,
  'the worker role cannot bypass row-level security');

-- log_event ----------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select lives_ok($$select public.log_event('program_followed', '{"kind":"follow"}')$$,
  'a user can log an allowed web event');
select throws_ok($$select public.log_event('alert_sent', '{}')$$, '22023', null,
  'log_event rejects events the web app may not emit');
select throws_ok($$select public.log_event('program_followed', '{"email":"a@example.test"}')$$, '22023', null,
  'log_event rejects props that could carry personal data');
reset role;
select is(
  (select count(*)::int from public.metrics_events
   where event = 'program_followed' and source = 'web'
     and user_ref = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1, 'log_event records the event against the calling user');

-- rate limiting -----------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(public.rate_limit_hit('upload', 2, interval '1 hour'), true, 'hit 1 of 2 is allowed');
select is(public.rate_limit_hit('upload', 2, interval '1 hour'), true, 'hit 2 of 2 is allowed');
select is(public.rate_limit_hit('upload', 2, interval '1 hour'), false, 'hit 3 of 2 is refused');
reset role;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(public.rate_limit_hit('upload', 2, interval '1 hour'), true, 'limits are per user');
reset role;
set local role anon;
select throws_ok($$select public.rate_limit_hit('upload', 2, interval '1 hour')$$, '42501', null,
  'anon cannot use the rate limiter');
reset role;

select * from finish();
rollback;
