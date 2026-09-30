-- User tables: constraints, and user A can never touch user B's rows
-- (architecture overview §2.5, §6.1; test plan §5).
begin;
select plan(39);

-- Impersonate an authenticated user, the way PostgREST does with a JWT.
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'program_follows', 'program_follows exists');
select has_table('public', 'resumes', 'resumes exists');
select has_table('public', 'applications', 'applications exists');
select has_table('public', 'application_events', 'application_events exists');
select has_table('public', 'app_admins', 'app_admins exists');

-- Fixtures (as the superuser) ----------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'c@example.test');

insert into public.companies (id, slug, name, careers_url)
  values ('00000000-0000-0000-0000-0000000000c1', 'acme', 'Acme', 'https://acme.example');
insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
          'grad', 'Acme Grad', 'graduate', 'https://acme.example/grad', true);

insert into public.profiles (user_id, expected_graduation, degree_level, citizenship) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2027-11-01', 'undergraduate', 'au_citizen'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2028-11-01', 'undergraduate', null);

insert into public.program_follows (user_id, program_id) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000a1');

insert into public.resumes (id, user_id, label, version, storage_path, mime_type, size_bytes, sha256,
                            wrapped_dek, iv, kek_version) values
  ('00000000-0000-0000-0000-00000000e0b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B v1', 1,
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/00000000-0000-0000-0000-00000000e0b1.bin', 'application/pdf', 1000, repeat('0', 64),
   '\x00', '\x00', 1);

insert into public.applications (id, user_id, program_id, cycle_year, resume_id, status, applied_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '00000000-0000-0000-0000-0000000000a1', 2027, '00000000-0000-0000-0000-00000000e0b1',
   'applied', now());

