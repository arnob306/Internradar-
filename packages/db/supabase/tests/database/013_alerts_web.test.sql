-- The web half of alerts (D31): a student can stop alert emails from the link in an email without
-- signing in, through one narrow function; and following a program has its own rate-limit bucket.
-- The function is the only thing an anonymous visitor can reach here: it changes one column
-- (email_alerts) for the owner of the alert it is given, and it says nothing about whether the
-- alert exists.
begin;
select plan(18);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

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
insert into public.profiles (user_id, email_alerts, citizenship, university) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 'au_citizen', 'Monash'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true, 'au_citizen', 'Monash');
insert into public.alerts (id, user_id, program_id, program_window_id, kind, dedupe_key, status, sent_at) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
   'opened', 'event:1', 'pending', null),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
   'dates_changed', 'event:2', 'sent', now() - interval '100 days'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
   'opened', 'event:1', 'pending', null);

-- How the function is built -------------------------------------------------------------------
select is((select prosecdef from pg_proc where oid = 'public.unsubscribe_from_alert(uuid)'::regprocedure),
  true, 'the unsubscribe function runs with its owner''s rights, so it needs no service key');
select is((select proconfig from pg_proc where oid = 'public.unsubscribe_from_alert(uuid)'::regprocedure),
  array['search_path=""'], 'and it pins an empty search path');
select ok(has_function_privilege('anon', 'public.unsubscribe_from_alert(uuid)', 'execute'),
  'a visitor who is not signed in can call it');
select ok(has_function_privilege('authenticated', 'public.unsubscribe_from_alert(uuid)', 'execute'),
  'and so can a signed-in student');

-- What it does ---------------------------------------------------------------------------------
set local role anon;
select public.unsubscribe_from_alert('11111111-1111-1111-1111-111111111111');
reset role;

select is((select email_alerts from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  false, 'a pending alert''s id turns alert emails off for its owner');
select is((select email_alerts from public.profiles where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  true, 'and nobody else');
select is((select citizenship::text from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'au_citizen', 'it changes no other profile column (citizenship)');
select is((select university from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Monash', 'nor the university');
select is((select status::text from public.alerts where id = '11111111-1111-1111-1111-111111111111'),
  'pending', 'and it leaves the alert itself alone');

-- What it refuses to reveal -----------------------------------------------------------------
update public.profiles set email_alerts = true where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
set local role anon;
select lives_ok($$select public.unsubscribe_from_alert('99999999-9999-9999-9999-999999999999')$$,
  'an id that matches no alert is not an error');
reset role;
select is((select count(*) from public.profiles where email_alerts), 2::bigint,
  'and changes nobody');
set local role anon;
select lives_ok($$select public.unsubscribe_from_alert(null)$$, 'a missing id is not an error either');
reset role;
select is((select count(*) from public.profiles where email_alerts), 2::bigint,
  'and changes nobody');

-- An old email must still work ---------------------------------------------------------------
set local role anon;
select public.unsubscribe_from_alert('22222222-2222-2222-2222-222222222222');
reset role;
select is((select email_alerts from public.profiles where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  false, 'the link in an old, already sent email still stops alerts');

-- A visitor still reaches nothing else -------------------------------------------------------
select ok(not has_table_privilege('anon', 'public.alerts', 'select'), 'a visitor cannot read alerts');
select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'or profiles');
select ok(not has_table_privilege('anon', 'public.profiles', 'update'), 'or change a profile directly');

-- Following has its own allowance ------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(public.rate_limit_hit('follow', 2, interval '1 hour'), true,
  'following programs has its own rate-limit bucket');

select * from finish();
rollback;
