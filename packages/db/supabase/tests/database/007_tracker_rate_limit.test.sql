-- The tracker has its own rate-limit bucket, so saving programs and moving applications cannot
-- use up (or be blocked by) a student's profile or upload allowance. Unknown buckets stay refused
-- (004_hardening checks that).
begin;
select plan(5);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

insert into auth.users (id, email) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'e@example.test'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'f@example.test');

select pg_temp.act_as('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');

select is(public.rate_limit_hit('tracker', 2, interval '1 hour'), true, 'the first tracker hit is allowed');
select is(public.rate_limit_hit('tracker', 2, interval '1 hour'), true, 'the second tracker hit is allowed');
select is(public.rate_limit_hit('tracker', 2, interval '1 hour'), false, 'the third is over the limit');
select is(public.rate_limit_hit('profile', 2, interval '1 hour'), true,
  'the tracker limit does not use up the profile allowance');

select pg_temp.act_as('ffffffff-ffff-ffff-ffff-ffffffffffff');
select is(public.rate_limit_hit('tracker', 2, interval '1 hour'), true,
  'another student has their own tracker allowance');

select * from finish();
rollback;
