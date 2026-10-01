-- fetch_claims: the one-fetch-per-URL-per-Melbourne-day rule, enforced across runs (ADR-015).
-- The worker claims a URL by inserting (url_key, fetch_day); a second insert for the same
-- pair does nothing, so overlapping or repeated runs cannot fetch a URL twice in a day.
begin;
select plan(25);

-- In Supabase, postgres can only SET ROLE into roles it belongs to. Rolled back with the test.
grant ingest_worker to postgres;
-- The worker must also be able to call pgTAP's assertion functions.
grant usage on schema extensions to ingest_worker;

-- Shape ---------------------------------------------------------------------------------
select has_table('public', 'fetch_claims', 'fetch_claims exists');
select col_type_is('public', 'fetch_claims', 'url_key', 'text', 'url_key is text');
select col_type_is('public', 'fetch_claims', 'fetch_day', 'date', 'fetch_day is a date');
select col_type_is('public', 'fetch_claims', 'claimed_at', 'timestamp with time zone',
  'claimed_at is timestamptz');
select col_is_pk('public', 'fetch_claims', array['url_key', 'fetch_day'],
  'a claim is identified by (url_key, fetch_day)');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.fetch_claims'::regclass),
  'row-level security is enabled');

-- Constraints ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.fetch_claims (url_key, fetch_day)
    values ('https://careers.example.com/robots.txt', '2026-10-02')$$,
  'a URL can be claimed for a day');

select throws_ok(
  $$insert into public.fetch_claims (url_key, fetch_day)
    values ('https://careers.example.com/robots.txt', '2026-10-02')$$,
  '23505', null, 'the same URL cannot be claimed twice for one day');

select lives_ok(
  $$insert into public.fetch_claims (url_key, fetch_day)
    values ('https://careers.example.com/robots.txt', '2026-10-03')$$,
  'the same URL can be claimed again on the next day');

select lives_ok(
  $$insert into public.fetch_claims (url_key, fetch_day)
    values ('https://careers.example.com/graduates', '2026-10-02')$$,
  'a different URL can be claimed on the same day');

select throws_ok(
  $$insert into public.fetch_claims (url_key, fetch_day) values ('', '2026-10-02')$$,
  '23514', null, 'url_key cannot be empty');

select throws_ok(
  $$insert into public.fetch_claims (url_key, fetch_day) values (repeat('x', 2049), '2026-10-02')$$,
  '23514', null, 'url_key is limited to 2048 characters');

-- Who may do what -------------------------------------------------------------------------
select ok(
  not (has_table_privilege('anon', 'public.fetch_claims', 'select')
    or has_table_privilege('anon', 'public.fetch_claims', 'insert')
    or has_table_privilege('anon', 'public.fetch_claims', 'update')
    or has_table_privilege('anon', 'public.fetch_claims', 'delete')),
  'anon has no privileges on fetch_claims');

select ok(
  not (has_table_privilege('authenticated', 'public.fetch_claims', 'select')
    or has_table_privilege('authenticated', 'public.fetch_claims', 'insert')
    or has_table_privilege('authenticated', 'public.fetch_claims', 'update')
    or has_table_privilege('authenticated', 'public.fetch_claims', 'delete')),
  'authenticated users have no privileges on fetch_claims');

select ok(has_table_privilege('ingest_worker', 'public.fetch_claims', 'select'),
  'the worker can read claims');
select ok(has_table_privilege('ingest_worker', 'public.fetch_claims', 'insert'),
  'the worker can take claims');
select ok(not has_table_privilege('ingest_worker', 'public.fetch_claims', 'update'),
  'the worker cannot rewrite a claim');
select ok(not has_table_privilege('ingest_worker', 'public.fetch_claims', 'delete'),
  'the worker cannot release a claim');

-- The claim operation, as the worker ------------------------------------------------------
set local role ingest_worker;

select lives_ok(
  $$insert into public.fetch_claims (url_key, fetch_day)
    values ('https://claim.example/a', '2026-10-02') on conflict do nothing$$,
  'the worker takes a claim');

select lives_ok(
  $$insert into public.fetch_claims (url_key, fetch_day)
    values ('https://claim.example/a', '2026-10-02') on conflict do nothing$$,
  'taking the same claim again does nothing and does not fail');

select is(
  (select count(*)::int from public.fetch_claims where url_key = 'https://claim.example/a'),
  1, 'the repeated claim left exactly one row');

select throws_ok(
  $$update public.fetch_claims set claimed_at = now()$$,
  '42501', null, 'the worker cannot update claims');

select throws_ok(
  $$delete from public.fetch_claims$$,
  '42501', null, 'the worker cannot delete claims');

-- Clients are shut out ----------------------------------------------------------------------
reset role;
set local role authenticated;
select throws_ok($$select count(*) from public.fetch_claims$$,
  '42501', null, 'authenticated users cannot read fetch_claims');

reset role;
set local role anon;
select throws_ok($$select count(*) from public.fetch_claims$$,
  '42501', null, 'anon cannot read fetch_claims');

reset role;
select * from finish();
rollback;
