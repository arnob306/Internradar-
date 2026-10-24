-- The web half of alerts (D31).
--
-- 1. Following a program gets its own rate-limit bucket, so it cannot use up a student's profile
--    or tracker allowance. Everything else about rate_limit_hit is unchanged from
--    20261008000100_tracker_rate_limit.sql: fixed buckets, a limit from 1 to 10000, and a window
--    from one minute to one day.
create or replace function public.rate_limit_hit(bucket text, max_hits int, window_len interval)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  current_hits int;
begin
  if uid is null then
    raise exception 'authentication required' using errcode = 'invalid_authorization_specification';
  end if;
  if bucket is null
     or bucket <> all (array['upload', 'profile', 'feedback', 'log_event', 'tracker', 'follow']) then
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

-- 2. Stopping alert emails from the link in an email, without signing in.
--
-- The link carries the id of an alert, a random uuid that only appears in that student's own
-- email. The function turns off email_alerts for the owner of that alert and nothing else. It
-- returns nothing and raises nothing, so a caller cannot tell a real id from a made-up one. It
-- runs with its owner's rights so the site never needs a service key, and pins an empty search
-- path. Only this function is open to a visitor: anon still has no access to alerts or profiles.
create function public.unsubscribe_from_alert(alert_id uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.profiles p
     set email_alerts = false
    from public.alerts a
   where a.id = alert_id
     and a.user_id = p.user_id
     and p.email_alerts;
$$;

revoke all on function public.unsubscribe_from_alert(uuid) from public;
grant execute on function public.unsubscribe_from_alert(uuid) to anon, authenticated;
