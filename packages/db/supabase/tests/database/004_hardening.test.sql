-- Hardening from the Phase 1 code review: abuse limits, tracker integrity,
-- cross-table consistency and no existence oracle for unpublished programs.
begin;
select plan(28);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test');
insert into public.companies (id, slug, name, careers_url)
  values ('00000000-0000-0000-0000-0000000000c1', 'acme', 'Acme', 'https://acme.example');
insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'one', 'One',
   'graduate', 'https://acme.example/1', true),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', 'draft', 'Draft',
   'graduate', 'https://acme.example/2', false),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000c1', 'three', 'Three',
   'graduate', 'https://acme.example/3', true);
insert into public.program_windows (id, program_id, cycle_year, provenance, source_url) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', 2028, 'seed', 'https://x.example'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a3', 2028, 'seed', 'https://x.example');
insert into public.applications (id, user_id, program_id, cycle_year) values
  ('00000000-0000-0000-0000-0000000000f1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '00000000-0000-0000-0000-0000000000a1', 2027);

-- 1. Abuse limits ---------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select lives_ok(
  $$select count(public.log_event('program_followed', '{}')) from generate_series(1, 20)$$,
  'a user can log 20 events a minute');
select throws_ok($$select public.log_event('program_followed', '{}')$$, '54000', null,
  'the 21st event in a minute is refused');
select throws_ok($$select public.rate_limit_hit('made_up', 5, interval '1 hour')$$, '22023', null,
  'rate_limit_hit refuses unknown buckets');
select throws_ok($$select public.rate_limit_hit('upload', 5, interval '1 second')$$, '22023', null,
  'rate_limit_hit refuses windows under a minute');
select throws_ok($$select public.rate_limit_hit('upload', 0, interval '1 hour')$$, '22023', null,
  'rate_limit_hit refuses a limit below 1');
select throws_ok($$select public.log_event(null, '{}')$$, '22023', null,
  'log_event refuses a null event');
reset role;

insert into public.rate_limits (key, window_start, hits)
  values ('old-key', now() - interval '10 days', 3);
select public.purge_rate_limits();
select is((select count(*)::int from public.rate_limits where key = 'old-key'), 0,
  'purge_rate_limits removes windows older than two days');

-- 2. Tracker integrity ---------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select throws_ok(
  $$update public.applications set status = 'offer', applied_at = now()
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23514', null, 'saved cannot jump straight to offer');

select lives_ok(
  $$update public.applications set status = 'applied', applied_at = now()
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'saved can move to applied');

select is(
  (select count(*)::int from public.application_events
   where application_id = '00000000-0000-0000-0000-0000000000f1'), 2,
  'the database recorded the creation and the move to applied');

select lives_ok(
  $$update public.applications set status = 'interview'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'the online assessment can be skipped');

select throws_ok(
  $$update public.applications set status = 'saved'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23514', null, 'a backward move that is not an undo is refused');

select lives_ok(
  $$update public.applications set status = 'applied'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'undoing the most recent move is allowed');

select is(
  (select is_undo from public.application_events
   where application_id = '00000000-0000-0000-0000-0000000000f1' order by id desc limit 1),
  true, 'the undo is recorded as an undo');

select throws_ok(
  $$update public.applications set status = 'saved'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23514', null, 'a second undo in a row is refused');

select lives_ok(
  $$update public.applications set status = 'interview'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'moving forward again after an undo is allowed');

select lives_ok(
  $$update public.applications set status = 'offer'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'interview can move to offer');

select throws_ok(
  $$update public.applications set status = 'rejected'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  '23514', null, 'an offer cannot be rejected');

select lives_ok(
  $$insert into public.applications (id, user_id, program_id, cycle_year)
    values ('00000000-0000-0000-0000-0000000000f2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            '00000000-0000-0000-0000-0000000000a3', 2027);
    update public.applications set status = 'rejected', applied_at = now()
    where id = '00000000-0000-0000-0000-0000000000f2'$$,
  'a saved application can be rejected');

select throws_ok(
  $$insert into public.applications (user_id, program_id, cycle_year, status, applied_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a3', 2030,
            'offer', now())$$,
  '42501', null, 'clients can only create applications as saved');

select throws_ok(
  $$insert into public.application_events (application_id, user_id, to_status)
    values ('00000000-0000-0000-0000-0000000000f1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'saved')$$,
  '42501', null, 'clients cannot forge tracker events');

select throws_ok(
  $$insert into public.app_admins (user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '42501', null, 'a user cannot make themselves an admin');

-- 3. Cross-table consistency ----------------------------------------------------------
select throws_ok(
  $$insert into public.applications (user_id, program_id, program_window_id, cycle_year)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-0000000000b3', 2028)$$,
  '23503', null, 'an application cannot use a window from a different program');

select lives_ok(
  $$insert into public.applications (user_id, program_id, program_window_id, cycle_year)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1',
            '00000000-0000-0000-0000-0000000000b1', 2028)$$,
  'an application can use a window from its own program');

select throws_ok(
  $$insert into public.resumes (id, user_id, label, version, storage_path, mime_type, size_bytes, sha256,
                                wrapped_dek, iv, kek_version)
    values ('00000000-0000-0000-0000-00000000e0a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'x', 1,
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/victim.bin', 'application/pdf', 10, repeat('0', 64),
            '\x00', '\x00', 1)$$,
  '23514', null, 'a resume path must be inside the owner''s own folder');

select lives_ok(
  $$insert into public.resumes (id, user_id, label, version, storage_path, mime_type, size_bytes, sha256,
                                wrapped_dek, iv, kek_version)
    values ('00000000-0000-0000-0000-00000000e0a1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ok', 1,
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/00000000-0000-0000-0000-00000000e0a1.bin',
            'application/pdf', 10, repeat('0', 64), '\x00', '\x00', 1)$$,
  'a resume path inside the owner''s own folder is accepted');

-- 4. No way to probe for unpublished programs --------------------------------------------
select throws_ok(
  $$insert into public.program_follows (user_id, program_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a2')$$,
  '42501', null, 'following an unpublished program is refused');

select throws_ok(
  $$insert into public.program_follows (user_id, program_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '99999999-9999-9999-9999-999999999999')$$,
  '42501', null, 'following a program that does not exist gives the same error');
reset role;

select * from finish();
rollback;