insert into public.application_events (application_id, user_id, from_status, to_status) values
  ('00000000-0000-0000-0000-0000000000f1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'saved', 'applied');

-- Constraints ----------------------------------------------------------------------
select throws_ok(
  $$update public.profiles set expected_graduation = '2027-11-15'
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514', null, 'graduation must be the first of a month');

select lives_ok(
  $$insert into public.profiles (user_id) values ('cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  'a profile can be created with every optional field empty (citizenship is optional)');

select throws_ok(
  $$insert into public.resumes (id, user_id, label, version, storage_path, mime_type, size_bytes, sha256,
                                wrapped_dek, iv, kek_version)
    values ('00000000-0000-0000-0000-00000000e0b2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'big', 2,
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/00000000-0000-0000-0000-00000000e0b2.bin', 'application/pdf',
            2097153, repeat('0', 64), '\x00', '\x00', 1)$$,
  '23514', null, 'a resume over 2 MB is rejected');

select throws_ok(
  $$insert into public.resumes (id, user_id, label, version, storage_path, mime_type, size_bytes, sha256,
                                wrapped_dek, iv, kek_version)
    values ('00000000-0000-0000-0000-00000000e0b3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dup', 1,
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/00000000-0000-0000-0000-00000000e0b3.bin', 'application/pdf',
            10, repeat('0', 64), '\x00', '\x00', 1)$$,
  '23505', null, 'resume versions are unique per user');

select throws_ok(
  $$insert into public.resumes (id, user_id, label, version, storage_path, mime_type, size_bytes, sha256,
                                wrapped_dek, iv, kek_version)
    values ('00000000-0000-0000-0000-00000000e0b4', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'exe', 3,
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/00000000-0000-0000-0000-00000000e0b4.bin',
            'application/x-msdownload', 10, repeat('0', 64), '\x00', '\x00', 1)$$,
  '23514', null, 'only PDF and DOCX resumes are accepted');

select throws_ok(
  $$insert into public.applications (user_id, program_id, cycle_year, status)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-0000000000a1', 2027, 'bogus')$$,
  '22P02', null, 'an unknown application status is rejected');

select throws_ok(
  $$insert into public.applications (user_id, program_id, cycle_year, status)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '00000000-0000-0000-0000-0000000000a1', 2027, 'applied')$$,
  '23514', null, 'a non-saved application needs applied_at');

select throws_ok(
  $$insert into public.applications (user_id, program_id, cycle_year)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000a1', 2027)$$,
  '23505', null, 'one application per user, program and cycle');

select throws_ok(
  $$insert into public.applications (user_id, program_id, cycle_year, resume_id, status, applied_at)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1', 2027,
            '00000000-0000-0000-0000-00000000e0b1', 'applied', now())$$,
  '23503', null, 'an application cannot use another user''s resume');

insert into public.profiles (user_id, university, updated_at)
  values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'old', '2000-01-01') on conflict (user_id) do update
  set updated_at = '2000-01-01';
update public.profiles set university = 'new' where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
select ok(
  (select updated_at > '2000-01-01' from public.profiles where user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  'updated_at is bumped on update');

delete from public.applications where id = '00000000-0000-0000-0000-0000000000f1';
select is((select count(*)::int from public.application_events), 0,
  'application events are deleted with their application');

-- Restore B's application for the access tests below.
insert into public.applications (id, user_id, program_id, cycle_year, resume_id, status, applied_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '00000000-0000-0000-0000-0000000000a1', 2027, '00000000-0000-0000-0000-00000000e0b1',
   'applied', now());

-- Access: user A ------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select is((select count(*)::int from public.profiles), 1, 'A sees only their own profile');
select is((select count(*)::int from public.profiles where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 0,
  'A cannot see B''s profile');
select is((select count(*)::int from public.resumes), 0, 'A cannot see B''s resumes');
select is((select count(*)::int from public.applications), 0, 'A cannot see B''s applications');
select is((select count(*)::int from public.application_events), 0, 'A cannot see B''s application events');
select is((select count(*)::int from public.program_follows), 0, 'A cannot see B''s follows');

-- These run without error but must change nothing; verified as the superuser below.
select lives_ok(
  $$update public.profiles set university = 'hacked'
    where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'A''s update of B''s profile is accepted but matches no rows');

select lives_ok(
  $$update public.applications set notes = 'hacked'
    where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'A''s update of B''s application is accepted but matches no rows');

select lives_ok(
  $$delete from public.program_follows where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'A''s delete of B''s follow is accepted but matches no rows');

select throws_ok(
  $$insert into public.profiles (user_id) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  '42501', null, 'A cannot insert a profile for B');

select throws_ok(
  $$update public.profiles set user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501', null, 'A cannot hand their profile to another user');

select throws_ok(
  $$insert into public.program_follows (user_id, program_id)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', null, 'A cannot follow a program as B');

select lives_ok(
  $$insert into public.program_follows (user_id, program_id)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-0000000000a1')$$,
  'A can follow a program as themselves');

select throws_ok(
  $$insert into public.application_events (application_id, user_id, to_status)
    values ('00000000-0000-0000-0000-0000000000f1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'interview')$$,
  '42501', null, 'clients cannot write application events at all (only the tracker trigger does)');

select throws_ok($$select * from public.app_admins$$, '42501', null,
  'clients cannot read app_admins');

select is(public.is_admin(), false, 'a normal user is not an admin');
reset role;

-- B's data is untouched by A's attempts above.
select is((select university from public.profiles where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), null,
  'B''s profile was not changed by A');
select is((select notes from public.applications where id = '00000000-0000-0000-0000-0000000000f1'), null,
  'B''s application was not changed by A');
select is((select count(*)::int from public.program_follows where user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), 1,
  'B''s follow still exists after A''s delete');

-- Admin, no-subject and anonymous access -------------------------------------------
insert into public.app_admins (user_id) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(public.is_admin(), true, 'is_admin() is true for a listed admin');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is((select count(*)::int from public.profiles), 0, 'a JWT without a subject sees no rows');
reset role;

set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
reset role;

select * from finish();
rollback;
