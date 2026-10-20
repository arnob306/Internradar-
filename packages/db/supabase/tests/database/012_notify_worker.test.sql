-- notify_worker (D30): the restricted role the alert sender connects as. It reads what it needs to
-- decide who is owed an alert, writes only alerts, and gets a student's email address one pending
-- alert at a time, never by reading the accounts table.
begin;
select plan(24);

grant notify_worker to postgres;
grant usage on schema extensions to notify_worker;

select ok(exists (select 1 from pg_roles where rolname = 'notify_worker' and rolcanlogin and not rolinherit),
  'notify_worker exists, can log in and does not inherit other roles');

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test');
insert into public.companies (id, slug, name, careers_url) values
  ('00000000-0000-0000-0000-0000000000c1', 'acme', 'Acme', 'https://acme.example/careers');
insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
   'grad', 'Acme Graduate Program', 'graduate', 'https://acme.example/grad', true);
insert into public.program_windows (id, program_id, cycle_year, window_seq, status, provenance, source_url) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
   2027, 1, 'unknown', 'seed', 'https://acme.example/grad');
insert into public.profiles (user_id, email_alerts, citizenship) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true, 'domestic');
insert into public.program_follows (user_id, program_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1');
insert into public.alerts (id, user_id, program_id, program_window_id, kind, dedupe_key, status, sent_at) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
   'opened', 'event:1', 'pending', null),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
   'dates_changed', 'event:2', 'sent', now());

-- What it may read ---------------------------------------------------------------------------
select ok(has_table_privilege('notify_worker', 'public.program_window_events', 'select'),
  'the worker can read window events');
select ok(has_table_privilege('notify_worker', 'public.program_follows', 'select'),
  'the worker can read follows');
select ok(not has_table_privilege('notify_worker', 'public.profiles', 'select'),
  'the worker cannot read whole profiles');
select ok(has_column_privilege('notify_worker', 'public.profiles', 'email_alerts', 'select'),
  'but it can read the email alerts switch');
select ok(not has_column_privilege('notify_worker', 'public.profiles', 'citizenship', 'select'),
  'and not citizenship');
select ok(not has_table_privilege('notify_worker', 'auth.users', 'select'),
  'the worker cannot read the accounts table');
select ok(not has_table_privilege('notify_worker', 'public.resumes', 'select'),
  'the worker cannot read resumes');
select ok(not has_table_privilege('notify_worker', 'public.applications', 'select'),
  'the worker cannot read applications');

-- What it may write --------------------------------------------------------------------------
select ok(not (has_table_privilege('notify_worker', 'public.program_window_events', 'insert')
    or has_table_privilege('notify_worker', 'public.program_window_events', 'update')
    or has_table_privilege('notify_worker', 'public.program_window_events', 'delete')),
  'the worker cannot write window events');
select ok(has_table_privilege('notify_worker', 'public.alerts', 'insert'),
  'the worker can queue alerts');
select ok(not has_table_privilege('notify_worker', 'public.alerts', 'delete'),
  'the worker cannot delete alerts');
select ok(has_column_privilege('notify_worker', 'public.alerts', 'status', 'update'),
  'the worker can record the outcome of a send');
select ok(not has_column_privilege('notify_worker', 'public.alerts', 'user_id', 'update'),
  'the worker cannot change who an alert is for');
select ok(not has_column_privilege('notify_worker', 'public.alerts', 'details', 'update'),
  'the worker cannot change what an alert says');

-- The email lookup ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.alert_recipient_email(uuid)', 'execute'),
  'a visitor who is not signed in cannot look up an address');
select ok(not has_function_privilege('authenticated', 'public.alert_recipient_email(uuid)', 'execute'),
  'a signed-in student cannot look up an address');
select ok(has_function_privilege('notify_worker', 'public.alert_recipient_email(uuid)', 'execute'),
  'the worker can look up an address');

set local role notify_worker;

select is(public.alert_recipient_email('11111111-1111-1111-1111-111111111111'), 'a@example.test',
  'the address of a pending alert is returned');
select is(public.alert_recipient_email('22222222-2222-2222-2222-222222222222'), null,
  'nothing is returned for an alert already sent');
select is(public.alert_recipient_email('99999999-9999-9999-9999-999999999999'), null,
  'nothing is returned for an alert that does not exist');
select throws_ok($$select email from auth.users$$, '42501', null,
  'reading the accounts table directly is refused');
select throws_ok($$update public.alerts set user_id = user_id$$, '42501', null,
  'rewriting who an alert is for is refused');

reset role;
select * from finish();
rollback;
