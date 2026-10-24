-- Alerts outbox (D29): one row per email a student is owed. A row can be inserted only once for the
-- same reason, a student can read their own rows and nobody else's, and only the worker writes.
begin;
select plan(13);

-- Impersonate an authenticated user, the way PostgREST does with a JWT.
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

select has_table('public', 'alerts', 'alerts exists');

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test');

insert into public.companies (id, slug, name, careers_url) values
  ('00000000-0000-0000-0000-0000000000c1', 'acme', 'Acme', 'https://acme.example/careers');
insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
   'grad', 'Acme Graduate Program', 'graduate', 'https://acme.example/grad', true);
insert into public.program_windows (id, program_id, cycle_year, window_seq, status, provenance, source_url) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
   2027, 1, 'unknown', 'seed', 'https://acme.example/grad');

insert into public.alerts (user_id, program_id, program_window_id, kind, dedupe_key) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b1', 'opened', 'event:1');

select is(
  (select status || ':' || attempts from public.alerts where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'pending:0',
  'a new alert waits to be sent and has not been tried');

select throws_ok(
  $$insert into public.alerts (user_id, program_id, program_window_id, kind, dedupe_key) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1',
     '00000000-0000-0000-0000-0000000000b1', 'opened', 'event:1')$$,
  '23505', null, 'the same reason cannot be queued twice for a student');

select lives_ok(
  $$insert into public.alerts (user_id, program_id, program_window_id, kind, dedupe_key) values
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000a1',
     '00000000-0000-0000-0000-0000000000b1', 'opened', 'event:1')$$,
  'but another student can have an alert for the same event');

select throws_ok(
  $$insert into public.alerts (user_id, program_id, program_window_id, kind, dedupe_key) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1',
     '00000000-0000-0000-0000-0000000000b1', 'bogus', 'event:2')$$,
  '23514', null, 'an unknown kind of alert is refused');

select throws_ok(
  $$update public.alerts set status = 'queued' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514', null, 'an unknown status is refused');

select throws_ok(
  $$update public.alerts set status = 'sent' where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514', null, 'an alert cannot be marked sent without when it was sent');

-- A student sees only their own alerts and cannot write any ---------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select is((select count(*)::int from public.alerts), 1, 'a student sees only their own alerts');

select throws_ok(
  $$insert into public.alerts (user_id, program_id, program_window_id, kind, dedupe_key) values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1',
     '00000000-0000-0000-0000-0000000000b1', 'opened', 'event:9')$$,
  '42501', null, 'a student cannot add an alert for themselves');

select throws_ok(
  $$update public.alerts set status = 'skipped'$$,
  '42501', null, 'a student cannot change an alert');

select throws_ok(
  $$delete from public.alerts$$,
  '42501', null, 'a student cannot delete an alert');

reset role;
set local role anon;

select throws_ok(
  $$select count(*) from public.alerts$$,
  '42501', null, 'a visitor who is not signed in cannot read alerts');

reset role;

delete from auth.users where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select count(*)::int from public.alerts where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'deleting an account deletes its alerts');

select * from finish();
rollback;
