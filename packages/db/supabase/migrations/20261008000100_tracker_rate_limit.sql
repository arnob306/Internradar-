-- The tracker (saving programs, moving and editing applications) gets its own rate-limit bucket,
-- so it cannot use up a student's profile or upload allowance. Everything else about
-- rate_limit_hit is unchanged from 20260930040846_hardening.sql: fixed buckets, a limit from 1 to
-- 10000, and a window from one minute to one day.
create or replace function public.rate_limit_hit(bucket text, max_hits int, window_len interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  current_hits int;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = 'invalid_authorization_specification';
  end if;
  if bucket is null or bucket <> all (array['upload', 'profile', 'feedback', 'log_event', 'tracker']) then
    raise exception 'unknown rate limit bucket' using errcode = 'invalid_parameter_value';
  end if;
  if max_hits is null or max_hits < 1 or max_hits > 10000 then
    raise exception 'max_hits must be between 1 and 10000' using errcode = 'invalid_parameter_value';
  end if;
  if window_len is null or window_len < interval '1 minute' or window_len > interval '1 day' then
    raise exception 'window must be between 1 minute and 1 day' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.rate_limits as r (key, window_start, hits)
  values (uid::text || ':' || bucket,
          date_bin(window_len, clock_timestamp(), timestamptz '2000-01-01'), 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into current_hits;
  return current_hits <= max_hits;
end $$;
