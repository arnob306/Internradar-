-- A student can mark a saved program as rejected without ever having applied (decision D9:
-- rejected is reachable from any status except offer). Every other status that is not
-- "saved" still needs the date the student applied.
begin;
select plan(5);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

insert into auth.users (id, email) values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'd@example.test');
insert into public.companies (id, slug, name, careers_url)
  values ('00000000-0000-0000-0000-0000000000c6', 'tracker-co', 'Tracker Co', 'https://tracker.example');
insert into public.programs (id, company_id, slug, name, program_type, source_url, is_published)
  values ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000c6',
          'grad', 'Tracker Grad', 'graduate', 'https://tracker.example/grad', true);

select lives_ok(
  $$insert into public.applications (user_id, program_id, cycle_year, status)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-0000000000a6', 2026, 'rejected')$$,
  'a rejected application does not need an applied date');

select throws_ok(
  $$insert into public.applications (user_id, program_id, cycle_year, status)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-0000000000a6', 2027, 'offer')$$,
  '23514', null, 'an offer still needs the applied date');

select throws_ok(
  $$insert into public.applications (user_id, program_id, cycle_year, status)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '00000000-0000-0000-0000-0000000000a6', 2028, 'interview')$$,
  '23514', null, 'an interview still needs the applied date');

insert into public.applications (id, user_id, program_id, cycle_year)
  values ('00000000-0000-0000-0000-0000000000f6', 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          '00000000-0000-0000-0000-0000000000a6', 2029);

select pg_temp.act_as('dddddddd-dddd-dddd-dddd-dddddddddddd');

select lives_ok(
  $$update public.applications set status = 'rejected'
    where id = '00000000-0000-0000-0000-0000000000f6'$$,
  'a student can reject a program they only saved');

select is(
  (select from_status::text || ' -> ' || to_status::text from public.application_events
   where application_id = '00000000-0000-0000-0000-0000000000f6' order by id desc limit 1),
  'saved -> rejected', 'and the move is recorded');

select * from finish();
rollback;
